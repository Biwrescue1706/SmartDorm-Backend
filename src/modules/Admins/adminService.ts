// src/modules/admin/adminService.ts
import bcrypt from "bcryptjs";
import { adminRepository } from "./adminRepository";

export const adminService = {
  async getAllAdmins() {
    return await adminRepository.findAll();
  },

  async getAdminById(adminId: string) {
    const admin = await adminRepository.findById(adminId);
    if (!admin) throw new Error("ไม่พบข้อมูลผู้ดูแลระบบ");
    return admin;
  },

  async updateAdmin(adminId: string, data: any) {
    const updateData: Record<string, any> = {};
    if (data.username) updateData.username = data.username.trim();
    if (data.name) updateData.name = data.name.trim();
    if (data.password) updateData.password = await bcrypt.hash(data.password, 10);
    if (data.role !== undefined) updateData.role = Number(data.role);

    return await adminRepository.update(adminId, updateData);
  },

  async deleteAdmin(adminId: string) {
    return await adminRepository.delete(adminId);
  },
};
