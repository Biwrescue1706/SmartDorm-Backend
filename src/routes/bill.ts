import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";

const router = Router();

/**
 * ➕ CREATE - ออกบิล (Admin)
 */
router.post("/create", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { roomId, userId, rent, service, wBefore, wAfter, eBefore, eAfter, fine } = req.body;

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status === 0) return res.status(400).json({ error: "ห้องยังไม่มีผู้เช่า ไม่สามารถออกบิลได้" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const wUnits = wAfter - wBefore;
    const eUnits = eAfter - eBefore;
    const wPrice = wUnits * 10; // ราคา/หน่วยน้ำ
    const ePrice = eUnits * 5;  // ราคา/หน่วยไฟ
    const total = rent + service + wPrice + ePrice + fine;

    // ✅ เลขบิล
    const billNumber = `BILL-${Date.now()}`;

    const bill = await prisma.bill.create({
      data: {
        number: billNumber,
        roomId,
        roomNumber: room.number,
        userId,
        month: new Date(),
        rent,
        service,
        wBefore,
        wAfter,
        wUnits,
        wPrice,
        eBefore,
        eAfter,
        eUnits,
        ePrice,
        fine,
        total,
        slipUrl: null,
        status: 0, // pending
        createdBy: req.admin!.id,
        createdName: req.admin!.name,
      },
      include: { user: true, room: true },
    });

    // 🔔 Notify Admin
    await notifyUser(
      "Ud13f39623a835511f5972b35cbc5cdbd",
      `📢 ออกบิลใหม่ ห้อง ${room.number} เลขที่ ${bill.number} ยอดรวม ${bill.total} บาท ให้ผู้ใช้ ${user.name}`
    );

    // 🔔 Notify User
    await notifyUser(
      user.userId,
      `💰 คุณมีบิลใหม่ ห้อง ${room.number} เลขที่ ${bill.number} ยอดรวม ${bill.total} บาท`
    );

    res.json({ message: "✅ ออกบิลสำเร็จ", bill });
  } catch (err) {
    console.error("❌ Error creating bill:", err);
    res.status(500).json({ error: "ไม่สามารถออกบิลได้" });
  }
});

/**
 * 📖 READ - ดึงบิลทั้งหมด
 */
router.get("/", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const bills = await prisma.bill.findMany({
      include: { room: true, user: true, payment: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(bills);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลบิลได้" });
  }
});

/**
 * 📖 READ - ดึงบิลตาม id
 */
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: req.params.id },
      include: { room: true, user: true, payment: true },
    });
    if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });
    res.json(bill);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลบิลได้" });
  }
});

/**
 * ✏️ UPDATE - อัปเดตบิล
 */
router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { rent, service, fine, status, slipUrl } = req.body;

    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });

    // ✅ อัปเดตข้อมูล
    const updated = await prisma.bill.update({
      where: { id: req.params.id },
      data: {
        ...(rent !== undefined && { rent: Number(rent) }),
        ...(service !== undefined && { service: Number(service) }),
        ...(fine !== undefined && { fine: Number(fine) }),
        ...(status !== undefined && { status: Number(status) }),
        ...(slipUrl !== undefined && { slipUrl }),
        updatedBy: req.admin!.id,
        updatedName: req.admin!.name,
      },
    });

    // ✅ คำนวณ total ใหม่
    const finalBill = await prisma.bill.update({
      where: { id: req.params.id },
      data: {
        total:
          (updated.rent ?? bill.rent) +
          (updated.service ?? bill.service) +
          bill.wPrice +
          bill.ePrice +
          (updated.fine ?? bill.fine),
      },
    });

    // 🔔 ถ้าอัปโหลด slip แจ้ง Admin
    if (slipUrl) {
      await notifyUser(
        "Ud13f39623a835511f5972b35cbc5cdbd",
        `📥 ผู้ใช้ ${updated.updatedName || "-"} อัปโหลดสลิปบิล ${updated.number}`
      );
    }

    res.json({ message: "✅ อัปเดตบิลสำเร็จ", bill: finalBill });
  } catch (err) {
    console.error("❌ Error updating bill:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดตบิลได้" });
  }
});

/**
 * ❌ DELETE - ลบบิล
 */
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    await prisma.bill.delete({ where: { id: req.params.id } });
    res.json({ message: "✅ ลบบิลสำเร็จ" });
  } catch {
    res.status(500).json({ error: "ไม่สามารถลบบิลได้" });
  }
});

export default router;
