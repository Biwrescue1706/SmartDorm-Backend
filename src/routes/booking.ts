import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const router = Router();

// ✅ ใช้ memoryStorage (เก็บไฟล์ชั่วคราวใน RAM)
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// 📝 User ขอจองห้อง
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

      // ✅ Upload slip ไป Supabase ก่อน
      let finalSlipUrl = "";
      if (slipFile) {
        const filename = `slips/${Date.now()}_${slipFile.originalname}`;
        const { error } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET!)
          .upload(filename, slipFile.buffer, {
            contentType: slipFile.mimetype,
            upsert: true,
          });

        if (error) {
          console.error("❌ Supabase upload error:", error.message);
          return res.status(500).json({ error: "อัปโหลดสลิปไม่สำเร็จ" });
        }

        const { data } = supabase.storage
          .from(process.env.SUPABASE_BUCKET!)
          .getPublicUrl(filename);

        finalSlipUrl = data.publicUrl;
      }

      // ✅ Transaction: Customer ใหม่ + Booking
      const booking = await prisma.$transaction(async (tx) => {
        // ➡️ สร้าง Customer ใหม่เสมอ
        const customer = await tx.customer.create({
          data: {
            userId, // ❗ ถ้าอยากเก็บซ้ำ ต้องลบ @unique ออกจาก Prisma model
            userName,
            ctitle,
            cname,
            csurname,
            fullName: `${ctitle} ${cname} ${csurname}`,
            cphone,
            cmumId,
          },
        });

        // ➡️ Booking ผูกกับ Customer ใหม่
        return tx.booking.create({
          data: {
            roomId,
            customerId: customer.customerId,
            checkin: new Date(checkin),
            slipUrl: finalSlipUrl,
            status: 0, // 0 = รออนุมัติ
          },
          include: { customer: true, room: true },
        });
      });

      // ✅ แจ้ง Admin ผ่าน LINE
      const Adminmsg = `📢 มีการส่งคำขอจองห้องใหม่ \n
      ชื่อ : ${booking.customer.fullName} \n
      เบอร์โทร : ${booking.customer.cphone} \n
      ห้อง : ${booking.room.number}\n
      https://smartdorm-frontend.onrender.com`;
      await notifyUser(process.env.ADMIN_LINE_ID!, Adminmsg);
      res.json({ message: "✅ จองสำเร็จ", booking });
    } catch (err) {
      console.error("❌ Error create booking:", err);
      res.status(500).json({ error: "ไม่สามารถจองห้องได้" });
    }
  }
);

// ✅ Admin อนุมัติการจอง
router.put("/:bookingId/approve", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { room: true, customer: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    if (booking.status === 1) {
      return res.status(400).json({ error: "การจองนี้ถูกอนุมัติแล้ว" });
    }

    const [updatedBooking] = await prisma.$transaction([
      prisma.booking.update({ where: { bookingId }, data: { status: 1 } }),
      prisma.room.update({
        where: { roomId: booking.roomId },
        data: { status: 1 },
      }),
    ]);

    // 📢 แจ้งไปยัง User
    await notifyUser(
      booking.customer.userId,
      `✅ การจองห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว`
    );

    res.json({ message: "✅ อนุมัติการจองสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error approving booking:", err);
    res.status(500).json({ error: "ไม่สามารถอนุมัติการจองได้" });
  }
});

// ❌ Admin ปฏิเสธการจอง
router.put("/:bookingId/reject", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    const updatedBooking = await prisma.booking.update({
      where: { bookingId },
      data: { status: 2 }, // ปฏิเสธ
    });

    await notifyUser(
      booking.customer.userId,
      `❌ การจองห้อง ${booking.room.number} ไม่ผ่านการอนุมัติ`
    );

    res.json({ message: "❌ ปฏิเสธการจองสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error rejecting booking:", err);
    res.status(500).json({ error: "ไม่สามารถปฏิเสธการจองได้" });
  }
});

// ✏️ Admin แก้ไขข้อมูลการจอง
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
      },
      include: { customer: true, room: true },
    });

    res.json({ message: "✅ แก้ไขการจองสำเร็จ", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error updating booking:", err);
    res.status(500).json({ error: "ไม่สามารถแก้ไขการจองได้" });
  }
});

// 🗑️ Admin ลบการจอง
router.delete("/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({ where: { bookingId } });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    // คืนสถานะห้องเป็นว่าง
    await prisma.room.update({
      where: { roomId: booking.roomId },
      data: { status: 0 },
    });

    await prisma.booking.delete({ where: { bookingId } });

    res.json({ message: "🗑️ ลบการจองสำเร็จ" });
  } catch (err) {
    console.error("❌ Error deleting booking:", err);
    res.status(500).json({ error: "ไม่สามารถลบการจองได้" });
  }
});

export default router;
