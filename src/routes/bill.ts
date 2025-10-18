import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";

const router = Router();

// ฟังก์ชันสร้างบิล (ใช้ซ้ำได้)
async function createBill(
  {
    roomId,
    customerId,
    month,
    wBefore,
    wAfter,
    eBefore,
    eAfter,
  }: {
    roomId: string;
    customerId: string;
    month: string;
    wBefore?: number;
    wAfter: number;
    eBefore?: number;
    eAfter: number;
  },
  adminId: string
) {
  if (!roomId || !customerId || !month || !wAfter || !eAfter) {
    throw new Error("กรุณากรอกข้อมูลให้ครบถ้วน");
  }

  // ตรวจสอบห้อง
  const room = await prisma.room.findUnique({ where: { roomId } });
  if (!room) throw new Error("ไม่พบห้อง");

  // ตั้งค่าราคาพื้นฐาน
  const rent = room.rent;
  const service = 20;
  const wPrice = 19;
  const ePrice = 7;

  // คำนวณเดือนก่อนหน้า
  const billMonth = new Date(month);
  const prevMonth = new Date(billMonth);
  prevMonth.setMonth(prevMonth.getMonth() - 1);

  // ดึงบิลของเดือนก่อนหน้าที่ตรงกับห้องนี้
  const prevBill = await prisma.bill.findFirst({
    where: {
      roomId,
      month: {
        gte: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1),
        lt: new Date(billMonth.getFullYear(), billMonth.getMonth(), 1),
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // ถ้ามีบิลก่อนหน้า ใช้ค่า wAfter, eAfter ของเดือนนั้นเป็นค่าเริ่มต้น
  const finalWBefore = prevBill ? prevBill.wAfter : (wBefore ?? 0);
  const finalEBefore = prevBill ? prevBill.eAfter : (eBefore ?? 0);

  const wUnits = wAfter - finalWBefore;
  const eUnits = eAfter - finalEBefore;
  const waterCost = wUnits * wPrice;
  const electricCost = eUnits * ePrice;

  const createdAt = new Date();
  const dueDate = new Date(createdAt);
  dueDate.setMonth(dueDate.getMonth() + 1);
  dueDate.setDate(5);

  // ค่าปรับถ้าเกินกำหนด
  let overdueDays = 0;
  let fine = 0;
  const today = new Date();
  if (today > dueDate) {
    const diff = today.getTime() - dueDate.getTime();
    overdueDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
    fine = overdueDays * 50;
  }

  // คำนวณยอดรวม
  const total = rent + service + waterCost + electricCost + fine;

  // สร้างบิลใหม่
  const bill = await prisma.bill.create({
    data: {
      month: new Date(month),
      rent,
      service,
      wBefore: finalWBefore,
      wAfter,
      wUnits,
      wPrice,
      waterCost,
      eBefore: finalEBefore,
      eAfter,
      eUnits,
      ePrice,
      electricCost,
      fine,
      overdueDays,
      total,
      dueDate,
      slipUrl: "",
      status: 0,
      roomId,
      customerId,
      createdBy: adminId,
      createdAt,
    },
    include: { room: true, customer: true },
  });

  // แจ้งเตือนลูกค้าผ่าน LINE
  const msg = `บิลใหม่ ห้อง: ${bill.room.number} มาแล้ว
เดือน: ${bill.month.toLocaleDateString("th-TH", { year: "numeric", month: "long" })}
ค่าเช่า: ${bill.rent.toLocaleString()} บาท
ค่าส่วนกลาง: ${bill.service.toLocaleString()} บาท
ค่าน้ำ: ${bill.wUnits} หน่วย (${bill.waterCost.toLocaleString()} บาท)
ค่าไฟ: ${bill.eUnits} หน่วย (${bill.electricCost.toLocaleString()} บาท)
ยอดรวมทั้งหมด: ${bill.total.toLocaleString()} บาท
ครบกำหนดชำระ: ${bill.dueDate.toLocaleDateString("th-TH")}
ขอบคุณที่ใช้บริการ SmartDorm`;

  if (bill.customer.userId) {
    await notifyUser(bill.customer.userId, msg);
  }

  return bill;
}

// สร้างบิลใหม่ (Admin เท่านั้น)
router.post("/create", authMiddleware, async (req: Request, res: Response) => {
  try {
    const bill = await createBill(req.body, req.admin!.adminId);
    res.json({ message: "สร้างบิลสำเร็จและแจ้งลูกค้าแล้ว", bill });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "ไม่สามารถสร้างบิลได้" });
  }
});

// สร้างบิลจาก roomId (ดึง customerId อัตโนมัติ)
router.post(
  "/createFromRoom/:roomId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { month, wBefore, wAfter, eBefore, eAfter } = req.body;

      const booking = await prisma.booking.findFirst({
        where: { roomId, status: 1 },
      });
      if (!booking)
        return res.status(404).json({ error: "ไม่พบบุ๊กกิ้งของห้องนี้" });

      const bill = await createBill(
        {
          roomId,
          customerId: booking.customerId,
          month,
          wBefore,
          wAfter,
          eBefore,
          eAfter,
        },
        req.admin!.adminId
      );

      res.json({ message: "สร้างบิลสำเร็จและแจ้งลูกค้าแล้ว", bill });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "ไม่สามารถสร้างบิลได้" });
    }
  }
);

// ดึงบิลทั้งหมด
router.get("/getall", authMiddleware, async (_req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: true, customer: true, payment: true },
    });
    res.json(bills);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงบิลได้" });
  }
});

// ดึงบิลรายตัว
router.get("/:billId", authMiddleware, async (req, res) => {
  try {
    const { billId } = req.params;
    const bill = await prisma.bill.findUnique({
      where: { billId },
      include: { room: true, customer: true, payment: true },
    });
    if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });
    res.json(bill);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงบิลได้" });
  }
});

// อัปเดตบิล
router.put("/:billId", authMiddleware, async (req, res) => {
  try {
    const { billId } = req.params;
    const updated = await prisma.bill.update({
      where: { billId },
      data: { ...req.body, updatedBy: req.admin!.adminId },
    });
    res.json({ message: "อัปเดตบิลสำเร็จ", updated });
  } catch {
    res.status(500).json({ error: "ไม่สามารถอัปเดตบิลได้" });
  }
});

// ลบบิล
router.delete("/:billId", authMiddleware, async (req, res) => {
  try {
    const { billId } = req.params;
    await prisma.bill.delete({ where: { billId } });
    res.json({ message: "ลบบิลสำเร็จ" });
  } catch {
    res.status(500).json({ error: "ไม่สามารถลบบิลได้" });
  }
});

export default router;
