// src/utils/lineNotify.ts
import fetch from "node-fetch";

export async function notifyUser(to: string, message: string) {
  try {
    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text: message }],
      }),
    });

    const result = await resp.json();
    console.log("LINE notify result:", result);
  } catch (err) {
    console.error("LINE notify error:", err);
  }
}
