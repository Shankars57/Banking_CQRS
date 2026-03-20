import {
  closeAccount,
  createAccount,
  depositMoney,
  getAccountEvents,
  getAccountSummary,
  getBalanceAtTimestamp,
  getTransactionHistory,
  withdrawMoney,
} from "../services/account.service.js";

export const createAccountController = async (req, res) => {
  const result = await createAccount(req.body);
  res.status(201).json(result);
};

export const depositMoneyController = async (req, res) => {
  const result = await depositMoney(req.params.accountId, req.body);
  res.status(result.idempotentReplay ? 200 : 201).json(result);
};

export const withdrawMoneyController = async (req, res) => {
  const result = await withdrawMoney(req.params.accountId, req.body);
  res.status(result.idempotentReplay ? 200 : 201).json(result);
};

export const closeAccountController = async (req, res) => {
  const result = await closeAccount(req.params.accountId, req.body);
  res.status(200).json(result);
};

export const getAccountSummaryController = async (req, res) => {
  const result = await getAccountSummary(req.params.accountId);
  res.status(200).json(result);
};

export const getTransactionHistoryController = async (req, res) => {
  const result = await getTransactionHistory(req.params.accountId, req.query);
  res.status(200).json(result);
};

export const getAccountEventsController = async (req, res) => {
  const result = await getAccountEvents(req.params.accountId);
  res.status(200).json(result);
};

export const getBalanceAtTimestampController = async (req, res) => {
  const result = await getBalanceAtTimestamp(
    req.params.accountId,
    req.query.timestamp,
  );
  res.status(200).json(result);
};
