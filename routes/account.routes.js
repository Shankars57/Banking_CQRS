import { Router } from "express";
import {
  closeAccountController,
  createAccountController,
  depositMoneyController,
  getAccountEventsController,
  getAccountSummaryController,
  getBalanceAtTimestampController,
  getTransactionHistoryController,
  withdrawMoneyController,
} from "../controllers/account.controller.js";

const accountRouter = Router();

accountRouter.post("/", createAccountController);
accountRouter.post("/:accountId/deposits", depositMoneyController);
accountRouter.post("/:accountId/withdrawals", withdrawMoneyController);
accountRouter.post("/:accountId/close", closeAccountController);
accountRouter.get("/:accountId/transactions", getTransactionHistoryController);
accountRouter.get("/:accountId/events", getAccountEventsController);
accountRouter.get("/:accountId/balance-at", getBalanceAtTimestampController);
accountRouter.get("/:accountId", getAccountSummaryController);

export default accountRouter;
