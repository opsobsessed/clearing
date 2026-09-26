import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Runs daily at 15:00 UTC (8:30pm IST) — see vercel.json. Two jobs (Vercel's free plan allows only
// two scheduled jobs, so they share this one):
//  1. Money Log reminder for anyone who turned it on and hasn't shared/saved today's log.
//  2. On the 1st of each month, emails a full backup file (unless turned off in Settings).
// Uses the same Resend setup as the payment reminders.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: rows, error } = await admin.from("user_state").select("user_id, data");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  let emailsSent = 0;
  const isFirst = todayIST.slice(8, 10) === "01";
  let backupsSent = 0;
  for (const row of rows || []) {
    const settings = (row.data && row.data.settings) || {};
    if (isFirst && settings.backupEmail !== false) {
      const { data: bprof } = await admin.from("profiles").select("email").eq("id", row.user_id).maybeSingle();
      if (bprof && bprof.email) {
        const json = JSON.stringify({ app: "clearing", v: 1, savedAt: new Date().toISOString(), ...row.data }, null, 2);
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.REMINDER_FROM, to: bprof.email, subject: `Clearing backup — ${todayIST.slice(0, 7)}`,
            html: `<div style="font-family:system-ui,sans-serif;max-width:420px;"><h2 style="color:#1F4D46;">Your monthly backup</h2><p style="color:#5F6B6E;font-size:14px;">Everything in Clearing as of today is attached. Keep this email — if anything ever goes wrong, open Settings → Restore in the app and pick this file.</p></div>`,
            attachments: [{ filename: `clearing-backup-${todayIST}.json`, content: Buffer.from(json).toString("base64") }],
          }),
        });
        if (r.ok) backupsSent++;
      }
    }
    if (!settings.logReminder) continue;
    const posts = settings.logPosts || {};
    if (posts[todayIST]) continue;
    const last = Object.keys(posts).filter(k => k < todayIST).sort().pop();
    const nextDay = last ? (+posts[last].day || 0) + 1 : null;

    const { data: prof } = await admin.from("profiles").select("email").eq("id", row.user_id).maybeSingle();
    const to = prof && prof.email;
    if (!to) continue;

    const title = nextDay ? `Day ${nextDay} of your Money Log is waiting` : "Your Money Log for today is waiting";
    const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;">
      <h2 style="color:#1F2A5C;">${title}</h2>
      <p style="color:#4A5680;font-size:14px;">Log today's last spends, then share today's page — it takes a minute.</p>
      <p><a href="${appUrl}" style="display:inline-block;background:#4F6367;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Open Clearing</a></p>
      <p style="color:#7A9E9F;font-size:12px;">Turn this off any time in the Money Log screen.</p></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.REMINDER_FROM, to, subject: title, html }),
    });
    if (res.ok) emailsSent++;
  }
  return Response.json({ ok: true, emailsSent, backupsSent });
}
