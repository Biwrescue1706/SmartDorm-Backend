import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware, roleMiddleware } from "../middleware/authMiddleware";

const router = Router();

// ดึงข้อมูลห้องทั้งหมด
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      orderBy: { number: "asc" },
      include: {
        bookings: true,
        bills: true,
        adminCreated: {
          select: { adminId: true, username: true, name: true },
        },
        adminUpdated: {
          select: { adminId: true, username: true, name: true },
        },
      },
    });
    res.json(rooms);
  } catch (err: any) {
    res
      .status(500)
      .json({ error: err.message || "ไม่สามารถโหลดข้อมูลห้องได้" });
  }
});

// ดึงข้อมูลห้องตาม roomId
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
  } catch {
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลห้องได้" });
  }
});

// เพิ่มห้องใหม่ (เฉพาะแอดมินหลัก)
router.post(
  "/create",
  authMiddleware,
  roleMiddleware(0),
  async (req: Request, res: Response) => {
    try {
      const { number, size, rent, deposit, bookingFee } = req.body;

      if (!number || !size || !rent || !deposit || !bookingFee)
        return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });

      const room = await prisma.room.create({
        data: {
          number,
          size,
          rent: Number(rent),
          deposit: Number(deposit),
          bookingFee: Number(bookingFee),
          status: 0,
          createdBy: req.admin!.adminId,
        },
        include: {
          adminCreated: {
            select: { adminId: true, username: true, name: true },
          },
        },
      });

      res.json({ message: "เพิ่มห้องสำเร็จ", room });
    } catch {
      res.status(500).json({ error: "ไม่สามารถเพิ่มห้องได้" });
    }
  }
);

// แก้ไขข้อมูลห้อง (เฉพาะแอดมินหลัก)
router.put(
  "/:roomId",
  authMiddleware,
  roleMiddleware(0),
  async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { number, size, rent, deposit, bookingFee, status } = req.body;

      const updated = await prisma.room.update({
        where: { roomId },
        data: {
          number,
          size,
          rent: rent ? Number(rent) : undefined,
          deposit: deposit ? Number(deposit) : undefined,
          bookingFee: bookingFee ? Number(bookingFee) : undefined,
          status,
          updatedBy: req.admin!.adminId,
        },
        include: {
          adminCreated: {
            select: { adminId: true, username: true, name: true },
          },
          adminUpdated: {
            select: { adminId: true, username: true, name: true },
          },
        },
      });

      res.json({ message: "อัปเดตห้องสำเร็จ", updated });
    } catch {
      res.status(500).json({ error: "ไม่สามารถแก้ไขห้องได้" });
    }
  }
);

// ลบห้อง (เฉพาะแอดมินหลัก)
router.delete(
  "/:roomId",
  authMiddleware,
  roleMiddleware(0),
  async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      await prisma.room.delete({ where: { roomId } });
      res.json({ message: "ลบห้องสำเร็จ" });
    } catch {
      res.status(500).json({ error: "ไม่สามารถลบห้องได้" });
    }
  }
);

export default router;
