"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Clearing from "../components/Clearing";

export default function Page() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) setErr(error.message); else setSent(true);
  }

  if (session === undefined) return <div style={{ minHeight: "100vh", background: "#EDF2F3" }} />;

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 20 }}>
        <div style={{ background: "#FBFDFD", border: "1px solid #D9E4E5", borderRadius: 18, padding: 26, width: "100%", maxWidth: 380, boxShadow: "0 6px 20px rgba(40,56,61,.06)" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#28383D", letterSpacing: "-.02em" }}>Clearing</div>
          <div style={{ fontSize: 14, color: "#5E747A", marginTop: 4, marginBottom: 20 }}>Sign in with your email. We send a one-tap link, no password.</div>
          {sent ? (
            <div style={{ fontSize: 14, color: "#3F9C94", fontWeight: 600 }}>Check your inbox for the sign-in link.</div>
          ) : (
            <>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 11, border: "1px solid #D9E4E5", fontSize: 15, outline: "none" }} />
              <button onClick={signIn} disabled={!email}
                style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, border: "none", background: "#3F9C94", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: email ? 1 : 0.5 }}>
                Send me a link
              </button>
              {err && <div style={{ color: "#CC8078", fontSize: 13, marginTop: 10 }}>{err}</div>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Clearing userId={session.user.id} />
      <button onClick={() => supabase.auth.signOut()}
        style={{ position: "fixed", top: 14, right: 14, zIndex: 30, background: "transparent", border: "1px solid #D9E4E5", color: "#5E747A", borderRadius: 10, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
        Sign out
      </button>
    </div>
  );
}
