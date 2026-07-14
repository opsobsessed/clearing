"use client";
import { supabase } from "../lib/supabaseClient";
import { useState, useEffect, useMemo } from "react";
import {
  Wallet, Landmark, PiggyBank, Users, Plus, Bell, BellRing, Trash2,
  ArrowRightLeft, X, Zap, ShieldCheck, Heart, Check, Download, Upload
} from "lucide-react";

/* Clearing — money in hand, where it goes, what's due next,
   and paying back friends, family, and loans. Persists to Supabase (user_state.data jsonb) per signed-in user. */

const C = {
  bg: "#EDF2F3", surface: "#FBFDFD", surface2: "#E2EDEF", line: "#D9E4E5",
  text: "#28383D", muted: "#5E747A", faint: "#95A6AB",
  teal: "#3F9C94", amber: "#5E90AE", coral: "#CC8078", violet: "#7E8AC8",
};
const PURPOSE = {
  income: { label: "Income", color: C.teal }, living: { label: "Living", color: C.amber }, debt: { label: "Debt", color: C.violet },
};
const OTYPE = {
  regulated: { label: "Regulated loan", short: "Regulated", color: C.teal, icon: ShieldCheck },
  payday: { label: "Payday / app loan", short: "Payday", color: C.coral, icon: Zap },
  family: { label: "Family & friends", short: "Family", color: C.violet, icon: Heart },
};
const EXP_CATS = ["Rent", "Food", "Groceries", "Transport", "Utilities", "Phone", "Medical", "Other"];
const REMIND_DAYS = 10;
const inr = (n) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const SEED_ACCOUNTS = [
  { name: "Kotak 811", purpose: "income" }, { name: "Spending", purpose: "living" }, { name: "Cash", purpose: "living" },
];
const SEED_OBLIG = [
  ...["HDFC Credit Card", "Axis Finance", "Muthoot Finance"].map(n => ({ name: n, type: "regulated" })),
  ...["Sheena Theresa John:650000", "Priyadarshini J:100000", "Binoy Kattipeedikayi:50000", "Elgin Thomas:50000",
    "Zeba Khan:50000", "Annamma Joseph:34010", "Saji Mathew:30000", "Shruti Kohli:30000", "Philip Thomas:10183",
    "Rupa H Singh:10000", "Amirul Islam:1729"].map(s => ({ name: s.split(":")[0], type: "family", outstanding: +s.split(":")[1] })),
  ...["mPokket", "LendenClub", "Taplend", "Pocketly", "KrazyBee", "FincFriends", "Sayyam (PayRupik)", "Tradofina",
    "Konark Commercial", "Ampire Finance", "Naman Finlease"].map(n => ({ name: n, type: "payday" })),
];

function daysUntil(day) {
  if (!day) return null;
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  let d = new Date(y, m, day);
  if (d < new Date(y, m, now.getDate())) d = new Date(y, m + 1, day);
  return Math.round((d - new Date(y, m, now.getDate())) / 86400000);
}

