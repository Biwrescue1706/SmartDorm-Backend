// src/modules/Payments/paymentModel.ts
export interface PaymentInput {
  billId: string;
  accessToken: string;
  slip?: Express.Multer.File;
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}
