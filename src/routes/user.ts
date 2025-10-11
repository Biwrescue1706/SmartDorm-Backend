// src/routes/user.ts
import { Router, Request, Response } from "express";
import prisma from "../prisma";
import fetch from "node-fetch";

const router = Router();

// ✅ ตรวจสอบ token กับ LINE API
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

// สมัครหรืออัปเดตข้อมูลลูกค้า
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { accessToken, ctitle, cname, csurname, cphone, cmumId } = req.body;
    if (!accessToken)
      return res.status(401).json({ error: "ไม่มี accessToken จาก LINE LIFF" });

    const { userId, displayName } = await verifyLineToken(accessToken);

    if (!ctitle || !cname || !cphone)
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });

    let customer = await prisma.customer.findFirst({ where: { userId } });

    if (customer) {
      customer = await prisma.customer.update({
        where: { customerId: customer.customerId },
        data: {
          userName: displayName,
          ctitle,
          cname,
          csurname,
          cphone,
          cmumId,
          fullName: `${ctitle}${cname} ${csurname}`,
        },
      });
    } else {
      customer = await prisma.customer.create({
        data: {
          userId,
          userName: displayName,
          ctitle,
          cname,
          csurname,
          cphone,
          cmumId,
          fullName: `${ctitle}${cname} ${csurname}`,
        },
      });
    }

    res.json({ message: "สมัครหรืออัปเดตข้อมูลสำเร็จ", customer });
  } catch (err) {
    console.error("Customer register error:", err);
    res.status(500).json({ error: "ไม่สามารถสมัครหรืออัปเดตข้อมูลได้" });
  }
});

// ดึงข้อมูลลูกค้าพร้อม booking และ bill
router.post("/me", async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken)
      return res.status(401).json({ error: "ไม่มี accessToken" });

    const { userId } = await verifyLineToken(accessToken);

    const customer = await prisma.customer.findFirst({
      where: { userId },
      include: {
        bookings: { include: { room: true } },
        bills: { include: { room: true, payment: true } },
      },
    });

    if (!customer) return res.status(404).json({ error: "ไม่พบข้อมูลลูกค้า" });

    res.json(customer);
  } catch (err) {
    console.error("Customer fetch error:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลได้" });
  }
});

// ✅ ดึงรายการบิลที่ชำระแล้ว (ไม่ใช้ bill.number อีกต่อไป)
router.post("/payments", async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken)
      return res.status(401).json({ error: "ไม่มี accessToken จาก LINE LIFF" });

    const { userId } = await verifyLineToken(accessToken);
    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer) return res.status(404).json({ error: "ไม่พบลูกค้า" });

    const paidBills = await prisma.bill.findMany({
      where: { customerId: customer.customerId, status: 1 },
      orderBy: { createdAt: "desc" },
      include: { room: true, payment: true },
    });

    const result = paidBills.map((b) => ({
      billCode: b.billId.slice(-6).toUpperCase(),
      roomNumber: b.room.number,
      total: b.total,
      slipUrl: b.payment?.slipUrl,
      paidAt: b.payment?.createdAt,
    }));

    res.json({
      message: "ดึงรายการบิลที่ชำระแล้วสำเร็จ",
      count: result.length,
      bills: result,
    });
  } catch (err) {
    console.error("Paid bills fetch error:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลบิลที่ชำระแล้วได้" });
  }
});

// ดึงรายการบิลที่ยังไม่ชำระ
router.post("/bills/unpaid", async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken)
      return res.status(401).json({ error: "ไม่มี accessToken จาก LINE LIFF" });

    const { userId } = await verifyLineToken(accessToken);
    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer) return res.status(404).json({ error: "ไม่พบลูกค้า" });

    const bills = await prisma.bill.findMany({
      where: { customerId: customer.customerId, status: 0 },
      orderBy: { createdAt: "desc" },
      include: { room: true },
    });

    res.json({
      message: "ดึงรายการบิลที่ยังไม่ชำระสำเร็จ",
      count: bills.length,
      bills,
    });
  } catch (err) {
    console.error("Unpaid bills error:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดบิลที่ยังไม่ชำระได้" });
  }
});

// ดึงรายการห้องที่สามารถคืนได้
router.post("/bookings/returnable", async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken)
      return res.status(401).json({ error: "ไม่มี accessToken จาก LINE LIFF" });

    const { userId } = await verifyLineToken(accessToken);
    const customer = await prisma.customer.findFirst({ where: { userId } });
    if (!customer) return res.status(404).json({ error: "ไม่พบลูกค้า" });

    const bookings = await prisma.booking.findMany({
      where: { customerId: customer.customerId, status: 1 },
      include: { room: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      message: "ดึงรายการที่สามารถคืนได้สำเร็จ",
      count: bookings.length,
      bookings,
    });
  } catch (err) {
    console.error("Returnable bookings error:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดรายการที่คืนได้" });
  }
});

export default router;
