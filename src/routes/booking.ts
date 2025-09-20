import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { notifyUser } from "../utils/lineNotify";

const router = Router();

/**
 * 📌 จองห้อง
 */
router.post("/book", async (req: Request, res: Response) => {
  try {
    const { userId, roomId, checkin } = req.body;

    // ✅ ตรวจสอบผู้ใช้
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    // ✅ ตรวจสอบห้อง
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status !== 0) {
      return res.status(400).json({ error: "ห้องนี้ถูกจองหรือไม่ว่าง" });
    }

    // ✅ กันไม่ให้ User จองหลายห้องพร้อมกัน
    const existingBooking = await prisma.booking.findFirst({
      where: { userId, status: { in: [0, 1] } }, // 0=จอง, 1=เข้าพัก
    });
    if (existingBooking) {
      return res.status(400).json({ error: "คุณมีการจองหรือเข้าพักอยู่แล้ว" });
    }

    // ✅ ใช้ Transaction เพื่อความปลอดภัย
    const [booking] = await prisma.$transaction([
      prisma.booking.create({
        data: {
          userId,
          roomId,
          checkin: new Date(checkin),
          status: 0, // active
        },
      }),
      prisma.room.update({
        where: { id: roomId },
        data: { status: 1 }, // ห้องถูกจองแล้ว
      }),
    ]);

    // 🔔 แจ้ง Admin
    await notifyUser(
      "Ud13f39623a835511f5972b35cbc5cdbd",
      `📢 ผู้ใช้ ${user.name} (${user.phone}) จองห้อง ${room.number}`
    );

    // 🔔 แจ้ง User
    await notifyUser(
      user.userId,
      `🛏️ คุณได้จองห้อง ${room.number} เรียบร้อยแล้ว`
    );

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

    // ✅ ตรวจสอบ booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบบันทึกการจอง" });
    if (booking.status === 2) {
      return res.status(400).json({ error: "ห้องนี้ถูกคืนไปแล้ว" });
    }

    // ✅ ใช้ Transaction อัปเดต booking และ room
    const [updatedBooking] = await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { checkout: new Date(), status: 2 }, // checked_out
        include: { user: true, room: true },
      }),
      prisma.room.update({
        where: { id: booking.roomId },
        data: { status: 0 }, // ห้องว่าง
      }),
    ]);

    // 🔔 แจ้ง Admin
    await notifyUser(
      "Ud13f39623a835511f5972b35cbc5cdbd",
      `📢 ผู้ใช้ ${updatedBooking.user.name} (${updatedBooking.user.phone}) คืนห้อง ${updatedBooking.room.number}`
    );

    // 🔔 แจ้ง User
    await notifyUser(
      updatedBooking.user.userId,
      `📤 คุณได้คืนห้อง ${updatedBooking.room.number} เรียบร้อยแล้ว`
    );

    res.json({ message: "✅ คืนห้องสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error checkout:", err);
    res.status(500).json({ error: "ไม่สามารถคืนห้องได้" });
  }
});

export default router;
