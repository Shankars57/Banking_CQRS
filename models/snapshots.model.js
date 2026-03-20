import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const snapshotsModel = sequelize.define(
  "Snapshot",
  {
    snapshot_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    aggregate_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    snapshot_data: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    last_event_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.literal("NOW()"),
    },
  },
  {
    tableName: "snapshots",
    timestamps: false,
  }
);

export default snapshotsModel;
