// src/modules/Users/userRouter.ts
import { Router, Request, Response } from "express";
import { userService } from "./userService";

const router = Router();

// สมัครหรืออัปเดตข้อมูลลูกค้า
router.post("/register", async (req: Request, res: Response) => {
  try {
    const customer = await userService.register(req.body);
    res.json({ message: "สมัครหรืออัปเดตข้อมูลสำเร็จ", customer });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ดึงข้อมูลลูกค้าพร้อม booking/bill
router.post("/me", async (req: Request, res: Response) => {
  try {
    const profile = await userService.getProfile(req.body.accessToken);
    res.json(profile);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ดึงรายการบิลที่ชำระแล้ว
router.post("/payments", async (req: Request, res: Response) => {
  try {
    const bills = await userService.getPaidBills(req.body.accessToken);
    res.json({
      message: "ดึงรายการบิลที่ชำระแล้วสำเร็จ",
      count: bills.length,
      bills,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ดึงรายการบิลที่ยังไม่ชำระ
router.post("/bills/unpaid", async (req: Request, res: Response) => {
  try {
    const bills = await userService.getUnpaidBills(req.body.accessToken);
    res.json({
      message: "ดึงรายการบิลที่ยังไม่ชำระสำเร็จ",
      count: bills.length,
      bills,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ดึงรายการห้องที่สามารถคืนได้
router.post("/bookings/returnable", async (req: Request, res: Response) => {
  try {
    const bookings = await userService.getReturnableBookings(req.body.accessToken);
    res.json({
      message: "ดึงรายการที่สามารถคืนได้สำเร็จ",
      count: bookings.length,
      bookings,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
