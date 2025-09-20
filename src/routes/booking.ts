import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";

const router = Router();

// ใช้ memoryStorage เพื่ออัปโหลดไฟล์แบบ Buffer
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 📌 จองห้อง (ผู้ใช้ล็อกอิน)
 */
router.post("/book", async (req: Request, res: Response) => {
  try {
    const { userId, roomId, checkin } = req.body;

    // ตรวจสอบผู้ใช้
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    // ตรวจสอบห้อง
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status !== 0) return res.status(400).json({ error: "ห้องนี้ถูกจองหรือไม่ว่าง" });

    // กันผู้ใช้จองหลายห้อง
    const existing = await prisma.booking.findFirst({
      where: { userId, status: { in: [0, 1] } },
    });
    if (existing) return res.status(400).json({ error: "คุณมีการจองหรือเข้าพักอยู่แล้ว" });

    // Transaction
    const [booking] = await prisma.$transaction([
      prisma.booking.create({
        data: {
          user: { connect: { id: userId } },
          room: { connect: { id: roomId } },
          checkin: new Date(checkin),
          status: 0,
          slip: Buffer.from(""), // 👈 ไม่ใช้ null แล้ว
        },
      }),
      prisma.room.update({ where: { id: roomId }, data: { status: 1 } }),
    ]);

    // แจ้งเตือน
    await notifyUser("Ud13f39623a835511f5972b35cbc5cdbd",
      `📢 ผู้ใช้ ${user.name} (${user.phone}) จองห้อง ${room.number}`);
    await notifyUser(user.userId, `🛏️ คุณได้จองห้อง ${room.number} เรียบร้อยแล้ว`);

    res.json({ message: "✅ จองห้องสำเร็จ", booking });
  } catch (err) {
    console.error("❌ Error booking:", err);
    res.status(500).json({ error: "ไม่สามารถจองห้องได้" });
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
    if (booking.status === 2) return res.status(400).json({ error: "ห้องนี้ถูกคืนไปแล้ว" });

    const [updated] = await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { checkout: new Date(), status: 2 },
        include: { user: true, room: true },
      }),
      prisma.room.update({ where: { id: booking.roomId }, data: { status: 0 } }),
    ]);

    await notifyUser("Ud13f39623a835511f5972b35cbc5cdbd",
      `📢 ผู้ใช้ ${updated.user.name} (${updated.user.phone}) คืนห้อง ${updated.room.number}`);
    await notifyUser(updated.user.userId,
      `📤 คุณได้คืนห้อง ${updated.room.number} เรียบร้อยแล้ว`);

    res.json({ message: "✅ คืนห้องสำเร็จ", booking: updated });
  } catch (err) {
    console.error("❌ Error checkout:", err);
    res.status(500).json({ error: "ไม่สามารถคืนห้องได้" });
  }
});

/**
 * 📌 จองห้องพร้อม Slip
 */
router.post("/create", upload.single("slip"), async (req: Request, res: Response) => {
  try {
    const { userId, roomId, checkin } = req.body;
    const slip = req.file;

    if (!slip) return res.status(400).json({ error: "กรุณาอัปโหลดสลิป" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status !== 0) return res.status(400).json({ error: "ห้องนี้ถูกจองหรือไม่ว่าง" });

    const [booking] = await prisma.$transaction([
      prisma.booking.create({
        data: {
          user: { connect: { id: userId } },
          room: { connect: { id: roomId } },
          checkin: new Date(checkin),
          slip: slip.buffer, // ✅ เก็บ binary
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
 * 📌 โหลด Slip
 */
router.get("/:id/slip", async (req: Request, res: Response) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: { slip: true },
    });

    if (!booking || !booking.slip) return res.status(404).json({ error: "ไม่พบสลิป" });

    res.setHeader("Content-Type", "image/png");
    res.send(Buffer.from(booking.slip));
  } catch (err) {
    console.error("❌ Error fetching slip:", err);
    res.status(500).json({ error: "โหลดสลิปล้มเหลว" });
  }
});

export default router;
