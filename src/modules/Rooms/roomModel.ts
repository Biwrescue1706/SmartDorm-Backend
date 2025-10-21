// src/modules/Rooms/roomModel.ts
export interface RoomInput {
  number: string;
  size: string;
  rent: number;
  deposit: number;
  bookingFee: number;
  status?: number;
}

export interface UpdateRoomInput extends Partial<RoomInput> {
  roomId: string;
}

export interface Room {
  roomId: string;
  number: string;
  size: string;
  rent: number;
  deposit: number;
  bookingFee: number;
  status: number;
  createdBy?: string;
  updatedBy?: string;
}
