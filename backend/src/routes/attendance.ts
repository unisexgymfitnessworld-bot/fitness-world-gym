import { Router } from "express";
import { deleteAttendance, listAttendance, createAttendance, listAllAttendance } from "../services/attendanceService.js";
import { attendanceInputSchema } from "../services/schemas.js";
import { validateBody } from "../middleware/validate.js";

export const attendanceRouter = Router();

attendanceRouter.get("/", async (req, res, next) => {
  try {
    res.json({ success: true, data: await listAllAttendance() });
  } catch (error) {
    next(error);
  }
});

attendanceRouter.get("/:memberId", async (req, res, next) => {
  try {
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    res.json({ success: true, data: await listAttendance(req.params.memberId, month) });
  } catch (error) {
    next(error);
  }
});

attendanceRouter.post("/", validateBody(attendanceInputSchema), async (req, res, next) => {
  try {
    const body = req.body as { memberId: string; visitDate: string; weightKg?: number };
    res.status(201).json({ success: true, data: await createAttendance(body.memberId, body.visitDate, body.weightKg) });
  } catch (error) {
    next(error);
  }
});

attendanceRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteAttendance(req.params.id);
    res.json({ success: true, data: { message: "Deleted" } });
  } catch (error) {
    next(error);
  }
});
