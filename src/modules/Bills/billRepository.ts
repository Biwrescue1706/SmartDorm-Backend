// src/modules/Bills/billRepository.ts
import prisma from "../../prisma";

export const billRepository = {
  async findAll() {
    return prisma.bill.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: true, customer: true, payment: true },
    });
  },

  async findById(billId: string) {
    return prisma.bill.findUnique({
      where: { billId },
      include: { room: true, customer: true, payment: true },
    });
  },

  async findPrevBill(roomId: string, billMonth: Date, prevMonth: Date) {
    return prisma.bill.findFirst({
      where: {
        roomId,
        month: {
          gte: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1),
          lt: new Date(billMonth.getFullYear(), billMonth.getMonth(), 1),
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(data: any) {
    return prisma.bill.create({
      data,
      include: { room: true, customer: true },
    });
  },

  async update(billId: string, data: any) {
    return prisma.bill.update({
      where: { billId },
      data,
    });
  },

  async delete(billId: string) {
    return prisma.bill.delete({ where: { billId } });
  },

  async findBooking(roomId: string) {
    return prisma.booking.findFirst({
      where: { roomId, status: 1 },
    });
  },

  async findRoom(roomId: string) {
    return prisma.room.findUnique({ where: { roomId } });
  },
};
