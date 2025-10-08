import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// ---------------- ADMIN CRUD ----------------
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
  } catch (err) {
    console.error(" GetAll Admin error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

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

    if (!admin) return res.status(404).json({ error: "ไม่พบ Admin" });

    res.json(admin);
  } catch (err) {
    console.error(" Get Admin error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

router.put("/:adminId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adminId } = req.params;
    const { username, name, password } = req.body;

    const setPayload: any = {};
    if (username) setPayload.username = username.trim();
    if (name) setPayload.name = name.trim();
    if (password) setPayload.password = await bcrypt.hash(password, 10);

    const updated = await prisma.admin.update({
      where: { adminId },
      data: setPayload,
    });

    res.json({ message: "อัปเดต Admin สำเร็จ", updated });
  } catch (err) {
    console.error(" Update Admin error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดต Admin" });
  }
});

router.delete(
  "/:adminId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { adminId } = req.params;
      await prisma.admin.delete({ where: { adminId } });
      res.json({ message: "ลบ Admin สำเร็จ" });
    } catch (err) {
      console.error(" Delete Admin error:", err);
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการลบ Admin" });
    }
  }
);

export default router;
