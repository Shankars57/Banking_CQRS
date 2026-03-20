import { Op, QueryTypes } from "sequelize";
import sequelize from "../db.js";
import { rehydrateBankAccount } from "../domain/bankAccount.js";
import Event from "../models/events.model.js";
import Snapshot from "../models/snapshots.model.js";

export const SNAPSHOT_INTERVAL = 50;

const buildSnapshotWhere = (accountId, asOfTimestamp) => {
  const where = { aggregate_id: accountId };

  if (asOfTimestamp) {
    where.created_at = { [Op.lte]: asOfTimestamp };
  }

  return where;
};

export const loadLatestSnapshot = async (
  accountId,
  { asOfTimestamp, transaction } = {},
) =>
  Snapshot.findOne({
    where: buildSnapshotWhere(accountId, asOfTimestamp),
    order: [["last_event_number", "DESC"]],
    raw: true,
    transaction,
  });

export const loadEventsAfter = async (
  accountId,
  { afterEventNumber = 0, upToTimestamp, transaction } = {},
) => {
  const where = { aggregate_id: accountId };

  if (afterEventNumber > 0) {
    where.event_number = { [Op.gt]: afterEventNumber };
  }

  if (upToTimestamp) {
    where.timestamp = { [Op.lte]: upToTimestamp };
  }

  return Event.findAll({
    where,
    order: [["event_number", "ASC"]],
    raw: true,
    transaction,
  });
};

export const loadAccountState = async (
  accountId,
  { asOfTimestamp, transaction } = {},
) => {
  const snapshot = await loadLatestSnapshot(accountId, {
    asOfTimestamp,
    transaction,
  });
  const events = await loadEventsAfter(accountId, {
    afterEventNumber: snapshot?.last_event_number ?? 0,
    upToTimestamp: asOfTimestamp,
    transaction,
  });

  return {
    snapshot,
    events,
    state: rehydrateBankAccount({
      accountId,
      snapshot,
      events,
    }),
  };
};

export const loadAllEvents = async (accountId, { transaction } = {}) =>
  Event.findAll({
    where: { aggregate_id: accountId },
    order: [["event_number", "ASC"]],
    raw: true,
    transaction,
  });

export const findEventByTransactionId = async (
  transactionId,
  { transaction } = {},
) => {
  const rows = await sequelize.query(
    `
      SELECT *
      FROM events
      WHERE event_data ->> 'transactionId' = :transactionId
      LIMIT 1
    `,
    {
      replacements: { transactionId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return rows[0] ?? null;
};

export const maybeCreateSnapshot = async (
  state,
  event,
  { transaction } = {},
) => {
  if (!state.exists || event.event_number % SNAPSHOT_INTERVAL !== 0) {
    return null;
  }

  const snapshotPayload = {
    aggregate_id: state.accountId,
    snapshot_data: {
      accountId: state.accountId,
      ownerName: state.ownerName,
      balance: state.balance,
      currency: state.currency,
      status: state.status,
    },
    last_event_number: event.event_number,
    created_at: event.timestamp,
  };

  await Snapshot.upsert(snapshotPayload, { transaction });

  return snapshotPayload;
};

export const mapEventResponse = (event) => ({
  eventId: event.event_id,
  aggregateId: event.aggregate_id,
  aggregateType: event.aggregate_type,
  eventType: event.event_type,
  eventNumber: Number(event.event_number),
  schemaVersion: Number(event.version),
  timestamp: event.timestamp,
  eventData: event.event_data,
});
