import "./env.js";
import "./models/index.js";
import express from "express";
import { connectDatabase, syncDatabase } from "./db.js";
import accountRouter from "./routes/account.routes.js";
import { isAppError } from "./errors/appError.js";
import projectionRouter from "./routes/projection.routes.js";

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 3030;

app.use(express.json());
app.use("/api/accounts", accountRouter);
app.use("/api/projections", projectionRouter);

app.get("/", (req, res) => {
  res.send("<h1>Server is running</h1>");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use((error, req, res, next) => {
  if (isAppError(error)) {
    return res.status(error.statusCode).json({
      code: error.code,
      message: error.message,
    });
  }

  console.error("Unexpected error:", error);

  return res.status(500).json({
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong",
  });
});

const startServer = async () => {
  try {
    await connectDatabase();
    await syncDatabase();
    app.listen(PORT, () => {
      console.log("Server is running on port:", PORT);
    });
  } catch (error) {
    console.error("Unable to connect to Postgres:", error.message);
    process.exit(1);
  }
};

startServer();
