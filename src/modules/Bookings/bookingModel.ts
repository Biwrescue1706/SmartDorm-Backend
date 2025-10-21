// src/modules/Bookings/bookingModel.ts
export interface BookingInput {
  userId: string;
  userName: string;
  ctitle: string;
  cname: string;
  csurname: string;
  cphone: string;
  cmumId: string;
  roomId: string;
  checkin: string;
  slip?: Express.Multer.File;
}

export interface BookingUpdateInput {
  ctitle?: string;
  cname?: string;
  csurname?: string;
  cmumId?: string;
  cphone?: string;
  checkin?: string;
  status?: number;
}

export interface Booking {
  bookingId: string;
  roomId: string;
  customerId: string;
  checkin: Date;
  slipUrl: string;
  status: number;
  createdAt: Date;
}
