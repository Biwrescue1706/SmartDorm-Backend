// src/utils/lineNotify.ts
import fetch from "node-fetch";

/**
 * ส่งข้อความผ่าน LINE Messaging API
 * @param to userId หรือ groupId (ต้องได้จาก webhook หรือเก็บใน DB)
 * @param message ข้อความที่ต้องการส่ง
 */
export async function notifyUser(to: string, message: string) {
  try {
    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}`, // ✅ ใช้ Messaging API token
      },
      body: JSON.stringify({
        to,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error("❌ LINE Messaging API error:", errorText);
      return null;
    }

    const result = await resp.json();
    console.log("✅ LINE message sent:", result);
    return result;
  } catch (err) {
    console.error("❌ LINE notify error:", err);
    return null;
  }
}
