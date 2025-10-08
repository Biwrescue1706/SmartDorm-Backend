import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { notifyUser } from "../utils/lineNotify";

const router = Router();

/* ======================================================
   📌 ดึงข้อมูลการคืนทั้งหมด (Admin)
====================================================== */
router.get("/getall", async (_req: Request, res: Response) => {
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

/* ======================================================
   📌 ผู้เช่าดึง booking ของตัวเอง (ที่สามารถขอคืนได้)
====================================================== */
router.get("/myBookings/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    console.log("🧩 GET /checkout/myBookings => userId:", userId);

    // ✅ ดึง customer จาก userId
    const customer = await prisma.customer.findFirst({
      where: { userId },
    });

    if (!customer) {
      console.warn("⚠️ ไม่พบ customer สำหรับ userId:", userId);
      return res.status(404).json({ error: "ไม่พบข้อมูลผู้ใช้ในระบบ" });
    }

    console.log("✅ พบ customer:", customer.customerId, customer.fullName);

    // ✅ ใช้ customerId มาค้น booking
    const bookings = await prisma.booking.findMany({
      where: {
        customerId: customer.customerId,
        status: 1, // 1 = อนุมัติแล้ว
        checkout: null, // ยังไม่เคยขอคืน
      },
      orderBy: { createdAt: "desc" },
      include: { room: true },
    });

    console.log(`📦 พบ booking ${bookings.length} รายการของลูกค้า ${customer.fullName}`);
    res.json(bookings);
  } catch (err) {
    console.error("❌ Error fetching user bookings:", err);
    res.status(500).json({ error: "ไม่สามารถดึง booking ของผู้ใช้ได้" });
  }
});

/* ======================================================
   🚪 ผู้เช่าขอคืนห้อง
====================================================== */
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

    // 📢 แจ้ง Admin
    const Adminmsg = `📢 มีการส่งคำขอคืนห้องใหม่
ชื่อ : ${booking.customer.fullName}
เบอร์โทร : ${booking.customer.cphone}
ขอคืนห้อง ${booking.room.number}
https://smartdorm-frontend.onrender.com`;
    if (process.env.ADMIN_LINE_ID) {
      await notifyUser(process.env.ADMIN_LINE_ID, Adminmsg);
    }

    res.json({
      message: "✅ ขอคืนห้องสำเร็จ รอแอดมินอนุมัติ",
      booking: updated,
    });
  } catch (err) {
    console.error("❌ Error checkout booking:", err);
    res.status(500).json({ error: "ไม่สามารถคืนห้องได้" });
  }
});

/* ======================================================
   ✅ Admin อนุมัติการคืนห้อง
====================================================== */
router.put("/:bookingId/approveCheckout", async (req, res) => {
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

    if (booking.status !== 1) {
      return res.status(400).json({ error: "สถานะ booking ไม่สามารถคืนห้องได้" });
    }

    const [updatedBooking] = await prisma.$transaction([
      prisma.booking.update({
        where: { bookingId },
        data: {
          returnStatus: 1, // ✅ อนุมัติคืน
          status: 3, // booking ปิด
        },
        include: { customer: true, room: true },
      }),
      prisma.room.update({
        where: { roomId: booking.roomId },
        data: { status: 0 }, // ห้องกลับไปเป็นว่าง
      }),
    ]);

    // 📢 แจ้ง User
    const Usermsg = `✅ การคืนห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว
ขอให้ ${booking.customer.userName} 
กรุณาส่งหมายเลขบัญชีเพื่อรับเงินมัดจำคืน
ขอบคุณที่ใช้บริการครับ😊`;

    if (booking.customer.userId) {
      await notifyUser(booking.customer.userId, Usermsg);
    }

    res.json({
      message: "✅ อนุมัติการคืนห้องสำเร็จ",
      booking: updatedBooking,
    });
  } catch (err) {
    console.error("❌ Error approving checkout:", err);
    res.status(500).json({ error: "ไม่สามารถอนุมัติการคืนได้" });
  }
});

/* ======================================================
   ❌ Admin ปฏิเสธการคืนห้อง
====================================================== */
router.put("/:bookingId/rejectCheckout", async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    const updatedBooking = await prisma.booking.update({
      where: { bookingId },
      data: { returnStatus: 2 }, // ❌ ปฏิเสธการคืน
      include: { customer: true, room: true },
    });

    // 📢 แจ้ง User
    const Usermsg = `📢 การคืนห้อง ${booking.room.number} 
ของคุณ ${booking.customer.userName} ไม่ได้รับการอนุมัติ
กรุณาติดต่อผู้ดูแลระบบ
ขอบคุณที่ใช้บริการครับ😊`;

    if (booking.customer.userId) {
      await notifyUser(booking.customer.userId, Usermsg);
    }

    res.json({ message: "❌ ปฏิเสธการคืนสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error rejecting checkout:", err);
    res.status(500).json({ error: "ไม่สามารถปฏิเสธการคืนได้" });
  }
});

/* ======================================================
   ✏️ Admin แก้ไขข้อมูลการคืน
====================================================== */
router.put("/:bookingId", async (req, res) => {
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
});

/* ======================================================
   🗑️ Admin ลบข้อมูลการคืน
====================================================== */
router.delete("/:bookingId", async (req, res) => {
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
      },
    });

    res.json({ message: "🗑️ ลบข้อมูลการคืนสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error deleting checkout:", err);
    res.status(500).json({ error: "ไม่สามารถลบข้อมูลการคืนได้" });
  }
});

export default router;
