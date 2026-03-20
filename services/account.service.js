import sequelize from "../db.js";
import {
  ACCOUNT_EVENT_TYPES,
  ACCOUNT_STATUS,
  applyBankAccountEvent,
} from "../domain/bankAccount.js";
import { AppError } from "../errors/appError.js";
import AccountSummary from "../models/accountSummaries.model.js";
import Event from "../models/events.model.js";
import TransactionHistory from "../models/transactionHistory.model.js";
import {
  findEventByTransactionId,
  loadAccountState as loadAccountStateFromStore,
  loadAllEvents,
  mapEventResponse,
  maybeCreateSnapshot,
} from "./eventStore.service.js";
import { projectEvent } from "./projection.service.js";

const AGGREGATE_TYPE = "BankAccount";
const EVENT_SCHEMA_VERSION = 1;
const MAX_PAGE_SIZE = 100;

const normalizeRequiredString = (value, fieldName, errorCode) => {
  const normalizedValue = value?.toString().trim();

  if (!normalizedValue) {
    throw new AppError(400, errorCode, `${fieldName} is required`);
  }

  return normalizedValue;
};

const normalizeAccountId = (accountId) =>
  normalizeRequiredString(accountId, "accountId", "ACCOUNT_ID_REQUIRED");

const normalizeCurrency = (currency) => {
  const normalizedCurrency = normalizeRequiredString(
    currency,
    "currency",
    "CURRENCY_REQUIRED",
  ).toUpperCase();

  if (normalizedCurrency.length !== 3) {
    throw new AppError(
      400,
      "INVALID_CURRENCY",
      "currency must be a 3-letter ISO code",
    );
  }

  return normalizedCurrency;
};

const normalizeAmount = (amount) => {
  const normalizedAmount = Number(amount);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new AppError(
      400,
      "INVALID_AMOUNT",
      "amount must be a positive number",
    );
  }

  return normalizedAmount;
};

const normalizeDescription = (description) => {
  if (description === undefined || description === null) {
    return null;
  }

  const normalizedDescription = description.toString().trim();
  return normalizedDescription || null;
};

const normalizeTimestamp = (timestamp) => {
  const normalizedTimestamp = normalizeRequiredString(
    timestamp,
    "timestamp",
    "TIMESTAMP_REQUIRED",
  );
  const parsedTimestamp = new Date(normalizedTimestamp);

  if (Number.isNaN(parsedTimestamp.getTime())) {
    throw new AppError(
      400,
      "INVALID_TIMESTAMP",
      "timestamp must be a valid ISO-8601 date-time",
    );
  }

  return parsedTimestamp;
};

const normalizePagination = (page, pageSize) => {
  const normalizedPage = Number.parseInt(page ?? "1", 10);
  const normalizedPageSize = Number.parseInt(pageSize ?? "10", 10);

  if (!Number.isInteger(normalizedPage) || normalizedPage < 1) {
    throw new AppError(400, "INVALID_PAGE", "page must be a positive integer");
  }

  if (
    !Number.isInteger(normalizedPageSize) ||
    normalizedPageSize < 1 ||
    normalizedPageSize > MAX_PAGE_SIZE
  ) {
    throw new AppError(
      400,
      "INVALID_PAGE_SIZE",
      `pageSize must be between 1 and ${MAX_PAGE_SIZE}`,
    );
  }

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
};

const sameMoney = (leftAmount, rightAmount) =>
  Number(leftAmount).toFixed(4) === Number(rightAmount).toFixed(4);

const isUniqueConstraintError = (error) =>
  error?.name === "SequelizeUniqueConstraintError";

const mapAccountSummary = (accountSummary) => ({
  accountId: accountSummary.account_id,
  ownerName: accountSummary.owner_name,
  balance: Number(accountSummary.balance),
  currency: accountSummary.currency,
  status: accountSummary.status,
  version: Number(accountSummary.version),
});

const mapTransactionHistory = (row) => ({
  transactionId: row.transaction_id,
  accountId: row.account_id,
  type: row.type,
  amount: Number(row.amount),
  description: row.description,
  timestamp: row.timestamp,
});

const ensureAccountExists = (state) => {
  if (!state.exists) {
    throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found");
  }
};

const ensureAccountOpen = (state) => {
  ensureAccountExists(state);

  if (state.status !== ACCOUNT_STATUS.OPEN) {
    throw new AppError(
      409,
      "ACCOUNT_CLOSED",
      "Cannot operate on a closed account",
    );
  }
};

const commitEvent = async (currentState, eventPayload) =>
  sequelize.transaction(async (transaction) => {
    const createdEvent = await Event.create(eventPayload, { transaction });
    const plainEvent = createdEvent.get({ plain: true });
    const nextState = applyBankAccountEvent(currentState, plainEvent);

    await projectEvent(plainEvent, transaction);
    await maybeCreateSnapshot(nextState, plainEvent, { transaction });

    return {
      event: plainEvent,
      state: nextState,
    };
  });

