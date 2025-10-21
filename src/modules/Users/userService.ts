// src/modules/Users/userService.ts
import { userRepository } from "./userRepository";
import { RegisterInput } from "./userModel";

export const userService = {
  async register(input: RegisterInput) {
    const { accessToken, ctitle, cname, csurname, cphone, cmumId } = input;
    if (!accessToken) throw new Error("ไม่มี accessToken จาก LINE LIFF");

    const { userId, displayName } = await userRepository.verifyLineToken(accessToken);

    if (!ctitle || !cname || !cphone)
      throw new Error("กรุณากรอกข้อมูลให้ครบ");

    const fullName = `${ctitle}${cname}${csurname ? " " + csurname : ""}`;

    let customer = await userRepository.findCustomerByUserId(userId);
    if (customer) {
      customer = await userRepository.updateCustomer(customer.customerId, {
        userName: displayName,
        ctitle,
        cname,
        csurname,
        cphone,
        cmumId,
        fullName,
      });
    } else {
      customer = await userRepository.createCustomer({
        userId,
        userName: displayName,
        ctitle,
        cname,
        csurname,
        cphone,
        cmumId,
        fullName,
      });
    }

    return customer;
  },

  async getProfile(accessToken: string) {
    if (!accessToken) throw new Error("ไม่มี accessToken");
    const { userId } = await userRepository.verifyLineToken(accessToken);

    const customer = await userRepository.getCustomerWithRelations(userId);
    if (!customer) throw new Error("ไม่พบข้อมูลลูกค้า");

    return customer;
  },

  async getPaidBills(accessToken: string) {
    if (!accessToken) throw new Error("ไม่มี accessToken จาก LINE LIFF");

    const { userId } = await userRepository.verifyLineToken(accessToken);
    const customer = await userRepository.findCustomerByUserId(userId);
    if (!customer) throw new Error("ไม่พบลูกค้า");

    const bills = await userRepository.findPaidBills(customer.customerId);
    return bills.map((b) => ({
      billCode: b.billId.slice(-6).toUpperCase(),
      roomNumber: b.room.number,
      total: b.total,
      slipUrl: b.payment?.slipUrl,
      paidAt: b.payment?.createdAt,
    }));
  },

  async getUnpaidBills(accessToken: string) {
    if (!accessToken) throw new Error("ไม่มี accessToken จาก LINE LIFF");

    const { userId } = await userRepository.verifyLineToken(accessToken);
    const customer = await userRepository.findCustomerByUserId(userId);
    if (!customer) throw new Error("ไม่พบลูกค้า");

    const bills = await userRepository.findUnpaidBills(customer.customerId);
    return bills;
  },

  async getReturnableBookings(accessToken: string) {
    if (!accessToken) throw new Error("ไม่มี accessToken จาก LINE LIFF");

    const { userId } = await userRepository.verifyLineToken(accessToken);
    const customer = await userRepository.findCustomerByUserId(userId);
    if (!customer) throw new Error("ไม่พบลูกค้า");

    const bookings = await userRepository.findReturnableBookings(customer.customerId);
    return bookings;
  },
};
