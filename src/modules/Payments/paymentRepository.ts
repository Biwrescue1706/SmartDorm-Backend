// src/modules/Payments/paymentRepository.ts
import prisma from "../../prisma";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export const paymentRepository = {
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

  async findCustomerByUserId(userId: string) {
    return prisma.customer.findFirst({ where: { userId } });
  },

  async findBillById(billId: string) {
    return prisma.bill.findUnique({
      where: { billId },
      include: { customer: true, room: true },
    });
  },

  async uploadSlipToSupabase(file: Express.Multer.File) {
    const filename = `${Date.now()}_${file.originalname}`;
    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) throw new Error("อัปโหลดสลิปไม่สำเร็จ");

    const { data } = supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .getPublicUrl(filename);

    return data.publicUrl;
  },

  async createPaymentAndUpdateBill(billId: string, slipUrl: string, customerId: string) {
    return prisma.$transaction([
      prisma.payment.create({
        data: { slipUrl, billId, customerId },
      }),
      prisma.bill.update({
        where: { billId },
        data: { status: 2, slipUrl },
      }),
    ]);
  },
};
