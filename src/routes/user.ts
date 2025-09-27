// src/routes/user.ts
import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

/**
 * 📝 สมัครหรืออัปเดต Customer ผ่าน LINE LIFF
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { userId, userName, cmumId, cname, csurname, cphone } = req.body;

    if (!userId || !userName || !cname || !cphone) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    let customer = await prisma.customer.findUnique({ where: { userId } });

    if (customer) {
      customer = await prisma.customer.update({
        where: { customerId: customer.customerId },
        data: {
          userName,
          cmumId,
          cname,
          csurname,
          cphone,
          fullName: `${cname} ${csurname}`,
        },
      });
    } else {
      customer = await prisma.customer.create({
        data: {
          userId,
          userName,
          cmumId,
          cname,
          csurname,
          cphone,
          fullName: `${cname} ${csurname}`,
        },
      });
    }

    res.json({ message: "✅ สมัคร/อัปเดต Customer สำเร็จ", customer });
  } catch (err) {
    console.error("❌ Error register customer:", err);
    res.status(500).json({ error: "ไม่สามารถสมัคร Customer ได้" });
  }
});

/**
 * 📌 ดึงข้อมูล Customer + Bookings + Bills
 */
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { userId },
      include: {
        bookings: { include: { room: true, payment: true } },
        bills: { include: { room: true, payment: true } },
      },
    });

    if (!customer) return res.status(404).json({ error: "ไม่พบ Customer" });

    res.json(customer);
  } catch (err) {
    console.error("❌ Error fetching customer:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูล Customer ได้" });
  }
});

/**
 * 💰 ดูประวัติการจ่ายเงินของ Customer
 */
router.get("/:userId/payments", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { userId },
      include: {
        bills: { include: { payment: true, room: true } },
        bookings: { include: { payment: true, room: true } },
      },
    });

    if (!customer) return res.status(404).json({ error: "ไม่พบ Customer" });

    const payments = [
      ...customer.bills
        .filter((b) => b.payment)
        .map((b) => ({
          type: "bill" as const,
          billNumber: b.number,
          roomNumber: b.room.number,
          amount: b.total,
          slipUrl: b.payment?.slipUrl,
          createdAt: b.payment?.createdAt,
        })),
      ...customer.bookings
        .filter((bk) => bk.payment)
        .map((bk) => ({
          type: "booking" as const,
          bookingId: bk.bookingId,
          roomNumber: bk.room.number,
          amount: bk.room.rent + bk.room.deposit + bk.room.bookingFee, // ✅ คำนวณรวม
          slipUrl: bk.payment?.slipUrl,
          createdAt: bk.payment?.createdAt,
        })),
    ].sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());

    res.json({ userId: customer.userId, payments });
  } catch (err) {
    console.error("❌ Error fetching payments:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลการจ่ายเงินได้" });
  }
});

export default router;
