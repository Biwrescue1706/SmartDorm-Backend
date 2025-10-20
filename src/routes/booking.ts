import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const router = Router();

// เก็บไฟล์ชั่วคราวใน RAM
const upload = multer({ storage: multer.memoryStorage() });

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// ดึงการจองทั้งหมด
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: true, customer: true },
    });
    res.json(bookings);
  } catch {
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการจองได้" });
  }
});

//  ผู้ใช้ขอจองห้อง
router.post(
  "/create",
  upload.single("slip"),
  async (req: Request, res: Response) => {
    try {
      const {
        userId,
        userName,
        ctitle,
        cname,
        csurname,
        cphone,
        cmumId,
        roomId,
        checkin,
      } = req.body;
      const slipFile = req.file;

      if (!userId || !roomId || !checkin) {
        return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
      }

      //  Upload slip ไป Supabase
      let finalSlipUrl = "";
      if (slipFile) {
        const filename = `slips/${Date.now()}_${slipFile.originalname}`;
        const { error: uploadError } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET!)
          .upload(filename, slipFile.buffer, {
            contentType: slipFile.mimetype,
            upsert: true,
          });

        if (uploadError) {
          return res.status(500).json({
            error: "อัปโหลดสลิปไม่สำเร็จ",
            detail: uploadError.message,
          });
        }

        const { data } = supabase.storage
          .from(process.env.SUPABASE_BUCKET!)
          .getPublicUrl(filename);

        finalSlipUrl = data.publicUrl;
      }

      // Transaction: สร้าง Customer ใหม่ทุกครั้ง + Booking + อัปเดตสถานะห้อง
      const booking = await prisma.$transaction(async (tx) => {
        //  สร้าง customer ใหม่ทุกครั้ง (ไม่ตรวจซ้ำ)
        const customer = await tx.customer.create({
          data: {
            userId,
            userName,
            ctitle,
            cname,
            csurname,
            fullName: `${ctitle}${cname} ${csurname}`,
            cphone,
            cmumId,
          },
        });

        //  สร้าง booking
        const newBooking = await tx.booking.create({
          data: {
            roomId,
            customerId: customer.customerId,
            checkin: new Date(checkin),
            slipUrl: finalSlipUrl,
            status: 0, // pending
          },
          include: { customer: true, room: true },
        });

        //  อัปเดตสถานะห้อง
        await tx.room.update({
          where: { roomId },
          data: { status: 1 },
        });

        return newBooking;
      });

      //  แจ้ง Admin ผ่าน LINE
      const adminMsg = `📢 มีการส่งคำขอจองห้องใหม่ 
ของคุณ ${booking.customer.userName}
ชื่อ : ${booking.customer.fullName}
เบอร์โทร : ${booking.customer.cphone}
ห้อง : ${booking.room.number}
วันที่จอง: ${new Date(booking.createdAt).toLocaleDateString()}
วันที่เช็คอิน: ${new Date(booking.checkin).toLocaleDateString()}
สลิปการโอนเงิน: ${booking.slipUrl || "ไม่มีสลิป"}
สามารถเข้าไป ตรวจสอบและอนุมัติได้ที่: https://smartdorm-frontend.onrender.com
`;

      const userMsg = `📢 ได้ส่งคำขอจองห้อง ${booking.room.number} 
ของคุณ ${booking.customer.userName} เรียบร้อยแล้ว
กรุณารอการอนุมัติจากผู้ดูแลระบบ

-------------------

รหัสการจองของคุณคือ: ${booking.bookingId}
ชื่อ : ${booking.customer.fullName}
เบอร์โทร : ${booking.customer.cphone}
วันที่จอง: ${new Date(booking.createdAt).toLocaleDateString()}
วันที่เช็คอิน: ${new Date(booking.checkin).toLocaleDateString()}
สถานะ: รอการอนุมัติจากผู้ดูแลระบบ

-------------------

ขอบคุณที่ใช้บริการ SmartDorm `;

      await notifyUser(booking.customer.userId, userMsg);
      if (process.env.ADMIN_LINE_ID) {
        await notifyUser(process.env.ADMIN_LINE_ID, adminMsg);
      }

      res.json({ message: "จองสำเร็จ", booking });
    } catch (err: any) {
      res.status(500).json({
        error: "ไม่สามารถจองห้องได้",
        detail: err.message || String(err),
      });
    }
  }
);

