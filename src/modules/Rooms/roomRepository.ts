// src/modules/Rooms/roomRepository.ts
import prisma from "../../prisma";

export const roomRepository = {
  async findAll() {
    return prisma.room.findMany({
      orderBy: { number: "asc" },
      include: {
        bookings: true,
        bills: true,
        adminCreated: { select: { adminId: true, username: true, name: true } },
        adminUpdated: { select: { adminId: true, username: true, name: true } },
      },
    });
  },

  async findById(roomId: string) {
    return prisma.room.findUnique({
      where: { roomId },
      include: {
        bookings: { include: { customer: true } },
        bills: { include: { customer: true } },
        adminCreated: { select: { adminId: true, username: true, name: true } },
        adminUpdated: { select: { adminId: true, username: true, name: true } },
      },
    });
  },

  async create(data: any) {
    return prisma.room.create({
      data,
      include: {
        adminCreated: { select: { adminId: true, username: true, name: true } },
      },
    });
  },

  async update(roomId: string, data: any) {
    return prisma.room.update({
      where: { roomId },
      data,
      include: {
        adminCreated: { select: { adminId: true, username: true, name: true } },
        adminUpdated: { select: { adminId: true, username: true, name: true } },
      },
    });
  },

  async delete(roomId: string) {
    return prisma.room.delete({ where: { roomId } });
  },
};