const buildTransactionResponse = (event, type, idempotentReplay = false) => ({
  accountId: event.aggregate_id,
  transactionId: event.event_data.transactionId,
  type,
  amount: Number(event.event_data.amount),
  balance: Number(
    event.event_data.balanceAfter ?? event.event_data.balance_after ?? 0,
  ),
  status: ACCOUNT_STATUS.OPEN,
  version: Number(event.event_number),
  eventId: event.event_id,
  createdAt: event.timestamp,
  idempotentReplay,
});

const assertMatchingTransactionReplay = (
  existingEvent,
  { accountId, amount, description, eventType },
) => {
  const existingDescription = existingEvent.event_data?.description ?? null;
  const requestedDescription = description ?? null;

  if (
    existingEvent.aggregate_id === accountId &&
    existingEvent.event_type === eventType &&
    sameMoney(existingEvent.event_data?.amount, amount) &&
    existingDescription === requestedDescription
  ) {
    return existingEvent;
  }

  throw new AppError(
    409,
    "DUPLICATE_TRANSACTION_ID",
    "transactionId has already been used for a different transaction",
  );
};

const resolveTransactionConflict = async (transactionId, commandShape) => {
  const existingEvent = await findEventByTransactionId(transactionId);

  if (!existingEvent) {
    throw new AppError(
      409,
      "CONCURRENT_MODIFICATION",
      "Concurrent modification detected. Retry the command.",
    );
  }

  return assertMatchingTransactionReplay(existingEvent, commandShape);
};

const buildBaseEventPayload = (accountId, eventType, eventNumber, timestamp) => ({
  aggregate_id: accountId,
  aggregate_type: AGGREGATE_TYPE,
  event_type: eventType,
  event_number: eventNumber,
  version: EVENT_SCHEMA_VERSION,
  timestamp,
});

export const createAccount = async (command) => {
  const accountId = normalizeAccountId(command.accountId);
  const ownerName = normalizeRequiredString(
    command.ownerName,
    "ownerName",
    "OWNER_NAME_REQUIRED",
  );
  const currency = normalizeCurrency(command.currency);
  const { state: currentState } = await loadAccountStateFromStore(accountId);

  if (currentState.exists) {
    throw new AppError(
      409,
      "ACCOUNT_ALREADY_EXISTS",
      "Account already exists",
    );
  }

  const timestamp = new Date();
  const eventPayload = {
    ...buildBaseEventPayload(
      accountId,
      ACCOUNT_EVENT_TYPES.CREATED,
      currentState.version + 1,
      timestamp,
    ),
    event_data: {
      accountId,
      ownerName,
      currency,
      balance: 0,
      status: ACCOUNT_STATUS.OPEN,
    },
  };

  try {
    const { event, state } = await commitEvent(currentState, eventPayload);

    return {
      accountId,
      ownerName,
      currency,
      balance: state.balance,
      status: state.status,
      version: state.version,
      eventId: event.event_id,
      createdAt: event.timestamp,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(
        409,
        "ACCOUNT_ALREADY_EXISTS",
        "Account already exists",
      );
    }

    throw error;
  }
};

export const depositMoney = async (accountId, command) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  const transactionId = normalizeRequiredString(
    command.transactionId,
    "transactionId",
    "TRANSACTION_ID_REQUIRED",
  );
  const amount = normalizeAmount(command.amount);
  const description = normalizeDescription(command.description);
  const existingEvent = await findEventByTransactionId(transactionId);

  if (existingEvent) {
    return buildTransactionResponse(
      assertMatchingTransactionReplay(existingEvent, {
        accountId: normalizedAccountId,
        amount,
        description,
        eventType: ACCOUNT_EVENT_TYPES.DEPOSITED,
      }),
      "DEPOSIT",
      true,
    );
  }

  const { state: currentState } = await loadAccountStateFromStore(
    normalizedAccountId,
  );
  ensureAccountOpen(currentState);

  const nextEventNumber = currentState.version + 1;
  const timestamp = new Date();
  const nextBalance = Number(currentState.balance) + amount;
  const eventPayload = {
    ...buildBaseEventPayload(
      normalizedAccountId,
      ACCOUNT_EVENT_TYPES.DEPOSITED,
      nextEventNumber,
      timestamp,
    ),
    event_data: {
      transactionId,
      amount,
      description,
      balanceAfter: nextBalance,
    },
  };

  try {
    const { event } = await commitEvent(currentState, eventPayload);
    return buildTransactionResponse(event, "DEPOSIT");
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const replayEvent = await resolveTransactionConflict(transactionId, {
        accountId: normalizedAccountId,
        amount,
        description,
        eventType: ACCOUNT_EVENT_TYPES.DEPOSITED,
      });

      return buildTransactionResponse(replayEvent, "DEPOSIT", true);
    }

    throw error;
  }
};

