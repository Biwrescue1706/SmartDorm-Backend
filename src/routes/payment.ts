// src/routes/payment.ts
import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// 📂 โฟลเดอร์เก็บไฟล์สลิป
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ✅ ใช้ memoryStorage (เก็บใน RAM ก่อน)
const upload = multer({ storage: multer.memoryStorage() });

// 📤 User ส่งสลิปการจ่ายบิล
router.post(
  "/create",
  upload.single("slip"),
  async (req: Request, res: Response) => {
    try {
      const { billId } = req.body;
      const slipFile = req.file;

      // ✅ ตรวจสอบบิล
      const bill = await prisma.bill.findUnique({
        where: { billId },
        include: { customer: true, room: true },
      });
      if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });

      if (bill.status === 1) {
        return res.status(400).json({ error: "บิลนี้ชำระแล้ว" });
      }

      if (bill.status === 2) {
        return res.status(400).json({ error: "บิลนี้กำลังรอตรวจสอบ" });
      }

      // ✅ จัดการ slip file
      let slipUrl = "";
      if (slipFile) {
        const filename = `${Date.now()}_${slipFile.originalname}`;
        const filepath = path.join(UPLOAD_DIR, filename);
        await fs.promises.writeFile(filepath, slipFile.buffer);

        const baseUrl =
          process.env.BASE_URL || "https://smartdorm-backend.onrender.com";
        slipUrl = `${baseUrl}/uploads/${filename}`;
      } else {
        return res.status(400).json({ error: "ต้องแนบสลิปการจ่าย" });
      }

      // ✅ สร้าง Payment
      const payment = await prisma.payment.create({
        data: {
          slipUrl,
          billId,
        },
      });

      // ✅ อัปเดตบิลเป็น pending (2)
      await prisma.bill.update({
        where: { billId },
        data: { status: 2, slipUrl },
      });

      // 🔔 Notify Admin
      const adminMsg = `📢 ผู้เช่า ${bill.customer.fullName} 
      เบอร์โทร(${bill.customer.cphone}) 
      ส่งสลิปชำระบิล ${bill.number} 
      ห้อง ${bill.room.number} 
      https://smartdorm-frontend.onrender.com
      `;
      await notifyUser(process.env.ADMIN_LINE_ID!, adminMsg);

      res.json({ message: "✅ ส่งสลิปสำเร็จ", payment });
    } catch (err) {
      console.error("❌ Error create payment:", err);
      res.status(500).json({ error: "ไม่สามารถบันทึกการจ่ายได้" });
    }
  }
);

// ✅ Admin ยืนยันการจ่าย
router.put(
  "/:paymentId/verify",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;

      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        include: { bill: { include: { customer: true, room: true } } },
      });
      if (!payment || !payment.bill)
        return res.status(404).json({ error: "ไม่พบข้อมูลการจ่าย" });

      // ✅ อัปเดตบิล → ชำระแล้ว
      const updatedBill = await prisma.bill.update({
        where: { billId: payment.bill.billId },
        data: { status: 1 },
      });

      // 🔔 แจ้ง User
      const Usermsg = `✅ การชำระบิล ห้อง${payment.bill.room.number} ได้รับการยืนยันแล้ว`;
      await notifyUser(process.env.ADMIN_LINE_ID!, Usermsg);

      res.json({ message: "✅ ยืนยันการจ่ายสำเร็จ", bill: updatedBill });
    } catch (err) {
      console.error("❌ Error verify payment:", err);
      res.status(500).json({ error: "ไม่สามารถยืนยันการจ่ายได้" });
    }
  }
);

// ❌ Admin ยกเลิก/ปฏิเสธการจ่าย
router.put(
  "/:paymentId/reject",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;

      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        include: { bill: { include: { customer: true, room: true } } },
      });
      if (!payment || !payment.bill)
        return res.status(404).json({ error: "ไม่พบข้อมูลการจ่าย" });

      // ✅ ลบ payment ออก
      await prisma.payment.delete({ where: { paymentId } });

      // ✅ อัปเดตบิลกลับไปยัง "ยังไม่ชำระ" (0)
      const updatedBill = await prisma.bill.update({
        where: { billId: payment.bill.billId },
        data: { status: 0, slipUrl: "" },
      });

      // 🔔 แจ้ง User
      const Usermsg =`❌ การชำระบิล ห้อง${payment.bill.room.number} ไม่ผ่านการตรวจสอบ กรุณาติดต่อผู้ดูแล`;
      await notifyUser(process.env.ADMIN_LINE_ID!, Usermsg);

      res.json({ message: "❌ ปฏิเสธการจ่ายแล้ว", bill: updatedBill });
    } catch (err) {
      console.error("❌ Error reject payment:", err);
      res.status(500).json({ error: "ไม่สามารถปฏิเสธการจ่ายได้" });
    }
  }
);

// 📌 Admin ดูการจ่ายทั้งหมด
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: { bill: { include: { customer: true, room: true } } },
    });
    res.json(payments);
  } catch (err) {
    console.error("❌ Error fetching payments:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการจ่ายได้" });
  }
});

export default router;
