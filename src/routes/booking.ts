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
    const { userId, userName, roomId, checkin, cname, csurname, cphone, cmumId, slipUrl } = req.body;
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
        slipUrl: finalSlipUrl,
        status: 0,
      },
      include: { customer: true, room: true },
    });

    // แจ้ง Admin
    await notifyUser(
      "ADMIN_LINE_ID",
      `📢 ผู้เช่า ${customer.cname} (${customer.cphone}) ส่งคำขอจองห้อง ${room.number}`
    );

    res.json({ message: "✅ ส่งคำขอจองเรียบร้อย รอแอดมินอนุมัติ", booking });
  } catch (err) {
    console.error("❌ Error create booking:", err);
    res.status(500).json({ error: "ไม่สามารถจองห้องได้" });
  }
});

/**
 * 🔄 ผู้เช่าคืนห้อง
 */
router.put("/:bookingId/checkout", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { checkout } = req.body;

    if (!checkout) {
      return res.status(400).json({ error: "ต้องระบุวันที่คืนห้อง" });
    }

    const booking = await prisma.booking.findUnique({ where: { bookingId } });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    const updated = await prisma.booking.update({
      where: { bookingId },
      data: {
        checkout: new Date(checkout),
        status: 3, // คืนห้อง
      },
    });

    // อัพเดทห้องกลับเป็นว่าง
    await prisma.room.update({
      where: { roomId: booking.roomId },
      data: { status: 0 },
    });

    res.json({ message: "✅ คืนห้องสำเร็จ", booking: updated });
  } catch (err) {
    console.error("❌ Error checkout booking:", err);
    res.status(500).json({ error: "ไม่สามารถคืนห้องได้" });
  }
});

/**
 * ✅ Admin อนุมัติการจอง
 */
router.put("/:bookingId/approve", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { room: true, customer: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    if (booking.status === 1) {
      return res.status(400).json({ error: "การจองนี้ถูกอนุมัติแล้ว" });
    }

    const [updatedBooking] = await prisma.$transaction([
      prisma.booking.update({
        where: { bookingId },
        data: { status: 1 },
      }),
      prisma.room.update({
        where: { roomId: booking.roomId },
        data: { status: 1 },
      }),
    ]);

    await notifyUser(
      booking.customer.userId,
      `✅ การจองห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว`
    );

    res.json({ message: "✅ อนุมัติการจองสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error approving booking:", err);
    res.status(500).json({ error: "ไม่สามารถอนุมัติการจองได้" });
  }
});

/**
 * ❌ Admin ปฏิเสธการจอง
 */
router.put("/:bookingId/reject", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    const updatedBooking = await prisma.booking.update({
      where: { bookingId },
      data: { status: 2 }, // ปฏิเสธ
    });

    await notifyUser(
      booking.customer.userId,
      `❌ การจองห้อง ${booking.room.number} ไม่ผ่านการอนุมัติ`
    );

    res.json({ message: "❌ ปฏิเสธการจองสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error rejecting booking:", err);
    res.status(500).json({ error: "ไม่สามารถปฏิเสธการจองได้" });
  }
});

/**
 * 📌 ดึงการจองทั้งหมด (Admin)
 */
router.get("/getall", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: true, customer: true, payment: true },
    });
    res.json(bookings);
  } catch (err) {
    console.error("❌ Error fetching bookings:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการจองได้" });
  }
});

export default router;
