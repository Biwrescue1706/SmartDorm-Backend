import { Router, Request, Response } from "express";
import { checkoutService } from "./checkoutService";

const router = Router();

//  ดึงข้อมูลการคืนทั้งหมด (Admin)
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const checkouts = await checkoutService.getAllCheckouts();
    res.json(checkouts);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการคืนได้" });
  }
});

//  ผู้เช่าดึง booking ของตัวเอง
router.post("/myBookings", async (req, res) => {
  try {
    const { accessToken } = req.body;
    const bookings = await checkoutService.getMyBookings(accessToken);
    res.json({ message: "ดึง booking ที่สามารถคืนได้สำเร็จ", bookings });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

//  ผู้เช่าขอคืนห้อง
router.put("/:bookingId/checkout", async (req, res) => {
  try {
    const updated = await checkoutService.requestCheckout(
      req.params.bookingId,
      req.body
    );
    res.json({ message: "ขอคืนห้องสำเร็จ รอการอนุมัติ", booking: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

//  Admin อนุมัติการคืนห้อง
router.put("/:bookingId/approveCheckout", async (req, res) => {
  try {
    const updated = await checkoutService.approveCheckout(req.params.bookingId);
    res.json({ message: "อนุมัติการคืนห้องสำเร็จ", booking: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

//  Admin ปฏิเสธการคืนห้อง
router.put("/:bookingId/rejectCheckout", async (req, res) => {
  try {
    const updated = await checkoutService.rejectCheckout(req.params.bookingId);
    res.json({ message: "ปฏิเสธการคืนสำเร็จ", booking: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

//  Admin แก้ไขข้อมูลการคืน
router.put("/:bookingId", async (req, res) => {
  try {
    const updated = await checkoutService.updateCheckout(req.params.bookingId, req.body);
    res.json({ message: "แก้ไขข้อมูลการคืนสำเร็จ", booking: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

//  ลบข้อมูลการคืน
router.delete("/:bookingId", async (req, res) => {
  try {
    const updated = await checkoutService.deleteCheckout(req.params.bookingId);
    res.json({ message: "ลบข้อมูลการคืนสำเร็จ", booking: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
