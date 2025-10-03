import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

//🏠 ดึงข้อมูลห้องทั้งหมด
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      orderBy: { number: "asc" },
      include: {
        bookings: true,
        bills: true,
        adminCreated: { select: { adminId: true, username: true, name: true } },
        adminUpdated: { select: { adminId: true, username: true, name: true } },
      },
    });
    res.json(rooms);
  } catch (err) {
    console.error("❌ Error fetching rooms:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลห้องได้" });
  }
});

// 🏠 ดึงข้อมูลห้องตาม roomId
router.get("/:roomId", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = await prisma.room.findUnique({
      where: { roomId },
      include: {
        bookings: { include: { customer: true } },
        bills: { include: { customer: true } },
        adminCreated: { select: { adminId: true, username: true, name: true } },
        adminUpdated: { select: { adminId: true, username: true, name: true } },
      },
    });

    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });

    res.json(room);
  } catch (err) {
    console.error("❌ Error fetching room:", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลห้องได้" });
  }
});

// ➕ เพิ่มห้อง
router.post("/create", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { number, size, rent, deposit, bookingFee } = req.body;
    const adminId = (req as any).user?.adminId;

    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const room = await prisma.room.create({
      data: {
        number,
        size,
        rent: Number(rent),
        deposit: Number(deposit),
        bookingFee: Number(bookingFee),
        status: 0,          // ✅ set default ว่าง
        createdBy: adminId, // ✅ บังคับว่าต้องมีคนสร้าง
      },
      include: {
        adminCreated: { select: { adminId: true, username: true, name: true } },
      },
    });

    res.json({ message: "✅ เพิ่มห้องสำเร็จ", room });
  } catch (err) {
    console.error("❌ Error creating room:", err);
    res.status(500).json({ error: "ไม่สามารถเพิ่มห้องได้" });
  }
});

// ✏️ แก้ไขห้อง
router.put("/:roomId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { number, size, rent, deposit, bookingFee, status } = req.body;
    const adminId = (req as any).user?.adminId;

    if (!adminId) return res.status(401).json({ error: "Unauthorized" });

    const updated = await prisma.room.update({
      where: { roomId },
      data: {
        ...(number !== undefined && { number }),
        ...(size !== undefined && { size }),
        ...(rent !== undefined && { rent: Number(rent) }),
        ...(deposit !== undefined && { deposit: Number(deposit) }),
        ...(bookingFee !== undefined && { bookingFee: Number(bookingFee) }),
        ...(status !== undefined && { status: Number(status) }),
        updatedBy: adminId,
      },
      include: {
        adminCreated: { select: { adminId: true, username: true, name: true } },
        adminUpdated: { select: { adminId: true, username: true, name: true } },
      },
    });

    res.json({ message: "✅ อัปเดตห้องสำเร็จ", updated });
  } catch (err) {
    console.error("❌ Error updating room:", err);
    res.status(500).json({ error: "ไม่สามารถแก้ไขห้องได้" });
  }
});

//❌ ลบห้อง (Admin)
router.delete(
  "/:roomId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;

      await prisma.room.delete({ where: { roomId } });

      res.json({ message: "✅ ลบห้องสำเร็จ" });
    } catch (err) {
      console.error("❌ Error deleting room:", err);
      res.status(500).json({ error: "ไม่สามารถลบห้องได้" });
    }
  }
);

export default router;
