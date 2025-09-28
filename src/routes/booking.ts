import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/authMiddleware";
import { notifyUser } from "../utils/lineNotify";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// 📂 โฟลเดอร์เก็บไฟล์สลิป
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ✅ ใช้ memoryStorage (เก็บใน RAM ก่อน)
const upload = multer({ storage: multer.memoryStorage()});

// 📝 User ขอจองห้อง (แนบ slip ได้ทั้งแบบ url และไฟล์จริง)
router.post(
  "/create",
  upload.single("slip"),
  async (req: Request, res: Response) => {
    try {
      const {
        userId,
        ctitle,
        userName,
        roomId,
        checkin,
        cname,
        csurname,
        cphone,
        cmumId,
        slipUrl,
        billId,
      } = req.body;

      const slipFile = req.file;

      if (!userId || !roomId || !checkin) {
        return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
      }

      // ✅ หา/สร้าง Customer
      let customer = await prisma.customer.findFirst({ where: { userId } });
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            userId,
            userName,
            ctitle,
            cname,
            csurname,
            cphone,
            cmumId,
            fullName: `${cname} ${csurname}`,
          },
        });
      }

      // ✅ ตรวจสอบห้อง
      const room = await prisma.room.findUnique({ where: { roomId } });
      if (!room) return res.status(404).json({ error: "ไม่พบห้อง" });
      if (room.status !== 0)
        return res.status(400).json({ error: "ห้องไม่ว่าง" });

      // ✅ จัดการ slip
      let finalSlipUrl = slipUrl || "";
      if (slipFile) {
        const filename = `${Date.now()}_${slipFile.originalname}`;
        const filepath = path.join(UPLOAD_DIR, filename);
        await fs.promises.writeFile(filepath, slipFile.buffer);
        finalSlipUrl = `/uploads/${filename}`;
      }

      // ✅ ตรวจสอบ booking ที่ยัง active อยู่
      const existing = await prisma.booking.findFirst({
        where: { customerId: customer.customerId, status: { in: [0, 1] } },
      });
      if (existing) {
        return res
          .status(400)
          .json({ error: "คุณมีการจองหรือเข้าพักอยู่แล้ว" });
      }

      // ✅ สร้าง booking
      const booking = await prisma.booking.create({
        data: {
          customerId: customer.customerId,
          roomId,
          checkin: new Date(checkin),
          status: 0, // รออนุมัติ
        },
        include: { customer: true, room: true },
      });

      // ✅ ถ้ามี slip → สร้าง Payment
      if (finalSlipUrl) {
        await prisma.payment.create({
          data: {
            bookingId: booking.bookingId,
            billId: billId || new Date().getTime().toString(), // 👈 ถ้าไม่มี billId จะ gen id ชั่วคราว
            slipUrl: finalSlipUrl,
          },
        });
      }

      // แจ้ง Admin
      await notifyUser(
        process.env.ADMIN_LINE_ID!,
        `📢 ผู้เช่า ${customer.cname} (${customer.cphone}) ส่งคำขอจองห้อง ${room.number}`
      );

      res.json({ message: "✅ ส่งคำขอจองเรียบร้อย รอแอดมินอนุมัติ", booking });
    } catch (err) {
      console.error("❌ Error create booking:", err);
      res.status(500).json({ error: "ไม่สามารถจองห้องได้" });
    }
  }
);

//🚪 ผู้เช่าคืนห้อง
router.put("/:bookingId/checkout", async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { checkout } = req.body;

    if (!checkout) {
      return res.status(400).json({ error: "ต้องระบุวันที่คืนห้อง" });
    }

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });
    if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

    const updated = await prisma.booking.update({
      where: { bookingId },
      data: {
        checkout: new Date(checkout),
        status: 0, // คืนห้องแล้ว
      },
    });

    await prisma.room.update({
      where: { roomId: booking.roomId },
      data: { status: 0 },
    });

    await notifyUser(
      process.env.ADMIN_LINE_ID!,
      `📢 ผู้เช่า ${booking.customer.fullName} (${booking.customer.cphone}) ขอคืนห้อง ${booking.room.number}`
    );

    res.json({ message: "✅ คืนห้องสำเร็จ", booking: updated });
  } catch (err) {
    console.error("❌ Error checkout booking:", err);
    res.status(500).json({ error: "ไม่สามารถคืนห้องได้" });
  }
});

