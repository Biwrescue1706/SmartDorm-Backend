import prisma from "../prisma";
import { Router, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";

// ✅ เราจะใช้ Express.Request ที่ถูกขยาย type แล้ว (จาก express.d.ts)
import type { Request } from "express";

const router = Router();

/**
 * ✅ ดึงห้องทั้งหมด
 * GET /room/getall
 */
router.get("/getall", async (req: Request, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      include: {
        bookings: true,
        Bill: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(rooms);
  } catch (err) {
    console.error("❌ Error fetching rooms:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลห้องได้" });
  }
});

/**
 * ✅ ดึงข้อมูลห้องตาม id
 * GET /room/:id
 */
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        bookings: true, // ดึงข้อมูล booking ของห้องนั้นด้วย
        Bill: true,     // ดึงบิลทั้งหมดของห้องนั้นด้วย
      },
    });

    if (!room) {
      return res.status(404).json({ error: "❌ ไม่พบห้องที่ต้องการ" });
    }

    res.json(room);
  } catch (err) {
    console.error("❌ Error fetching room by id:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลห้องได้" });
  }
});

/**
 * ✅ เพิ่มห้องใหม่
 * POST /room/create
 */
router.post("/create", authMiddleware, async (req: Request, res: Response) => {
  const { number, size, rent, deposit, bookingFee } = req.body;

  if (!number || !size || !rent || !deposit || !bookingFee) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  }

  try {
    const room = await prisma.room.create({
      data: {
        number,
        size,
        rent: Number(rent),
        deposit: Number(deposit),
        bookingFee: Number(bookingFee),
        status: 0, // 0 = ว่าง
        createdBy: req.admin!.id,
        createdName: req.admin!.name,
      },
    });
    res.json({ message: "✅ เพิ่มห้องสำเร็จ", room });
  } catch (err) {
    console.error("❌ Error creating room:", err);
    res.status(500).json({ error: "ไม่สามารถเพิ่มห้องได้" });
  }
});

/**
 * ✅ อัปเดตสถานะห้อง
 * PUT /room/:id/status
 */
router.put(
  "/:id/status",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
      const room = await prisma.room.update({
        where: { id },
        data: {
          status: Number(status),
          updatedBy: req.admin!.id,
          updatedName: req.admin!.name,
        },
      });
      res.json({ message: "✅ อัปเดตสถานะห้องสำเร็จ", room });
    } catch (err) {
      console.error("❌ Error updating room status:", err);
      res.status(500).json({ error: "ไม่สามารถอัปเดตห้องได้" });
    }
  }
);

/**
 * ✅ แก้ไขข้อมูลห้อง
 * PUT /room/:id
 */
router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { number, size, rent, deposit, bookingFee, status } = req.body;

  try {
    const room = await prisma.room.update({
      where: { id },
      data: {
        ...(number && { number }),
        ...(size && { size }),
        ...(rent && { rent: Number(rent) }),
        ...(deposit && { deposit: Number(deposit) }),
        ...(bookingFee && { bookingFee: Number(bookingFee) }),
        ...(status !== undefined && { status: Number(status) }),
        updatedBy: req.admin!.id,
        updatedName: req.admin!.name,
      },
    });
    res.json({ message: "✅ อัปเดตข้อมูลห้องสำเร็จ", room });
  } catch (err) {
    console.error("❌ Error updating room:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดตข้อมูลห้องได้" });
  }
});

/**
 * ✅ ลบห้อง
 * DELETE /room/:id
 */
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.room.delete({ where: { id } });
    res.json({ message: "✅ ลบห้องสำเร็จ" });
  } catch (err) {
    console.error("❌ Error deleting room:", err);
    res.status(500).json({ error: "ไม่สามารถลบห้องได้" });
  }
});

export default router;
