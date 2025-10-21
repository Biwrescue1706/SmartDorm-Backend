// src/modules/admin/adminRouter.ts
import { Router, Request, Response } from "express";
import { authMiddleware, roleMiddleware } from "../../middleware/authMiddleware";
import { adminService } from "./adminService";

const router = Router();

//  ดึงข้อมูลแอดมินทั้งหมด
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const admins = await adminService.getAllAdmins();
    res.json(admins);
  } catch {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

//  ดึงข้อมูลแอดมินตาม ID
router.get("/:adminId", async (req: Request, res: Response) => {
  try {
    const admin = await adminService.getAdminById(req.params.adminId);
    res.json(admin);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

//  แก้ไขข้อมูลแอดมิน (เฉพาะแอดมินหลักเท่านั้น)
router.put(
  "/:adminId",
  authMiddleware,
  roleMiddleware(0),
  async (req: Request, res: Response) => {
    try {
      const updated = await adminService.updateAdmin(req.params.adminId, req.body);
      res.json({ message: "อัปเดตข้อมูลผู้ดูแลระบบสำเร็จ", updated });
    } catch {
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตข้อมูล" });
    }
  }
);

//  ลบแอดมิน (เฉพาะแอดมินหลักเท่านั้น)
router.delete(
  "/:adminId",
  authMiddleware,
  roleMiddleware(0),
  async (req: Request, res: Response) => {
    try {
      await adminService.deleteAdmin(req.params.adminId);
      res.json({ message: "ลบผู้ดูแลระบบสำเร็จ" });
    } catch {
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการลบข้อมูล" });
    }
  }
);

export default router;
