import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, plan } = await request.json();
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId || !plan) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return Response.json({ error: "Payments aren't configured yet." }, { status: 500 });
  }

  // Razorpay's rule: sha256 HMAC of "order_id|payment_id" using the key secret must match
  // the signature it sent back. This is what proves the payment is real and wasn't faked
  // from the browser.
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (expected !== razorpay_signature) {
    return Response.json({ error: "Payment could not be verified." }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (plan === "full" || plan === "full_after_trial") {
    const { error } = await admin.from("profiles").update({ premium_unlocked: true }).eq("id", userId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else if (plan === "trial") {
    // Only starts the clock the first time — a repeat ₹300 payment after an already-used trial
    // won't grant a fresh 7 days, since is("trial_started_at", null) makes this a no-op otherwise.
    const { error } = await admin.from("profiles").update({ trial_started_at: new Date().toISOString() }).eq("id", userId).is("trial_started_at", null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    return Response.json({ error: "Unknown plan" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
