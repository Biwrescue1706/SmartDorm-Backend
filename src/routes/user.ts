import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

// 📝 สมัครหรืออัปเดต Customer ผ่าน LINE LIFF
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { userId, ctitle, userName, cmumId, cname, csurname, cphone } =
      req.body;

    if (!userId || !ctitle || !userName || !cname || !cphone) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    let customer = await prisma.customer.findUnique({ where: { userId } });

    if (customer) {
      customer = await prisma.customer.update({
        where: { customerId: customer.customerId },
        data: {
          userName,
          cmumId,
          ctitle,
          cname,
          csurname,
          cphone,
          fullName: `${ctitle}${cname} ${csurname}`,
        },
      });
    } else {
      customer = await prisma.customer.create({
        data: {
          userId,
          userName,
          ctitle,
          cmumId,
          cname,
          csurname,
          cphone,
          fullName: `${ctitle}${cname} ${csurname}`,
        },
      });
    }

    res.json({ message: "✅ สมัคร/อัปเดต Customer สำเร็จ", customer });
  } catch (err) {
    console.error("❌ Error register customer:", err);
    res.status(500).json({ error: "ไม่สามารถสมัคร Customer ได้" });
  }
});

// 📌 ดึงข้อมูล Customer + Bookings + Bills
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { userId },
      include: {
        bookings: { include: { room: true } }, // ❌ booking ไม่มี payment
        bills: { include: { room: true, payment: true } }, // ✅ bill มี payment
      },
    });

    if (!customer) return res.status(404).json({ error: "ไม่พบ Customer" });

    res.json(customer);
  } catch (err) {
    console.error("❌ Error fetching customer:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูล Customer ได้" });
  }
});

// 💰 ดูประวัติการจ่ายเงินของ Customer
router.get("/:userId/payments", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { userId },
      include: {
        bills: { include: { payment: true, room: true } }, // ✅ bill มี payment
        bookings: { include: { room: true } }, // ❌ booking ไม่มี payment
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
      // 👉 booking ไม่มี payment โดยตรง ดังนั้นถ้าจะใช้ slip ต้องใช้ booking.slipUrl แทน
      ...customer.bookings.map((bk) => ({
        type: "booking" as const,
        bookingId: bk.bookingId,
        roomNumber: bk.room.number,
        amount: bk.room.rent + bk.room.deposit + bk.room.bookingFee,
        slipUrl: bk.slipUrl, // ✅ booking ใช้ slipUrl จาก model โดยตรง
        createdAt: bk.createdAt,
      })),
    ].sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());

    res.json({ userId: customer.userId, payments });
  } catch (err) {
    console.error("❌ Error fetching payments:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลการจ่ายเงินได้" });
  }
});

export default router;
