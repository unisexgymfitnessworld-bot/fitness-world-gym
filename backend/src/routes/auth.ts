import { Router } from "express";
import { HttpError } from "../lib/httpError.js";
import { getSupabaseAuthClient } from "../lib/supabase.js";
import { authMiddleware } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { loginSchema } from "../services/schemas.js";
import type { AuthenticatedRequest } from "../types/index.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { assertTrainerAllowed } from "../lib/trainerAccess.js";
import type { User } from "@supabase/supabase-js";

const loginLimiter = createRateLimiter(
  15 * 60 * 1000,
  10,
  "Too many login attempts from this IP, please try again after 15 minutes"
);

export const authRouter = Router();

function trainerFromUser(user: User, fallbackEmail = "") {
  const metadata = user.user_metadata;
  const name = typeof metadata?.name === "string" && metadata.name.trim()
    ? metadata.name.trim()
    : user.email?.split("@")[0] ?? "Fitness World Trainer";
  const avatar = typeof metadata?.avatar === "string" && metadata.avatar.trim() ? metadata.avatar.trim() : undefined;

  return {
    id: user.id,
    name,
    email: user.email ?? fallbackEmail,
    role: user.app_metadata?.role === "developer" ? "developer" : "trainer",
    avatar,
  };
}

authRouter.post("/login", loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const body = req.body as { email: string; password: string };
    const { data, error } = await getSupabaseAuthClient().auth.signInWithPassword(body);

    if (error || !data.session?.access_token || !data.user) {
      throw new HttpError(401, "LOGIN_FAILED", error?.message ?? "Unable to sign in");
    }

    assertTrainerAllowed(data.user);

    res.json({
      success: true,
      data: {
        token: data.session.access_token,
        trainer: trainerFromUser(data.user, body.email),
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", authMiddleware, (_req, res) => {
  res.json({
    success: true,
    data: {
      message: "Logged out",
    },
  });
});

authRouter.get("/me", authMiddleware, (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.authUser) {
      throw new HttpError(401, "UNAUTHORIZED", "Missing trainer session");
    }
    res.json({
      success: true,
      data: {
        trainer: trainerFromUser(req.authUser),
      },
    });
  } catch (error) {
    next(error);
  }
});
