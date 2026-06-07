import type { NextFunction, Response } from "express";
import { HttpError } from "../lib/httpError.js";
import { getSupabaseAuthClient } from "../lib/supabase.js";
import type { AuthenticatedRequest } from "../types/index.js";

export async function authMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
      throw new HttpError(401, "UNAUTHORIZED", "Missing bearer token");
    }

    const { data, error } = await getSupabaseAuthClient().auth.getUser(token);
    if (error || !data.user) {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired session");
    }

    req.authUser = data.user;
    next();
  } catch (error) {
    next(error);
  }
}
