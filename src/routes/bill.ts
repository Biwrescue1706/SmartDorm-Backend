// src/routes/bill.ts
import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

/**
 * 📝 สร้าง Bill ใหม่ (Admin เท่านั้น)
 */
router.post("/create", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { roomId, customerId, month, rent, service,
      wBefore, wAfter, wUnits, wPrice,
      eBefore, eAfter, eUnits, ePrice,
      fine, total } = req.body;

    // ✅ validate input
    if (!roomId || !customerId || !month) {
      return res.status(400).json({ error: "กรอกข้อมูลไม่ครบ" });
    }

    const bill = await prisma.bill.create({
      data: {
        number: `BILL-${Date.now()}`, // gen running number
        month: new Date(month),
        rent,
        service,
        wBefore, wAfter, wUnits, wPrice,
        eBefore, eAfter, eUnits, ePrice,
        fine,
        total,
        status: 0, // 0 = ยังไม่ชำระ
        slipUrl: "",
        roomId,
        customerId,
        createdBy: req.admin!.adminId,
      },
      include: { room: true, customer: true },
    });

    res.json({ message: "✅ สร้าง Bill สำเร็จ", bill });
  } catch (err) {
    console.error("❌ Error creating bill:", err);
    res.status(500).json({ error: "ไม่สามารถสร้างบิลได้" });
  }
});

/**
 * 📌 ดึงบิลทั้งหมด
 */
router.get("/getall", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const bills = await prisma.bill.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: true, customer: true, payment: true },
    });
    res.json(bills);
  } catch (err) {
    console.error("❌ Error fetching bills:", err);
    res.status(500).json({ error: "ไม่สามารถดึงบิลได้" });
  }
});

/**
 * 📌 ดึงบิลรายตัว
 */
router.get("/:billId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { billId } = req.params;
    const bill = await prisma.bill.findUnique({
      where: { billId },
      include: { room: true, customer: true, payment: true },
    });
    if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });
    res.json(bill);
  } catch (err) {
    console.error("❌ Error fetching bill:", err);
    res.status(500).json({ error: "ไม่สามารถดึงบิลได้" });
  }
});

/**
 * ✏️ อัปเดตบิล
 */
router.put("/:billId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { billId } = req.params;
    const data = req.body;

    const updated = await prisma.bill.update({
      where: { billId },
      data: {
        ...data,
        updatedBy: req.admin!.adminId,
      },
    });

    res.json({ message: "✅ อัปเดตบิลสำเร็จ", updated });
  } catch (err) {
    console.error("❌ Error updating bill:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดตบิลได้" });
  }
});

/**
 * ❌ ลบบิล
 */
router.delete("/:billId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { billId } = req.params;
    await prisma.bill.delete({ where: { billId } });
    res.json({ message: "🗑️ ลบบิลสำเร็จ" });
  } catch (err) {
    console.error("❌ Error deleting bill:", err);
    res.status(500).json({ error: "ไม่สามารถลบบิลได้" });
  }
});

export default router;
