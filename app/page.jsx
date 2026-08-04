"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Clearing from "../components/Clearing";

const OWNER_EMAIL = (process.env.NEXT_PUBLIC_OWNER_EMAIL || "").toLowerCase();
const TRIAL_DAYS = 7;

// Zenith Finance palette — mirrors the `C` object in components/Clearing.jsx, kept as a
// separate copy here since this file renders before the main app (sign-in/paywall screens).
const C = {
  bg: "#F9F9FF", surface: "#FFFFFF", surface2: "#E8EDFF", line: "#C3C6D6",
  text: "#041B3C", muted: "#434654", faint: "#737685",
  primary: "#0052CC", teal: "#00875A", coral: "#DE350B",
  inverse: "#1D3052", onInverse: "#EDF0FF",
};

function accessFromProfile(email, prof) {
  const isOwner = !!(email && OWNER_EMAIL && email.toLowerCase() === OWNER_EMAIL);
  if (isOwner) return { hasAccess: true, trialDaysLeft: null, trialExpired: false };
  if (prof && prof.premium_unlocked) return { hasAccess: true, trialDaysLeft: null, trialExpired: false };
  if (prof && prof.trial_started_at) {
    const started = new Date(prof.trial_started_at).getTime();
    const msLeft = started + TRIAL_DAYS * 86400000 - Date.now();
    if (msLeft > 0) return { hasAccess: true, trialDaysLeft: Math.ceil(msLeft / 86400000), trialExpired: false };
    return { hasAccess: false, trialDaysLeft: 0, trialExpired: true };
  }
  return { hasAccess: false, trialDaysLeft: null, trialExpired: false };
}

// Shared by the paywall screen and the trial banner. Returns a click handler that creates a
// server-side order (amount is fixed there, never trusted from here), opens Razorpay's checkout,
// and verifies the payment server-side before calling onSuccess.
function payAndUnlock({ userId, plan, onSuccess, onError }) {
  return async () => {
    try {
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, plan }),
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
        handler: async (response) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...response, userId, plan }),
            });
            const result = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(result.error || "Payment could not be verified.");
            onSuccess();
          } catch (e) { onError(e.message); }
        },
        theme: { color: C.primary },
      });
      rzp.on("payment.failed", (e) => onError((e && e.error && e.error.description) || "Payment failed."));
      rzp.open();
    } catch (e) {
      onError(e.message);
    }
  };
}

