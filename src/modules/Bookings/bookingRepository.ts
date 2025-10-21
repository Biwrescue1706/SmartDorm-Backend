// src/modules/Bookings/bookingRepository.ts
import prisma from "../../prisma";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export const bookingRepository = {
  async findAll() {
    return prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: true, customer: true },
    });
  },

  async findById(bookingId: string) {
    return prisma.booking.findUnique({
      where: { bookingId },
      include: { room: true, customer: true },
    });
  },

  async createCustomer(data: any, tx: any) {
    return tx.customer.create({ data });
  },

  async createBooking(data: any, tx: any) {
    return tx.booking.create({
      data,
      include: { customer: true, room: true },
    });
  },

  async updateRoomStatus(roomId: string, status: number, tx?: any) {
    const db = tx || prisma;
    return db.room.update({ where: { roomId }, data: { status } });
  },

  async updateBooking(bookingId: string, data: any) {
    return prisma.booking.update({
      where: { bookingId },
      data,
      include: { customer: true, room: true },
    });
  },

  async deleteBooking(bookingId: string) {
    return prisma.booking.delete({ where: { bookingId } });
  },

  async uploadSlip(file: Express.Multer.File) {
    const filename = `slips/${Date.now()}_${file.originalname}`;
    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage
      .from(process.env.SUPABASE_BUCKET!)
      .getPublicUrl(filename);

    return data.publicUrl;
  },

  async deleteSlip(url: string) {
    try {
      const filePath = url.split("/").slice(-2).join("/");
      await supabase.storage
        .from(process.env.SUPABASE_BUCKET!)
        .remove([filePath]);
    } catch (err) {
      console.warn("ลบสลิปไม่สำเร็จ:", err);
    }
  },
};
