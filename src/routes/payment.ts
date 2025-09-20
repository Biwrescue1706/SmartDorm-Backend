import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";

const router = Router();

/**
 * 📤 User ส่งสลิปการจ่ายบิล
 */
router.post("/create", async (req: Request, res: Response) => {
  try {
    const { amount, slipUrl, billId } = req.body;

    // ✅ ตรวจสอบบิล
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { user: true, room: true },
    });
    if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });

    // ✅ สร้าง Payment
    const payment = await prisma.payment.create({
      data: {
        amount,
        slipUrl,
        status: 1, // pending
        bill: { connect: { id: billId } },
      },
    });

    // ✅ อัปเดตบิล
    await prisma.bill.update({
      where: { id: billId },
      data: { paymentId: payment.id, slipUrl, status: 1 }, // pending
    });

    // 🔔 แจ้ง Admin
    await notifyUser(
      "Ud13f39623a835511f5972b35cbc5cdbd", // Admin ID
      `📢 ผู้ใช้ ${bill.user.name} (${bill.user.phone}) ส่งสลิปบิล ${bill.number} ห้อง ${bill.roomNumber} จำนวน ${amount} บาท`
    );

    // 🔔 แจ้ง User
    await notifyUser(
      bill.user.userId,
      `📤 คุณได้ส่งสลิปชำระบิล ${bill.number} ห้อง ${bill.roomNumber} จำนวน ${amount} บาท (รอตรวจสอบ)`
    );

    res.json({ message: "✅ ส่งสลิปสำเร็จ", payment });
  } catch (err) {
    console.error("❌ Error create payment:", err);
    res.status(500).json({ error: "ไม่สามารถบันทึกการจ่ายได้" });
  }
});

/**
 * ✅ Admin ยืนยันการจ่าย
 */
router.put("/:id/verify", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // ✅ ตรวจสอบ Payment
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { bill: { include: { user: true, room: true } } },
    });
    if (!payment) return res.status(404).json({ error: "ไม่พบข้อมูลการจ่าย" });

    // ✅ อัปเดตสถานะ Payment + Bill
    const verified = await prisma.payment.update({
      where: { id },
      data: { status: 0 }, // paid
    });

    await prisma.bill.update({
      where: { paymentId: id },
      data: { status: 0 }, // paid
    });

    // 🔔 แจ้ง User
    if (payment.bill) {
      await notifyUser(
        payment.bill.user.userId,
        `✅ การชำระบิล ${payment.bill.number} ห้อง ${payment.bill.roomNumber} ได้รับการยืนยันแล้ว ขอบคุณครับ`
      );
    }

    res.json({ message: "✅ ยืนยันการจ่ายสำเร็จ", payment: verified });
  } catch (err) {
    console.error("❌ Error verify payment:", err);
    res.status(500).json({ error: "ไม่สามารถยืนยันการจ่ายได้" });
  }
});

export default router;
