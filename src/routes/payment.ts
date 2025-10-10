import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const router = Router();

// ✅ Memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Init Supabase
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

// 📤 ผู้เช่าส่งสลิปการจ่ายบิล (ยืนยันผ่าน LINE accessToken)
router.post(
  "/create",
  upload.single("slip"),
  async (req: Request, res: Response) => {
    try {
      const { billId, accessToken } = req.body;
      const slipFile = req.file;

      if (!accessToken)
        return res
          .status(401)
          .json({ error: "ไม่มี accessToken จาก LINE LIFF" });
      if (!slipFile)
        return res.status(400).json({ error: "ต้องแนบสลิปการจ่าย" });

      // ✅ ตรวจสอบ token และดึง userId
      const { userId } = await verifyLineToken(accessToken);
      const customer = await prisma.customer.findFirst({ where: { userId } });
      if (!customer)
        return res.status(404).json({ error: "ไม่พบข้อมูลลูกค้า" });

      // ✅ ตรวจสอบว่า bill เป็นของลูกค้าคนนี้จริงไหม
      const bill = await prisma.bill.findUnique({
        where: { billId },
        include: { customer: true, room: true },
      });

      if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });
      if (bill.customerId !== customer.customerId)
        return res
          .status(403)
          .json({ error: "ไม่มีสิทธิ์ส่งสลิปสำหรับบิลนี้" });
      if (bill.status === 1)
        return res.status(400).json({ error: "บิลนี้ชำระแล้ว" });
      if (bill.status === 2)
        return res.status(400).json({ error: "บิลนี้กำลังรอตรวจสอบ" });

      // ✅ อัปโหลด Slip ไป Supabase
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

      // ✅ Transaction: สร้าง Payment + อัปเดต Bill
      const [payment, updatedBill] = await prisma.$transaction([
        prisma.payment.create({
          data: {
            slipUrl,
            billId,
            customerId: bill.customerId,
          },
        }),
        prisma.bill.update({
          where: { billId },
          data: { status: 2, slipUrl }, // 2 = pending ตรวจสอบ
        }),
      ]);

      // 🔔 แจ้ง Admin ผ่าน LINE
      const adminMsg = `📢 ผู้เช่า ${bill.customer.fullName}
เบอร์โทร (${bill.customer.cphone})
ส่งสลิปชำระบิล ${bill.number}
ห้อง ${bill.room.number}
https://smartdorm-frontend.onrender.com`;

      if (process.env.ADMIN_LINE_ID)
        await notifyUser(process.env.ADMIN_LINE_ID, adminMsg);

      res.json({ message: "✅ ส่งสลิปสำเร็จ", payment, bill: updatedBill });
    } catch (err) {
      console.error("Payment create error:", err);
      res.status(500).json({ error: "ไม่สามารถบันทึกการจ่ายได้" });
    }
  }
);

// ✅ Admin ยืนยันการจ่ายบิล
router.put(
  "/:paymentId/verify",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;
      const adminId = (req as any).user?.adminId;

      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        include: { bill: { include: { customer: true, room: true } } },
      });

      if (!payment || !payment.bill)
        return res.status(404).json({ error: "ไม่พบข้อมูลการจ่าย" });

      const updatedBill = await prisma.bill.update({
        where: { billId: payment.bill.billId },
        data: { status: 1, updatedBy: adminId },
      });

      const userMsg = `✅ การชำระบิลห้อง ${payment.bill.room.number} ได้รับการยืนยันแล้ว ขอบคุณที่ใช้บริการ SmartDorm 😊`;

      if (payment.bill.customer.userId)
        await notifyUser(payment.bill.customer.userId, userMsg);

      res.json({ message: "✅ ยืนยันการจ่ายสำเร็จ", bill: updatedBill });
    } catch {
      res.status(500).json({ error: "ไม่สามารถยืนยันการจ่ายได้" });
    }
  }
);

// ❌ Admin ปฏิเสธการจ่ายบิล
router.put(
  "/:paymentId/reject",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;
      const adminId = (req as any).user?.adminId;

      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        include: { bill: { include: { customer: true, room: true } } },
      });

      if (!payment || !payment.bill)
        return res.status(404).json({ error: "ไม่พบข้อมูลการจ่าย" });

      const [updatedPayment, updatedBill] = await prisma.$transaction([
        prisma.payment.update({
          where: { paymentId },
          data: { slipUrl: payment.slipUrl },
        }),
        prisma.bill.update({
          where: { billId: payment.bill.billId },
          data: { status: 0, slipUrl: "", updatedBy: adminId },
        }),
      ]);

      const userMsg = `❌ การชำระบิลห้อง ${payment.bill.room.number} ไม่ผ่านการตรวจสอบ กรุณาติดต่อผู้ดูแลระบบ`;

      if (payment.bill.customer.userId)
        await notifyUser(payment.bill.customer.userId, userMsg);

      res.json({
        message: "❌ ปฏิเสธการจ่ายสำเร็จ",
        payment: updatedPayment,
        bill: updatedBill,
      });
    } catch {
      res.status(500).json({ error: "ไม่สามารถปฏิเสธการจ่ายได้" });
    }
  }
);

// 📋 Admin ดึงข้อมูลการจ่ายทั้งหมด
router.get("/getall", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: { bill: { include: { customer: true, room: true } } },
    });
    res.json(payments);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการจ่ายได้" });
  }
});

export default router;