export const withdrawMoney = async (accountId, command) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  const transactionId = normalizeRequiredString(
    command.transactionId,
    "transactionId",
    "TRANSACTION_ID_REQUIRED",
  );
  const amount = normalizeAmount(command.amount);
  const description = normalizeDescription(command.description);
  const existingEvent = await findEventByTransactionId(transactionId);

  if (existingEvent) {
    return buildTransactionResponse(
      assertMatchingTransactionReplay(existingEvent, {
        accountId: normalizedAccountId,
        amount,
        description,
        eventType: ACCOUNT_EVENT_TYPES.WITHDRAWN,
      }),
      "WITHDRAWAL",
      true,
    );
  }

  const { state: currentState } = await loadAccountStateFromStore(
    normalizedAccountId,
  );
  ensureAccountOpen(currentState);

  if (Number(currentState.balance) < amount) {
    throw new AppError(
      409,
      "INSUFFICIENT_FUNDS",
      "Cannot withdraw more than the available balance",
    );
  }

  const nextEventNumber = currentState.version + 1;
  const timestamp = new Date();
  const nextBalance = Number(currentState.balance) - amount;
  const eventPayload = {
    ...buildBaseEventPayload(
      normalizedAccountId,
      ACCOUNT_EVENT_TYPES.WITHDRAWN,
      nextEventNumber,
      timestamp,
    ),
    event_data: {
      transactionId,
      amount,
      description,
      balanceAfter: nextBalance,
    },
  };

  try {
    const { event } = await commitEvent(currentState, eventPayload);
    return buildTransactionResponse(event, "WITHDRAWAL");
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const replayEvent = await resolveTransactionConflict(transactionId, {
        accountId: normalizedAccountId,
        amount,
        description,
        eventType: ACCOUNT_EVENT_TYPES.WITHDRAWN,
      });

      return buildTransactionResponse(replayEvent, "WITHDRAWAL", true);
    }

    throw error;
  }
};

export const closeAccount = async (accountId, command = {}) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  const description = normalizeDescription(command.description);
  const { state: currentState } = await loadAccountStateFromStore(
    normalizedAccountId,
  );
  ensureAccountOpen(currentState);

  const timestamp = new Date();
  const eventPayload = {
    ...buildBaseEventPayload(
      normalizedAccountId,
      ACCOUNT_EVENT_TYPES.CLOSED,
      currentState.version + 1,
      timestamp,
    ),
    event_data: {
      description,
      balanceAfter: Number(currentState.balance),
      status: ACCOUNT_STATUS.CLOSED,
    },
  };

  try {
    const { event, state } = await commitEvent(currentState, eventPayload);

    return {
      accountId: normalizedAccountId,
      balance: state.balance,
      status: state.status,
      version: state.version,
      eventId: event.event_id,
      closedAt: event.timestamp,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(
        409,
        "CONCURRENT_MODIFICATION",
        "Concurrent modification detected. Retry the command.",
      );
    }

    throw error;
  }
};

export const getAccountSummary = async (accountId) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  const accountSummary = await AccountSummary.findByPk(normalizedAccountId, {
    raw: true,
  });

  if (!accountSummary) {
    throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found");
  }

  return mapAccountSummary(accountSummary);
};

export const getTransactionHistory = async (
  accountId,
  { page, pageSize } = {},
) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  await getAccountSummary(normalizedAccountId);

  const pagination = normalizePagination(page, pageSize);
  const { count, rows } = await TransactionHistory.findAndCountAll({
    where: { account_id: normalizedAccountId },
    order: [
      ["timestamp", "DESC"],
      ["transaction_id", "DESC"],
    ],
    limit: pagination.pageSize,
    offset: pagination.offset,
    raw: true,
  });

  return {
    accountId: normalizedAccountId,
    page: pagination.page,
    currentPage: pagination.page,
    pageSize: pagination.pageSize,
    total: Number(count),
    items: rows.map(mapTransactionHistory),
  };
};

export const getAccountEvents = async (accountId) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  const events = await loadAllEvents(normalizedAccountId);

  if (events.length === 0) {
    throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found");
  }

  return {
    accountId: normalizedAccountId,
    events: events.map(mapEventResponse),
  };
};

export const getBalanceAtTimestamp = async (accountId, timestamp) => {
  const normalizedAccountId = normalizeAccountId(accountId);
  const asOfTimestamp = normalizeTimestamp(timestamp);
  const { state } = await loadAccountStateFromStore(normalizedAccountId, {
    asOfTimestamp,
  });

  if (!state.exists) {
    throw new AppError(
      404,
      "ACCOUNT_NOT_FOUND_AT_TIMESTAMP",
      "Account did not exist at the specified timestamp",
    );
  }

  return {
    accountId: normalizedAccountId,
    balance: Number(state.balance),
    currency: state.currency,
    status: state.status,
    version: Number(state.version),
    timestamp: asOfTimestamp.toISOString(),
  };
};

