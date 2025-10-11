// src/routes/payment.ts
import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// ✅ ตรวจสอบ token กับ LINE API
async function verifyLineToken(accessToken: string): Promise<{
  userId: string;
  displayName: string;
  pictureUrl?: string;
}> {
  const res = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("LINE token ไม่ถูกต้องหรือหมดอายุ");
  return (await res.json()) as {
    userId: string;
    displayName: string;
    pictureUrl?: string;
  };
}

// 📤 ผู้เช่าส่งสลิปการจ่ายบิล
router.post("/create", upload.single("slip"), async (req: Request, res: Response) => {
  try {
    const { billId, accessToken } = req.body;
    const slipFile = req.file;

    if (!accessToken)
      return res.status(401).json({ error: "ไม่มี accessToken จาก LINE LIFF" });
    if (!slipFile)
      return res.status(400).json({ error: "ต้องแนบสลิปการจ่าย" });

    const { userId } = await verifyLineToken(accessToken);
    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer) return res.status(404).json({ error: "ไม่พบข้อมูลลูกค้า" });

    const bill = await prisma.bill.findUnique({
      where: { billId },
      include: { customer: true, room: true },
    });

    if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });
    if (bill.customerId !== customer.customerId)
      return res.status(403).json({ error: "ไม่มีสิทธิ์ส่งสลิปสำหรับบิลนี้" });
    if (bill.status === 1)
      return res.status(400).json({ error: "บิลนี้ชำระแล้ว" });
    if (bill.status === 2)
      return res.status(400).json({ error: "บิลนี้กำลังรอตรวจสอบ" });

    const filename = `${Date.now()}_${slipFile.originalname}`;
    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .upload(filename, slipFile.buffer, {
        contentType: slipFile.mimetype,
        upsert: true,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return res.status(500).json({ error: "อัปโหลดสลิปไม่สำเร็จ" });
    }

    const { data } = supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .getPublicUrl(filename);

    const slipUrl = data.publicUrl;

    const [payment, updatedBill] = await prisma.$transaction([
      prisma.payment.create({
        data: { slipUrl, billId, customerId: bill.customerId },
      }),
      prisma.bill.update({
        where: { billId },
        data: { status: 2, slipUrl },
      }),
    ]);

    const adminMsg = `📢 ผู้เช่า ${bill.customer.fullName}
เบอร์โทร (${bill.customer.cphone})
ส่งสลิปชำระบิล ${bill.billId.slice(-6).toUpperCase()}
ห้อง ${bill.room.number}
https://smartdorm-frontend.onrender.com`;

    if (process.env.ADMIN_LINE_ID)
      await notifyUser(process.env.ADMIN_LINE_ID, adminMsg);

    res.json({ message: "✅ ส่งสลิปสำเร็จ", payment, bill: updatedBill });
  } catch (err) {
    console.error("Payment create error:", err);
    res.status(500).json({ error: "ไม่สามารถบันทึกการจ่ายได้" });
  }
});

export default router;
