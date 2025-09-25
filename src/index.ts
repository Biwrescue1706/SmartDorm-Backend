import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const allowedOrigins = [
  "http://localhost:5173", // ⚡ frontend vite dev server
  "http://localhost:5174", // ⚡ frontend vite dev server
  "https://smartdorm-frontend.onrender.com", // ⚡ เพิ่ม frontend ของ SmartDorm
  "https://smartdorm-line-liff.onrender.com", // ⚡ เพิ่ม frontend ของ SmartDorm
];

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow เช่น Postman
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("❌ CORS not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());
app.use(cookieParser());

const MONGO_URI = process.env.MONGO_URI as string;
const PORT = process.env.PORT || 10000;
const prisma = new PrismaClient();

mongoose
  .connect(MONGO_URI, {
    dbName: "SmartDormDB",
  })
  .then(() => {
    console.log(" Connected to MongoDB database ");
  })
  .catch((err: unknown) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// routes
import adminRouter from "./routes/admin";
import authRouter from "./routes/auth"
import roomRouter from "./routes/room";
import billsRouter from "./routes/bill";
import bookingRouter from "./routes/booking";
import paymentRouter from "./routes/payment";
import userRouter from "./routes/user";

app.get("/", (_req, res) => {
  res.send("🚀 ระบบ Backend ของ SmartDorm ");
});

app.get("/test-db", async (_req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      select: {
        adminID: true,
        username: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(admins);
  } catch (err: any) {
    console.error("❌ Prisma error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล", detail: err.message });
  }
});

// ✅ Register routes
app.use("/auth",authRouter)
app.use("/admin", adminRouter);
app.use("/room", roomRouter);
app.use("/bills", billsRouter);
app.use("/booking", bookingRouter);
app.use("/payment", paymentRouter);
app.use("/user", userRouter);

// ✅ Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("❌ Global Error:", err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});