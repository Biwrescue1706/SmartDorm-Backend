// src/modules/auth/authRouter.ts
import { Router, Request, Response } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { authService } from "./authService";

const router = Router();

// ---------------- REGISTER ----------------
router.post("/register", async (req: Request, res: Response) => {
  try {
    const admin = await authService.register(req.body);
    res.status(201).json({
      message: "สมัครสมาชิกสำเร็จ",
      admin: { adminId: admin.adminId, username: admin.username, name: admin.name, role: admin.role },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- LOGIN ----------------
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { admin, token } = await authService.login(req.body);
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 2 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      admin: { adminId: admin.adminId, username: admin.username, name: admin.name, role: admin.role },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- LOGOUT ----------------
router.post("/logout", (_req: Request, res: Response) => {
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
  if (!token) return res.status(401).json({ valid: false, error: "ไม่มี token" });

  try {
    const decoded = authService.verifyToken(token);
    res.status(200).json({ valid: true, admin: decoded });
  } catch (err: any) {
    res.status(401).json({ valid: false, error: err.message });
  }
});

// ---------------- PROFILE ----------------
router.get("/profile", authMiddleware, async (req: Request, res: Response) => {
  try {
    const admin = await authService.getProfile(req.admin!.adminId);
    res.json(admin);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- UPDATE NAME ----------------
router.put("/profile", authMiddleware, async (req: Request, res: Response) => {
  try {
    const updated = await authService.updateName(req.admin!.adminId, req.body.name);
    res.json({ message: "อัปเดตชื่อสำเร็จ", admin: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- FORGOT PASSWORD ----------------
router.post("/forgot/check", async (req: Request, res: Response) => {
  try {
    const admin = await authService.forgotCheck(req.body.username);
    res.json({ message: "พบผู้ใช้", name: admin.name });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.put("/forgot/reset", async (req: Request, res: Response) => {
  try {
    await authService.forgotReset(req.body);
    res.json({ message: "รีเซ็ตรหัสผ่านสำเร็จ" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- CHANGE PASSWORD ----------------
router.put("/change-password", authMiddleware, async (req: Request, res: Response) => {
  try {
    await authService.changePassword({
      adminId: req.admin!.adminId,
      oldPassword: req.body.oldPassword,
      newPassword: req.body.newPassword,
    });
    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
