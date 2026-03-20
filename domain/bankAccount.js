const NOT_CREATED_STATUS = "NOT_CREATED";
const OPEN_STATUS = "OPEN";
const CLOSED_STATUS = "CLOSED";

const readEventValue = (eventData, camelKey, snakeKey = camelKey) =>
  eventData?.[camelKey] ?? eventData?.[snakeKey];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const readBalanceAfter = (eventData, currentBalance, direction = "same") => {
  const explicitBalance = readEventValue(
    eventData,
    "balanceAfter",
    "balance_after",
  );

  if (explicitBalance !== undefined) {
    return toNumber(explicitBalance, currentBalance);
  }

  if (direction === "increase") {
    return toNumber(currentBalance) + toNumber(eventData.amount, 0);
  }

  if (direction === "decrease") {
    return toNumber(currentBalance) - toNumber(eventData.amount, 0);
  }

  return toNumber(currentBalance);
};

export const createEmptyBankAccountState = (accountId = null) => ({
  accountId,
  ownerName: null,
  balance: 0,
  currency: null,
  status: NOT_CREATED_STATUS,
  version: 0,
  exists: false,
});

export const createStateFromSnapshot = (snapshot) => {
  if (!snapshot) {
    return createEmptyBankAccountState();
  }

  const snapshotData = snapshot.snapshot_data ?? {};

  return {
    accountId: snapshot.aggregate_id,
    ownerName: readEventValue(snapshotData, "ownerName", "owner_name") ?? null,
    balance: toNumber(snapshotData.balance, 0),
    currency: snapshotData.currency ?? null,
    status: snapshotData.status ?? OPEN_STATUS,
    version: snapshot.last_event_number ?? 0,
    exists: true,
  };
};

export const applyBankAccountEvent = (state, event) => {
  const eventData = event.event_data ?? {};
  const baseState = {
    ...state,
    accountId: event.aggregate_id ?? state.accountId,
    version: event.event_number ?? state.version,
  };

  switch (event.event_type) {
    case "AccountCreated":
      return {
        ...baseState,
        exists: true,
        ownerName:
          readEventValue(eventData, "ownerName", "owner_name") ?? state.ownerName,
        balance: toNumber(
          readEventValue(eventData, "balance") ??
            readEventValue(eventData, "initialBalance", "initial_balance"),
          0,
        ),
        currency: eventData.currency ?? state.currency,
        status: eventData.status ?? OPEN_STATUS,
      };
    case "MoneyDeposited":
      return {
        ...baseState,
        balance: readBalanceAfter(eventData, state.balance, "increase"),
      };
    case "MoneyWithdrawn":
      return {
        ...baseState,
        balance: readBalanceAfter(eventData, state.balance, "decrease"),
      };
    case "AccountClosed":
      return {
        ...baseState,
        balance: readBalanceAfter(eventData, state.balance),
        status: CLOSED_STATUS,
      };
    default:
      return baseState;
  }
};

export const rehydrateBankAccount = ({ accountId, snapshot, events = [] }) => {
  const initialState = snapshot
    ? createStateFromSnapshot(snapshot)
    : createEmptyBankAccountState(accountId);

  return events.reduce(applyBankAccountEvent, initialState);
};

export const ACCOUNT_STATUS = {
  NOT_CREATED: NOT_CREATED_STATUS,
  OPEN: OPEN_STATUS,
  CLOSED: CLOSED_STATUS,
};

export const ACCOUNT_EVENT_TYPES = {
  CREATED: "AccountCreated",
  DEPOSITED: "MoneyDeposited",
  WITHDRAWN: "MoneyWithdrawn",
  CLOSED: "AccountClosed",
};
