// src/modules/admin/adminModel.ts
import { Prisma } from "@prisma/client";

export interface Admin {
  adminId: string;
  username: string;
  name: string;
  password: string;
  role: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateAdminInput = Prisma.AdminCreateInput;
export type UpdateAdminInput = Prisma.AdminUpdateInput;