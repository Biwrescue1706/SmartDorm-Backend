// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload, SignOptions, Secret } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) throw new Error("JWT_SECRET must be defined in .env file");

declare global {
  namespace Express {
    interface Request {
      admin?: {
        adminId: string;
        username: string;
        name: string;
        role: number;
      };
      user?: {
        customerId: string;
        userId: string;
        displayName: string;
      };
    }
  }
}

//ฟังก์ชันออก Token ใหม่
function generateToken(payload: object) {
  const options: SignOptions = {
    expiresIn: "2h",
    algorithm: "HS256",
  };
  return jwt.sign(payload, JWT_SECRET as Secret, options);
}

// ตรวจสอบ token + ต่ออายุอัตโนมัติ
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) return res.status(401).json({ error: "ไม่พบ Token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET as Secret, {
      algorithms: ["HS256"],
    }) as JwtPayload & { exp: number };

    //  รองรับทั้ง admin และ user
    if ((decoded as any).adminId) req.admin = decoded as any;
    else req.user = decoded as any;

    //  ตรวจสอบเวลาเหลือ ถ้าน้อยกว่า 30 นาที ให้ต่ออายุ token อัตโนมัติ
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = (decoded.exp || 0) - now;

    if (timeLeft < 30 * 60) {
      const newToken = generateToken(decoded);
      const isProduction = process.env.NODE_ENV === "production";

      res.cookie("token", newToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 2 * 60 * 60 * 1000,
        path: "/",
      });
    }

    next();
  } catch (err: any) {
    console.error("Auth error:", err.message);
    res.status(401).json({ error: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }
}

//ตรวจสอบ role เฉพาะ (เช่น SuperAdmin)
export function roleMiddleware(requiredRole: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin)
      return res.status(401).json({ error: "ยังไม่ได้เข้าสู่ระบบ" });

    if (req.admin.role !== requiredRole)
      return res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึงส่วนนี้" });

    next();
  };
}
