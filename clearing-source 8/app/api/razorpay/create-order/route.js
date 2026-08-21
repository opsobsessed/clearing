import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Amounts are fixed server-side on purpose — never trust an amount sent from the client for a payment.
const PLAN_AMOUNTS_PAISE = {
  trial: 30000,           // ₹300 — 7-day trial
  full: 300000,           // ₹3000 — one-time, permanent (no trial taken)
  full_after_trial: 270000, // ₹2700 — the ₹300 trial fee counts toward the ₹3000 total
};

export async function POST(request) {
  const { userId, email, plan } = await request.json();
  // Two ways in: userId (already signed in — the in-app Paywall/trial-banner flow, unchanged) or
  // email only (the public /pricing page — lets someone pay before they have an account at all;
  // see verify-preaccount/route.js and claim/route.js for how that gets matched up after sign-in).
  if (!userId && !email) return Response.json({ error: "Missing userId or email" }, { status: 400 });
  if (!PLAN_AMOUNTS_PAISE[plan]) return Response.json({ error: "Unknown plan" }, { status: 400 });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return Response.json({ error: "Payments aren't configured yet." }, { status: 500 });
  }

  // full_after_trial is a discounted price (₹2700 instead of ₹3000) that only makes sense if this
  // user actually paid the ₹300 trial already. Without this check, anyone could request that plan
  // directly (bypassing the UI, which only ever offers it post-trial) and get the discount for free.
  // Only reachable via the signed-in flow — /pricing never offers this plan pre-account.
  if (plan === "full_after_trial") {
    if (!userId) return Response.json({ error: "Sign in first to use this plan." }, { status: 400 });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: "Payments aren't configured yet." }, { status: 500 });
    }
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: prof } = await admin.from("profiles").select("trial_started_at").eq("id", userId).maybeSingle();
    if (!prof?.trial_started_at) {
      return Response.json({ error: "No trial found on this account — use Unlock forever instead." }, { status: 400 });
    }
  }

  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: PLAN_AMOUNTS_PAISE[plan],
      currency: "INR",
      receipt: `${plan}_${(userId || email)}_${Date.now()}`.slice(0, 40),
      notes: userId ? { userId, plan } : { email: email.toLowerCase(), plan },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return Response.json({ error: data?.error?.description || "Could not create the payment order." }, { status: 500 });
  }
  return Response.json({ orderId: data.id, amount: data.amount, currency: data.currency, keyId: process.env.RAZORPAY_KEY_ID });
}
