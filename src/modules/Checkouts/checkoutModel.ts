//src/modules/Checkout/checkoutModel.ts
export interface CheckoutRequest {
  accessToken: string;
  checkout: string;
}

export interface BookingWithRelations {
  bookingId: string;
  room: { number: string };
  customer: {
    userId: string;
    userName: string;
    fullName: string;
    cphone: string;
  };
  checkout?: Date | null;
  status: number;
  returnStatus?: number | null;
}
