import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const router = Router();

// ✅ ใช้ memoryStorage (เก็บใน RAM ชั่วคราว)
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Init Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

/* ======================================================
   📤 ผู้เช่าส่งสลิปการจ่ายบิล
====================================================== */
router.post(
  "/create",
  upload.single("slip"),
  async (req: Request, res: Response) => {
    try {
      const { billId } = req.body;
      const slipFile = req.file;

      const bill = await prisma.bill.findUnique({
        where: { billId },
        include: { customer: true, room: true },
      });

      if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });
      if (bill.status === 1)
        return res.status(400).json({ error: "บิลนี้ชำระแล้ว" });
      if (bill.status === 2)
        return res.status(400).json({ error: "บิลนี้กำลังรอตรวจสอบ" });

      // ✅ อัปโหลด Slip ไป Supabase
      let slipUrl = "";
      if (slipFile) {
        const filename = `${Date.now()}_${slipFile.originalname}`;

        const { error } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET!)
          .upload(filename, slipFile.buffer, {
            contentType: slipFile.mimetype,
            upsert: true,
          });

        if (error) {
          return res.status(500).json({ error: "อัปโหลดสลิปไม่สำเร็จ" });
        }

        const { data } = supabase.storage
          .from(process.env.SUPABASE_BUCKET!)
          .getPublicUrl(filename);

        slipUrl = data.publicUrl;
      } else {
        return res.status(400).json({ error: "ต้องแนบสลิปการจ่าย" });
      }

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

      if (process.env.ADMIN_LINE_ID) {
        await notifyUser(process.env.ADMIN_LINE_ID, adminMsg);
      }

      res.json({ message: "✅ ส่งสลิปสำเร็จ", payment, bill: updatedBill });
    } catch {
      res.status(500).json({ error: "ไม่สามารถบันทึกการจ่ายได้" });
    }
  }
);

//✅ Admin ยืนยันการจ่ายบิล

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

      if (payment.bill.customer.userId) {
        await notifyUser(payment.bill.customer.userId, userMsg);
      }

      res.json({ message: "✅ ยืนยันการจ่ายสำเร็จ", bill: updatedBill });
    } catch {
      res.status(500).json({ error: "ไม่สามารถยืนยันการจ่ายได้" });
    }
  }
);

   //❌ Admin ปฏิเสธการจ่ายบิล
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

      if (payment.bill.customer.userId) {
        await notifyUser(payment.bill.customer.userId, userMsg);
      }

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

/* ======================================================
   📋 Admin ดึงข้อมูลการจ่ายทั้งหมด
====================================================== */
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
