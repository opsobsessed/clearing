"use client";
// Public, unauthenticated page — deliberately does NOT check for a session. Its purpose is to let
// anyone (a visitor, or a payment-gateway reviewer) see exactly what Clearing costs and what they
// get for it, without having to sign in first. Linked from the sign-in screen in app/page.jsx.

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

export default function PricingPage() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter',system-ui,sans-serif", color: C.text, padding: "40px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Work Sans',system-ui,sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "-.02em" }}>Clearing</div>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 6, marginBottom: 32, lineHeight: 1.5 }}>
          A calm money-in-hand, spending, and debt-clearing tracker — built especially for anyone juggling multiple loans, including payday/app loans, and dealing with recovery calls.
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Pricing</div>
        <div style={{ display: "grid", gap: 14, marginBottom: 36 }}>
          <div style={{ background: C.surface, border: "1px solid " + C.line, borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>7-day trial</div>
              <div style={{ fontWeight: 700, fontSize: 20 }}>₹300</div>
            </div>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              One-time payment. Unlocks every feature in the app, in full, for 7 days — nothing is held back or limited during the trial. Can be started once per account.
            </div>
            <a href="/" style={{ textDecoration: "none" }}>
              <div style={{ marginTop: 14, textAlign: "center", background: "#fff", color: C.text, border: "1px solid " + C.line, borderRadius: 8, padding: "11px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Sign in to start the trial
              </div>
            </a>
          </div>
          <div style={{ background: C.surface, border: "1px solid " + C.primary, borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Unlock forever</div>
              <div style={{ fontWeight: 700, fontSize: 20 }}>₹3,000</div>
            </div>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              One-time payment, permanent access, no subscription and no auto-renewal. Can be bought directly, or any time during/after the trial — if the ₹300 trial was already paid, unlocking forever only costs ₹2,700 more (₹300 + ₹2,700 = ₹3,000 total, never ₹3,300).
            </div>
            <a href="/" style={{ textDecoration: "none" }}>
              <div style={{ marginTop: 14, textAlign: "center", background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Sign in to unlock forever
              </div>
            </a>
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 36, marginTop: -22 }}>
          Both buttons take you to sign-in first — payment happens on the next screen, once you're signed in, since it's tied to your account.
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

        <a href="/" style={{ display: "inline-block", marginTop: 20, fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: "none" }}>← Back to sign in</a>
      </div>
    </div>
  );
}