export default function Clearing({ userId }) {
  const [tab, setTab] = useState("home");
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [oblig, setOblig] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [celebrate, setCelebrate] = useState(null);
  const [settings, setSettings] = useState({ buffer: 0, budget: 0 });
  const [notif, setNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  useEffect(() => { (async () => {
    try {
      const { data } = await supabase.from("user_state").select("data").eq("user_id", userId).maybeSingle();
      const d = (data && data.data) || {};
      setAccounts(d.accounts || []); setOblig(d.oblig || []); setExpenses(d.expenses || []);
      setPayments(d.payments || []); setSettings(d.settings || { buffer: 0, budget: 0 });
    } catch (e) { /* first run: no row yet */ }
    setReady(true);
  })(); }, [userId]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      supabase.from("user_state").upsert({ user_id: userId, data: { accounts, oblig, expenses, payments, settings }, updated_at: new Date().toISOString() }).then(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [accounts, oblig, expenses, payments, settings, ready, userId]);
  useEffect(() => { if (!celebrate) return; const t = setTimeout(() => setCelebrate(null), 4000); return () => clearTimeout(t); }, [celebrate]);

  useEffect(() => {
    if (!ready || notif !== "granted") return;
    (async () => {
      const today = new Date().toDateString();
      if (localStorage.getItem("clr2:lastNotify") === today) return;
      const soon = oblig.filter(o => o.status !== "closed" && daysUntil(o.dueDay) !== null && daysUntil(o.dueDay) <= REMIND_DAYS && +o.monthly > 0);
      soon.forEach(o => { const n = daysUntil(o.dueDay); try { new Notification("Due " + (n === 0 ? "today" : "in " + n + "d") + " · " + o.name, { body: inr(o.monthly) }); } catch {} });
      if (soon.length) localStorage.setItem("clr2:lastNotify", today);
    })();
  }, [ready, notif, oblig]);

  const moneyInHand = accounts.reduce((s, a) => s + (+a.balance || 0), 0);
  const openOblig = oblig.filter(o => o.status !== "closed");
  const dueSoon = openOblig.map(o => ({ ...o, in: daysUntil(o.dueDay) })).filter(o => o.in !== null && o.in <= REMIND_DAYS && +o.monthly > 0).sort((a, b) => a.in - b.in);
  const setAside = dueSoon.reduce((s, o) => s + (+o.monthly || 0), 0);
  const safeToSpend = moneyInHand - setAside - (+settings.buffer || 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthExp = expenses.filter(e => e.date.slice(0, 7) === monthKey);
  const monthSpend = monthExp.reduce((s, e) => s + (+e.amount || 0), 0);

  async function askNotif() { if (typeof Notification !== "undefined") setNotif(await Notification.requestPermission()); }

  function exportData() {
    const data = { app: "clearing", v: 1, savedAt: new Date().toISOString(), accounts, oblig, expenses, payments, settings };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "clearing-backup.json"; a.click(); URL.revokeObjectURL(url);
    setCelebrate("Backup saved. Keep it somewhere safe.");
  }
  function importData(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d.accounts) setAccounts(d.accounts);
        if (d.oblig) setOblig(d.oblig);
        if (d.expenses) setExpenses(d.expenses);
        if (d.payments) setPayments(d.payments);
        if (d.settings) setSettings(d.settings);
        setCelebrate("Backup restored. Everything's back.");
      } catch { setCelebrate("Couldn't read that file, sorry."); }
    };
    r.readAsText(f); e.target.value = "";
  }

  const S = `
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    .clr{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:${C.text};background:${C.bg};min-height:100vh;max-width:520px;margin:0 auto;padding:20px 16px 100px}
    .num{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
    .card{background:${C.surface};border:1px solid ${C.line};border-radius:18px;padding:18px;box-shadow:0 1px 2px rgba(40,56,61,.03),0 6px 20px rgba(40,56,61,.05)}
    .row{display:flex;align-items:center}
    .btn{border:none;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;border-radius:12px;padding:11px 14px;color:#fff;background:${C.teal};display:inline-flex;align-items:center;gap:7px;box-shadow:0 2px 8px rgba(63,156,148,.28)}
    .btn.ghost{background:#fff;color:${C.text};border:1px solid ${C.line};box-shadow:none}
    .btn:active{transform:translateY(1px)}
    .chip{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
    .in{width:100%;background:#fff;border:1px solid ${C.line};color:${C.text};border-radius:11px;padding:10px 12px;font-size:15px;font-family:inherit;outline:none}
    .in:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(63,156,148,.14)}
    .lbl{font-size:12px;color:${C.muted};margin-bottom:5px;display:block}
    .tabbar{position:fixed;bottom:0;left:0;right:0;background:${C.surface};border-top:1px solid ${C.line};display:flex;max-width:520px;margin:0 auto;box-shadow:0 -4px 20px rgba(40,56,61,.05)}
    .tabbar button{flex:1;background:none;border:none;color:${C.faint};padding:11px 0 15px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;font-family:inherit}
    .tabbar button.on{color:${C.teal}}
    .li{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid ${C.line}}
    .li:last-child{border-bottom:none}
    .ib{background:none;border:none;color:${C.faint};cursor:pointer;padding:6px;border-radius:8px}
    .ib:hover{color:${C.text};background:${C.surface2}}
    .bar{height:10px;border-radius:99px;background:${C.line};overflow:hidden}
    .fill{height:100%;border-radius:99px}
    .foot{font-size:11.5px;color:${C.faint};line-height:1.5}
    .toast{position:fixed;left:16px;right:16px;bottom:84px;max-width:488px;margin:0 auto;background:${C.teal};color:#fff;border-radius:14px;padding:14px 16px;font-weight:600;display:flex;align-items:center;gap:10px;box-shadow:0 8px 30px rgba(63,156,148,.4);z-index:20}
    @media (prefers-reduced-motion: no-preference){
      .fill{transition:width .7s cubic-bezier(.22,1,.36,1)}
      .card,.btn{transition:box-shadow .15s ease,transform .1s ease}
      .toast{animation:pop .35s cubic-bezier(.22,1.4,.36,1)}
      @keyframes pop{from{transform:translateY(16px) scale(.96);opacity:0}to{transform:none;opacity:1}}
    }
  `;
  if (!ready) return <div style={{ background: C.bg, minHeight: "100vh" }} />;

  return (
    <div className="clr">
      <style>{S}</style>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em" }}>Clearing</div>
          <div style={{ fontSize: 13, color: C.muted }}>What you can spend, what's due, what's left to clear.</div></div>
        <button className="ib" onClick={askNotif} style={{ color: notif === "granted" ? C.teal : C.faint }}>
          {notif === "granted" ? <BellRing size={22} /> : <Bell size={22} />}</button>
      </div>

      {tab === "home" && <Home {...{ moneyInHand, setAside, safeToSpend, settings, setSettings, dueSoon, monthSpend }} />}
      {tab === "home" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Your data</div>
          <div className="foot">Saved automatically as you go. Keep a backup so a cleared browser or a new phone can never wipe your progress.</div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn ghost" onClick={exportData} style={{ flex: 1 }}><Download size={16} /> Back up</button>
            <label className="btn ghost" style={{ flex: 1, cursor: "pointer", justifyContent: "center" }}>
              <Upload size={16} /> Restore
              <input type="file" accept="application/json" onChange={importData} style={{ display: "none" }} />
            </label>
          </div>
        </div>
      )}
      {tab === "accounts" && <Accounts {...{ accounts, setAccounts, moneyInHand, setExpenses }} />}
      {tab === "spending" && <Spending {...{ expenses, setExpenses, accounts, setAccounts, settings, setSettings, monthExp, monthSpend }} />}
      {tab === "clear" && <Clear {...{ oblig, setOblig, accounts, setAccounts, payments, setPayments, onCelebrate: setCelebrate }} />}

      {celebrate && (
        <div className="toast"><Heart size={18} fill="#fff" /><span>{celebrate}</span></div>
      )}

      <div className="tabbar">
        {[["home", "Home", Wallet], ["accounts", "Accounts", Landmark], ["spending", "Spending", PiggyBank], ["clear", "Clear", Users]]
          .map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>
          ))}
      </div>
    </div>
  );
}

