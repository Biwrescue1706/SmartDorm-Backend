import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import prisma from "./prisma"; // ✅ ดึง prisma client ที่เช็คการ connect มาแล้ว

dotenv.config();

const allowedOrigins = [
  "http://localhost:5173", // frontend dev
  "http://localhost:5174", // frontend dev
  "https://smartdorm-frontend.onrender.com", // frontend render
  "https://smartdorm-bookingroom.onrender.com", // liff
];

const app = express();

// ✅ Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Safari / Postman
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("❌ Blocked by CORS:", origin);
        callback(new Error("❌ CORS not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());
app.use(cookieParser());

// 📂 เสิร์ฟไฟล์ uploads ออกไปให้ frontend
const UPLOAD_DIR = path.join(__dirname, "../uploads");
app.use("/uploads", express.static(UPLOAD_DIR));

// ---------------- Routes ----------------
import adminRouter from "./routes/admin";
import roomRouter from "./routes/room";
import billsRouter from "./routes/bill";
import bookingRouter from "./routes/booking";
import paymentRouter from "./routes/payment";
import userRouter from "./routes/user";
import qrRouter from "./routes/qr";

app.use("/admin", adminRouter);
app.use("/room", roomRouter);
app.use("/bills", billsRouter);
app.use("/booking", bookingRouter);
app.use("/payment", paymentRouter);
app.use("/user", userRouter);
app.use("/qr", qrRouter);

// ---------------- Health & Test ----------------
app.get("/", (_req, res) => {
  res.send("🚀 SmartDorm Backend is running");
});

app.get("/test-db", async (_req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      select: {
        adminId: true,
        username: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(admins);
  } catch (err: any) {
    console.error("❌ Prisma error:", err);
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// ---------------- Error Handler ----------------
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("❌ Global Error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
);

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  try {
    await prisma.$connect();
    console.log("✅ Connected to MongoDB via Prisma");
  } catch (err) {
    console.error("❌ Prisma connection error:", err);
    process.exit(1);
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  }
});

// ✅ จัดการ disconnect เวลา server ถูก kill
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  console.log("🛑 Prisma disconnected (SIGINT)");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  console.log("🛑 Prisma disconnected (SIGTERM)");
  process.exit(0);
});
