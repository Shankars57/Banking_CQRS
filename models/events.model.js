import { DataTypes } from "sequelize";
import sequelize from "../db.js";

// aggregate_id	VARCHAR(255)	NOT NULL
// aggregate_type	VARCHAR(255)	NOT NULL, e.g., 'BankAccount'
//  event_type	VARCHAR(255)	NOT NULL, e.g., 'AccountCreated'
// event_data	JSONB	NOT NULL
// event_number	INTEGER	NOT NULL
// timestamp	TIMESTAMP WITH TIME ZONE	NOT NULL, DEFAULT NOW()
// version

const eventsModel = sequelize.define(
  "Event",
  {
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    aggregate_id: { type: DataTypes.STRING, allowNull: false },
    aggregate_type: { type: DataTypes.STRING, allowNull: false },
    event_type: { type: DataTypes.STRING, allowNull: false },
    event_data: { type: DataTypes.JSONB, allowNull: false },
    event_number: { type: DataTypes.INTEGER, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "events",
    timestamps: false,
    indexes: [
      {
        fields: ["aggregate_id"],
      },
      {
        unique: true,
        fields: ["aggregate_id", "event_number"],
      },
    ],
  },
);

export default eventsModel;
