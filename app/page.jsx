"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Clearing from "../components/Clearing";

// Clearing is a personal app now: sign in with your email, and only your account gets in.
// Access is granted to NEXT_PUBLIC_OWNER_EMAIL, or to an account already unlocked in `profiles`
// (so the existing owner account keeps working even if that env variable isn't set).
const OWNER_EMAIL = (process.env.NEXT_PUBLIC_OWNER_EMAIL || "").toLowerCase();

const C = {
  bg: "#F5F1EA", surface: "#FFFFFF", line: "#E4DCCF", text: "#1D2B2F", muted: "#5F6B6E", faint: "#8E979A",
  primary: "#1F4D46", teal: "#2E7D5B", coral: "#C4553D",
};
const shell = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',system-ui,sans-serif", padding: 20, background: C.bg };
const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 20, padding: 26, width: "100%", maxWidth: 380 };
const btn = { width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, border: "none", background: C.primary, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" };

export default function Page() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [allowed, setAllowed] = useState(undefined);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setAllowed(undefined); return; }
    const mail = (session.user.email || "").toLowerCase();
    if (OWNER_EMAIL && mail === OWNER_EMAIL) { setAllowed(true); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("premium_unlocked, trial_started_at").eq("id", session.user.id).maybeSingle();
      setAllowed(!!(data && (data.premium_unlocked || data.trial_started_at)));
    })();
  }, [session]);

  async function signIn() {
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setErr(error.message); else setSent(true);
  }

  if (session === undefined || (session && allowed === undefined)) return <div style={{ minHeight: "100vh", background: C.bg }} />;

  if (!session) {
    return (
      <div style={shell}><div style={card}>
        <div style={{ fontFamily: "'Fraunces',Georgia,serif", fontSize: 28, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 10 }}><img src="/logo.svg" alt="" width="34" height="34" style={{ borderRadius: 8 }} />Clearing</div>
        <div style={{ fontSize: 14, color: C.muted, marginTop: 4, marginBottom: 20 }}>Sign in with your email — we'll send a one-tap link.</div>
        {sent ? <div style={{ fontSize: 14, color: C.teal, fontWeight: 600 }}>Check your inbox for the sign-in link.</div> : (
          <>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 15, fontFamily: "inherit", color: C.text, boxSizing: "border-box" }} />
            <button onClick={signIn} disabled={!email} style={{ ...btn, opacity: email ? 1 : 0.5 }}>Send me a link</button>
            {err && <div style={{ color: C.coral, fontSize: 13, marginTop: 10 }}>{err}</div>}
          </>
        )}
      </div></div>
    );
  }

  if (!allowed) {
    return (
      <div style={shell}><div style={card}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>This is a private app</div>
        <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>{session.user.email} doesn't have access.</div>
        <button onClick={() => supabase.auth.signOut()} style={btn}>Sign out</button>
      </div></div>
    );
  }

  return (
    <div>
      <Clearing userId={session.user.id} />
      <button onClick={() => supabase.auth.signOut()}
        style={{ position: "fixed", top: 14, right: 14, zIndex: 30, background: "transparent", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", fontFamily: "'Inter',system-ui,sans-serif" }}>
        Sign out
      </button>
    </div>
  );
}
