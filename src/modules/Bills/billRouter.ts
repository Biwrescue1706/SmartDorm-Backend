// src/modules/Bills/billRouter.ts
import { Router, Request, Response } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { billService } from "./billService";

const router = Router();

//  สร้างบิลใหม่
router.post("/create", authMiddleware, async (req: Request, res: Response) => {
  try {
    const bill = await billService.createBill(req.body, req.admin!.adminId);
    res.json({ message: "สร้างบิลสำเร็จและแจ้งลูกค้าแล้ว", bill });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

//  สร้างบิลจาก roomId
router.post(
  "/createFromRoom/:roomId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const bill = await billService.createBillFromRoom(
        req.params.roomId,
        req.body,
        req.admin!.adminId
      );
      res.json({ message: "สร้างบิลสำเร็จและแจ้งลูกค้าแล้ว", bill });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

//  ดึงบิลทั้งหมด
router.get("/getall", authMiddleware, async (_req, res) => {
  try {
    const bills = await billService.getAllBills();
    res.json(bills);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

//  ดึงบิลรายตัว
router.get("/:billId", authMiddleware, async (req, res) => {
  try {
    const bill = await billService.getBillById(req.params.billId);
    res.json(bill);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

//  อัปเดตบิล
router.put("/:billId", authMiddleware, async (req, res) => {
  try {
    const updated = await billService.updateBill(
      req.params.billId,
      req.body,
      req.admin!.adminId
    );
    res.json({ message: "อัปเดตบิลสำเร็จ", updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

//  ลบบิล
router.delete("/:billId", authMiddleware, async (req, res) => {
  try {
    await billService.deleteBill(req.params.billId);
    res.json({ message: "ลบบิลสำเร็จ" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
