import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";

const router = Router();

router.post("/line", async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    const channelSecret = process.env.LINE_CHANNEL_SECRET!;

    const decoded = jwt.verify(idToken, channelSecret) as any;

    res.json({
      userId: decoded.sub,
      name: decoded.name,
      picture: decoded.picture,
    });
  } catch (err) {
    console.error("❌ LINE Auth Error:", err);
    res.status(400).json({ error: "Token ไม่ถูกต้อง" });
  }
});

export default router;
