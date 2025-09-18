import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { Router, Request, Response } from "express";

const router = Router();

// ✅ โหลด JWT_SECRET จาก .env
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET must be defined in .env file");
}

// ---------------- REGISTER ----------------
router.post("/register", async (req: Request , res: Response) => {
  try {
    const { username, password, name } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    // เช็คว่ามี username แล้วหรือยัง
    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: "ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { username, name, password: hashed },
    });

    res.json({ message: "สมัครสมาชิกสำเร็จ", admin });
  } catch (err) {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสมัครสมาชิก" });
  }
});

// ---------------- LOGIN ----------------
router.post("/login", async (req: Request , res: Response) => {
  const { username, password } = req.body;

  try {
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) return res.status(400).json({ error: "ไม่พบผู้ใช้" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });

    // ✅ สร้าง JWT ด้วย secret จาก .env
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ✅ เก็บ token ใน cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // ✅ fix
      sameSite: "strict",
      maxAge: 60 * 60 * 1000, // 1 ชั่วโมง
    });

    res.json({ message: "เข้าสู่ระบบสำเร็จ", token });
  } catch (err) {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" });
  }
});

// ---------------- LOGOUT ----------------
router.get("/logout", (req: Request , res: Response) => {
  res.clearCookie("token");
  res.json({ message: "ออกจากระบบสำเร็จ" });
});

// ---------------- VERIFY ----------------
router.get("/verify", (req: Request , res: Response) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "ไม่มี token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, decoded });
  } catch (err: any) {
    res.status(401).json({ valid: false, error: err.message });
  }
});

export default router;
