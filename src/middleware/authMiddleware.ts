import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      adminId: string;
      username: string;
      name: string;
    };

    req.admin = {
      adminId: decoded.adminId, // 👈 ต้องตรงกับ payload ของ JWT
      username: decoded.username,
      name: decoded.name,
    };
    next();
  } catch (err: any) {
    return res
      .status(401)
      .json({ error: "Invalid token", details: err.message });
  }
}
