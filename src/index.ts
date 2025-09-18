import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
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
import authRoutes from "./routes/auth";

app.get("/", (req, res) => {
  res.send("🚀 ระบบ Backend ของ SmartDorm ");
});

app.get("/test-db", async (req, res) => {
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

app.use("/admin", authRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
