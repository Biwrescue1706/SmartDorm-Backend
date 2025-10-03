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
  } catch (err) {
    console.error("❌ Register error:", err);
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

    // ✅ สร้าง token
    const token = jwt.sign(
      { adminId: admin.adminId, username: admin.username, name: admin.name },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ✅ เซ็ต cookie (cross-site)
    res.cookie("token", token, {
      httpOnly: true,
      secure: true, // Render ใช้ HTTPS อยู่แล้ว
      sameSite: "none", // ต้องเป็น none ไม่งั้น Safari/iPad จะไม่ส่ง cookie
    });

    res.json({ message: "✅ เข้าสู่ระบบสำเร็จ" });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "ไม่สามารถเข้าสู่ระบบได้" });
  }
});

// ---------------- LOGOUT ----------------
router.get("/logout", (req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ message: "ออกจากระบบสำเร็จ" });
});

// ---------------- VERIFY ----------------
router.get("/verify", (req: Request, res: Response) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "ไม่มี token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    res.json({ valid: true, decoded });
  } catch (err: any) {
    res.status(401).json({ valid: false, error: err.message });
  }
});

// ---------------- ADMIN CRUD ----------------
router.get("/getall", async (_req: Request, res: Response) => {
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
    console.error("❌ GetAll Admin error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

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
  } catch (err) {
    console.error("❌ Get Admin error:", err);
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
    console.error("❌ Update Admin error:", err);
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
      console.error("❌ Delete Admin error:", err);
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการลบ Admin" });
    }
  }
);

export default router;
