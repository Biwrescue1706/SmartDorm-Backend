// src/modules/Checkouts/checkoutRepository.ts
import prisma from "../../prisma";
import fetch from "node-fetch";

export const checkoutRepository = {
  async verifyLineToken(accessToken: string): Promise<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
  }> {
    const res = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("LINE token ไม่ถูกต้องหรือหมดอายุ");
    return (await res.json()) as {
      userId: string;
      displayName: string;
      pictureUrl?: string;
    };
  },

  async findAllCheckouts() {
    return prisma.booking.findMany({
      where: { checkout: { not: null } },
      orderBy: { checkout: "desc" },
      include: { room: true, customer: true },
    });
  },

  async findCustomerByUserId(userId: string) {
    return prisma.customer.findFirst({ where: { userId } });
  },

  async findBookingsByCustomer(customerId: string) {
    return prisma.booking.findMany({
      where: { customerId, status: 1, checkout: null },
      orderBy: { createdAt: "desc" },
      include: { room: true },
    });
  },

  async findBookingById(bookingId: string) {
    return prisma.booking.findUnique({
      where: { bookingId },
      include: { customer: true, room: true },
    });
  },

  async updateBooking(bookingId: string, data: any) {
    return prisma.booking.update({
      where: { bookingId },
      data,
      include: { customer: true, room: true },
    });
  },

  async updateRoomStatus(roomId: string, status: number) {
    return prisma.room.update({
      where: { roomId },
      data: { status },
    });
  },

  async transactionUpdate(fn: any) {
    return prisma.$transaction(fn);
  },
};
