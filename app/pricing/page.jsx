"use client";
// Public, unauthenticated page — deliberately does NOT check for a session. Its purpose is to let
// anyone (a visitor, or a payment-gateway reviewer) see exactly what Clearing costs, pay right here
// with just an email, and get what they get for it — without having to create an account first.
// Payment happens on this page; signing in to actually use the app happens afterward, matched up
// automatically by email (see /api/razorpay/verify-preaccount and /api/razorpay/claim).

import { useState } from "react";

const C = {
  bg: "#F9F9FF", surface: "#FFFFFF", surface2: "#E8EDFF", line: "#C3C6D6",
  text: "#041B3C", muted: "#434654", faint: "#737685",
  primary: "#0052CC", teal: "#00875A", coral: "#DE350B",
};

const FEATURES = [
  ["Money in hand", "Track balances across every account you actually hold money in, and see what's safe to spend right now after everything due soon is set aside."],
  ["Spending", "Log expenses against custom categories, set a monthly budget and per-category budgets, and see day/week/month/year breakdowns as charts."],
  ["Debt payoff", "Track every loan or debt in one place — banks, payday/app loans, and family & friends — with an avalanche or snowball payoff plan, a projected debt-free date, and support for settling a debt for less than what's owed."],
  ["Evidence log", "For problem lenders: log harassment/contact incidents, complaints filed, settlement offers, references given, and No Due Certificates received, all tied to the specific loan — plus a one-tap copyable summary for anyone you need to share it with."],
  ["Know your rights", "A guided Escalation Helper covering RBI recovery-call rules, how to check if a lender is even legitimate, how to file a free RBI Ombudsman complaint, and what to do if it turns criminal — plus mental health helplines if it's all feeling like a lot."],
  ["Your data, your control", "Everything lives in your own account. A Back Up button exports a full JSON copy any time, and Restore brings it back on any device."],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PricingPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(""); // "trial" | "full" | ""
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(""); // "trial" | "full" | ""
  const validEmail = EMAIL_RE.test(email.trim());

  async function pay(plan) {
    if (!validEmail || busy) return;
    setErr("");
    setBusy(plan);
    try {
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), plan }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error || "Could not start the payment.");
      if (typeof window === "undefined" || !window.Razorpay) throw new Error("Payment couldn't load — check your connection and try again.");
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Clearing",
        description: plan === "trial" ? "7-day trial" : "Unlock forever",
        order_id: order.orderId,
        prefill: { email: email.trim() },
        handler: async (response) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify-preaccount", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...response, email: email.trim(), plan }),
            });
            const result = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(result.error || "Payment could not be verified.");
            setSuccess(plan);
          } catch (e) {
            setErr(e.message);
          }
          setBusy("");
        },
        theme: { color: C.primary },
      });
      rzp.on("payment.failed", (e) => {
        setErr((e && e.error && e.error.description) || "Payment failed.");
        setBusy("");
      });
      rzp.open();
    } catch (e) {
      setErr(e.message);
      setBusy("");
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter',system-ui,sans-serif", color: C.text, padding: "40px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 420, background: C.surface, border: "1px solid " + C.line, borderRadius: 16, padding: 26, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 8 }}>Payment received</div>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 18, lineHeight: 1.6 }}>
            {success === "trial" ? "Your 7-day trial is paid for." : "You're unlocked forever."} One last step — sign in with <strong>{email.trim()}</strong> (the same email you just paid with) and it'll be applied to your account automatically.
          </div>
          <a href="/" style={{ textDecoration: "none" }}>
            <div style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Sign in to get access
            </div>
          </a>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 14, lineHeight: 1.5 }}>
            Use the exact same email — that's how we match your payment to your account. Trouble? <a href="mailto:luxefulfilmentco@gmail.com" style={{ color: C.primary, fontWeight: 600 }}>luxefulfilmentco@gmail.com</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter',system-ui,sans-serif", color: C.text, padding: "40px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Work Sans',system-ui,sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "-.02em" }}>Clearing</div>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 6, marginBottom: 28, lineHeight: 1.5 }}>
          A calm money-in-hand, spending, and debt-clearing tracker — built especially for anyone juggling multiple loans, including payday/app loans, and dealing with recovery calls.
        </div>

        <div style={{ background: C.surface2, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Your email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            type="email"
            style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: "1px solid " + C.line, fontSize: 15, outline: "none", fontFamily: "inherit", color: C.text, background: "#fff" }}
          />
          <div style={{ fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.4 }}>
            You'll pay first, then sign in with this same email afterward to unlock the app — no account needed just to see pricing or pay.
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Pricing</div>
        <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
          <div style={{ background: C.surface, border: "1px solid " + C.line, borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>7-day trial</div>
              <div style={{ fontWeight: 700, fontSize: 20 }}>₹300</div>
            </div>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              One-time payment. Unlocks every feature in the app, in full, for 7 days — nothing is held back or limited during the trial. Can be started once per account.
            </div>
            <button onClick={() => pay("trial")} disabled={!validEmail || !!busy}
              style={{ width: "100%", marginTop: 14, textAlign: "center", background: "#fff", color: C.text, border: "1px solid " + C.line, borderRadius: 8, padding: "11px", fontWeight: 600, fontSize: 14, cursor: validEmail ? "pointer" : "not-allowed", opacity: validEmail ? 1 : 0.55 }}>
              {busy === "trial" ? "Opening payment…" : "Pay ₹300 — start trial"}
            </button>
          </div>
          <div style={{ background: C.surface, border: "1px solid " + C.primary, borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Unlock forever</div>
              <div style={{ fontWeight: 700, fontSize: 20 }}>₹3,000</div>
            </div>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              One-time payment, permanent access, no subscription and no auto-renewal.
            </div>
            <button onClick={() => pay("full")} disabled={!validEmail || !!busy}
              style={{ width: "100%", marginTop: 14, textAlign: "center", background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 600, fontSize: 14, cursor: validEmail ? "pointer" : "not-allowed", opacity: validEmail ? 1 : 0.55 }}>
              {busy === "full" ? "Opening payment…" : "Pay ₹3,000 — unlock forever"}
            </button>
          </div>
        </div>
        {!validEmail && email.length > 0 && (
          <div style={{ fontSize: 12, color: C.coral, marginBottom: 10 }}>Enter a valid email to enable payment.</div>
        )}
        {err && <div style={{ fontSize: 13, color: C.coral, marginBottom: 10 }}>{err}</div>}
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 36 }}>
          Already have an account and want the ₹2,700 post-trial price? <a href="/" style={{ color: C.primary, fontWeight: 600 }}>Sign in</a> and unlock from inside the app instead.
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>What every plan includes</div>
        <div style={{ display: "grid", gap: 12, marginBottom: 36 }}>
          {FEATURES.map(([title, body]) => (
            <div key={title} style={{ background: C.surface2, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{title}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{body}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 36, lineHeight: 1.5 }}>
          There is no difference in features between the trial and the full unlock — the trial is the entire app, time-limited to 7 days. Paying to unlock forever simply removes that time limit, permanently.
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Refunds &amp; cancellations</div>
        <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 36, lineHeight: 1.6 }}>
          Both plans are one-time payments — there is nothing to cancel, since nothing auto-renews. If a payment was deducted but access wasn't unlocked (a failed or stuck transaction), or you were charged in error, contact us within 7 days of the payment and we'll issue a full refund once it's confirmed with Razorpay.
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Contact</div>
        <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 8, lineHeight: 1.6 }}>
          For billing questions, refunds, or anything else: <a href="mailto:luxefulfilmentco@gmail.com" style={{ color: C.primary, fontWeight: 600 }}>luxefulfilmentco@gmail.com</a>
        </div>

        <div style={{ display: "flex", gap: 18, marginTop: 20, flexWrap: "wrap" }}>
          <a href="/" style={{ fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: "none" }}>← Back to sign in</a>
          <a href="/journey" style={{ fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: "none" }}>My story & 1:1 sessions →</a>
        </div>
      </div>
    </div>
  );
}
