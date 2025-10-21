// src/modules/admin/adminRepository.ts
import prisma from "../../prisma";
import type { UpdateAdminInput } from "./adminModel";

export const adminRepository = {
  async findAll() {
    return prisma.admin.findMany({
      select: {
        adminId: true,
        username: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async findById(adminId: string) {
    return prisma.admin.findUnique({
      where: { adminId },
      select: {
        adminId: true,
        username: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async update(adminId: string, data: UpdateAdminInput) {
    return prisma.admin.update({
      where: { adminId },
      data,
    });
  },

  async delete(adminId: string) {
    return prisma.admin.delete({ where: { adminId } });
  },
};
