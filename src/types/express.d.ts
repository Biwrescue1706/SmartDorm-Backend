import "express";

declare global {
  namespace Express {
    interface Request {
      admin?: {
        adminId: string;  // ต้องตรงกับ schema
        username: string;
        name: string;
      };
    }
  }
}
