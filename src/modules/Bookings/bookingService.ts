// src/modules/Bookings/bookingService.ts
import { bookingRepository } from "./bookingRepository";
import { notifyUser } from "../../utils/lineNotify";
import { BookingInput, BookingUpdateInput } from "./bookingModel";
import prisma from "../../prisma";

const formatThaiDate = (dateInput: string | Date) => {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const bookingService = {
  async getAllBookings() {
    return await bookingRepository.findAll();
  },

  async getBookingById(bookingId: string) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new Error("ไม่พบการจอง");
    return booking;
  },

  async createBooking(input: BookingInput) {
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
      slip,
    } = input;

    if (!userId || !roomId || !checkin) throw new Error("ข้อมูลไม่ครบ");

    let slipUrl = "";
    if (slip) slipUrl = await bookingRepository.uploadSlip(slip);

    const booking = await prisma.$transaction(async (tx) => {
      const customer = await bookingRepository.createCustomer(
        {
          userId,
          userName,
          ctitle,
          cname,
          csurname,
          fullName: `${ctitle}${cname} ${csurname}`,
          cphone,
          cmumId,
        },
        tx
      );

      const newBooking = await bookingRepository.createBooking(
        {
          roomId,
          customerId: customer.customerId,
          checkin: new Date(checkin),
          slipUrl,
          status: 0,
        },
        tx
      );

      await bookingRepository.updateRoomStatus(roomId, 1, tx);

      return newBooking;
    });

    const adminMsg = `📢 มีการส่งคำขอจองห้อง 
ของคุณ ${booking.customer.userName}

-----------ข้อมูลลูกค้า----------
ชื่อ : ${booking.customer.fullName}
เบอร์โทร : ${booking.customer.cphone}
ห้อง : ${booking.room.number}
วันที่จอง : ${formatThaiDate(booking.createdAt)}
วันที่เช็คอิน : ${formatThaiDate(booking.checkin)}
สลิปการโอนเงิน : ${booking.slipUrl || "ไม่มีสลิป"}
--------------------
เข้าไปตรวจสอบได้ที่ : https://smartdorm-frontend.onrender.com`;

    const userMsg = `📢 ได้ส่งคำขอจองห้อง ${booking.room.number}
ของคุณ ${booking.customer.userName} เรียบร้อยแล้ว
กรุณารอการอนุมัติจากผู้ดูแลระบบ

รหัสการจอง: ${booking.bookingId}
ชื่อ: ${booking.customer.fullName}
วันที่เช็คอิน: ${formatThaiDate(booking.checkin)}
สถานะ: รอการอนุมัติ`;

    await notifyUser(booking.customer.userId, userMsg);
    if (process.env.ADMIN_LINE_ID)
      await notifyUser(process.env.ADMIN_LINE_ID, adminMsg);

    return booking;
  },

  async approveBooking(bookingId: string) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new Error("ไม่พบการจอง");
    if (booking.status === 1) throw new Error("การจองนี้ถูกอนุมัติแล้ว");

    const updated = await bookingRepository.updateBooking(bookingId, {
      status: 1,
    });

    const msg = `📢 การจองห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว
ชื่อ : ${booking.customer.fullName}
เช็คอิน : ${formatThaiDate(booking.checkin)}`;

    await notifyUser(booking.customer.userId, msg);
    return updated;
  },

  async rejectBooking(bookingId: string) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new Error("ไม่พบการจอง");

    const [updated] = await prisma.$transaction([
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

    const msg = `📢 การจองห้อง ${booking.room.number} ถูกปฏิเสธ
ชื่อ : ${booking.customer.fullName}
กรุณาส่งหมายเลขบัญชีเพื่อรับเงินคืน`;
    await notifyUser(booking.customer.userId, msg);
    return updated;
  },

  async updateBooking(bookingId: string, data: BookingUpdateInput) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new Error("ไม่พบการจอง");

    let roomStatus = booking.room.status;
    if (data.status === 1) roomStatus = 1;
    if (data.status === 2) roomStatus = 0;

    const updated = await bookingRepository.updateBooking(bookingId, {
      checkin: data.checkin ? new Date(data.checkin) : booking.checkin,
      status: data.status ?? booking.status,
      customer: {
        update: {
          ctitle: data.ctitle,
          cname: data.cname,
          csurname: data.csurname,
          fullName: `${data.ctitle}${data.cname} ${data.csurname}`,
          cmumId: data.cmumId,
          cphone: data.cphone,
        },
      },
      room: { update: { status: roomStatus } },
    });

    return updated;
  },

  async deleteBooking(bookingId: string) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new Error("ไม่พบการจอง");

    if (booking.slipUrl) await bookingRepository.deleteSlip(booking.slipUrl);
    await bookingRepository.updateRoomStatus(booking.roomId, 0);
    await bookingRepository.deleteBooking(bookingId);
  },
};
