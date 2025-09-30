import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";

const router = Router();

//📌 ดึงการคืนทั้งหมด (Admin)
router.get("/getall", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const checkouts = await prisma.booking.findMany({
      where: { checkout: { not: null } },
      orderBy: { checkout: "desc" },
      include: { room: true, customer: true },
    });
    res.json(checkouts);
  } catch (err) {
    console.error("❌ Error fetching checkouts:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการคืนได้" });
  }
});

// 🚪 ผู้เช่าขอคืนห้อง
router.put("/:bookingId/checkout", async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { checkout } = req.body;

    if (!checkout) {
      return res.status(400).json({ error: "ต้องระบุวันที่คืนห้อง" });
    }

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    const updated = await prisma.booking.update({
      where: { bookingId },
      data: {
        checkout: new Date(checkout),
        returnStatus: 0, // 0 = รออนุมัติคืน
      },
      include: { customer: true, room: true },
    });

    // 📢 แจ้ง Admin group
    const Adminmsg = `📢 ผู้เช่า \n
    ชื่อ : ${booking.customer.fullName} \n
    เบอร์โทร : (${booking.customer.cphone}) \n
    ขอคืนห้อง ${booking.room.number} \n
    https://smartdorm-frontend.onrender.com
    `;
    await notifyUser(process.env.ADMIN_LINE_ID!, Adminmsg);

    res.json({
      message: "✅ ขอคืนห้องสำเร็จ รอแอดมินอนุมัติ",
      booking: updated,
    });
  } catch (err) {
    console.error("❌ Error checkout booking:", err);
    res.status(500).json({ error: "ไม่สามารถคืนห้องได้" });
  }
});

// ✅ อนุมัติการคืนห้อง
router.put(
  "/:bookingId/approveCheckout",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { bookingId },
        include: { customer: true, room: true },
      });
      if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

      if (!booking.checkout) {
        return res.status(400).json({ error: "ยังไม่มีการขอคืนห้อง" });
      }

      const [updatedBooking] = await prisma.$transaction([
        prisma.booking.update({
          where: { bookingId },
          data: {
            returnStatus: 1, // อนุมัติคืน
            status: 3, // ปิด booking
          },
        }),
        prisma.room.update({
          where: { roomId: booking.roomId },
          data: { status: 0 }, // ห้องกลับไปเป็นว่าง
        }),
      ]);

      // 📢 แจ้งไปยัง User
      await notifyUser(
        booking.customer.userId,
        `✅ การคืนห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว`
      );

      res.json({
        message: "✅ อนุมัติการคืนห้องสำเร็จ",
        booking: updatedBooking,
      });
    } catch (err) {
      console.error("❌ Error approving checkout:", err);
      res.status(500).json({ error: "ไม่สามารถอนุมัติการคืนได้" });
    }
  }
);

// ❌ ปฏิเสธการคืนห้อง
router.put(
  "/:bookingId/rejectCheckout",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { bookingId },
        include: { customer: true, room: true },
      });
      if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

      const updatedBooking = await prisma.booking.update({
        where: { bookingId },
        data: { returnStatus: 2 },
      });

      // 📢 แจ้งไปยัง User
      const Usermsg = `❌ การคืนห้อง ${booking.room.number} ไม่ได้รับการอนุมัติ`;
      await notifyUser(booking.customer.userId, Usermsg);

      res.json({ message: "❌ ปฏิเสธการคืนสำเร็จ", booking: updatedBooking });
    } catch (err) {
      console.error("❌ Error rejecting checkout:", err);
      res.status(500).json({ error: "ไม่สามารถปฏิเสธการคืนได้" });
    }
  }
);

//✏️ Admin แก้ไขข้อมูลการคืน
router.put(
  "/:bookingId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { checkout, returnStatus } = req.body;

      const booking = await prisma.booking.findUnique({
        where: { bookingId },
        include: { customer: true, room: true },
      });
      if (!booking) return res.status(404).json({ error: "ไม่พบข้อมูลการคืน" });

      const updatedBooking = await prisma.booking.update({
        where: { bookingId },
        data: {
          ...(checkout && { checkout: new Date(checkout) }),
          ...(returnStatus !== undefined && { returnStatus }),
        },
        include: { room: true, customer: true },
      });

      res.json({
        message: "✏️ แก้ไขข้อมูลการคืนสำเร็จ",
        booking: updatedBooking,
      });
    } catch (err) {
      console.error("❌ Error updating checkout:", err);
      res.status(500).json({ error: "ไม่สามารถแก้ไขข้อมูลการคืนได้" });
    }
  }
);

//🗑️ Admin ลบข้อมูลการคืน
router.delete(
  "/:bookingId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;

      const booking = await prisma.booking.findUnique({ where: { bookingId } });
      if (!booking) return res.status(404).json({ error: "ไม่พบข้อมูลการคืน" });

      const updatedBooking = await prisma.booking.update({
        where: { bookingId },
        data: {
          checkout: null,
          returnStatus: null,
          status: booking.status === 3 ? 1 : booking.status,
          // ถ้าเคยปิด booking ไปแล้ว -> revert กลับเป็น active
        },
      });

      res.json({ message: "🗑️ ลบข้อมูลการคืนสำเร็จ", booking: updatedBooking });
    } catch (err) {
      console.error("❌ Error deleting checkout:", err);
      res.status(500).json({ error: "ไม่สามารถลบข้อมูลการคืนได้" });
    }
  }
);

export default router;