//  Admin อนุมัติการจอง
router.put("/:bookingId/approve", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { room: true, customer: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });
    if (booking.status === 1)
      return res.status(400).json({ error: "การจองนี้ถูกอนุมัติแล้ว" });

    const updatedBooking = await prisma.booking.update({
      where: { bookingId },
      data: { status: 1 },
      include: { customer: true, room: true },
    });

    const userMsg = `📢 การจองห้อง ${booking.room.number}
ของคุณ ${booking.customer.userName} ได้รับการอนุมัติแล้ว
ขอบคุณที่ใช้บริการ SmartDorm`;

    await notifyUser(booking.customer.userId, userMsg);

    res.json({ message: " อนุมัติการจองสำเร็จ", booking: updatedBooking });
  } catch {
    res.status(500).json({ error: "ไม่สามารถอนุมัติการจองได้" });
  }
});

//  Admin ปฏิเสธการจอง
router.put("/:bookingId/reject", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    const [updatedBooking] = await prisma.$transaction([
      prisma.booking.update({
        where: { bookingId },
        data: { status: 2 },
        include: { customer: true, room: true },
      }),
      prisma.room.update({
        where: { roomId: booking.roomId },
        data: { status: 0 },
      }),
    ]);

    const userMsg = `📢การจองห้อง ${booking.room.number} 
ของคุณ ${booking.customer.userName} ถูกปฏิเสธ
กรุณาติดต่อผู้ดูแลระบบ`;

    await notifyUser(booking.customer.userId, userMsg);

    res.json({ message: " ปฏิเสธการจองสำเร็จ", booking: updatedBooking });
  } catch {
    res.status(500).json({ error: "ไม่สามารถปฏิเสธการจองได้" });
  }
});

// Admin แก้ไขข้อมูลการจอง
router.put("/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { ctitle, cname, csurname, cmumId, cphone, checkin, status } =
      req.body;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    let roomStatus = booking.room.status;
    if (status === 1) roomStatus = 1;
    if (status === 2) roomStatus = 0;

    const updatedBooking = await prisma.booking.update({
      where: { bookingId },
      data: {
        checkin: checkin ? new Date(checkin) : booking.checkin,
        status: status !== undefined ? status : booking.status,
        customer: {
          update: {
            ctitle,
            cname,
            csurname,
            fullName: `${ctitle} ${cname} ${csurname}`,
            cmumId,
            cphone,
          },
        },
        room: { update: { status: roomStatus } },
      },
      include: { customer: true, room: true },
    });

    res.json({ message: " แก้ไขการจองสำเร็จ", booking: updatedBooking });
  } catch {
    res.status(500).json({ error: "ไม่สามารถแก้ไขการจองได้" });
  }
});

//  Admin ลบการจอง
router.delete("/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({ where: { bookingId } });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    //  ถ้ามี slipUrl ให้ลบจาก Supabase
    if (booking.slipUrl) {
      try {
        // ตัดเอา path หลังชื่อ bucket (เช่น slips/1734462_xxx.png)
        const filePath = booking.slipUrl.split("/").slice(-2).join("/");

        const { error: removeError } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET!)
          .remove([filePath]);

        if (removeError) {
          console.warn("⚠️ ลบสลิปจาก Supabase ไม่สำเร็จ:", removeError.message);
        } else {
          console.log("🗑️ ลบสลิปจาก Supabase สำเร็จ:", filePath);
        }
      } catch (err) {
        console.warn("⚠️ ไม่สามารถลบไฟล์ Supabase ได้:", err);
      }
    }

    //  อัพเดทสถานะห้องก่อนลบการจอง
    await prisma.room.update({
      where: { roomId: booking.roomId },
      data: { status: 0 },
    });

    // ลบ booking ในฐานข้อมูล
    await prisma.booking.delete({ where: { bookingId } });

    res.json({ message: "ลบการจองและสลิปสำเร็จ" });
  } catch (err) {
    console.error("❌ Error deleting booking:", err);
    res.status(500).json({ error: "ไม่สามารถลบการจองได้" });
  }
});

export default router;
