import { Router } from "express";
import type { Request } from "express";
import { HttpError } from "../lib/httpError.js";
import { validateBody } from "../middleware/validate.js";
import { createMember, getMember, listMembers, renewMember, suspendMember, updateMember, updatePayment } from "../services/memberService.js";
import { memberInputSchema, paymentSchema, renewSchema } from "../services/schemas.js";

export const membersRouter = Router();

function memberIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new HttpError(400, "INVALID_MEMBER_ID", "Member id is required");
  }
  return id;
}

membersRouter.get("/", async (req, res, next) => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const goal = req.query.goal as string | undefined;
    const payment = req.query.payment as string | undefined;
    const dueSoon = req.query.due_soon === "true" || req.query.dueSoon === "true" ? true : undefined;
    const sort = req.query.sort as string | undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

    const data = await listMembers({
      search,
      status,
      goal,
      payment,
      dueSoon,
      sort,
      page,
      limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

membersRouter.get("/:id", async (req, res, next) => {
  try {
    res.json({ success: true, data: await getMember(memberIdParam(req)) });
  } catch (error) {
    next(error);
  }
});

membersRouter.post("/", validateBody(memberInputSchema), async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await createMember(req.body) });
  } catch (error) {
    next(error);
  }
});

membersRouter.put("/:id", validateBody(memberInputSchema), async (req, res, next) => {
  try {
    res.json({ success: true, data: await updateMember(memberIdParam(req), req.body) });
  } catch (error) {
    next(error);
  }
});

membersRouter.patch("/:id/payment", validateBody(paymentSchema), async (req, res, next) => {
  try {
    const body = req.body as { paymentStatus: "Paid" | "Pending" };
    res.json({ success: true, data: await updatePayment(memberIdParam(req), body.paymentStatus) });
  } catch (error) {
    next(error);
  }
});

membersRouter.patch("/:id/renew", validateBody(renewSchema), async (req, res, next) => {
  try {
    const body = req.body as { membershipStart: string; membershipDue: string; feesAmount: number };
    res.json({ success: true, data: await renewMember(memberIdParam(req), body.membershipStart, body.membershipDue, body.feesAmount) });
  } catch (error) {
    next(error);
  }
});

membersRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json({ success: true, data: await suspendMember(memberIdParam(req)) });
  } catch (error) {
    next(error);
  }
});
