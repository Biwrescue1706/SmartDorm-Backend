// src/modules/Payments/paymentService.ts
import { paymentRepository } from "./paymentRepository";
import { notifyUser } from "../../utils/lineNotify";
import { PaymentInput } from "./paymentModel";

const formatThaiDate = (dateInput: string | Date) => {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const paymentService = {
  async createPayment(input: PaymentInput) {
    const { billId, accessToken, slip } = input;

    if (!accessToken) throw new Error("ไม่มี accessToken จาก LINE LIFF");
    if (!slip) throw new Error("ต้องแนบสลิปการจ่าย");

    const { userId } = await paymentRepository.verifyLineToken(accessToken);
    const customer = await paymentRepository.findCustomerByUserId(userId);
    if (!customer) throw new Error("ไม่พบข้อมูลลูกค้า");

    const bill = await paymentRepository.findBillById(billId);
    if (!bill) throw new Error("ไม่พบบิล");

    if (bill.customerId !== customer.customerId)
      throw new Error("ไม่มีสิทธิ์ส่งสลิปสำหรับบิลนี้");
    if (bill.status === 1)
      throw new Error("บิลนี้ชำระแล้ว");
    if (bill.status === 2)
      throw new Error("บิลนี้กำลังรอตรวจสอบ");

    const slipUrl = await paymentRepository.uploadSlipToSupabase(slip);

    const [payment, updatedBill] = await paymentRepository.createPaymentAndUpdateBill(
      billId,
      slipUrl,
      bill.customerId
    );

    const adminMsg = `มีการชำระบิลใหม่เข้ามา
ชื่อผู้ใช้: ${bill.customer.fullName}
ห้อง: ${bill.room.number}
เบอร์โทร: ${bill.customer.cphone}
รหัสบิล: ${bill.billId}
ยอดชำระ: ${bill.total} บาท
วันที่ชำระ: ${formatThaiDate(new Date())}
สลิป: ${slipUrl}
ตรวจสอบได้ที่ https://smartdorm-frontend.onrender.com`;

    const userMsg = `คุณได้ส่งสลิปการชำระบิลเรียบร้อยแล้ว
รหัสบิล: ${bill.billId}
ยอดชำระ: ${bill.total} บาท
วันที่ชำระ: ${formatThaiDate(new Date())}
ขอบคุณที่ใช้บริการ SmartDorm`;

    await notifyUser(bill.customer.userId, userMsg);
    if (process.env.ADMIN_LINE_ID)
      await notifyUser(process.env.ADMIN_LINE_ID, adminMsg);

    return { payment, bill: updatedBill };
  },
};
