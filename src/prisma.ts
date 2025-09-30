// src/prisma.ts

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function connectDB() {
  try {
    await prisma.$connect();
    console.log("✅ Connected to MongoDB via Prisma");
  } catch (err) {
    console.error("❌ Prisma connection error:", err);
    process.exit(1);
  }
}

connectDB();

export default prisma;