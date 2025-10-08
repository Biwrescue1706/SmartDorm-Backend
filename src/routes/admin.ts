import bcrypt from "bcryptjs";
import prisma from "../prisma";
import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// ---------------- ADMIN CRUD ----------------

// 📌 ดึงข้อมูลแอดมินทั้งหมด
router.get("/getall", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const admins = await prisma.admin.findMany({
      select: {
        adminId: true,
        username: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(admins);
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

// 📌 ดึงข้อมูลแอดมินตาม ID
router.get("/:adminId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adminId } = req.params;

    const admin = await prisma.admin.findUnique({
      where: { adminId },
      select: {
        adminId: true,
        username: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!admin) {
      return res.status(404).json({ error: "ไม่พบข้อมูลผู้ดูแลระบบ" });
    }

    res.json(admin);
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

// 📌 แก้ไขข้อมูลแอดมิน
router.put("/:adminId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adminId } = req.params;
    const { username, name, password } = req.body;

    const dataToUpdate: Record<string, any> = {};
    if (username) dataToUpdate.username = username.trim();
    if (name) dataToUpdate.name = name.trim();
    if (password) dataToUpdate.password = await bcrypt.hash(password, 10);

    const updated = await prisma.admin.update({
      where: { adminId },
      data: dataToUpdate,
    });

    res.json({ message: "อัปเดตข้อมูลผู้ดูแลระบบสำเร็จ", updated });
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตข้อมูล" });
  }
});

// 📌 ลบแอดมิน
router.delete("/:adminId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adminId } = req.params;
    await prisma.admin.delete({ where: { adminId } });
    res.json({ message: "ลบผู้ดูแลระบบสำเร็จ" });
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการลบข้อมูล" });
  }
});

export default router;