//✅ Admin อนุมัติการจอง
router.put(
  "/:bookingId/approve",
  authMiddleware,
  async (req: Request, res: Response) => {
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
        prisma.booking.update({
          where: { bookingId },
          data: { status: 1 },
        }),
        prisma.room.update({
          where: { roomId: booking.roomId },
          data: { status: 1 },
        }),
      ]);

      await notifyUser(
        booking.customer.userId,
        `✅ การจองห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว`
      );

      res.json({ message: "✅ อนุมัติการจองสำเร็จ", booking: updatedBooking });
    } catch (err) {
      console.error("❌ Error approving booking:", err);
      res.status(500).json({ error: "ไม่สามารถอนุมัติการจองได้" });
    }
  }
);

//❌ Admin ปฏิเสธการจอง
router.put(
  "/:bookingId/reject",
  authMiddleware,
  async (req: Request, res: Response) => {
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
  }
);

//📌 ดึงการจองทั้งหมด (Admin)
router.get("/getall", async (_req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        room: true,
        customer: true,
      },
    });
    res.json(bookings);
  } catch (err) {
    console.error("❌ Error fetching bookings:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการจองได้" });
  }
});

//✏️ Admin แก้ไขข้อมูลการจอง
router.put(
  "/:bookingId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { ctitle, cname, csurname, cmumId, cphone, status, checkin } =
        req.body;

      const booking = await prisma.booking.findUnique({
        where: { bookingId },
        include: { customer: true },
      });
      if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

      const updatedBooking = await prisma.booking.update({
        where: { bookingId },
        data: {
          ...(status !== undefined && { status }),
          ...(checkin && { checkin: new Date(checkin) }),
        },
        include: { customer: true, room: true },
      });

      if (ctitle || cname || csurname || cmumId || cphone) {
        await prisma.customer.update({
          where: { customerId: booking.customerId },
          data: {
            ...(ctitle && { ctitle }),
            ...(cname && { cname }),
            ...(csurname && { csurname }),
            ...(cmumId && { cmumId }),
            ...(cphone && { cphone }),
            ...(cname || csurname
              ? {
                  fullName: `${cname || booking.customer.cname} ${csurname || booking.customer.csurname}`,
                }
              : {}),
          },
        });
      }

      res.json({
        message: "✏️ แก้ไขข้อมูลการจองสำเร็จ",
        booking: updatedBooking,
      });
    } catch (err) {
      console.error("❌ Error updating booking:", err);
      res.status(500).json({ error: "ไม่สามารถแก้ไขข้อมูลการจองได้" });
    }
  }
);

//🗑️ Admin ลบข้อมูลการจอง
router.delete(
  "/:bookingId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;

      const deleted = await prisma.booking.delete({
        where: { bookingId },
      });

      res.json({ message: "🗑️ ลบข้อมูลการจองสำเร็จ", booking: deleted });
    } catch (err) {
      console.error("❌ Error deleting booking:", err);
      res.status(500).json({ error: "ไม่สามารถลบข้อมูลการจองได้" });
    }
  }
);

//การคืน

// ✅ Admin อนุมัติการคืน
router.put(
  "/:bookingId/approveCheckout",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { bookingId },
        include: { customer: true, room: true },
      });
      if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

      if (!booking.checkout) {
        return res.status(400).json({ error: "ยังไม่มีการขอคืนห้อง" });
      }

      const [updatedBooking] = await prisma.$transaction([
        prisma.booking.update({
          where: { bookingId },
          data: { returnStatus: 1 }, // อนุมัติการคืน
        }),
        prisma.room.update({
          where: { roomId: booking.roomId },
          data: { status: 0 }, // ห้องว่าง
        }),
      ]);

      await notifyUser(
        booking.customer.userId,
        `✅ การคืนห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว`
      );

      res.json({
        message: "✅ อนุมัติการคืนห้องสำเร็จ",
        booking: updatedBooking,
      });
    } catch (err) {
      console.error("❌ Error approving checkout:", err);
      res.status(500).json({ error: "ไม่สามารถอนุมัติการคืนได้" });
    }
  }
);

