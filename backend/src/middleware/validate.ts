import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { HttpError } from "../lib/httpError.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request body";
      next(new HttpError(400, "VALIDATION_ERROR", message));
      return;
    }
    req.body = parsed.data;
    next();
  };
}
