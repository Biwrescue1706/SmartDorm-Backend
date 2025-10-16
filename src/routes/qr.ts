// src/routes/qr.ts
import { Router, Request, Response } from "express";
import fetch from "node-fetch";

const router = Router();

//สร้าง QR Code สำหรับ PromptPay Payment
router.get("/:amount", async (req: Request, res: Response) => {
  try {
    const amount = req.params.amount;
    const promptpayId = "0611747731"; // หมายเลข PromptPay ของ SmartDorm

    // ใช้ API จาก promptpay.io สร้าง QR (ภาพ PNG)
    const url = `https://promptpay.io/${promptpayId}/${amount}.png`;

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*"); //  ป้องกัน CORS
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).send("ไม่สามารถสร้าง QR Code ได้");
  }
});

export default router;
