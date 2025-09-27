// src/routes/qr.ts
import { Router, Request, Response } from "express";
import fetch from "node-fetch";

const router = Router();

router.get("/:amount", async (req: Request, res: Response) => {
  try {
    const amount = req.params.amount;
    const promptpayId = "0611747731"; // 👉 เบอร์ PromptPay
    const url = `https://promptpay.io/${promptpayId}/${amount}.png`;

    const resp = await fetch(url);
    const buffer = await resp.arrayBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*"); // ✅ กัน CORS
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("❌ Error fetching QR:", err);
    res.status(500).send("Error fetching QR");
  }
});

export default router;
