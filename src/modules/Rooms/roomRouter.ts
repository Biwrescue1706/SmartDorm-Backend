// src/modules/Rooms/roomRouter.ts
import { Router, Request, Response } from "express";
import { authMiddleware, roleMiddleware } from "../../middleware/authMiddleware";
import { roomService } from "./roomService";

const router = Router();

//  ดึงข้อมูลห้องทั้งหมด
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const rooms = await roomService.getAllRooms();
    res.json(rooms);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "ไม่สามารถโหลดข้อมูลห้องได้" });
  }
});

//  ดึงข้อมูลห้องตาม roomId
router.get("/:roomId", async (req: Request, res: Response) => {
  try {
    const room = await roomService.getRoomById(req.params.roomId);
    res.json(room);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

//  เพิ่มห้องใหม่ (เฉพาะแอดมินหลัก)
router.post(
  "/create",
  authMiddleware,
  roleMiddleware(0),
  async (req: Request, res: Response) => {
    try {
      const room = await roomService.createRoom(req.admin!.adminId, req.body);
      res.json({ message: "เพิ่มห้องสำเร็จ", room });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

//  แก้ไขข้อมูลห้อง (เฉพาะแอดมินหลัก)
router.put(
  "/:roomId",
  authMiddleware,
  roleMiddleware(0),
  async (req: Request, res: Response) => {
    try {
      const updated = await roomService.updateRoom(req.admin!.adminId, {
        roomId: req.params.roomId,
        ...req.body,
      });
      res.json({ message: "อัปเดตห้องสำเร็จ", updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

//  ลบห้อง (เฉพาะแอดมินหลัก)
router.delete(
  "/:roomId",
  authMiddleware,
  roleMiddleware(0),
  async (req: Request, res: Response) => {
    try {
      await roomService.deleteRoom(req.params.roomId);
      res.json({ message: "ลบห้องสำเร็จ" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
