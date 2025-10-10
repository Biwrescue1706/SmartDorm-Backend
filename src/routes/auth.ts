import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) throw new Error("❌ JWT_SECRET must be defined in .env file");

// ---------------- REGISTER ----------------
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, name, password, role } = req.body;

    if (!username || !name || !password)
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });

    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing)
      return res.status(400).json({ error: "Username นี้ถูกใช้ไปแล้ว" });

    const hashed = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { username, name, password: hashed, role: role ?? 1 },
    });

    res.status(201).json({
      message: "✅ สมัครสมาชิกสำเร็จ",
      admin: {
        adminId: admin.adminId,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
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
    if (!admin) return res.status(400).json({ error: "ไม่พบบัญชีผู้ใช้" });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });

    const token = jwt.sign(
      {
        adminId: admin.adminId,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
      JWT_SECRET,
      { expiresIn: "2h", algorithm: "HS256" }
    );

    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 2 * 60 * 60 * 1000, // 2 ชั่วโมง
      path: "/",
    });

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      admin: {
        adminId: admin.adminId,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "ไม่สามารถเข้าสู่ระบบได้" });
  }
});

// ---------------- LOGOUT ----------------
router.post("/logout", (req: Request, res: Response) => {
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie("token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });

  res.json({ message: "ออกจากระบบสำเร็จ" });
});

// ---------------- VERIFY ----------------
router.get("/verify", (req: Request, res: Response) => {
  const token = req.cookies.token;
  if (!token)
    return res.status(401).json({ valid: false, error: "ไม่มี token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as {
      adminId: string;
      username: string;
      name: string;
      role: number;
    };
    res.status(200).json({ valid: true, admin: decoded });
  } catch (err: any) {
    res.status(401).json({ valid: false, error: err.message });
  }
});

// ---------------- PROFILE (แก้ไขตัวเอง) ----------------
router.get("/profile", authMiddleware, async (req: Request, res: Response) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { adminId: req.admin!.adminId },
      select: {
        adminId: true,
        username: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!admin) return res.status(404).json({ error: "ไม่พบข้อมูลผู้ใช้" });
    res.json(admin);
  } catch (err) {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการโหลดโปรไฟล์" });
  }
});

router.put("/profile", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, oldPassword, newPassword } = req.body;
    const admin = await prisma.admin.findUnique({
      where: { adminId: req.admin!.adminId },
    });

    if (!admin) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const updateData: Record<string, any> = {};
    if (name) updateData.name = name.trim();

    if (oldPassword && newPassword) {
      const valid = await bcrypt.compare(oldPassword, admin.password);
      if (!valid)
        return res.status(400).json({ error: "รหัสผ่านเดิมไม่ถูกต้อง" });
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.admin.update({
      where: { adminId: req.admin!.adminId },
      data: updateData,
    });

    res.json({ message: "อัปเดตข้อมูลสำเร็จ", updated });
  } catch (err) {
    console.error("❌ Profile update error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตโปรไฟล์" });
  }
});

// ---------------- FORGOT PASSWORD ----------------

// 🔍 ตรวจสอบว่า username มีในระบบไหม
router.post("/forgot/check", async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });

    res.json({ message: "พบผู้ใช้", name: admin.name });
  } catch (err) {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการตรวจสอบ" });
  }
});

// 🔄 รีเซ็ตรหัสผ่านใหม่
router.put("/forgot/reset", async (req: Request, res: Response) => {
  try {
    const { username, newPassword } = req.body;
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.admin.update({
      where: { username },
      data: { password: hashed },
    });

    res.json({ message: "รีเซ็ตรหัสผ่านสำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน" });
  }
});

export default router;
