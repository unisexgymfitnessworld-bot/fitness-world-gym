import type { ErrorRequestHandler } from "express";
import { HttpError } from "../lib/httpError.js";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  logger.error({ error }, message);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error",
    },
  });
};
