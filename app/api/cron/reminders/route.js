import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const REMIND_DAYS = 10;

// Same date rules as the app (components/Clearing.jsx), so the email lists what Home shows as due.
const pad2 = (n) => String(n).padStart(2, "0");
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDaysStr = (ds, n) => { const d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() + n); return localDay(d); };
const addMonthsStr = (ds, n) => { const d = new Date(ds + "T00:00:00"); d.setMonth(d.getMonth() + n); return localDay(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
function daysUntil(day) {
  if (!day) return null;
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  let d = new Date(y, m, day);
  if (d < new Date(y, m, now.getDate())) d = new Date(y, m + 1, day);
  return Math.round((d - new Date(y, m, now.getDate())) / 86400000);
}
// A card's next unpaid statement due date (from the "next payment due" set on the Clear tab).
function cardDueDate(o, payments) {
  if (!o.nextDue) return null;
  for (let k = 0; k < 36; k++) {
    const due = addMonthsStr(o.nextDue, k);
    const paid = (payments || []).some((p) => p.obligId === o.id && p.date > addDaysStr(due, -30) && p.date <= addDaysStr(due, 25));
    if (!paid) return due;
  }
  return null;
}
// Days until something is due: a card by its statement date, a loan that hasn't started by its
// start date, anything else by its monthly due day.
function dueInDays(o, payments) {
  const today = localDay();
  if (o.startsOn && today < o.startsOn) return daysBetween(today, o.startsOn);
  if (o.isCreditCard) { const due = cardDueDate(o, payments); return due ? daysBetween(today, due) : null; }
  return daysUntil(o.dueDay);
}
// A card is due for its whole bill; anything else for its monthly amount.
const dueAmount = (o) => (o.isCreditCard ? +o.outstanding || 0 : +o.monthly || 0);
// Cleared and settled (closed for less) debts are never due — "settled" used to slip through here.
const stillOwed = (o) => o.status !== "closed" && o.status !== "settled" && (+o.outstanding || 0) > 0;
const inr = (n) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const whenText = (n) => (n < 0 ? `${-n} day${n === -1 ? "" : "s"} late` : n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`);

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
    const payments = (row.data && row.data.payments) || [];
    const due = obligs
      .filter(stillOwed)
      .map((o) => ({ ...o, amount: dueAmount(o), in: dueInDays(o, payments) }))
      // Only cards can show as late here: a loan's due day always rolls to its next date.
      .filter((o) => o.amount > 0 && o.in !== null && o.in <= REMIND_DAYS)
      .sort((a, b) => a.in - b.in);
    if (due.length === 0) continue;

    const { data: prof } = await admin.from("profiles").select("email").eq("id", row.user_id).maybeSingle();
    const to = prof && prof.email;
    if (!to) continue;

    const lines = due.map((o) => `<tr><td style="padding:6px 0;">${o.name}${o.isCreditCard ? " (card bill)" : ""}</td><td style="text-align:right;">${inr(o.amount)}</td><td style="text-align:right;color:${o.in < 0 ? "#C4553D" : "#5E747A"};">${whenText(o.in)}</td></tr>`).join("");
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
