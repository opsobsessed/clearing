export const dynamic = "force-dynamic";

// Amounts are fixed server-side on purpose — never trust an amount sent from the client for a payment.
const PLAN_AMOUNTS_PAISE = {
  trial: 30000,           // ₹300 — 7-day trial
  full: 300000,           // ₹3000 — one-time, permanent (no trial taken)
  full_after_trial: 270000, // ₹2700 — the ₹300 trial fee counts toward the ₹3000 total
};

export async function POST(request) {
  const { userId, plan } = await request.json();
  if (!userId) return Response.json({ error: "Missing userId" }, { status: 400 });
  if (!PLAN_AMOUNTS_PAISE[plan]) return Response.json({ error: "Unknown plan" }, { status: 400 });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return Response.json({ error: "Payments aren't configured yet." }, { status: 500 });
  }

  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: PLAN_AMOUNTS_PAISE[plan],
      currency: "INR",
      receipt: `${plan}_${userId}_${Date.now()}`.slice(0, 40),
      notes: { userId, plan },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return Response.json({ error: data?.error?.description || "Could not create the payment order." }, { status: 500 });
  }
  return Response.json({ orderId: data.id, amount: data.amount, currency: data.currency, keyId: process.env.RAZORPAY_KEY_ID });
}
