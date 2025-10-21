// src/modules/Bookings/bookingRouter.ts
import { Router, Request, Response } from "express";
import multer from "multer";
import { authMiddleware } from "../../middleware/authMiddleware";
import { bookingService } from "./bookingService";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

//  ดึงข้อมูลทั้งหมด
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const bookings = await bookingService.getAllBookings();
    res.json(bookings);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการจองได้" });
  }
});

//  ผู้ใช้ส่งคำขอจองห้อง
router.post("/create", upload.single("slip"), async (req, res) => {
  try {
    const booking = await bookingService.createBooking({
      ...req.body,
      slip: req.file,
    });
    res.json({ message: "จองสำเร็จ", booking });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

//  Admin อนุมัติการจอง
router.put("/:bookingId/approve", authMiddleware, async (req, res) => {
  try {
    const updated = await bookingService.approveBooking(req.params.bookingId);
    res.json({ message: "อนุมัติการจองสำเร็จ", booking: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

//  Admin ปฏิเสธการจอง
router.put("/:bookingId/reject", authMiddleware, async (req, res) => {
  try {
    const updated = await bookingService.rejectBooking(req.params.bookingId);
    res.json({ message: "ปฏิเสธการจองสำเร็จ", booking: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

//  Admin แก้ไขข้อมูลการจอง
router.put("/:bookingId", authMiddleware, async (req, res) => {
  try {
    const updated = await bookingService.updateBooking(
      req.params.bookingId,
      req.body
    );
    res.json({ message: "แก้ไขการจองสำเร็จ", booking: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

//  Admin ลบการจอง
router.delete("/:bookingId", authMiddleware, async (req, res) => {
  try {
    await bookingService.deleteBooking(req.params.bookingId);
    res.json({ message: "ลบการจองสำเร็จ" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
