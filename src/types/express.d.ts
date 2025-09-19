import "express";

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        adminID: string;
        username: string;
        name: string;
      };
    }
  }
}
