import "./env.js";
import { Sequelize } from "sequelize";

const buildDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5432";
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;

  const missingVars = [
    ["POSTGRES_USER", user],
    ["POSTGRES_PASSWORD", password],
    ["POSTGRES_DB", database],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing database environment variables: ${missingVars.join(", ")}`,
    );
  }

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${database}`;
};

const sequelize = new Sequelize(buildDatabaseUrl(), {
  dialect: "postgres",
  logging: false,
});

export const connectDatabase = async () => {
  await sequelize.authenticate();
  console.log("Postgres connected successfully");
};

export const syncDatabase = async () => {
  await sequelize.sync();
  await sequelize.query("DROP INDEX IF EXISTS events_aggregate_id_version;");
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS events_aggregate_id ON events (aggregate_id);",
  );
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS events_aggregate_id_timestamp ON events (aggregate_id, timestamp);",
  );
  await sequelize.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS events_transaction_id_unique ON events ((event_data ->> 'transactionId')) WHERE event_data ? 'transactionId';",
  );
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS transaction_history_account_id_timestamp ON transaction_history (account_id, timestamp DESC);",
  );
  await sequelize.query(
    "ALTER TABLE snapshots ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';",
  );
  await sequelize.query(
    "ALTER TABLE snapshots ALTER COLUMN created_at SET DEFAULT NOW();",
  );
  console.log("Sequelize models synchronized");
};

export default sequelize;
