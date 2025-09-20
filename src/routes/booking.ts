// src/routes/booking.ts
import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// 📂 โฟลเดอร์เก็บไฟล์สลิป
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ✅ ใช้ memoryStorage
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 📌 จองห้อง (ไม่แนบสลิป)
 */
router.post("/book", async (req: Request, res: Response) => {
  try {
    const { userId, roomId, checkin, name, phone, mumId } = req.body;

    // ✅ หา user ถ้าไม่มีให้สร้าง
    let user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      user = await prisma.user.create({
        data: { userId, name, phone, mumId },
      });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status !== 0)
      return res.status(400).json({ error: "ห้องนี้ถูกจองหรือไม่ว่าง" });

    // กันไม่ให้ผู้ใช้จองหลายห้องพร้อมกัน
    const existing = await prisma.booking.findFirst({
      where: { userId, status: { in: [0, 1] } },
    });
    if (existing)
      return res
        .status(400)
        .json({ error: "คุณมีการจองหรือเข้าพักอยู่แล้ว" });

    const [booking] = await prisma.$transaction([
      prisma.booking.create({
        data: {
          user: { connect: { userId } },
          room: { connect: { id: roomId } },
          checkin: new Date(checkin),
          status: 0,
          slipUrl: null,
        },
      }),
      prisma.room.update({ where: { id: roomId }, data: { status: 1 } }),
    ]);

    // ✅ แจ้งเตือน LINE
    await notifyUser(
      "Ud13f39623a835511f5972b35cbc5cdbd", // admin
      `📢 ผู้ใช้ ${user.name} (${user.phone}) จองห้อง ${room.number}`
    );
    await notifyUser(user.userId, `🛏️ คุณได้จองห้อง ${room.number} เรียบร้อยแล้ว`);

    res.json({ message: "✅ จองห้องสำเร็จ", booking });
  } catch (err) {
    console.error("❌ Error booking:", err);
    res.status(500).json({ error: "ไม่สามารถจองห้องได้" });
  }
});

/**
 * 📌 จองห้อง + แนบสลิป (เก็บ URL)
 */
router.post("/create", upload.single("slip"), async (req: Request, res: Response) => {
  try {
    const { userId, roomId, checkin, name, phone, mumId } = req.body;
    const slip = req.file;

    if (!slip) return res.status(400).json({ error: "กรุณาอัปโหลดสลิป" });

    // ✅ หา user ถ้าไม่มีให้สร้าง
    let user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      user = await prisma.user.create({
        data: { userId, name, phone, mumId },
      });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status !== 0)
      return res.status(400).json({ error: "ห้องนี้ถูกจองหรือไม่ว่าง" });

    // ✅ เซฟไฟล์ slip
    const filename = `${Date.now()}_${slip.originalname}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, slip.buffer);

    const slipUrl = `/uploads/${filename}`;

    const [booking] = await prisma.$transaction([
      prisma.booking.create({
        data: {
          user: { connect: { userId } },
          room: { connect: { id: roomId } },
          checkin: new Date(checkin),
          slipUrl,
          status: 0,
        },
      }),
      prisma.room.update({ where: { id: roomId }, data: { status: 1 } }),
    ]);

    res.json({ message: "✅ จองห้องพร้อม Slip สำเร็จ", booking });
  } catch (err) {
    console.error("❌ Error booking with slip:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการจอง" });
  }
});

/**
 * 📌 คืนห้อง
 */
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบบันทึกการจอง" });
    if (booking.status === 2)
      return res.status(400).json({ error: "ห้องนี้ถูกคืนไปแล้ว" });

    const [updated] = await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { checkout: new Date(), status: 2 },
        include: { user: true, room: true },
      }),
      prisma.room.update({ where: { id: booking.roomId }, data: { status: 0 } }),
    ]);

    if (updated.user) {
      await notifyUser(
        "Ud13f39623a835511f5972b35cbc5cdbd",
        `📢 ผู้ใช้ ${updated.user.name} (${updated.user.phone}) คืนห้อง ${updated.room.number}`
      );
      await notifyUser(
        updated.user.userId,
        `📤 คุณได้คืนห้อง ${updated.room.number} เรียบร้อยแล้ว`
      );
    }

    res.json({ message: "✅ คืนห้องสำเร็จ", booking: updated });
  } catch (err) {
    console.error("❌ Error checkout:", err);
    res.status(500).json({ error: "ไม่สามารถคืนห้องได้" });
  }
});

export default router;
