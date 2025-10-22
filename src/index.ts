// src/index.ts
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import prisma from "./prisma";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

//  Allowed Origins
const allowedOrigins = [

  // localhost (dev)
  "http://localhost:5173",
  "http://localhost:5174",


  // Render deploys
  "https://smartdorm-frontend.onrender.com",
  "https://smartdorm-bookingroom.onrender.com",
  "https://smartdorm-returnroom.onrender.com",
  "https://smartdorm-paymentbill.onrender.com",

    // Custom domains
  "https://smartdorm-admin.biwbong.shop",
  "https://smartdorm-bookingroom.biwbong.shop",

];

//  CORS Config
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    console.log("📍 Incoming Origin:", origin); // << เพิ่มบรรทัดนี้
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin);
    console.log(isAllowed ? "Allowed" : "Blocked", origin); // << และอันนี้
    isAllowed ? callback(null, true) : callback(new Error("CORS not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Set-Cookie"],
};

// ใช้ CORS (production / dev mode)
if (process.env.NODE_ENV !== "production") {
  console.log("⚙️ Dev Mode: Allow all origins temporarily");
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(cors(corsOptions));
}


app.use(express.json());
app.use(cookieParser());

// ---------------- Routes ----------------
import adminRouter from "./modules/Admins/adminRouter";
import authRouter from "./modules/Auths/authRouter";
import billRouter from "./modules/Bills/billRouter";
import roomRouter from "./modules/Rooms/roomRouter";
import bookingRouter from "./modules/Bookings/bookingRouter";
import checkoutRouter from "./modules/Checkouts/checkoutRouter";
import paymentRouter from "./modules/Payments/paymentRouter";
import qrRouter from "./modules/QR/qrRouter";
import userRouter from "./modules/Users/userRouter";

app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/room", roomRouter);
app.use("/booking", bookingRouter);
app.use("/checkout", checkoutRouter);
app.use("/bill", billRouter);
app.use("/payment", paymentRouter);
app.use("/user", userRouter);
app.use("/qr", qrRouter);

// ---------------- Health Check ----------------
app.get("/", (_req, res) => res.send("🚀 SmartDorm Backend is running"));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// ---------------- Error Handler ----------------
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(" Global Error:", err);
  res.status(500).json({ error: err.message || "Server error" });
});

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  try {
    await prisma.$connect();
    console.log(" Connected to MongoDB via Prisma");
  } catch (err) {
    console.error(" Prisma connection error:", err);
    process.exit(1);
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  } else {
    console.log(`🚀 Server running on https://smartdorm-backend.biwbong.shop`);
  }
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  console.log("Prisma disconnected (SIGINT)");
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  console.log("Prisma disconnected (SIGTERM)");
  process.exit(0);
});
