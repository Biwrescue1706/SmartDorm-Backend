// src/modules/Users/userRepository.ts
import prisma from "../../prisma";
import fetch from "node-fetch";
import { LineProfile } from "./userModel";

export const userRepository = {
  async verifyLineToken(accessToken: string): Promise<LineProfile> {
    const res = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("LINE token ไม่ถูกต้องหรือหมดอายุ");
    const data = (await res.json()) as LineProfile;
    return data;
  },

  async findCustomerByUserId(userId: string) {
    return prisma.customer.findFirst({ where: { userId } });
  },

  async createCustomer(data: any) {
    return prisma.customer.create({ data });
  },

  async updateCustomer(customerId: string, data: any) {
    return prisma.customer.update({ where: { customerId }, data });
  },

  async getCustomerWithRelations(userId: string) {
    return prisma.customer.findFirst({
      where: { userId },
      include: {
        bookings: { include: { room: true } },
        bills: { include: { room: true, payment: true } },
      },
    });
  },

  async findPaidBills(customerId: string) {
    return prisma.bill.findMany({
      where: { customerId, status: 1 },
      orderBy: { createdAt: "desc" },
      include: { room: true, payment: true },
    });
  },

  async findUnpaidBills(customerId: string) {
    return prisma.bill.findMany({
      where: { customerId, status: 0 },
      orderBy: { createdAt: "desc" },
      include: { room: true },
    });
  },

  async findReturnableBookings(customerId: string) {
    return prisma.booking.findMany({
      where: { customerId, status: 1 },
      include: { room: true },
      orderBy: { createdAt: "desc" },
    });
  },
};
