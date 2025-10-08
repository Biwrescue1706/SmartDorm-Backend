// src/index.ts
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import prisma from "./prisma";

dotenv.config();

// ✅ เพิ่ม frontend render origin
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://smartdorm-frontend.onrender.com",
  "https://smartdorm-admin.pages.dev",
  "https://smartdorm-bookingroom.onrender.com",
  "https://smartdorm-returnroom.onrender.com",
  "https://smartdorm-paymentbill.onrender.com",

  // ✅ เพิ่ม RegExp สำหรับ iPad (local development)
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:\d+$/,
];

const app = express();

app.set("trust proxy", 1);

// ✅ CORS Middleware (รองรับทั้ง string และ RegExp)
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // ✅ Log ทุก request เพื่อ debug
    console.log("📍 Incoming request from origin:", origin);

    if (!origin) {
      console.log("✅ No origin (Safari/Postman) - Allowed");
      return callback(null, true);
    }

    // ✅ เช็คทั้ง string และ RegExp
    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === "string") {
        return allowed === origin;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      console.log("✅ Origin allowed:", origin);
      callback(null, true);
    } else {
      console.warn("❌ Blocked by CORS:", origin);
      callback(new Error("❌ CORS not allowed"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Set-Cookie"],
};

app.use(cors(corsOptions));
// ✅ ไม่ต้องใช้ app.options() เพราะ cors middleware จัดการให้แล้ว

app.use(express.json());
app.use(cookieParser());

// ✅ เพิ่ม middleware เพื่อ debug cookies
app.use((req, res, next) => {
  console.log("🍪 Cookies:", req.cookies);
  console.log("📍 Path:", req.path);
  console.log("📍 Method:", req.method);
  next();
});

// ---------------- import Routes ----------------
import adminRouter from "./routes/admin";
import roomRouter from "./routes/room";
import billsRouter from "./routes/bill";
import bookingRouter from "./routes/booking";
import checkoutRouter from "./routes/checkout";
import paymentRouter from "./routes/payment";
import userRouter from "./routes/user";
import qrRouter from "./routes/qr";
import authRouter from "./routes/auth";

// ---------------- use Routes ----------------
app.use("/admin", adminRouter);
app.use("/auth", authRouter);
app.use("/room", roomRouter);
app.use("/bills", billsRouter);
app.use("/booking", bookingRouter);
app.use("/checkout", checkoutRouter);
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

  console.log(`🚀 Server running on port ${PORT}`);
  console.log("✅ Allowed origins:", allowedOrigins);
});

// ✅ Disconnect Prisma เมื่อ server ถูก kill
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
