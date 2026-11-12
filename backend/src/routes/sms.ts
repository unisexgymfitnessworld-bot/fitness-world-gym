import { Router } from "express";
import { getMember, markReminderSent } from "../services/memberService.js";
import { smsInputSchema } from "../services/schemas.js";
import { sendSms } from "../services/smsService.js";
import { validateBody } from "../middleware/validate.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const smsLimiter = createRateLimiter(
  15 * 60 * 1000,
  10,
  "Too many SMS requests from this IP, please try again after 15 minutes"
);

export const smsRouter = Router();

smsRouter.post("/send", smsLimiter, validateBody(smsInputSchema), async (req, res, next) => {
  try {
    const body = req.body as { member_id: string; message: string };
    const member = await getMember(body.member_id);
    const requestId = await sendSms(member.phone, body.message);
    await markReminderSent(member.id);
    res.json({
      success: true,
      data: {
        requestId,
      },
    });
  } catch (error) {
    next(error);
  }
});

smsRouter.post("/whatsapp-link", validateBody(smsInputSchema.pick({ member_id: true })), async (req, res, next) => {
  try {
    const body = req.body as { member_id: string };
    const member = await getMember(body.member_id);
    const text = encodeURIComponent(`Hi ${member.name}, your Fitness World membership update is ready. - Fitness World`);
    res.json({
      success: true,
      data: {
        url: `https://wa.me/91${member.phone}?text=${text}`,
      },
    });
  } catch (error) {
    next(error);
  }
});