function Home({ moneyInHand, setAside, safeToSpend, settings, setSettings, dueSoon, monthSpend }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ background: C.surface2 }}>
        <div className="lbl">Safe to spend right now</div>
        <div className="num" style={{ fontSize: 42, fontWeight: 700, color: safeToSpend >= 0 ? C.teal : C.coral, lineHeight: 1.1 }}>
          {safeToSpend >= 0 ? inr(safeToSpend) : "−" + inr(Math.abs(safeToSpend))}
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 13 }}>
          <Line l="Money in hand" v={inr(moneyInHand)} c={C.text} />
          <Line l={"Due within " + REMIND_DAYS + " days"} v={"− " + inr(setAside)} c={C.amber} />
          <Line l="Buffer you keep aside" v={"− " + inr(settings.buffer)} c={C.muted} />
        </div>
        <div style={{ marginTop: 12 }}>
          <span className="lbl">Buffer to protect</span>
          <input className="in num" type="number" inputMode="numeric" value={settings.buffer || ""} placeholder="0"
            onChange={e => setSettings(s => ({ ...s, buffer: +e.target.value }))} />
        </div>
      </div>

      <div className="card">
        <div className="lbl" style={{ marginBottom: 10 }}>Due in the next {REMIND_DAYS} days</div>
        {dueSoon.length === 0 ? <Empty>Nothing due in the next {REMIND_DAYS} days. Set due days on the Clear tab.</Empty> :
          dueSoon.map(o => (
            <div key={o.id} className="li">
              <div><div style={{ fontWeight: 500, fontSize: 14 }}>{o.name}</div>
                <div style={{ fontSize: 12, color: OTYPE[o.type].color }}>{OTYPE[o.type].short}</div></div>
              <div className="row" style={{ gap: 10 }}>
                <span className="num" style={{ fontWeight: 600 }}>{inr(o.monthly)}</span>
                <span className="chip" style={{ background: o.in <= 3 ? C.coral : C.amber, color: C.bg, width: 60, textAlign: "center" }}>
                  {o.in === 0 ? "today" : o.in + "d"}</span>
              </div>
            </div>
          ))}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="lbl" style={{ margin: 0 }}>Spent this month</div>
          <span className="num" style={{ fontWeight: 700, fontSize: 18, color: settings.budget && monthSpend > settings.budget ? C.coral : C.text }}>{inr(monthSpend)}</span>
        </div>
        {settings.budget > 0 && (
          <>
            <div className="bar" style={{ marginTop: 10 }}>
              <div className="fill" style={{ width: Math.min(100, (monthSpend / settings.budget) * 100) + "%", background: monthSpend > settings.budget ? C.coral : C.teal }} />
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>of {inr(settings.budget)} living budget</div>
          </>
        )}
      </div>
    </div>
  );
}
function Line({ l, v, c }) { return <div className="row" style={{ justifyContent: "space-between" }}><span style={{ color: C.muted }}>{l}</span><span className="num" style={{ color: c }}>{v}</span></div>; }

