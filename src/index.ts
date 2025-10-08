// src/index.ts
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import prisma from "./prisma";

dotenv.config();

const app = express();
app.set("trust proxy", 1); // ✅ จำเป็นเมื่อ deploy บน Render / Cloudflare

// ✅ กำหนด Origin ที่อนุญาต
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://smartdorm-frontend.onrender.com",
  "https://smartdorm-admin.pages.dev",
  "https://smartdorm-bookingroom.onrender.com",
  "https://smartdorm-returnroom.onrender.com",
  "https://smartdorm-paymentbill.onrender.com",

  // ✅ รองรับการเข้าจากเครือข่ายภายใน (เช่น iPad)
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:\d+$/,
];

// ✅ ตั้งค่า CORS เบื้องต้น
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    console.log("📍 Incoming request from origin:", origin);

    if (!origin) {
      console.log("✅ No origin (Safari/Postman) - Allowed");
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some((allowed) =>
      typeof allowed === "string"
        ? allowed === origin
        : allowed instanceof RegExp && allowed.test(origin)
    );

    if (isAllowed) {
      console.log("✅ Origin allowed:", origin);
      callback(null, true);
    } else {
      console.warn("❌ Blocked by CORS:", origin);
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true, // ✅ จำเป็นเพื่อให้ cookie ทำงาน
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],
  exposedHeaders: ["Set-Cookie"],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// ✅ เพิ่ม middleware นี้เพื่อบังคับใส่ header ทุก response
// (ช่วยปลดล็อก CORS/Cookie เมื่อ proxy เช่น Render/Cloudflare ตัด header ออก)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  const origin = req.headers.origin;
  if (
    origin &&
    allowedOrigins.some((allowed) =>
      typeof allowed === "string"
        ? allowed === origin
        : allowed instanceof RegExp && allowed.test(origin)
    )
  ) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Expose-Headers", "Set-Cookie");
  next();
});

// ✅ Debug cookies ทุก request
app.use((req, _res, next) => {
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
      select: { adminId: true, username: true, name: true, createdAt: true },
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

// ✅ ปิดการเชื่อมต่อ Prisma อย่างปลอดภัยเมื่อหยุด server
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
