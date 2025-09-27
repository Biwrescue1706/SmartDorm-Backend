// src/routes/booking.ts
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

/**
 * 📝 User ขอจองห้อง (แนบ slip ได้ทั้งแบบ url และไฟล์จริง)
 */
router.post("/create", upload.single("slip"), async (req: Request, res: Response) => {
  try {
    const { userId, ctitle, userName, roomId, checkin, cname, csurname, cphone, cmumId, slipUrl } =
      req.body;
    const slipFile = req.file;

    if (!userId || !roomId || !checkin) {
      return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
    }

    // ✅ หา/สร้าง Customer
    let customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          userId,
          userName,
          ctitle,
          cname,
          csurname,
          cphone,
          cmumId,
          fullName: `${cname} ${csurname}`,
        },
      });
    }

    // ✅ ตรวจสอบห้อง
    const room = await prisma.room.findUnique({ where: { roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status !== 0) return res.status(400).json({ error: "ห้องไม่ว่าง" });

    // ✅ จัดการ slip (ถ้ามีการอัปโหลดไฟล์)
    let finalSlipUrl = slipUrl || "";
    if (slipFile) {
      const filename = `${Date.now()}_${slipFile.originalname}`;
      const filepath = path.join(UPLOAD_DIR, filename);
      await fs.promises.writeFile(filepath, slipFile.buffer);
      finalSlipUrl = `/uploads/${filename}`;
    }

    // ✅ ตรวจสอบว่ามี booking ค้างอยู่ไหม
    const existing = await prisma.booking.findFirst({
      where: { customerId: customer.customerId, status: { in: [0, 1] } },
    });
    if (existing) {
      return res.status(400).json({ error: "คุณมีการจอง/เข้าพักอยู่แล้ว" });
    }

    // ✅ สร้าง booking (status = 0 รออนุมัติ)
    const booking = await prisma.booking.create({
      data: {
        customerId: customer.customerId,
        roomId,
        checkin: new Date(checkin),
        status: 0,
      },
      include: { customer: true, room: true, payments: true },
    });

    // ✅ ถ้ามี slip → บันทึกใน Payment
    if (finalSlipUrl) {
      await prisma.payment.create({
        data: {
          bookingId: booking.bookingId,
          slipUrl: finalSlipUrl,
        },
      });
    }

    // ✅ ดึง booking ใหม่พร้อม payments
    const bookingWithPayments = await prisma.booking.findUnique({
      where: { bookingId: booking.bookingId },
      include: { customer: true, room: true, payments: true },
    });

    // แจ้ง Admin
    await notifyUser(
      process.env.ADMIN_LINE_ID!,
      `📢 ผู้เช่า ${customer.cname} (${customer.cphone}) ส่งคำขอจองห้อง ${room.number}`
    );

    res.json({
      message: "✅ ส่งคำขอจองเรียบร้อย รอแอดมินอนุมัติ",
      booking: bookingWithPayments,
    });
  } catch (err) {
    console.error("❌ Error create booking:", err);
    res.status(500).json({ error: "ไม่สามารถจองห้องได้" });
  }
});

/**
 * 📌 ดึงการจองทั้งหมด (Admin)
 */
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: true, customer: true, payments: true },
    });
    res.json(bookings);
  } catch (err) {
    console.error("❌ Error fetching bookings:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการจองได้" });
  }
});

export default router;
