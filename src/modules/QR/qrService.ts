// src/modules/QR/qrService.ts
import { qrRepository } from "./qrRepository";

export const qrService = {
  async getPromptPayQr(amount: string) {
    const promptpayId = "0611747731"; // หมายเลข PromptPay ของ SmartDorm
    if (!amount || isNaN(Number(amount))) {
      throw new Error("จำนวนเงินไม่ถูกต้อง");
    }

    const image = await qrRepository.generatePromptPayQr(promptpayId, amount);
    return { image, contentType: "image/png" };
  },
};
