import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { Router, Request, Response } from "express";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("❌ JWT_SECRET must be defined in .env file");

// ✅ Debug middleware
router.use((req, _res, next) => {
  console.log("---------------------------------");
  console.log("📍 Auth Route - Origin:", req.headers.origin);
  console.log("📍 Auth Route - Cookies:", req.cookies);
  console.log("📍 Auth Route - User-Agent:", req.headers["user-agent"]);
  next();
});

// ---------------- REGISTER ----------------
router.post("/register", async (req, res) => {
  try {
    const { username, name, password } = req.body;
    if (!username || !name || !password)
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });

    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing)
      return res.status(400).json({ error: "Username นี้ถูกใช้ไปแล้ว" });

    const hashed = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { username, name, password: hashed },
    });

    res.json({
      message: "สร้าง Admin สำเร็จ",
      adminID: admin.adminId,
      username: admin.username,
      name: admin.name,
    });
  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสมัครสมาชิก" });
  }
});

// ---------------- LOGIN ----------------
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) return res.status(400).json({ error: "ไม่พบบัญชีผู้ใช้" });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });

    const token = jwt.sign(
      { adminId: admin.adminId, username: admin.username, name: admin.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ ตั้งค่า cookie แบบ cross-domain
    res.cookie("token", token, {
      httpOnly: true,
      secure: true, // ✅ localhost จะ false
      sameSite: "none",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    console.log("✅ Login successful - Cookie set for:", admin.username);
    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      admin: {
        adminId: admin.adminId,
        username: admin.username,
        name: admin.name,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "ไม่สามารถเข้าสู่ระบบได้" });
  }
});

// ---------------- LOGOUT ----------------
router.post("/logout", (req: Request, res: Response) => {
  console.log("🚪 Logout called - cookies before:", req.cookies);

  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });

  // ✅ ป้องกัน proxy ลบ header โดยการใส่ซ้ำ
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Expose-Headers", "Set-Cookie");
  }

  console.log("🍪 ClearCookie header sent:", res.getHeaders()["set-cookie"]);
  res.status(200).json({ message: "ออกจากระบบสำเร็จ" });
});

// ---------------- VERIFY ----------------
router.get("/verify", (req: Request, res: Response) => {
  console.log("🔍 Verify endpoint called");
  console.log("📦 Cookies received:", req.cookies);

  const token = req.cookies.token;
  if (!token) {
    console.log("⚠️ No token found in cookies");
    return res.status(401).json({
      valid: false,
      error: "ไม่มี token",
      debug: {
        cookies: req.cookies,
        hasCookieHeader: !!req.headers.cookie,
      },
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    console.log("✅ Token verified:", decoded);
    res.json({ valid: true, decoded });
  } catch (err: any) {
    console.log("❌ Token verification failed:", err.message);
    res.status(401).json({ valid: false, error: err.message });
  }
});

export default router;
