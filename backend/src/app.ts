import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authMiddleware } from "./middleware/auth.js";
import { attendanceRouter } from "./routes/attendance.js";
import { authRouter } from "./routes/auth.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { membersRouter } from "./routes/members.js";
import { smsRouter } from "./routes/sms.js";

export const app = express();
const allowedOrigins = env.FRONTEND_URL ? [env.FRONTEND_URL] : ["http://localhost:5173", "http://127.0.0.1:5173"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(
  pinoHttp({
    logger,
  }),
);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/members", authMiddleware, membersRouter);
app.use("/api/attendance", authMiddleware, attendanceRouter);
app.use("/api/dashboard", authMiddleware, dashboardRouter);
app.use("/api/sms", authMiddleware, smsRouter);

app.use(errorHandler);
