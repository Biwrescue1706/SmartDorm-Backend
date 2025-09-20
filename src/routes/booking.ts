import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// 📂 โฟลเดอร์เก็บไฟล์
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ✅ multer memoryStorage
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 📌 จองห้อง
 */
router.post("/book", async (req: Request, res: Response) => {
  try {
    const { userId, roomId, checkin } = req.body;

    // ✅ ใช้ userId (string จาก LINE)
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status !== 0) return res.status(400).json({ error: "ห้องนี้ถูกจองหรือไม่ว่าง" });

    const existing = await prisma.booking.findFirst({
      where: { userId, status: { in: [0, 1] } },
    });
    if (existing) return res.status(400).json({ error: "คุณมีการจองหรือเข้าพักอยู่แล้ว" });

    const [booking] = await prisma.$transaction([
      prisma.booking.create({
        data: {
          user: { connect: { userId } },
          room: { connect: { id: roomId } },
          checkin: new Date(checkin),
          status: 0,
          slipUrl: null,
        },
      }),
      prisma.room.update({ where: { id: roomId }, data: { status: 1 } }),
    ]);

    // แจ้งเตือน
    await notifyUser(
      "Ud13f39623a835511f5972b35cbc5cdbd",
      `📢 ผู้ใช้ ${user.name} (${user.phone}) จองห้อง ${room.number}`
    );
    await notifyUser(user.userId, `🛏️ คุณได้จองห้อง ${room.number} เรียบร้อยแล้ว`);

    res.json({ message: "✅ จองห้องสำเร็จ", booking });
  } catch (err) {
    console.error("❌ Error booking:", err);
    res.status(500).json({ error: "ไม่สามารถจองห้องได้" });
  }
});

/**
 * 📌 จองห้องพร้อม Slip (เก็บ URL)
 */
router.post("/create", upload.single("slip"), async (req: Request, res: Response) => {
  try {
    const { userId, roomId, checkin } = req.body;
    const slip = req.file;

    if (!slip) return res.status(400).json({ error: "กรุณาอัปโหลดสลิป" });

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
    if (room.status !== 0) return res.status(400).json({ error: "ห้องนี้ถูกจองหรือไม่ว่าง" });

    // ✅ สร้างไฟล์ชื่อไม่ซ้ำ
    const filename = `${Date.now()}_${slip.originalname}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, slip.buffer);

    const slipUrl = `/uploads/${filename}`;

    const [booking] = await prisma.$transaction([
      prisma.booking.create({
        data: {
          user: { connect: { userId } },
          room: { connect: { id: roomId } },
          checkin: new Date(checkin),
          slipUrl,
          status: 0,
        },
      }),
      prisma.room.update({ where: { id: roomId }, data: { status: 1 } }),
    ]);

    res.json({ message: "✅ จองห้องพร้อม Slip สำเร็จ", booking });
  } catch (err) {
    console.error("❌ Error booking with slip:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการจอง" });
  }
});

export default router;
