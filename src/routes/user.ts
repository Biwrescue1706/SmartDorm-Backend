import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

/**
 * 📝 สมัครหรืออัปเดต User ผ่าน LINE LIFF
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { userId, mumId, name, phone } = req.body;

    if (!userId || !name || !phone) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const user = await prisma.user.upsert({
      where: { userId },
      update: { mumId, name, phone, updatedAt: new Date() },
      create: { userId, mumId, name, phone },
    });

    res.json({ message: "✅ สมัคร/อัปเดต User สำเร็จ", user });
  } catch (err) {
    console.error("❌ Error register user:", err);
    res.status(500).json({ error: "ไม่สามารถสมัคร User ได้" });
  }
});

/**
 * 📌 ดึงข้อมูล User + Bookings + Bills
 */
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        bookings: {
          include: { room: true, payment: true },
          orderBy: { createdAt: "desc" },
        },
        bills: {
          include: { room: true, payment: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) return res.status(404).json({ error: "ไม่พบ User" });

    res.json(user);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูล User ได้" });
  }
});

/**
 * 💰 ดูประวัติการจ่ายเงินของ User
 */
router.get("/:userId/payments", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        bills: {
          include: { payment: true, room: true },
        },
        bookings: {
          include: { payment: true, room: true },
        },
      },
    });

    if (!user) return res.status(404).json({ error: "ไม่พบ User" });

    // ✅ รวม payment จากทั้ง Bill และ Booking
    const payments = [
      ...user.bills
        .filter(b => b.payment)
        .map(b => ({
          type: "bill",
          billNumber: b.number,
          roomNumber: b.roomNumber,
          amount: b.payment!.amount,
          slipUrl: b.payment!.slipUrl,
          status: b.payment!.status,
          createdAt: b.payment!.createdAt,
        })),
      ...user.bookings
        .filter(bk => bk.payment)
        .map(bk => ({
          type: "booking",
          bookingId: bk.id,
          roomNumber: bk.room.number,
          amount: bk.payment!.amount,
          slipUrl: bk.payment!.slipUrl,
          status: bk.payment!.status,
          createdAt: bk.payment!.createdAt,
        })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({ userId: user.userId, payments });
  } catch (err) {
    console.error("❌ Error fetching payments:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลการจ่ายเงินได้" });
  }
});

export default router;
