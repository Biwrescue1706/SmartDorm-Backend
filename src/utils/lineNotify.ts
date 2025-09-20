import fetch from "node-fetch";

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

/**
 * ส่งข้อความไปยัง userId ผ่าน LINE Messaging API
 */
export async function notifyUser(userId: string, message: string) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("❌ LINE API Error:", errorText);
    } else {
      console.log(`✅ Sent LINE message to ${userId}: ${message}`);
    }
  } catch (err) {
    console.error("❌ notifyUser error:", err);
  }
}
