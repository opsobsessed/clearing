import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Verifies a payment made from the public /pricing page, where there's no signed-in userId yet —
// only the email the buyer typed in before checkout. Since we can't grant access to an account
// that doesn't exist, this parks the paid plan in pending_purchases keyed by email. It gets handed
// out automatically the moment that email signs in — see /api/razorpay/claim/route.js.
export async function POST(request) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, email, plan } = await request.json();
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !email || !plan) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return Response.json({ error: "Payments aren't configured yet." }, { status: 500 });
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (expected !== razorpay_signature) {
    return Response.json({ error: "Payment could not be verified." }, { status: 400 });
  }

  // Same cross-check as the signed-in verify route: confirm the order's notes (set server-side,
  // at order-creation time, never trusted from the browser) actually match the email claiming it
  // here, so nobody can replay someone else's order_id/payment_id/signature with a different email.
  const orderAuth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
    headers: { Authorization: `Basic ${orderAuth}` },
  });
  const orderData = await orderRes.json();
  const orderEmail = (orderData?.notes?.email || "").toLowerCase();
  if (!orderRes.ok || orderEmail !== email.toLowerCase() || orderData?.notes?.plan !== plan) {
    return Response.json({ error: "Payment could not be verified." }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Payments aren't configured yet." }, { status: 500 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await admin.from("pending_purchases").insert({
    email: email.toLowerCase(),
    plan,
    razorpay_order_id,
    razorpay_payment_id,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
