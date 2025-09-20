import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

/**
 * LINE Messaging API Webhook
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const events = req.body.events;

    for (const event of events) {
      if (event.type === "follow") {
        // สมัคร user อัตโนมัติ
        const lineUserId = event.source.userId;
        await prisma.user.upsert({
          where: { userId: lineUserId },
          update: {},
          create: { userId: lineUserId, mumId: "-", name: "New User", phone: "-" },
        });
      }

      if (event.type === "message" && event.message.type === "text") {
        const text = event.message.text;
        // คุณสามารถเขียน logic: "จองห้อง 101" หรือ "คืนห้อง" ตรงนี้
      }
    }

    res.json({ message: "ok" });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).json({ error: "webhook error" });
  }
});

export default router;
