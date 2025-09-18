import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET must be defined in .env file");
}

// ✨ ขยาย type ของ Express.Request ให้รองรับ req.user
declare global {
  namespace Express {
    interface Request {
      user?: string | jwt.JwtPayload;
    }
  }
}

// Middleware สำหรับตรวจสอบ JWT
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const token =
    req.cookies?.token ||
    (authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null);

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: ไม่มี token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // เก็บ payload ลง req.user
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token หมดอายุ" });
    }
    return res.status(401).json({ error: "Token ไม่ถูกต้อง" });
  }
};