//❌ Admin ปฏิเสธการคืน
router.put(
  "/:bookingId/rejectCheckout",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;

      const booking = await prisma.booking.findUnique({
        where: { bookingId },
        include: { customer: true, room: true },
      });
      if (!booking) return res.status(404).json({ error: "ไม่พบการจอง" });

      const updatedBooking = await prisma.booking.update({
        where: { bookingId },
        data: { returnStatus: 2 }, // ปฏิเสธการคืน
      });

      await notifyUser(
        booking.customer.userId,
        `❌ การคืนห้อง ${booking.room.number} ไม่ได้รับการอนุมัติ`
      );

      res.json({ message: "❌ ปฏิเสธการคืนสำเร็จ", booking: updatedBooking });
    } catch (err) {
      console.error("❌ Error rejecting checkout:", err);
      res.status(500).json({ error: "ไม่สามารถปฏิเสธการคืนได้" });
    }
  }
);

//📌 ดึงการคืนทั้งหมด (Admin)
router.get(
  "/checkout/getall",
  authMiddleware,
  async (_req: Request, res: Response) => {
    try {
      const checkouts = await prisma.booking.findMany({
        where: { checkout: { not: null } }, // ✅ เอาเฉพาะที่มีคืนห้องแล้ว
        orderBy: { checkout: "desc" },
        include: { room: true, customer: true },
      });
      res.json(checkouts);
    } catch (err) {
      console.error("❌ Error fetching checkouts:", err);
      res.status(500).json({ error: "ไม่สามารถดึงข้อมูลการคืนได้" });
    }
  }
);

//✏️ Admin แก้ไขข้อมูลการคืน
router.put(
  "/checkout/:bookingId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { checkout, returnStatus } = req.body;

      const booking = await prisma.booking.findUnique({
        where: { bookingId },
        include: { customer: true, room: true },
      });
      if (!booking) return res.status(404).json({ error: "ไม่พบข้อมูลการคืน" });

      const updatedBooking = await prisma.booking.update({
        where: { bookingId },
        data: {
          ...(checkout && { checkout: new Date(checkout) }),
          ...(returnStatus !== undefined && { returnStatus }),
        },
        include: { room: true, customer: true },
      });

      res.json({
        message: "✏️ แก้ไขข้อมูลการคืนสำเร็จ",
        booking: updatedBooking,
      });
    } catch (err) {
      console.error("❌ Error updating checkout:", err);
      res.status(500).json({ error: "ไม่สามารถแก้ไขข้อมูลการคืนได้" });
    }
  }
);

//🗑️ Admin ลบข้อมูลการคืน
router.delete(
  "/checkout/:bookingId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { bookingId } = req.params;

      const booking = await prisma.booking.findUnique({ where: { bookingId } });
      if (!booking) return res.status(404).json({ error: "ไม่พบข้อมูลการคืน" });

      // ✅ ถ้าลบการคืนห้อง เราไม่ได้ลบทั้ง booking แต่ล้างค่า checkout + returnStatus
      const updatedBooking = await prisma.booking.update({
        where: { bookingId },
        data: {
          checkout: null,
          returnStatus: null,
        },
      });

      res.json({ message: "🗑️ ลบข้อมูลการคืนสำเร็จ", booking: updatedBooking });
    } catch (err) {
      console.error("❌ Error deleting checkout:", err);
      res.status(500).json({ error: "ไม่สามารถลบข้อมูลการคืนได้" });
    }
  }
);

export default router;
