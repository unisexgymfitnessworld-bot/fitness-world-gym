import { Router } from "express";
import { getDashboardStats } from "../services/dashboardService.js";

export const dashboardRouter = Router();

dashboardRouter.get("/stats", async (_req, res, next) => {
  try {
    res.json({ success: true, data: await getDashboardStats() });
  } catch (error) {
    next(error);
  }
});