function Accounts({ accounts, setAccounts, moneyInHand, setExpenses }) {
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [income, setIncome] = useState(false);
  const [reconc, setReconc] = useState(null);
  const seed = () => setAccounts(SEED_ACCOUNTS.map(a => ({ ...a, id: crypto.randomUUID(), balance: 0 })));
  const addIncome = (id, amt) => { setAccounts(x => x.map(a => a.id === id ? { ...a, balance: (+a.balance || 0) + amt } : a)); setIncome(false); };
  function reconcile(id, actual) {
    const acc = accounts.find(a => a.id === id); const diff = (+acc.balance || 0) - actual;
    if (diff > 0) setExpenses(x => [...x, { id: crypto.randomUUID(), amount: diff, cat: "Other", date: new Date().toISOString().slice(0, 10), accountId: id, note: "cash correction" }]);
    setAccounts(x => x.map(a => a.id === id ? { ...a, balance: actual } : a)); setReconc(null);
  }
  const add = (a) => { setAccounts(x => [...x, { ...a, id: crypto.randomUUID() }]); setAdding(false); };
  const upd = (id, p) => setAccounts(x => x.map(a => a.id === id ? { ...a, ...p } : a));
  const rm = (id) => setAccounts(x => x.filter(a => a.id !== id));
  const move = (from, to, amt) => { setAccounts(x => x.map(a => a.id === from ? { ...a, balance: (+a.balance || 0) - amt } : a.id === to ? { ...a, balance: (+a.balance || 0) + amt } : a)); setMoving(false); };
  const byPurpose = Object.keys(PURPOSE).map(p => ({ p, total: accounts.filter(a => a.purpose === p).reduce((s, a) => s + (+a.balance || 0), 0) }));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {accounts.length === 0 && (
        <div className="card"><div style={{ fontWeight: 600, marginBottom: 6 }}>Set up your accounts</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Add the accounts you actually hold money in. The idea: salary lands in Income, you move living costs to a Spending account, and pay debts from a third. Keeping them separate is how you stay in control.</div>
          <button className="btn" onClick={seed}>Add starter accounts</button></div>
      )}
      <div className="card" style={{ background: C.surface2 }}>
        <div className="lbl">Money in hand (all accounts)</div>
        <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{inr(moneyInHand)}</div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          {byPurpose.map(({ p, total }) => (
            <div key={p} style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: PURPOSE[p].color, fontWeight: 700, textTransform: "uppercase" }}>{PURPOSE[p].label}</div>
              <div className="num" style={{ fontSize: 15 }}>{inr(total)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={() => setIncome(true)} style={{ flex: 1 }}><Plus size={16} /> Add income</button>
        {accounts.length >= 2 && <button className="btn ghost" onClick={() => setMoving(true)} style={{ flex: 1 }}><ArrowRightLeft size={16} /> Move money</button>}
        <button className="btn ghost" onClick={() => setAdding(true)} style={{ flex: 1 }}><Plus size={16} /> Account</button>
      </div>
      {income && <IncomeForm accounts={accounts} onAdd={addIncome} onCancel={() => setIncome(false)} />}
      {moving && <MoveForm accounts={accounts} onMove={move} onCancel={() => setMoving(false)} />}
      {adding && <AccountForm onSave={add} onCancel={() => setAdding(false)} />}
      {accounts.map(a => (
        <div className="card" key={a.id}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{a.name}</div>
            <div className="row" style={{ gap: 4 }}>
              <button className="chip" onClick={() => setReconc(a.id)} style={{ background: "transparent", color: C.muted, border: "1px solid " + C.line, cursor: "pointer" }}>correct to actual</button>
              <button className="ib" onClick={() => rm(a.id)}><Trash2 size={15} /></button>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="in num" type="number" value={a.balance || ""} placeholder="balance" onChange={e => upd(a.id, { balance: +e.target.value })} style={{ flex: 1 }} />
            {Object.keys(PURPOSE).map(p => (
              <button key={p} className="btn ghost" onClick={() => upd(a.id, { purpose: p })}
                style={{ padding: "8px 10px", fontSize: 12, borderColor: a.purpose === p ? PURPOSE[p].color : C.line, color: a.purpose === p ? PURPOSE[p].color : C.muted }}>{PURPOSE[p].label}</button>
            ))}
          </div>
          {reconc === a.id && <ReconcileForm current={+a.balance || 0} onSave={(actual) => reconcile(a.id, actual)} onCancel={() => setReconc(null)} />}
        </div>
      ))}
      <div className="foot" style={{ marginTop: 2 }}>Cash leaks when you forget to log it. Once in a while, count what's really in your wallet and hit "correct to actual" — the difference is booked as spending so your numbers stay honest. Record an ATM withdrawal with "Move money" (bank to cash), not as an expense.</div>
    </div>
  );
}
function IncomeForm({ accounts, onAdd, onCancel }) {
  const [acc, setAcc] = useState(accounts.find(a => a.purpose === "income")?.id || accounts[0]?.id);
  const [amt, setAmt] = useState("");
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><div style={{ fontWeight: 600 }}>Add income</div><button className="ib" onClick={onCancel}><X size={18} /></button></div>
      <select className="in" value={acc} onChange={e => setAcc(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {inr(a.balance)}</option>)}</select>
      <input className="in num" type="number" placeholder="Amount received (salary, etc.)" value={amt} onChange={e => setAmt(e.target.value)} autoFocus />
      <button className="btn" disabled={!amt || !acc} onClick={() => onAdd(acc, +amt)} style={{ opacity: (amt && acc) ? 1 : 0.5 }}>Add to account</button>
    </div>
  );
}
function ReconcileForm({ current, onSave, onCancel }) {
  const [actual, setActual] = useState("");
  const diff = actual === "" ? 0 : current - +actual;
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 8, background: C.surface2, padding: 12, borderRadius: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <input className="in num" type="number" placeholder={"Actual amount (app shows " + inr(current) + ")"} value={actual} onChange={e => setActual(e.target.value)} style={{ flex: 1 }} autoFocus />
        <button className="ib" onClick={onCancel}><X size={16} /></button>
      </div>
      {actual !== "" && diff > 0 && <div className="foot" style={{ color: C.amber }}>{inr(diff)} less than recorded — booked as spending.</div>}
      {actual !== "" && diff < 0 && <div className="foot" style={{ color: C.teal }}>{inr(-diff)} more than recorded — balance corrected up.</div>}
      <button className="btn" disabled={actual === ""} onClick={() => onSave(+actual)} style={{ opacity: actual === "" ? 0.5 : 1 }}><Check size={16} /> Set to actual</button>
    </div>
  );
}
function AccountForm({ onSave, onCancel }) {
  const [f, setF] = useState({ name: "", balance: 0, purpose: "living" });
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><div style={{ fontWeight: 600 }}>New account</div><button className="ib" onClick={onCancel}><X size={18} /></button></div>
      <input className="in" placeholder="Account name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <div className="row" style={{ gap: 8 }}>
        <input className="in num" type="number" placeholder="Balance" value={f.balance || ""} onChange={e => setF({ ...f, balance: +e.target.value })} style={{ flex: 1 }} />
      </div>
      <div className="row" style={{ gap: 6 }}>{Object.keys(PURPOSE).map(p => (
        <button key={p} className="btn ghost" onClick={() => setF({ ...f, purpose: p })} style={{ flex: 1, padding: "8px 6px", fontSize: 12, borderColor: f.purpose === p ? PURPOSE[p].color : C.line, color: f.purpose === p ? PURPOSE[p].color : C.muted }}>{PURPOSE[p].label}</button>
      ))}</div>
      <button className="btn" disabled={!f.name} onClick={() => onSave(f)} style={{ opacity: f.name ? 1 : 0.5 }}>Save</button>
    </div>
  );
}
function MoveForm({ accounts, onMove, onCancel }) {
  const [from, setFrom] = useState(accounts[0]?.id);
  const [to, setTo] = useState(accounts[1]?.id);
  const [amt, setAmt] = useState("");
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><div style={{ fontWeight: 600 }}>Move money</div><button className="ib" onClick={onCancel}><X size={18} /></button></div>
      <div className="row" style={{ gap: 8 }}>
        <select className="in" value={from} onChange={e => setFrom(e.target.value)} style={{ flex: 1 }}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <ArrowRightLeft size={18} color={C.muted} />
        <select className="in" value={to} onChange={e => setTo(e.target.value)} style={{ flex: 1 }}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>
      <input className="in num" type="number" placeholder="Amount" value={amt} onChange={e => setAmt(e.target.value)} />
      <button className="btn" disabled={!amt || from === to} onClick={() => onMove(from, to, +amt)} style={{ opacity: (!amt || from === to) ? 0.5 : 1 }}>Move</button>
    </div>
  );
}

