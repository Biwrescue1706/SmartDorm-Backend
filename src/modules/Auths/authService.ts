// src/modules/auth/authService.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authRepository } from "./authRepository";
import {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ChangePasswordInput,
  AuthPayload,
} from "./authModel";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) throw new Error("JWT_SECRET must be defined in .env file");

export const authService = {
  // ---------------- REGISTER ----------------
  async register(data: RegisterInput) {
    const { username, name, password, role } = data;
    if (!username || !name || !password) throw new Error("กรุณากรอกข้อมูลให้ครบ");

    const existing = await authRepository.findByUsername(username);
    if (existing) throw new Error("Username นี้ถูกใช้ไปแล้ว");

    const hashed = await bcrypt.hash(password, 10);
    const admin = await authRepository.createAdmin({
      username,
      name,
      password: hashed,
      role: role ?? 1,
    });
    return admin;
  },

  // ---------------- LOGIN ----------------
  async login(data: LoginInput) {
    const { username, password } = data;

    const admin = await authRepository.findByUsername(username);
    if (!admin) throw new Error("ไม่พบบัญชีผู้ใช้");

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) throw new Error("รหัสผ่านไม่ถูกต้อง");

    const token = jwt.sign(
      {
        adminId: admin.adminId,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      } as AuthPayload,
      JWT_SECRET,
      { expiresIn: "2h", algorithm: "HS256" }
    );

    return { admin, token };
  },

  // ---------------- VERIFY ----------------
  verifyToken(token: string) {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AuthPayload;
  },

  // ---------------- PROFILE ----------------
  async getProfile(adminId: string) {
    const admin = await authRepository.findById(adminId);
    if (!admin) throw new Error("ไม่พบข้อมูลผู้ใช้");
    return admin;
  },

  async updateName(adminId: string, name: string) {
    if (!name.trim()) throw new Error("กรุณากรอกชื่อใหม่");
    const admin = await authRepository.findById(adminId);
    if (!admin) throw new Error("ไม่พบผู้ใช้ในระบบ");
    return await authRepository.updateName(adminId, name.trim());
  },

  // ---------------- FORGOT PASSWORD ----------------
  async forgotCheck(username: string) {
    const admin = await authRepository.findByUsername(username);
    if (!admin) throw new Error("ไม่พบบัญชีผู้ใช้");
    return admin;
  },

  async forgotReset(data: ForgotPasswordInput) {
    const { username, newPassword } = data;
    const admin = await authRepository.findByUsername(username);
    if (!admin) throw new Error("ไม่พบบัญชีผู้ใช้");

    const hashed = await bcrypt.hash(newPassword, 10);
    return await authRepository.updatePasswordByUsername(username, hashed);
  },

  // ---------------- CHANGE PASSWORD ----------------
  async changePassword(data: ChangePasswordInput) {
    const { adminId, oldPassword, newPassword } = data;

    const admin = await authRepository.findById(adminId);
    if (!admin) throw new Error("ไม่พบผู้ใช้ในระบบ");

    const valid = await bcrypt.compare(oldPassword, admin.password);
    if (!valid) throw new Error("รหัสผ่านเดิมไม่ถูกต้อง");

    const hashed = await bcrypt.hash(newPassword, 10);
    return await authRepository.updatePasswordById(adminId, hashed);
  },
};
