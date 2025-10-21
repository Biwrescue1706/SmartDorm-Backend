import { Router, Request, Response } from "express";
import { qrService } from "./qrService";

const router = Router();

// สร้าง QR Code สำหรับ PromptPay Payment
router.get("/:amount", async (req: Request, res: Response) => {
  try {
    const { amount } = req.params;
    const result = await qrService.getPromptPayQr(amount);

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Access-Control-Allow-Origin", "*"); // ป้องกัน CORS
    res.send(result.image);
  } catch (err: any) {
    res.status(500).send(err.message || "ไม่สามารถสร้าง QR Code ได้");
  }
});

export default router;
