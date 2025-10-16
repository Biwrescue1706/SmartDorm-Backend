// src/routes/checkout.ts
import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { notifyUser } from "../utils/lineNotify";
import fetch from "node-fetch";

const router = Router();

// ตรวจสอบ token กับ LINE API
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

// ดึงข้อมูลการคืนทั้งหมด (Admin)
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const checkouts = await prisma.booking.findMany({
      where: { checkout: { not: null } },
      orderBy: { checkout: "desc" },
      include: { room: true, customer: true },
    });
    res.json(checkouts);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการคืนได้" });
  }
});

// ผู้เช่าดึง booking ของตัวเอง (ที่สามารถขอคืนได้)
router.post("/myBookings", async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken)
      return res.status(401).json({ error: "ไม่มี accessToken จาก LINE LIFF" });

    const { userId } = await verifyLineToken(accessToken);
    const customer = await prisma.customer.findFirst({ where: { userId } });

    if (!customer)
      return res.status(404).json({ error: "ไม่พบข้อมูลผู้ใช้ในระบบ" });

    const bookings = await prisma.booking.findMany({
      where: { customerId: customer.customerId, status: 1, checkout: null },
      orderBy: { createdAt: "desc" },
      include: { room: true },
    });

    res.json({ message: "ดึง booking ที่สามารถคืนได้สำเร็จ", bookings });
  } catch (err) {
    console.error("Fetch myBookings error:", err);
    res.status(500).json({ error: "ไม่สามารถดึง booking ของผู้ใช้ได้" });
  }
});

// ผู้เช่าขอคืนห้อง
router.put("/:bookingId/checkout", async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { accessToken, checkout } = req.body;

    if (!accessToken)
      return res.status(401).json({ error: "ไม่มี accessToken จาก LINE LIFF" });
    if (!checkout)
      return res.status(400).json({ error: "ต้องระบุวันที่คืนห้อง" });

    const { userId } = await verifyLineToken(accessToken);
    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer)
      return res.status(404).json({ error: "ไม่พบข้อมูลผู้ใช้ในระบบ" });

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });

    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });
    if (booking.customerId !== customer.customerId)
      return res.status(403).json({ error: "ไม่มีสิทธิ์คืนห้องนี้" });

    const updated = await prisma.booking.update({
      where: { bookingId },
      data: { checkout: new Date(checkout), returnStatus: 0 },
      include: { customer: true, room: true },
    });

    const adminMsg = `📢 มีการส่งคำขอคืนห้องใหม่
ชื่อ : ${booking.customer.fullName}
เบอร์โทร : ${booking.customer.cphone}
ขอคืนห้อง ${booking.room.number}
https://smartdorm-frontend.onrender.com`;

    if (process.env.ADMIN_LINE_ID)
      await notifyUser(process.env.ADMIN_LINE_ID, adminMsg);

    res.json({ message: "ขอคืนห้องสำเร็จ รอแอดมินอนุมัติ", booking: updated });
  } catch (err) {
    console.error("Checkout request error:", err);
    res.status(500).json({ error: "ไม่สามารถคืนห้องได้" });
  }
});

//  Admin อนุมัติการคืนห้อง
router.put("/:bookingId/approveCheckout", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });

    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });
    if (!booking.checkout)
      return res.status(400).json({ error: "ยังไม่มีการขอคืนห้อง" });
    if (booking.status !== 1)
      return res
        .status(400)
        .json({ error: "สถานะ booking ไม่สามารถคืนห้องได้" });

    const [updatedBooking] = await prisma.$transaction([
      prisma.booking.update({
        where: { bookingId },
        data: { returnStatus: 1, status: 3 },
        include: { customer: true, room: true },
      }),
      prisma.room.update({
        where: { roomId: booking.roomId },
        data: { status: 0 },
      }),
    ]);

    const userMsg = ` การคืนห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว
กรุณาส่งหมายเลขบัญชีเพื่อรับเงินมัดจำคืน
ขอบคุณที่ใช้บริการ SmartDorm`;

    if (booking.customer.userId)
      await notifyUser(booking.customer.userId, userMsg);

    res.json({ message: "อนุมัติการคืนห้องสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("Approve checkout error:", err);
    res.status(500).json({ error: "ไม่สามารถอนุมัติการคืนได้" });
  }
});

// ปฏิเสธการคืนห้อง
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
      data: { returnStatus: 2 },
      include: { customer: true, room: true },
    });

    const userMsg = `📢 การคืนห้อง ${booking.room.number}
ของคุณ ${booking.customer.userName} ไม่ได้รับการอนุมัติ
กรุณาติดต่อผู้ดูแลระบบ`;

    if (booking.customer.userId)
      await notifyUser(booking.customer.userId, userMsg);

    res.json({ message: "ปฏิเสธการคืนสำเร็จ", booking: updatedBooking });
  } catch (err) {
    res.status(500).json({ error: "ไม่สามารถปฏิเสธการคืนได้" });
  }
});

// Admin แก้ไขข้อมูลการคืน
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

    res.json({ message: "แก้ไขข้อมูลการคืนสำเร็จ", booking: updatedBooking });
  } catch (err) {
    res.status(500).json({ error: "ไม่สามารถแก้ไขข้อมูลการคืนได้" });
  }
});

// ลบข้อมูลการคืน
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

    res.json({ message: "ลบข้อมูลการคืนสำเร็จ", booking: updatedBooking });
  } catch (err) {
    res.status(500).json({ error: "ไม่สามารถลบข้อมูลการคืนได้" });
  }
});

export default router;
