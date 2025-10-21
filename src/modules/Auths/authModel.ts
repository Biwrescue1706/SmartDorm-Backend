// src/modules/auth/authModel.ts

export interface AuthPayload {
  adminId: string;
  username: string;
  name: string;
  role: number;
}

export interface RegisterInput {
  username: string;
  name: string;
  password: string;
  role?: number;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface ForgotPasswordInput {
  username: string;
  newPassword: string;
}

export interface ChangePasswordInput {
  adminId: string;
  oldPassword: string;
  newPassword: string;
}
