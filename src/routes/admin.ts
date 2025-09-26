import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// ✅ โหลด JWT_SECRET จาก .env
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET must be defined in .env file");
}

// ---------------- REGISTER ----------------
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, name, password } = req.body;

    if (!username || !name || !password) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: "Username นี้ถูกใช้ไปแล้ว" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { username, name, password: hashed },
    });

    res.json({
      message: "สร้าง Admin สำเร็จ",
      adminID: admin.adminId,
      username: admin.username,
      name: admin.name,
      createdAt: admin.createdAt,
    });
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสมัครสมาชิก" });
  }
});

// ---------------- LOGIN ----------------
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) {
      return res.status(400).json({ error: "ไม่พบบัญชีผู้ใช้" });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });
    }

    // ✅ ตรงนี้ต้องใส่ adminId เข้า payload ด้วย
    const token = jwt.sign(
      {
        adminId: admin.adminId, // 👈 สำคัญที่สุด
        username: admin.username,
        name: admin.name,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });

    res.json({ message: "✅ เข้าสู่ระบบสำเร็จ", token });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "ไม่สามารถเข้าสู่ระบบได้" });
  }
});

// ---------------- LOGOUT ----------------
router.get("/logout", (req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({ message: "ออกจากระบบสำเร็จ" });
});

// ---------------- VERIFY ----------------
router.get("/verify", (req: Request, res: Response) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "ไม่มี token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, decoded });
  } catch (err: any) {
    res.status(401).json({ valid: false, error: err.message });
  }
});

// ---------------- ADMIN CRUD ----------------

// ✅ READ - แสดง Admin ทั้งหมด
router.get("/getall", async (req: Request, res: Response) => {
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

// ✅ READ - แสดง Admin รายบุคคล
router.get("/:adminId", async (req: Request, res: Response) => {
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
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

// ✅ UPDATE - อัปเดต Admin
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
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดต Admin" });
  }
});

// ✅ DELETE - ลบ Admin
router.delete(
  "/:adminId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { adminId } = req.params;
      await prisma.admin.delete({
        where: {
          adminId,
        },
      });
      res.json({ message: "ลบ Admin สำเร็จ" });
    } catch {
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการลบ Admin" });
    }
  }
);

export default router;
