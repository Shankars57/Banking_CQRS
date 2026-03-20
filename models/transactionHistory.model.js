import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const transactionHistoryModel = sequelize.define(
  "TransactionHistory",
  {
    transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      primaryKey: true,
    },
    account_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(19, 4),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "transaction_history",
    timestamps: false,
  }
);

export default transactionHistoryModel;
