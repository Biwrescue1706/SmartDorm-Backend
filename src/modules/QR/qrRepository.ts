// src/modules/QR/qrRepository.ts
import fetch from "node-fetch";

export const qrRepository = {
  async generatePromptPayQr(promptpayId: string, amount: string) {
    const url = `https://promptpay.io/${promptpayId}/${amount}.png`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("ไม่สามารถสร้าง QR Code ได้");
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  },
};
