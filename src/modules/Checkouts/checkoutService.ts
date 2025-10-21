import { checkoutRepository } from "./checkoutRepository";
import { notifyUser } from "../../utils/lineNotify";
import { CheckoutRequest } from "./checkoutModel";

const formatThaiDate = (dateInput: string | Date) => {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const checkoutService = {
  async getAllCheckouts() {
    return await checkoutRepository.findAllCheckouts();
  },

  async getMyBookings(accessToken: string) {
    const { userId } = await checkoutRepository.verifyLineToken(accessToken);
    const customer = await checkoutRepository.findCustomerByUserId(userId);
    if (!customer) throw new Error("ไม่พบข้อมูลผู้ใช้ในระบบ");
    const bookings = await checkoutRepository.findBookingsByCustomer(customer.customerId);
    return bookings;
  },

  async requestCheckout(bookingId: string, data: CheckoutRequest) {
    const { accessToken, checkout } = data;
    if (!accessToken) throw new Error("ไม่มี accessToken จาก LINE LIFF");
    if (!checkout) throw new Error("ต้องระบุวันที่คืนห้อง");

    const { userId } = await checkoutRepository.verifyLineToken(accessToken);
    const customer = await checkoutRepository.findCustomerByUserId(userId);
    if (!customer) throw new Error("ไม่พบข้อมูลผู้ใช้ในระบบ");

    const booking = await checkoutRepository.findBookingById(bookingId);
    if (!booking) throw new Error("ไม่พบการจอง");
    if (booking.customerId !== customer.customerId)
      throw new Error("ไม่มีสิทธิ์คืนห้องนี้");

    const updated = await checkoutRepository.updateBooking(bookingId, {
      checkout: new Date(checkout),
      returnStatus: 0,
    });

    const adminMsg = `มีการส่งคำขอคืนห้องใหม่
ชื่อผู้ใช้: ${booking.customer.userName}
ชื่อจริง: ${booking.customer.fullName}
เบอร์โทร: ${booking.customer.cphone}
ห้อง: ${booking.room.number}
วันที่ขอคืน: ${formatThaiDate(checkout)}
สามารถตรวจสอบได้ที่ https://smartdorm-frontend.onrender.com`;

    const userMsg = `คุณได้ส่งคำขอคืนห้อง ${booking.room.number}
รหัสการจอง: ${booking.bookingId}
ชื่อ: ${booking.customer.fullName}
วันที่เช็คเอาท์: ${formatThaiDate(checkout)}
สถานะ: รอการอนุมัติการคืนห้องจากผู้ดูแลระบบ`;

    await notifyUser(booking.customer.userId, userMsg);
    if (process.env.ADMIN_LINE_ID)
      await notifyUser(process.env.ADMIN_LINE_ID, adminMsg);

    return updated;
  },

  async approveCheckout(bookingId: string) {
    const booking = await checkoutRepository.findBookingById(bookingId);
    if (!booking) throw new Error("ไม่พบการจอง");
    if (!booking.checkout) throw new Error("ยังไม่มีการขอคืนห้อง");
    if (booking.status !== 1) throw new Error("สถานะ booking ไม่สามารถคืนห้องได้");

    const [updated] = await checkoutRepository.transactionUpdate([
      checkoutRepository.updateBooking(bookingId, {
        returnStatus: 1,
        status: 3,
      }),
      checkoutRepository.updateRoomStatus(booking.roomId, 0),
    ]);

    const userMsg = `การคืนห้อง ${booking.room.number} ได้รับการอนุมัติแล้ว
ชื่อ: ${booking.customer.fullName}
กรุณาส่งหมายเลขบัญชีเพื่อรับเงินมัดจำคืน`;
    await notifyUser(booking.customer.userId, userMsg);
    return updated;
  },

  async rejectCheckout(bookingId: string) {
    const booking = await checkoutRepository.findBookingById(bookingId);
    if (!booking) throw new Error("ไม่พบการจอง");

    const updated = await checkoutRepository.updateBooking(bookingId, {
      returnStatus: 2,
    });

    const userMsg = `คำขอคืนห้อง ${booking.room.number} ของคุณไม่ผ่านการอนุมัติ
กรุณาติดต่อผู้ดูแลระบบเพื่อสอบถามเพิ่มเติม`;
    await notifyUser(booking.customer.userId, userMsg);
    return updated;
  },

  async updateCheckout(bookingId: string, body: any) {
    const { checkout, returnStatus } = body;
    const booking = await checkoutRepository.findBookingById(bookingId);
    if (!booking) throw new Error("ไม่พบข้อมูลการคืน");

    const updated = await checkoutRepository.updateBooking(bookingId, {
      ...(checkout && { checkout: new Date(checkout) }),
      ...(returnStatus !== undefined && { returnStatus }),
    });
    return updated;
  },

  async deleteCheckout(bookingId: string) {
    const booking = await checkoutRepository.findBookingById(bookingId);
    if (!booking) throw new Error("ไม่พบข้อมูลการคืน");

    const updated = await checkoutRepository.updateBooking(bookingId, {
      checkout: null,
      returnStatus: null,
      status: booking.status === 3 ? 1 : booking.status,
    });

    return updated;
  },
};
