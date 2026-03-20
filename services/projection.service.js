import sequelize from "../db.js";
import { ACCOUNT_EVENT_TYPES, ACCOUNT_STATUS } from "../domain/bankAccount.js";
import { AppError } from "../errors/appError.js";
import AccountSummary from "../models/accountSummaries.model.js";
import Event from "../models/events.model.js";
import TransactionHistory from "../models/transactionHistory.model.js";

const requireAccountSummary = async (accountId, transaction) => {
  const accountSummary = await AccountSummary.findByPk(accountId, {
    raw: true,
    transaction,
  });

  if (!accountSummary) {
    throw new AppError(
      500,
      "ACCOUNT_SUMMARY_MISSING",
      `Projection is missing account summary for ${accountId}`,
    );
  }
};

const updateAccountSummary = async (accountId, values, transaction) => {
  await requireAccountSummary(accountId, transaction);

  await AccountSummary.update(values, {
    where: { account_id: accountId },
    transaction,
  });
};

const upsertTransactionHistory = async (
  event,
  type,
  amount,
  description,
  transaction,
) => {
  await TransactionHistory.upsert(
    {
      transaction_id: event.event_data.transactionId ?? event.event_id,
      account_id: event.aggregate_id,
      type,
      amount,
      description,
      timestamp: event.timestamp,
    },
    { transaction },
  );
};

export const projectEvent = async (event, transaction) => {
  const eventData = event.event_data ?? {};

  switch (event.event_type) {
    case ACCOUNT_EVENT_TYPES.CREATED:
      await AccountSummary.upsert(
        {
          account_id: event.aggregate_id,
          owner_name: eventData.ownerName ?? eventData.owner_name,
          balance: Number(eventData.balance ?? 0),
          currency: eventData.currency,
          status: eventData.status ?? ACCOUNT_STATUS.OPEN,
          version: event.event_number,
        },
        { transaction },
      );
      return;
    case ACCOUNT_EVENT_TYPES.DEPOSITED:
      await updateAccountSummary(
        event.aggregate_id,
        {
          balance: Number(eventData.balanceAfter ?? eventData.balance_after ?? 0),
          version: event.event_number,
        },
        transaction,
      );
      await upsertTransactionHistory(
        event,
        "DEPOSIT",
        Number(eventData.amount),
        eventData.description ?? null,
        transaction,
      );
      return;
    case ACCOUNT_EVENT_TYPES.WITHDRAWN:
      await updateAccountSummary(
        event.aggregate_id,
        {
          balance: Number(eventData.balanceAfter ?? eventData.balance_after ?? 0),
          version: event.event_number,
        },
        transaction,
      );
      await upsertTransactionHistory(
        event,
        "WITHDRAWAL",
        Number(eventData.amount),
        eventData.description ?? null,
        transaction,
      );
      return;
    case ACCOUNT_EVENT_TYPES.CLOSED:
      await updateAccountSummary(
        event.aggregate_id,
        {
          balance: Number(eventData.balanceAfter ?? eventData.balance_after ?? 0),
          status: ACCOUNT_STATUS.CLOSED,
          version: event.event_number,
        },
        transaction,
      );
      return;
    default:
      throw new AppError(
        500,
        "UNSUPPORTED_PROJECTION_EVENT",
        `No projector implemented for event type ${event.event_type}`,
      );
  }
};

export const rebuildProjections = async () =>
  sequelize.transaction(async (transaction) => {
    await TransactionHistory.destroy({
      where: {},
      truncate: true,
      cascade: true,
      restartIdentity: false,
      transaction,
    });
    await AccountSummary.destroy({
      where: {},
      truncate: true,
      cascade: true,
      restartIdentity: false,
      transaction,
    });

    const events = await Event.findAll({
      order: [
        ["aggregate_id", "ASC"],
        ["event_number", "ASC"],
      ],
      raw: true,
      transaction,
    });

    for (const event of events) {
      await projectEvent(event, transaction);
    }

    const accountsProjected = await AccountSummary.count({ transaction });
    const transactionsProjected = await TransactionHistory.count({ transaction });

    return {
      eventsProcessed: events.length,
      accountsProjected,
      transactionsProjected,
    };
  });