function Spending({ expenses, setExpenses, accounts, setAccounts, settings, setSettings, monthExp, monthSpend }) {
  const [f, setF] = useState({ amount: "", cat: "Food", date: new Date().toISOString().slice(0, 10), accountId: "" });
  const list = [...monthExp].sort((a, b) => b.date.localeCompare(a.date));
  const over = settings.budget > 0 && monthSpend > settings.budget;
  const byCat = EXP_CATS.map(c => ({ c, total: monthExp.filter(e => e.cat === c).reduce((s, e) => s + (+e.amount || 0), 0) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const maxCat = byCat[0]?.total || 1;
  function add() {
    if (!f.amount) return;
    setExpenses(x => [...x, { ...f, amount: +f.amount, id: crypto.randomUUID() }]);
    if (f.accountId) setAccounts(x => x.map(a => a.id === f.accountId ? { ...a, balance: (+a.balance || 0) - +f.amount } : a));
    setF({ ...f, amount: "" });
  }
  const rm = (id) => setExpenses(x => x.filter(e => e.id !== id));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ background: C.surface2 }}>
        <div className="lbl">Spent this month</div>
        <div className="num" style={{ fontSize: 34, fontWeight: 700, color: over ? C.coral : C.text }}>{inr(monthSpend)}</div>
        <div className="row" style={{ gap: 8, alignItems: "flex-end", marginTop: 10 }}>
          <div style={{ flex: 1 }}><span className="lbl">Monthly living budget</span>
            <input className="in num" type="number" value={settings.budget || ""} placeholder="0" onChange={e => setSettings(s => ({ ...s, budget: +e.target.value }))} /></div>
          {settings.budget > 0 && <div className="num" style={{ color: over ? C.coral : C.teal, fontSize: 14, paddingBottom: 10 }}>{over ? "−" + inr(monthSpend - settings.budget) : inr(settings.budget - monthSpend) + " left"}</div>}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <input className="in num" type="number" inputMode="numeric" placeholder="Amount" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} style={{ flex: 1 }} />
          <input className="in" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} style={{ width: 138 }} />
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {EXP_CATS.map(c => (<button key={c} className="btn ghost" onClick={() => setF({ ...f, cat: c })} style={{ padding: "6px 10px", fontSize: 12, borderColor: f.cat === c ? C.teal : C.line, color: f.cat === c ? C.teal : C.muted }}>{c}</button>))}
        </div>
        {accounts.length > 0 && (
          <select className="in" value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}>
            <option value="">Pay from… (optional, updates balance)</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {inr(a.balance)}</option>)}
          </select>
        )}
        <button className="btn" onClick={add} style={{ opacity: f.amount ? 1 : 0.5 }}><Plus size={16} /> Log expense</button>
      </div>

      {byCat.length > 0 && (
        <div className="card">
          <div className="lbl" style={{ marginBottom: 10 }}>Where it went this month</div>
          {byCat.map(({ c, total }) => (
            <div key={c} style={{ marginBottom: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>{c}</span><span className="num" style={{ fontSize: 13, color: C.muted }}>{inr(total)}</span></div>
              <div className="bar"><div className="fill" style={{ width: (total / maxCat) * 100 + "%", background: C.teal }} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {list.length === 0 ? <Empty>No spending logged this month yet.</Empty> :
          list.map(e => (<div key={e.id} className="li">
            <div><div style={{ fontSize: 14 }}>{e.cat}</div><div style={{ fontSize: 12, color: C.faint }}>{e.date}</div></div>
            <div className="row" style={{ gap: 8 }}><span className="num" style={{ fontWeight: 600 }}>{inr(e.amount)}</span>
              <button className="ib" onClick={() => rm(e.id)}><Trash2 size={15} /></button></div></div>))}
      </div>
    </div>
  );
}

function Clear({ oblig, setOblig, accounts, setAccounts, payments, setPayments, onCelebrate }) {
  const [adding, setAdding] = useState(false);
  const [payFor, setPayFor] = useState(null);
  function seed() {
    setOblig(SEED_OBLIG.map(o => ({ id: crypto.randomUUID(), name: o.name, type: o.type, outstanding: o.outstanding || 0, paid: 0, monthly: 0, dueDay: "", status: "open" })));
  }
  const add = (o) => { setOblig(x => [...x, { ...o, id: crypto.randomUUID(), paid: 0, status: "open" }]); setAdding(false); };
  const upd = (id, p) => setOblig(x => x.map(o => o.id === id ? { ...o, ...p } : o));
  const rm = (id) => setOblig(x => x.filter(o => o.id !== id));
  function pay(id, amt, accountId) {
    const o = oblig.find(x => x.id === id);
    const closes = o && (+o.outstanding || 0) - amt <= 0;
    setOblig(x => x.map(o => {
      if (o.id !== id) return o;
      const outstanding = Math.max(0, (+o.outstanding || 0) - amt);
      return { ...o, outstanding, paid: (+o.paid || 0) + amt, status: outstanding === 0 ? "closed" : o.status };
    }));
    setPayments(x => [...x, { id: crypto.randomUUID(), obligId: id, amount: amt, date: new Date().toISOString().slice(0, 10) }]);
    if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) - amt } : a));
    onCelebrate(closes ? `Cleared ${o.name} in full. One less to carry.` : `Paid ${inr(amt)} off ${o.name}.`);
    setPayFor(null);
  }
  const groups = Object.keys(OTYPE).map(t => ({ t, items: oblig.filter(o => o.type === t) }));
  const owed = t => oblig.filter(o => o.type === t && o.status !== "closed").reduce((s, o) => s + (+o.outstanding || 0), 0);
  const totalOwed = owed("regulated") + owed("payday") + owed("family");
  const clearedAll = (payments || []).reduce((s, p) => s + (+p.amount || 0), 0);
  const grandTotal = totalOwed + clearedAll;
  const pctCleared = grandTotal > 0 ? (clearedAll / grandTotal) * 100 : 0;
  const closedCount = oblig.filter(o => o.status === "closed").length;
  const monthKey = new Date().toISOString().slice(0, 7);
  const clearedThisMonth = (payments || []).filter(p => p.date.slice(0, 7) === monthKey).reduce((s, p) => s + (+p.amount || 0), 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {oblig.length === 0 && (
        <div className="card"><div style={{ fontWeight: 600, marginBottom: 6 }}>What you're clearing</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Loans and the money owed to friends and family, in one place. Load the starter list from your statement, set what's outstanding, and log each payment to watch it shrink.</div>
          <button className="btn" onClick={seed}>Load from statement</button></div>
      )}
      <div className="card" style={{ background: C.surface2 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="lbl" style={{ margin: 0 }}>Cleared so far</div>
          <div className="num" style={{ fontWeight: 700, color: C.teal }}>{Math.round(pctCleared)}%</div>
        </div>
        <div className="bar" style={{ marginTop: 8, height: 14 }}>
          <div className="fill" style={{ width: pctCleared + "%", background: "linear-gradient(90deg," + C.teal + "," + C.violet + ")" }} />
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 10, fontSize: 13 }}>
          <span style={{ color: C.muted }}><b className="num" style={{ color: C.teal }}>{inr(clearedAll)}</b> cleared</span>
          <span style={{ color: C.muted }}><b className="num" style={{ color: C.text }}>{inr(totalOwed)}</b> to go</span>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <Stat n={closedCount} l={closedCount === 1 ? "debt gone" : "debts gone"} />
          <Stat n={inr(clearedThisMonth)} l="cleared this month" />
        </div>
      </div>
      <button className="btn ghost" onClick={() => setAdding(true)}><Plus size={16} /> Add something to clear</button>
      {adding && <ObligForm onSave={add} onCancel={() => setAdding(false)} />}

      {groups.map(({ t, items }) => items.length > 0 && (
        <div className="card" key={t}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            {(() => { const I = OTYPE[t].icon; return <I size={16} color={OTYPE[t].color} />; })()}
            <span style={{ fontSize: 12, fontWeight: 700, color: OTYPE[t].color, textTransform: "uppercase", letterSpacing: ".03em" }}>{OTYPE[t].label}</span>
          </div>
          {items.map(o => {
            const total = (+o.outstanding || 0) + (+o.paid || 0);
            const pct = total > 0 ? (o.paid / total) * 100 : (o.status === "closed" ? 100 : 0);
            return (
              <div key={o.id} style={{ padding: "11px 0", borderBottom: "1px solid " + C.line, opacity: o.status === "closed" ? 0.6 : 1 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                    {o.status === "closed" && <Check size={15} color={C.teal} />}{o.name}
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    {o.status === "closed"
                      ? <span className="chip" style={{ background: C.teal, color: "#fff" }}>cleared</span>
                      : <span className="num" style={{ fontWeight: 600 }}>{inr(o.outstanding)}</span>}
                    {o.status !== "closed" && <button className="chip" onClick={() => setPayFor(o.id)} style={{ background: C.teal, color: "#fff", cursor: "pointer" }}>pay</button>}
                    <button className="ib" onClick={() => rm(o.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                {pct > 0 && <div className="bar" style={{ marginTop: 8 }}><div className="fill" style={{ width: pct + "%", background: OTYPE[t].color }} /></div>}
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" placeholder="outstanding" value={o.outstanding || ""} onChange={e => upd(o.id, { outstanding: +e.target.value })} />
                  <input className="in num" style={{ padding: "5px 8px", fontSize: 12, width: 90 }} type="number" placeholder="monthly" value={o.monthly || ""} onChange={e => upd(o.id, { monthly: +e.target.value })} />
                  <input className="in num" style={{ padding: "5px 8px", fontSize: 12, width: 58 }} type="number" min="1" max="31" placeholder="due" value={o.dueDay || ""} onChange={e => upd(o.id, { dueDay: +e.target.value })} />
                </div>
                {payFor === o.id && <PayForm accounts={accounts} onPay={(amt, acc) => pay(o.id, amt, acc)} onCancel={() => setPayFor(null)} />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="foot">Row fields: outstanding · monthly amount · due day. "Monthly" and "due day" drive the week-ahead reminder on Home. Log a payment and it comes off the balance (and the account, if you pick one).</div>
    </div>
  );
}
function ObligForm({ onSave, onCancel }) {
  const [f, setF] = useState({ name: "", type: "family", outstanding: 0, monthly: 0, dueDay: "" });
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><div style={{ fontWeight: 600 }}>Add to clear</div><button className="ib" onClick={onCancel}><X size={18} /></button></div>
      <input className="in" placeholder="Name (lender or person)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <div className="row" style={{ gap: 6 }}>{Object.keys(OTYPE).map(t => (
        <button key={t} className="btn ghost" onClick={() => setF({ ...f, type: t })} style={{ flex: 1, padding: "8px 6px", fontSize: 12, borderColor: f.type === t ? OTYPE[t].color : C.line, color: f.type === t ? OTYPE[t].color : C.muted }}>{OTYPE[t].short}</button>
      ))}</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="in num" type="number" placeholder="Outstanding" value={f.outstanding || ""} onChange={e => setF({ ...f, outstanding: +e.target.value })} style={{ flex: 1 }} />
        <input className="in num" type="number" placeholder="Monthly" value={f.monthly || ""} onChange={e => setF({ ...f, monthly: +e.target.value })} style={{ width: 90 }} />
        <input className="in num" type="number" min="1" max="31" placeholder="Due" value={f.dueDay || ""} onChange={e => setF({ ...f, dueDay: +e.target.value })} style={{ width: 58 }} />
      </div>
      <button className="btn" disabled={!f.name} onClick={() => onSave(f)} style={{ opacity: f.name ? 1 : 0.5 }}>Save</button>
    </div>
  );
}
function PayForm({ accounts, onPay, onCancel }) {
  const [amt, setAmt] = useState(""); const [acc, setAcc] = useState("");
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 8, background: C.surface2, padding: 12, borderRadius: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <input className="in num" type="number" placeholder="Amount paid" value={amt} onChange={e => setAmt(e.target.value)} style={{ flex: 1 }} autoFocus />
        <button className="ib" onClick={onCancel}><X size={16} /></button>
      </div>
      {accounts.length > 0 && (
        <select className="in" value={acc} onChange={e => setAcc(e.target.value)}>
          <option value="">From account… (optional)</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {inr(a.balance)}</option>)}
        </select>
      )}
      <button className="btn" disabled={!amt} onClick={() => onPay(+amt, acc)} style={{ opacity: amt ? 1 : 0.5 }}><Check size={16} /> Record payment</button>
    </div>
  );
}

function Stat({ n, l }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,.6)", borderRadius: 12, padding: "10px 12px" }}>
      <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: C.muted }}>{l}</div>
    </div>
  );
}
function Empty({ children }) { return <div style={{ fontSize: 13, color: C.faint, padding: "8px 0" }}>{children}</div>; }
