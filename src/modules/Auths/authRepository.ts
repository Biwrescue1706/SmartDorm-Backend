// src/modules/auth/authRepository.ts
import prisma from "../../prisma";

export const authRepository = {
  async findByUsername(username: string) {
    return prisma.admin.findUnique({ where: { username } });
  },

  async findById(adminId: string) {
    return prisma.admin.findUnique({ where: { adminId } });
  },

  async createAdmin(data: any) {
    return prisma.admin.create({ data });
  },

  async updateName(adminId: string, name: string) {
    return prisma.admin.update({
      where: { adminId },
      data: { name },
    });
  },

  async updatePasswordByUsername(username: string, hashedPassword: string) {
    return prisma.admin.update({
      where: { username },
      data: { password: hashedPassword },
    });
  },

  async updatePasswordById(adminId: string, hashedPassword: string) {
    return prisma.admin.update({
      where: { adminId },
      data: { password: hashedPassword },
    });
  },
};
