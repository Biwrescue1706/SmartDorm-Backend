// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET must be defined in .env file");
}

// ✅ กำหนด type ให้ req รองรับ admin
declare global {
  namespace Express {
    interface Request {
      admin?: {
        adminId: string;
        username: string;
        name: string;
      };
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) {
    return res.status(401).json({ error: "ไม่พบ Token" });
  }

  try {
    // ✅ บังคับใช้ HS256
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;

    req.admin = {
      adminId: decoded.adminId,
      username: decoded.username,
      name: decoded.name,
    };

    next();
  } catch (err: any) {
    console.error("❌ Token verification failed:", err.message);
    return res.status(401).json({ error: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }
}
