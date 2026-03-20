import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const accountSummariesModel = sequelize.define(
  "AccountSummary",
  {
    account_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      primaryKey: true,
    },
    owner_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    balance: {
      type: DataTypes.DECIMAL(19, 4),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    version: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    tableName: "account_summaries",
    timestamps: false,
  }
);

export default accountSummariesModel;
