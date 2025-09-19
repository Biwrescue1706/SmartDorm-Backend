import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET: string = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET must be defined in .env file");
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
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
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    req.admin = {
      id: decoded.id,
      adminID: decoded.adminid,
      username: decoded.username,
      name: decoded.name,
    };

    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token หมดอายุ" });
    }
    return res.status(401).json({ error: "Token ไม่ถูกต้อง" });
  }
}