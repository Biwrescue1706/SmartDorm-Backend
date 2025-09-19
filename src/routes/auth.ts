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

function generateAdminID() {
  const segment = () => Math.floor(1000 + Math.random() * 9000).toString();
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
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

    // ✅ สร้าง adminID แบบสุ่ม xxxx-xxxx-xxxx-xxxx
    const adminID = generateAdminID();

    const hashed = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { adminID, username, name, password: hashed },
    });

    res.json({
      message: "สร้าง Admin สำเร็จ",
      adminID: admin.adminID,
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
  const { username, password } = req.body;

  try {
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) return res.status(400).json({ error: "ไม่พบผู้ใช้" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });

    const token = jwt.sign(
      {
        id: admin.id,
        adminid: admin.adminID,
        username: admin.username,
        name: admin.name,
      },
      JWT_SECRET,
      { expiresIn: "10m" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // prod = true, dev = false
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 60 * 1000,
    });

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      adminID: admin.adminID,
      username: admin.username,
      name: admin.name,
      token,
    });
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" });
  }
});

// ---------------- LOGOUT ----------------
router.get("/logout", (req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ message: "ออกจากระบบสำเร็จ" });
});

// ---------------- VERIFY ----------------
router.get("/verify", (req: Request, res: Response) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
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
router.get("/", async (req: Request, res: Response) => {
  try {
    const admins = await prisma.admin.findMany({
      select: {
        adminID: true,
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
router.get("/:adminID", async (req: Request, res: Response) => {
  try {
    const { adminID } = req.params;
    const admin = await prisma.admin.findUnique({
      where: { adminID },
      select: {
        adminID: true,
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
router.put("/:adminID", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adminID } = req.params;
    const { username, name, password } = req.body;

    const setPayload: any = {};
    if (username) setPayload.username = username.trim();
    if (name) setPayload.name = name.trim();
    if (password) setPayload.password = await bcrypt.hash(password, 10);

    const updated = await prisma.admin.update({
      where: { adminID },
      data: setPayload,
    });

    res.json({ message: "อัปเดต Admin สำเร็จ", updated });
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดต Admin" });
  }
});

// ✅ DELETE - ลบ Admin
router.delete(
  "/:adminID",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { adminID } = req.params;
      await prisma.admin.delete({
        where: {
          adminID,
        },
      });
      res.json({ message: "ลบ Admin สำเร็จ" });
    } catch {
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการลบ Admin" });
    }
  }
);

export default router;
