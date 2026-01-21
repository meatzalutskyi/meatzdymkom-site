// netlify/functions/order.mjs
export default async (req, context) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return new Response("Bad Request", { status: 400 });
    }

    // Honeypot (bots often fill hidden fields)
    const company = String(payload.company ?? "").trim();
    if (company) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const orderData = payload.orderData;
    const msg = String(payload.msg ?? "");
    const isCutoff = Boolean(payload.isCutoff);

    if (!orderData || typeof orderData !== "object") {
      return new Response("Invalid orderData", { status: 422 });
    }
    if (!msg || msg.length < 10) {
      return new Response("Invalid message", { status: 422 });
    }

    const token = Netlify.env.TELEGRAM_BOT_TOKEN;
    const chatId = Netlify.env.TELEGRAM_CHAT_ID;
    const scriptUrl = Netlify.env.GOOGLE_SCRIPT_URL; // optional
    const scriptSecret = Netlify.env.GOOGLE_SCRIPT_SECRET; // optional

    if (!token || !chatId) {
      return new Response("Server not configured", { status: 500 });
    }

    // 1) Telegram
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const txt = await tgRes.text().catch(() => "");
      return new Response(`Telegram failed: ${txt}`.slice(0, 1000), { status: 502 });
    }

    // 2) Google Sheet via existing Apps Script webhook (if configured)
    if (scriptUrl) {
      await fetch(scriptUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(scriptSecret ? { "x-meatzdymkom-secret": scriptSecret } : {}),
        },
        body: JSON.stringify(scriptSecret ? { ...orderData, secret: scriptSecret } : orderData),
      });
    }

    return new Response(JSON.stringify({ ok: true, cutoff: isCutoff }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response("Server error", { status: 500 });
  }
};

export const config = {
  path: "/api/order",
};