function Paywall({ userId, trialExpired, onUnlocked, onTrialStarted, onSignOut }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const tryTrial = payAndUnlock({
    userId, plan: "trial",
    onSuccess: () => { onTrialStarted(); setBusy(""); },
    onError: (m) => { setErr(m); setBusy(""); },
  });
  const fullPlan = trialExpired ? "full_after_trial" : "full";
  const fullPrice = trialExpired ? "₹2,700" : "₹3,000";
  const buyFull = payAndUnlock({
    userId, plan: fullPlan,
    onSuccess: () => { onUnlocked(); setBusy(""); },
    onError: (m) => { setErr(m); setBusy(""); },
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',system-ui,sans-serif", padding: 20, background: C.bg }}>
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 26, width: "100%", maxWidth: 380, boxShadow: "0 6px 20px rgba(4,27,60,.06)" }}>
        <div style={{ fontFamily: "'Work Sans',system-ui,sans-serif", fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: "-.02em" }}>Clearing</div>
        <div style={{ fontSize: 14, color: C.muted, marginTop: 4, marginBottom: 20 }}>
          {trialExpired ? "Your 7-day trial has ended. Your data is safe and waiting — unlock to keep going. The ₹300 you already paid counts toward the ₹3,000, so it's ₹2,700 from here." : "What you can spend, what's due, and what's left to clear."}
        </div>
        {!trialExpired && (
          <button onClick={() => { setBusy("trial"); tryTrial(); }} disabled={!!busy}
            style={{ width: "100%", padding: "12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.text, fontWeight: 600, fontSize: 15, cursor: "pointer", marginBottom: 10, opacity: busy ? 0.6 : 1 }}>
            {busy === "trial" ? "Opening payment…" : "Try 7 days for ₹300"}
          </button>
        )}
        <button onClick={() => { setBusy("full"); buyFull(); }} disabled={!!busy}
          style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: busy ? 0.6 : 1, boxShadow: "0 2px 8px rgba(0,82,204,.28)" }}>
          {busy === "full" ? "Opening payment…" : `Unlock forever — ${fullPrice} one-time`}
        </button>
        {err && <div style={{ color: C.coral, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ fontSize: 12, color: C.faint, marginTop: 16, lineHeight: 1.5 }}>
          One-time payments only, never a subscription. Your data stays saved either way — it just waits for you.
        </div>
        <button onClick={onSignOut} style={{ background: "none", border: "none", color: C.faint, fontSize: 12, marginTop: 14, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function TrialBanner({ daysLeft, userId, onUnlocked }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const buyFull = payAndUnlock({
    userId, plan: "full_after_trial",
    onSuccess: () => { onUnlocked(); setBusy(false); },
    onError: (m) => { setErr(m); setBusy(false); },
  });
  return (
    <div style={{ background: C.inverse, color: C.onInverse, fontFamily: "'Inter',system-ui,sans-serif", fontSize: 13, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", textAlign: "center" }}>
      <span>Trial: {daysLeft} {daysLeft === 1 ? "day" : "days"} left</span>
      <button onClick={() => { setBusy(true); buyFull(); }} disabled={busy}
        style={{ background: "#fff", color: C.primary, border: "none", borderRadius: 8, padding: "4px 10px", fontWeight: 600, fontSize: 12, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
        {busy ? "Opening…" : "Unlock forever — ₹2,700"}
      </button>
      {err && <span style={{ fontSize: 11 }}>{err}</span>}
    </div>
  );
}

export default function Page() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [usePassword, setUsePassword] = useState(false); // password sign-in — only meant for a fixed test account (e.g. for reviewers), everyone else uses the magic link
  const [password, setPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [profile, setProfile] = useState(undefined); // undefined = loading, null/obj once fetched

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("email, premium_unlocked, trial_started_at").eq("id", session.user.id).maybeSingle();
      setProfile(data || {});
    })();
  }, [session]);

  async function signIn() {
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) setErr(error.message); else setSent(true);
  }

  async function signInPassword() {
    setErr("");
    setPwBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setPwBusy(false);
  }

  if (session === undefined) return <div style={{ minHeight: "100vh", background: C.bg }} />;

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',system-ui,sans-serif", padding: 20, background: C.bg }}>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 26, width: "100%", maxWidth: 380, boxShadow: "0 6px 20px rgba(4,27,60,.06)" }}>
          <div style={{ fontFamily: "'Work Sans',system-ui,sans-serif", fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: "-.02em" }}>Clearing</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 4, marginBottom: 20 }}>
            {usePassword ? "Sign in with a test account." : "Sign in with your email. We send a one-tap link, no password."}
          </div>
          {usePassword ? (
            <>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 15, outline: "none", fontFamily: "inherit", color: C.text }} />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password"
                style={{ width: "100%", marginTop: 10, padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 15, outline: "none", fontFamily: "inherit", color: C.text }} />
              <button onClick={signInPassword} disabled={!email || !password || pwBusy}
                style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: email && password ? 1 : 0.5, boxShadow: "0 2px 8px rgba(0,82,204,.28)" }}>
                {pwBusy ? "Signing in…" : "Sign in"}
              </button>
              {err && <div style={{ color: C.coral, fontSize: 13, marginTop: 10 }}>{err}</div>}
              <button onClick={() => { setUsePassword(false); setErr(""); }} style={{ background: "none", border: "none", color: C.faint, fontSize: 12, marginTop: 14, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                Use the magic link instead
              </button>
            </>
          ) : sent ? (
            <div style={{ fontSize: 14, color: C.teal, fontWeight: 600 }}>Check your inbox for the sign-in link.</div>
          ) : (
            <>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 15, outline: "none", fontFamily: "inherit", color: C.text }} />
              <button onClick={signIn} disabled={!email}
                style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: email ? 1 : 0.5, boxShadow: "0 2px 8px rgba(0,82,204,.28)" }}>
                Send me a link
              </button>
              {err && <div style={{ color: C.coral, fontSize: 13, marginTop: 10 }}>{err}</div>}
              <button onClick={() => { setUsePassword(true); setErr(""); }} style={{ background: "none", border: "none", color: C.faint, fontSize: 12, marginTop: 14, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                Have a password instead?
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (profile === undefined) return <div style={{ minHeight: "100vh", background: C.bg }} />;

  const access = accessFromProfile(session.user.email, profile);

  if (!access.hasAccess) {
    return (
      <Paywall
        userId={session.user.id}
        trialExpired={access.trialExpired}
        onUnlocked={() => setProfile((p) => ({ ...p, premium_unlocked: true }))}
        onTrialStarted={() => setProfile((p) => ({ ...p, trial_started_at: new Date().toISOString() }))}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  return (
    <div>
      {access.trialDaysLeft !== null && (
        <TrialBanner daysLeft={access.trialDaysLeft} userId={session.user.id} onUnlocked={() => setProfile((p) => ({ ...p, premium_unlocked: true }))} />
      )}
      <Clearing userId={session.user.id} />
      <button onClick={() => supabase.auth.signOut()}
        style={{ position: "fixed", top: 14, right: 14, zIndex: 30, background: "transparent", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", fontFamily: "'Inter',system-ui,sans-serif" }}>
        Sign out
      </button>
    </div>
  );
}
