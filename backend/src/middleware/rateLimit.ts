import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../lib/httpError.js";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export function createRateLimiter(windowMs: number, maxRequests: number, message: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      return next(new HttpError(429, "RATE_LIMIT_EXCEEDED", message));
    }

    next();
  };
}
