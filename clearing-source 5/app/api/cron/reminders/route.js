import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const REMIND_DAYS = 10;

function daysUntil(day) {
  if (!day) return null;
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  let d = new Date(y, m, day);
  if (d < new Date(y, m, now.getDate())) d = new Date(y, m + 1, day);
  return Math.round((d - new Date(y, m, now.getDate())) / 86400000);
}
const inr = (n) => "\u20B9" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

export async function GET(request) {
  // Vercel sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: rows, error } = await admin.from("user_state").select("user_id, data");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let emailsSent = 0;
  for (const row of rows || []) {
    const obligs = (row.data && row.data.oblig) || [];
    const due = obligs
      .filter((o) => o.status !== "closed" && +o.monthly > 0)
      .map((o) => ({ ...o, in: daysUntil(o.dueDay) }))
      .filter((o) => o.in !== null && o.in <= REMIND_DAYS)
      .sort((a, b) => a.in - b.in);
    if (due.length === 0) continue;

    const { data: prof } = await admin.from("profiles").select("email").eq("id", row.user_id).maybeSingle();
    const to = prof && prof.email;
    if (!to) continue;

    const lines = due.map((o) => `<tr><td style="padding:6px 0;">${o.name}</td><td style="text-align:right;">${inr(o.monthly)}</td><td style="text-align:right;color:#5E747A;">${o.in === 0 ? "today" : "in " + o.in + " days"}</td></tr>`).join("");
    const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;">
      <h2 style="color:#28383D;">Payments coming up</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${lines}</table>
      <p style="color:#5E747A;font-size:13px;margin-top:16px;">Open Clearing to log them as you pay. You've got this.</p></div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.REMINDER_FROM, to, subject: `${due.length} payment${due.length > 1 ? "s" : ""} due soon`, html }),
    });
    if (res.ok) emailsSent++;
  }
  return Response.json({ ok: true, emailsSent });
}
