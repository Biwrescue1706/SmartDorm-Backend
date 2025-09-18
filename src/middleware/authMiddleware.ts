import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET must be defined in .env file");
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: ไม่มี token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded; // เก็บ user ลง req เผื่อไปใช้ที่อื่น
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token ไม่ถูกต้อง" });
  }
};
