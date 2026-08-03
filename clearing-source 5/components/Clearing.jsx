"use client";
import { supabase } from "../lib/supabaseClient";
import { useState, useEffect, useMemo } from "react";
import {
  Wallet, Landmark, PiggyBank, Users, Plus, Bell, BellRing, Trash2,
  ArrowRightLeft, X, Zap, ShieldCheck, Heart, Check, Download, Upload, ArrowDownUp,
  LifeBuoy, Phone, MessageCircle, ChevronDown, ChevronUp, AlertTriangle, Scale
} from "lucide-react";

/* Clearing — money in hand, where it goes, what's due next,
   and paying back friends, family, and loans. Persists to Supabase (user_state.data jsonb) per signed-in user. */

// "Zenith Finance" design system — Clarity through Calm. Primary Blue drives brand/actions/nav;
// Success Green is reserved specifically for positive balances and cleared debts; Warning Orange
// and Danger Red flag things that need attention, sparingly, so they keep their meaning.
const C = {
  bg: "#F9F9FF", surface: "#FFFFFF", surface2: "#E8EDFF", line: "#C3C6D6",
  text: "#041B3C", muted: "#434654", faint: "#737685",
  primary: "#0052CC", teal: "#00875A", amber: "#E67E22", coral: "#DE350B", violet: "#8F4800",
  inverse: "#1D3052", onInverse: "#EDF0FF",
};
const PURPOSE = {
  income: { label: "Income", color: C.teal }, living: { label: "Living", color: C.amber }, debt: { label: "Debt", color: C.violet },
};
const OTYPE = {
  regulated: { label: "Regulated loan", short: "Regulated", color: C.primary, icon: ShieldCheck },
  payday: { label: "Payday / app loan", short: "Payday", color: C.coral, icon: Zap },
  family: { label: "Family & friends", short: "Family", color: C.violet, icon: Heart },
};
const EXP_CATS = ["Rent", "Food", "Groceries", "Transport", "Utilities", "Phone", "Medical", "Other"];
const REMIND_DAYS = 10;
const CONTACT_CHANNELS = ["Call", "SMS", "WhatsApp", "Email"];
const CONTACT_TARGETS = ["Me", "Reference", "Workplace", "Family/friend"];
const COMPLAINT_TARGETS = ["Lender's Grievance Officer", "RBI Ombudsman (cms.rbi.org.in)", "Cybercrime (1930 / cybercrime.gov.in)", "Police", "Other"];
const COMPLAINT_STATUSES = ["Filed", "Acknowledged", "Resolved", "No response"];
const ESCALATION_SITUATIONS = [
  {
    key: "legit",
    label: "Is this lender even real?",
    icon: ShieldCheck,
    steps: [
      "Open the app or its Play Store listing and look for the actual bank or NBFC name backing the loan — a genuine app has to name it, not just its own brand.",
      "Search that name on the RBI's Digital Lending Apps directory on rbi.org.in to confirm it's tied to a currently active, non-cancelled NBFC or bank licence.",
      "Cross-check the lender on the RBI Sachet portal (sachet.rbi.org.in) — this is specifically where fraud and unauthorised-lending complaints against an entity show up.",
      "No named bank or NBFC, or it's not listed there? You're very likely dealing with an unregistered operator — that changes what's below, including whether it can actually touch your CIBIL and whether police, not the RBI Ombudsman, is the right first stop.",
    ],
    links: [
      { label: "RBI Digital Lending Apps directory", href: "https://www.rbi.org.in/" },
      { label: "RBI Sachet portal", href: "https://sachet.rbi.org.in/" },
    ],
  },
  {
    key: "cibil",
    label: "Will this hit my CIBIL?",
    icon: AlertTriangle,
    steps: [
      "Only RBI-regulated lenders (banks and registered NBFCs) can report to CIBIL, Experian, and CRIF — that reporting pipeline is only open to entities RBI has licensed.",
      "So if the previous check confirmed the lender is a registered NBFC, yes — missed payments will likely show up and drag your score down.",
      "If it isn't RBI-registered at all, it almost certainly has no way to report anything to the bureaus, no matter what's threatened on the phone. That doesn't make the debt disappear, but the CIBIL threat specifically is very often a bluff from unregistered apps.",
      "Either way, check your real score directly and for free (CRED, OneScore, or PaisaBazaar) every month or two, so you're going by what's actually reported — not what a collector claims.",
    ],
  },
  {
    key: "threats",
    label: "It's turned into threats or blackmail",
    icon: AlertTriangle,
    steps: [
      "The moment it's abuse, threats, contacting your family or employer to shame you, or morphed/explicit photos — that's a crime, not a lending dispute anymore.",
      "Screenshot or record everything as it happens: calls, messages, who contacted you, when. This is what makes a police or cybercrime complaint actually actionable.",
      "Report it immediately at cybercrime.gov.in or call 1930 (National Cyber Crime Helpline, 24x7, free).",
      "Also file a complaint at your local police station — many of these operators already have open cases against them, and a formal complaint on record protects you if they ever threaten a false counter-case.",
    ],
    links: [
      { label: "cybercrime.gov.in", href: "https://cybercrime.gov.in/" },
      { label: "Call 1930", href: "tel:1930" },
    ],
  },
  {
    key: "escalate",
    label: "How do I formally escalate?",
    icon: LifeBuoy,
    steps: [
      "Start with the lender's own Grievance Redressal Officer or Nodal Officer, in writing (email works) — they're required to respond within 30 days.",
      "No response, or not good enough? File for free at cms.rbi.org.in under the RBI Ombudsman Scheme. No lawyer needed, no filing fee, and it explicitly covers digital lending.",
      "Keep copies of every complaint and response — the Ombudsman process runs on paper trail, and compensation for proven mental agony (up to ₹3 lakh) has been awarded in real cases.",
      "This route is for registered lenders. For unregistered or illegal apps, the police and cybercrime routes above matter more than the Ombudsman, since there's no licence for RBI to act against.",
    ],
    links: [{ label: "cms.rbi.org.in (RBI Ombudsman)", href: "https://cms.rbi.org.in/" }],
  },
  {
    key: "lawyer",
    label: "Do I need a lawyer?",
    icon: Scale,
    steps: [
      "For a single harassment complaint against a registered lender, usually not — the RBI Ombudsman route above is built to be used without one.",
      "Get a lawyer if: you've received an actual legal notice or police summons and don't understand it, the amount involved is large enough that a negotiated settlement matters, or you want to pursue the harassment itself as a criminal case rather than just a regulatory complaint.",
      "Before paying anyone privately, check if you qualify for free legal aid through NALSA — eligibility is income-based and varies by state (usually a few lakh a year), but women and a few other categories qualify regardless of income. Apply at nalsa.gov.in or your nearest District Legal Services Authority.",
    ],
    links: [{ label: "nalsa.gov.in", href: "https://nalsa.gov.in/" }],
  },
];
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

function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }

/* Is this debt past its due day with nothing paid since that due date? daysUntil() alone can't
   answer this — once the day passes it just rolls forward to next month, which quietly hides
   a missed payment instead of flagging it. */
function overdueInfo(o, payments) {
  if (!o.dueDay || o.status === "closed" || !(+o.monthly > 0)) return { overdue: false };
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const thisMonthDue = new Date(y, m, o.dueDay);
  const lastDue = thisMonthDue <= now ? thisMonthDue : new Date(y, m - 1, o.dueDay);
  const paidSince = (payments || []).some(p => p.obligId === o.id && new Date(p.date) >= lastDue);
  if (paidSince || now <= lastDue) return { overdue: false };
  return { overdue: true, daysLate: Math.floor((now - lastDue) / 86400000) };
}
const fmtMonthYear = (d) => d ? d.toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : null;

// Shared by the Spending and Activity charts: four selectable windows, each measured
// from its start up to right now (so "week" is Mon-through-today, not a fixed 7 days).
const PERIODS = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]];
function periodStart(period) {
  const now = new Date();
  if (period === "day") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // back to Monday
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  }
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function inPeriod(dateStr, period) { return new Date(dateStr) >= periodStart(period); }
const CHART_PALETTE = ["#0052CC", "#00875A", "#E67E22", "#8F4800", "#6554C0", "#DE350B", "#00B8D9", "#5243AA", "#36B37E", "#FF8B00"];

/* Avalanche = highest APR first (least total interest). Snowball = smallest balance first (fastest early wins).
   Extra money each month goes to the top of the order; once a debt clears, its share rolls to the next. */
function buildPayoffPlan(oblig, extraMonthly, strategy) {
  const open = oblig
    .filter(o => o.status !== "closed" && (+o.outstanding || 0) > 0)
    .map(o => ({ id: o.id, name: o.name, type: o.type, balance: +o.outstanding || 0, apr: +o.apr || 0, minPay: +o.monthly || 0 }));
  if (open.length === 0) return { order: [], months: 0, totalInterest: 0, debtFreeDate: new Date(), insufficient: false };
  const rank = [...open].sort((a, b) => strategy === "avalanche" ? b.apr - a.apr : a.balance - b.balance);
  const sim = rank.map(o => ({ ...o }));
  const clearedAt = {};
  let month = 0, totalInterest = 0;
  const MAX_MONTHS = 600;
  while (sim.some(o => o.balance > 0.5) && month < MAX_MONTHS) {
    month++;
    for (const o of sim) {
      if (o.balance <= 0) continue;
      const interest = o.balance * (o.apr / 100 / 12);
      totalInterest += interest;
      o.balance += interest;
      o.balance -= Math.min(o.minPay, o.balance);
    }
    let pool = extraMonthly;
    for (const o of sim) {
      if (pool <= 0) break;
      if (o.balance <= 0) continue;
      const pay = Math.min(pool, o.balance);
      o.balance -= pay;
      pool -= pay;
    }
    for (const o of sim) if (o.balance <= 0.5 && clearedAt[o.id] == null) clearedAt[o.id] = month;
  }
  const insufficient = month >= MAX_MONTHS && sim.some(o => o.balance > 0.5);
  return {
    order: rank.map(o => ({ ...o, monthCleared: clearedAt[o.id] || null })),
    months: insufficient ? null : month,
    totalInterest: Math.round(totalInterest),
    debtFreeDate: insufficient ? null : addMonths(new Date(), month),
    insufficient,
  };
}

/* Classic Indian credit-card trap: paying only the ~5% minimum due lets interest snowball for years.
   Compares that against paying a fixed amount that clears the card in a chosen number of months. */
function simulateMinPayment(balance, aprPct, minPct = 0.05, minFloor = 500) {
  let b = balance, month = 0, totalInterest = 0;
  const i = aprPct / 100 / 12;
  const MAX = 600;
  while (b > 0.5 && month < MAX) {
    month++;
    const interest = b * i;
    totalInterest += interest;
    b += interest;
    const pay = Math.min(Math.max(b * minPct, minFloor), b);
    b -= pay;
  }
  return { months: month >= MAX ? null : month, totalInterest: Math.round(totalInterest) };
}
function simulateFixedPayoff(balance, aprPct, months) {
  const i = aprPct / 100 / 12;
  if (months <= 0) return { payment: balance, totalInterest: 0 };
  const payment = i === 0 ? balance / months : (balance * i) / (1 - Math.pow(1 + i, -months));
  const totalInterest = Math.max(0, payment * months - balance);
  return { payment: Math.round(payment), totalInterest: Math.round(totalInterest) };
}

/* Suggests an effective APR from what a lender actually disbursed vs what they say you owe —
   this is how payday apps hide their real cost: "loan amount ₹50,000" (amountTaken) but only
   ₹44,000 (amountReceived) ever lands in the account after upfront fees. Always just a suggestion
   the person can accept or ignore, never forced onto the apr field automatically. */
function suggestedAPR(o) {
  const taken = +o.amountTaken || 0, received = +o.amountReceived || 0;
  if (!(taken > received && received > 0 && o.startDate)) return null;
  if (o.paymentType === "onetime") {
    const start = new Date(o.startDate);
    let due = o.dueDay ? new Date(start.getFullYear(), start.getMonth(), o.dueDay) : null;
    if (due && due < start) due = new Date(start.getFullYear(), start.getMonth() + 1, o.dueDay);
    const days = due ? Math.max(1, Math.round((due - start) / 86400000)) : 30; // assume 30d if no due day set
    return Math.round((((taken / received) - 1) * (365 / days)) * 1000) / 10;
  }
  // installments: solve for the monthly rate that makes amountReceived the present value of
  // the monthly payments over an estimated term (amountTaken / monthly, rounded up).
  const monthly = +o.monthly || 0;
  if (!(monthly > 0)) return null;
  const months = Math.max(1, Math.ceil(taken / monthly));
  const pv = (i) => i === 0 ? monthly * months : monthly * (1 - Math.pow(1 + i, -months)) / i;
  if (pv(0) <= received) return 0;
  let lo = 0, hi = 5;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (pv(mid) > received) lo = mid; else hi = mid; }
  return Math.round(((lo + hi) / 2) * 12 * 1000) / 10;
}

/* Plain-text report for one loan — everything logged against it, in date order, meant to be
   pasted into an email/WhatsApp/doc or attached to a formal complaint. Deliberately plain text,
   not JSON, so it's readable by whoever it's shared with. */
function buildEvidenceSummary(o, payments) {
  const lines = [];
  lines.push(`${o.name} — ${OTYPE[o.type]?.label || o.type}`);
  if (o.lenderContact) lines.push(`Lender contact/reference: ${o.lenderContact}`);
  if (o.startDate) lines.push(`Loan started: ${o.startDate}`);
  if (+o.amountTaken > 0) lines.push(`Amount taken (owed): ${inr(o.amountTaken)}`);
  if (+o.amountReceived > 0) lines.push(`Amount received: ${inr(o.amountReceived)}`);
  lines.push(`Outstanding: ${inr(o.outstanding)} · Paid so far: ${inr(o.paid)}`);
  if (o.closedAt) lines.push(`Closed: ${o.closedAt}`);
  lines.push("");
  const hist = (payments || []).filter(p => p.obligId === o.id).sort((a, b) => a.date.localeCompare(b.date));
  if (hist.length) {
    lines.push("Payments:");
    hist.forEach(p => lines.push(`  ${p.date} — ${inr(p.amount)}${p.note ? " (" + p.note + ")" : ""}`));
    lines.push("");
  }
  if ((o.settlements || []).length) {
    lines.push("Settlement offers:");
    [...o.settlements].sort((a, b) => a.date.localeCompare(b.date)).forEach(s =>
      lines.push(`  ${s.date} — offered ${inr(s.offeredAmount)}${s.accepted ? " (accepted)" : ""}${s.notes ? " — " + s.notes : ""}`));
    lines.push("");
  }
  if ((o.incidents || []).length) {
    lines.push("Contact / harassment log:");
    [...o.incidents].sort((a, b) => a.date.localeCompare(b.date)).forEach(i =>
      lines.push(`  ${i.date} — ${i.channel} to ${i.target}${i.notes ? " — " + i.notes : ""}`));
    lines.push("");
  }
  if ((o.complaints || []).length) {
    lines.push("Complaints filed:");
    [...o.complaints].sort((a, b) => a.date.localeCompare(b.date)).forEach(c =>
      lines.push(`  ${c.date} — ${c.filedWith} [${c.status}]${c.refNumber ? " ref: " + c.refNumber : ""}${c.notes ? " — " + c.notes : ""}`));
  }
  return lines.join("\n");
}

export default function Clearing({ userId }) {
  const [tab, setTab] = useState("home");
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [oblig, setOblig] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [celebrate, setCelebrate] = useState(null);
  const [settings, setSettings] = useState({ buffer: 0, budget: 0 });
  const [notif, setNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  useEffect(() => { (async () => {
    try {
      const { data } = await supabase.from("user_state").select("data").eq("user_id", userId).maybeSingle();
      const d = (data && data.data) || {};
      setAccounts(d.accounts || []); setOblig(d.oblig || []); setExpenses(d.expenses || []);
      setPayments(d.payments || []); setIncomes(d.incomes || []); setSettings(d.settings || { buffer: 0, budget: 0 });
    } catch (e) { /* first run: no row yet */ }
    setReady(true);
  })(); }, [userId]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      supabase.from("user_state").upsert({ user_id: userId, data: { accounts, oblig, expenses, payments, incomes, settings }, updated_at: new Date().toISOString() }).then(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [accounts, oblig, expenses, payments, incomes, settings, ready, userId]);
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
  const dueSoon = openOblig
    .map(o => ({ ...o, in: daysUntil(o.dueDay), ...overdueInfo(o, payments) }))
    .filter(o => +o.monthly > 0 && (o.overdue || (o.in !== null && o.in <= REMIND_DAYS)))
    .sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || a.in - b.in);
  const setAside = dueSoon.reduce((s, o) => s + (+o.monthly || 0), 0);
  const safeToSpend = moneyInHand - setAside - (+settings.buffer || 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthExp = expenses.filter(e => e.date.slice(0, 7) === monthKey);
  const monthSpend = monthExp.reduce((s, e) => s + (+e.amount || 0), 0);

  const debtStrategy = settings.payoffStrategy || "avalanche";
  const debtExtra = +settings.extraMonthly || 0;
  const debtPlan = useMemo(() => buildPayoffPlan(oblig, debtExtra, debtStrategy), [oblig, debtExtra, debtStrategy]);

  async function askNotif() { if (typeof Notification !== "undefined") setNotif(await Notification.requestPermission()); }

  function exportData() {
    const data = { app: "clearing", v: 1, savedAt: new Date().toISOString(), accounts, oblig, expenses, payments, incomes, settings };
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
        if (d.incomes) setIncomes(d.incomes);
        if (d.settings) setSettings(d.settings);
        setCelebrate("Backup restored. Everything's back.");
      } catch { setCelebrate("Couldn't read that file, sorry."); }
    };
    r.readAsText(f); e.target.value = "";
  }

  const S = `
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    .clr{font-family:'Inter',system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:${C.text};background:${C.bg};min-height:100vh;max-width:520px;margin:0 auto;padding:20px 16px 100px}
    .num{font-family:'JetBrains Mono',ui-monospace,"SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
    .hd{font-family:'Work Sans',system-ui,sans-serif}
    .card{background:${C.surface};border:1px solid ${C.line};border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(4,27,60,.03),0 6px 20px rgba(4,27,60,.05)}
    .row{display:flex;align-items:center}
    .btn{border:none;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;border-radius:8px;padding:11px 14px;color:#fff;background:${C.primary};display:inline-flex;align-items:center;gap:7px;box-shadow:0 2px 8px rgba(0,82,204,.28)}
    .btn.ghost{background:#fff;color:${C.text};border:1px solid ${C.line};box-shadow:none}
    .btn:active{transform:translateY(1px)}
    .chip{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
    .in{width:100%;background:#fff;border:1px solid ${C.line};color:${C.text};border-radius:8px;padding:10px 12px;font-size:15px;font-family:inherit;outline:none}
    .in:focus{border-color:${C.primary};box-shadow:0 0 0 3px rgba(0,82,204,.14)}
    .lbl{font-size:12px;color:${C.muted};margin-bottom:5px;display:block}
    .tabbar{position:fixed;bottom:0;left:0;right:0;background:${C.surface};border-top:1px solid ${C.line};display:flex;max-width:520px;margin:0 auto;box-shadow:0 -4px 20px rgba(4,27,60,.05)}
    .tabbar button{flex:1;background:none;border:none;color:${C.faint};padding:11px 0 15px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;font-family:inherit}
    .tabbar button.on{color:${C.primary}}
    .li{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid ${C.line}}
    .li:last-child{border-bottom:none}
    .ib{background:none;border:none;color:${C.faint};cursor:pointer;padding:6px;border-radius:8px}
    .ib:hover{color:${C.text};background:${C.surface2}}
    .bar{height:10px;border-radius:99px;background:${C.line};overflow:hidden}
    .fill{height:100%;border-radius:99px}
    .foot{font-size:11.5px;color:${C.faint};line-height:1.5}
    .toast{position:fixed;left:16px;right:16px;bottom:84px;max-width:488px;margin:0 auto;background:${C.primary};color:#fff;border-radius:14px;padding:14px 16px;font-weight:600;display:flex;align-items:center;gap:10px;box-shadow:0 8px 30px rgba(0,82,204,.4);z-index:20}
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
        <button className="ib" onClick={askNotif} style={{ color: notif === "granted" ? C.primary : C.faint }}>
          {notif === "granted" ? <BellRing size={22} /> : <Bell size={22} />}</button>
      </div>

      {tab === "home" && <Home {...{ moneyInHand, setAside, safeToSpend, settings, setSettings, dueSoon, monthSpend, debtPlan }} />}
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
      {tab === "accounts" && <Accounts {...{ accounts, setAccounts, moneyInHand, setExpenses, setIncomes }} />}
      {tab === "activity" && <Activity {...{ expenses, payments, incomes, oblig, accounts }} />}
      {tab === "spending" && <Spending {...{ expenses, setExpenses, accounts, setAccounts, settings, setSettings, monthExp, monthSpend }} />}
      {tab === "clear" && <Clear {...{ oblig, setOblig, accounts, setAccounts, payments, setPayments, onCelebrate: setCelebrate, settings, setSettings, safeToSpend }} />}
      {tab === "support" && <Support />}

      {celebrate && (
        <div className="toast"><Heart size={18} fill="#fff" /><span>{celebrate}</span></div>
      )}

      <div className="tabbar">
        {[["home", "Home", Wallet], ["accounts", "Accounts", Landmark], ["activity", "Activity", ArrowDownUp], ["spending", "Spending", PiggyBank], ["clear", "Clear", Users], ["support", "Support", LifeBuoy]]
          .map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>
          ))}
      </div>
    </div>
  );
}

function Home({ moneyInHand, setAside, safeToSpend, settings, setSettings, dueSoon, monthSpend, debtPlan }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {debtPlan && debtPlan.order.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="lbl" style={{ margin: 0 }}>Debt-free target</div>
            <span className="chip" style={{ background: C.violet, color: "#fff" }}>{OTYPE[debtPlan.order[0].type].short} first</span>
          </div>
          {debtPlan.insufficient ? (
            <div style={{ fontSize: 14, color: C.coral, marginTop: 6 }}>Minimum payments don't cover interest on some debts — see the Clear tab.</div>
          ) : (
            <>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{fmtMonthYear(debtPlan.debtFreeDate)}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{debtPlan.months} {debtPlan.months === 1 ? "month" : "months"} away, attacking <b>{debtPlan.order[0].name}</b> first</div>
            </>
          )}
        </div>
      )}
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
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="lbl" style={{ margin: 0 }}>Buffer to protect</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{inr(settings.buffer || 0)}</span>
          </div>
          <input
            type="range" min={0} max={5000} step={50}
            value={Math.min(5000, Math.max(0, +settings.buffer || 0))}
            onChange={e => setSettings(s => ({ ...s, buffer: +e.target.value }))}
            style={{ width: "100%", accentColor: C.primary, height: 4, cursor: "pointer" }}
          />
          <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: C.faint }}>₹0</span>
            <input className="in num" type="number" inputMode="numeric" value={settings.buffer || ""} placeholder="0"
              onChange={e => setSettings(s => ({ ...s, buffer: +e.target.value }))}
              style={{ width: 90, padding: "4px 8px", fontSize: 13, textAlign: "right" }} />
            <span style={{ fontSize: 11, color: C.faint }}>₹5,000</span>
          </div>
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
                {o.overdue ? (
                  <span className="chip" style={{ background: C.coral, color: "#fff", width: 66, textAlign: "center" }}>overdue</span>
                ) : (
                  <span className="chip" style={{ background: o.in <= 3 ? C.coral : C.amber, color: C.bg, width: 60, textAlign: "center" }}>
                    {o.in === 0 ? "today" : o.in + "d"}</span>
                )}
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

function PeriodToggle({ period, setPeriod }) {
  return (
    <div className="row" style={{ gap: 6, marginBottom: 14 }}>
      {PERIODS.map(([id, label]) => (
        <button key={id} className="btn ghost" onClick={() => setPeriod(id)}
          style={{ flex: 1, padding: "6px 4px", fontSize: 12, borderColor: period === id ? C.primary : C.line, color: period === id ? C.primary : C.muted }}>
          {label}
        </button>
      ))}
    </div>
  );
}
// CSS conic-gradient donut — no chart library needed. `slices` is [{label, value, color}].
function PieChart({ slices, size = 120, centerLabel, centerSub }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops = total > 0
    ? slices.map(s => { const pct = (s.value / total) * 100, from = acc; acc += pct; return `${s.color} ${from}% ${acc}%`; }).join(", ")
    : `${C.line} 0% 100%`;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${stops})`, position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: "18%", left: "18%", right: "18%", bottom: "18%", borderRadius: "50%", background: C.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {centerLabel && <div className="num" style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{centerLabel}</div>}
        {centerSub && <div style={{ fontSize: 10, color: C.faint }}>{centerSub}</div>}
      </div>
    </div>
  );
}
function ChartLegend({ items }) {
  return (
    <div style={{ flex: 1, display: "grid", gap: 6 }}>
      {items.map(x => (
        <div key={x.label} className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
          <span className="row" style={{ gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: x.color, display: "inline-block" }} />
            {x.label}
          </span>
          <span className="num" style={{ color: C.muted }}>{inr(x.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Accounts({ accounts, setAccounts, moneyInHand, setExpenses, setIncomes }) {
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [income, setIncome] = useState(false);
  const [reconc, setReconc] = useState(null);
  const seed = () => setAccounts(SEED_ACCOUNTS.map(a => ({ ...a, id: crypto.randomUUID(), balance: 0 })));
  const addIncome = (id, amt) => {
    setAccounts(x => x.map(a => a.id === id ? { ...a, balance: (+a.balance || 0) + amt } : a));
    setIncomes(x => [...x, { id: crypto.randomUUID(), accountId: id, amount: amt, date: new Date().toISOString().slice(0, 10) }]);
    setIncome(false);
  };
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
  const [f, setF] = useState({ amount: "", cat: "Food", custom: "", date: new Date().toISOString().slice(0, 10), accountId: "" });
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [editingCats, setEditingCats] = useState(false);
  const [chartPeriod, setChartPeriod] = useState("month");
  const list = [...monthExp].sort((a, b) => b.date.localeCompare(a.date));
  const over = settings.budget > 0 && monthSpend > settings.budget;
  const categoryOptions = settings.categories && settings.categories.length ? settings.categories : EXP_CATS;
  const cats = [...new Set(monthExp.map(e => e.cat).filter(Boolean))];
  const byCat = cats.map(c => ({ c, total: monthExp.filter(e => e.cat === c).reduce((s, e) => s + (+e.amount || 0), 0) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const maxCat = byCat[0]?.total || 1;
  const periodExpenses = expenses.filter(e => inPeriod(e.date, chartPeriod));
  const periodTotal = periodExpenses.reduce((s, e) => s + (+e.amount || 0), 0);
  const periodByCat = [...new Set(periodExpenses.map(e => e.cat).filter(Boolean))]
    .map(c => ({ c, total: periodExpenses.filter(e => e.cat === c).reduce((s, e) => s + (+e.amount || 0), 0) }))
    .filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const now = new Date();
  const lastMonthKey = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const lastMonthSpend = expenses.filter(e => e.date.slice(0, 7) === lastMonthKey).reduce((s, e) => s + (+e.amount || 0), 0);
  const trendPct = lastMonthSpend > 0 ? Math.round(((monthSpend - lastMonthSpend) / lastMonthSpend) * 100) : null;
  function add() {
    if (!f.amount) return;
    const cat = (f.cat === "Other" && f.custom.trim()) ? f.custom.trim() : f.cat;
    setExpenses(x => [...x, { amount: +f.amount, cat, date: f.date, accountId: f.accountId, id: crypto.randomUUID() }]);
    if (f.accountId) setAccounts(x => x.map(a => a.id === f.accountId ? { ...a, balance: (+a.balance || 0) - +f.amount } : a));
    setF({ ...f, amount: "", custom: "" });
  }
  const rm = (id) => setExpenses(x => x.filter(e => e.id !== id));
  function addCategory() {
    const name = newCat.trim();
    if (!name || categoryOptions.includes(name)) { setAddingCat(false); setNewCat(""); return; }
    setSettings(s => ({ ...s, categories: [...categoryOptions, name] }));
    setF(x => ({ ...x, cat: name }));
    setAddingCat(false); setNewCat("");
  }
  function removeCategory(c) {
    const next = categoryOptions.filter(x => x !== c);
    setSettings(s => ({ ...s, categories: next }));
    if (f.cat === c) setF(x => ({ ...x, cat: next[0] || "Other" }));
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ background: C.surface2 }}>
        <div className="lbl">Spent this month</div>
        <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
          <div className="num" style={{ fontSize: 34, fontWeight: 700, color: over ? C.coral : C.text }}>{inr(monthSpend)}</div>
          {trendPct !== null && (
            <span className="chip" style={{ background: trendPct > 0 ? C.coral : C.teal, color: "#fff" }}>{trendPct > 0 ? "+" : ""}{trendPct}% vs last mo.</span>
          )}
        </div>
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
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {categoryOptions.map(c => (
            <div key={c} className="row" style={{ gap: 2 }}>
              <button className="btn ghost" onClick={() => setF({ ...f, cat: c })} style={{ padding: "6px 10px", fontSize: 12, borderColor: f.cat === c ? C.primary : C.line, color: f.cat === c ? C.primary : C.muted }}>{c}</button>
              {editingCats && (
                <button className="ib" onClick={() => removeCategory(c)} style={{ padding: 4 }}><Trash2 size={12} /></button>
              )}
            </div>
          ))}
          {addingCat ? (
            <div className="row" style={{ gap: 4 }}>
              <input className="in" autoFocus value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category"
                onKeyDown={e => e.key === "Enter" && addCategory()} style={{ width: 130, padding: "6px 10px", fontSize: 12 }} />
              <button className="ib" onClick={addCategory}><Check size={14} /></button>
              <button className="ib" onClick={() => { setAddingCat(false); setNewCat(""); }}><X size={14} /></button>
            </div>
          ) : (
            <button className="btn ghost" onClick={() => setAddingCat(true)} style={{ padding: "6px 10px", fontSize: 12, borderColor: C.line, color: C.muted }}><Plus size={12} /> Add</button>
          )}
          <button className="btn ghost" onClick={() => setEditingCats(v => !v)} style={{ padding: "6px 10px", fontSize: 11, borderColor: C.line, color: editingCats ? C.coral : C.faint }}>{editingCats ? "Done" : "Edit"}</button>
        </div>
        {f.cat === "Other" && (
          <input className="in" placeholder="Name this type (e.g. Gift, Subscription, Childcare)" value={f.custom} onChange={e => setF({ ...f, custom: e.target.value })} />
        )}
        {accounts.length > 0 && (
          <select className="in" value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}>
            <option value="">Pay from… (optional, updates balance)</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {inr(a.balance)}</option>)}
          </select>
        )}
        <button className="btn" onClick={add} style={{ opacity: f.amount ? 1 : 0.5 }}><Plus size={16} /> Log expense</button>
      </div>

      <div className="card">
        <div className="lbl" style={{ marginBottom: 4 }}>Category breakdown</div>
        <PeriodToggle period={chartPeriod} setPeriod={setChartPeriod} />
        {periodByCat.length === 0 ? <Empty>Nothing logged in this period.</Empty> : (
          <div className="row" style={{ gap: 16, alignItems: "center" }}>
            <PieChart
              centerLabel={inr(periodTotal)}
              centerSub={PERIODS.find(p => p[0] === chartPeriod)[1]}
              slices={periodByCat.map((x, i) => ({ label: x.c, value: x.total, color: CHART_PALETTE[i % CHART_PALETTE.length] }))}
            />
            <ChartLegend items={periodByCat.map((x, i) => ({ label: x.c, value: x.total, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
          </div>
        )}
      </div>

      {byCat.length > 0 && (
        <div className="card">
          <div className="lbl" style={{ marginBottom: 10 }}>Where it went this month</div>
          {byCat.map(({ c, total }) => {
            const catBudget = (settings.catBudgets || {})[c] || 0;
            const catOver = catBudget > 0 && total > catBudget;
            return (
              <div key={c} style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{c}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="num" style={{ fontSize: 13, color: catOver ? C.coral : C.muted }}>{inr(total)}</span>
                    <input className="in num" style={{ width: 60, padding: "2px 6px", fontSize: 11 }} type="number" placeholder="budget" value={catBudget || ""}
                      onChange={e => setSettings(s => ({ ...s, catBudgets: { ...(s.catBudgets || {}), [c]: +e.target.value } }))} />
                  </div>
                </div>
                <div className="bar"><div className="fill" style={{ width: (total / maxCat) * 100 + "%", background: catOver ? C.coral : C.teal }} /></div>
              </div>
            );
          })}
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

function Clear({ oblig, setOblig, accounts, setAccounts, payments, setPayments, onCelebrate, settings, setSettings, safeToSpend }) {
  const [adding, setAdding] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedEvidence, setExpandedEvidence] = useState(null);
  const [evidenceForm, setEvidenceForm] = useState(null); // { obligId, kind: 'incident'|'complaint'|'settlement' }
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  function clearAllDebts() {
    setOblig([]);
    setPayments([]);
    setConfirmClearAll(false);
    onCelebrate("All debts cleared. Add your real numbers whenever you're ready.");
  }
  function seed() {
    setOblig(SEED_OBLIG.map(o => ({
      id: crypto.randomUUID(), name: o.name, type: o.type, outstanding: o.outstanding || 0, apr: 0, paid: 0, monthly: 0, dueDay: "", status: "open",
      cibilImpact: o.type === "regulated", harassment: o.type === "payday", paymentType: "installments", isCreditCard: false,
    })));
  }
  const strategy = settings.payoffStrategy || "avalanche";
  const extra = settings.extraMonthly || 0;
  const suggestedExtra = Math.max(0, Math.round((safeToSpend || 0) - (+settings.buffer || 0)));
  const plan = useMemo(() => buildPayoffPlan(oblig, +extra || 0, strategy), [oblig, extra, strategy]);
  const targetId = plan.order[0]?.id;
  const add = (o) => { setOblig(x => [...x, { ...o, id: crypto.randomUUID(), paid: 0, status: "open" }]); setAdding(false); };
  const upd = (id, p) => setOblig(x => x.map(o => o.id === id ? { ...o, ...p } : o));
  const rm = (id) => {
    setOblig(x => x.filter(o => o.id !== id));
    setPayments(x => x.filter(p => p.obligId !== id)); // drop this debt's payment history too, so it can't linger in "cleared" totals
  };
  function pay(id, amt, accountId, note) {
    const o = oblig.find(x => x.id === id);
    const closes = o && (+o.outstanding || 0) - amt <= 0;
    const today = new Date().toISOString().slice(0, 10);
    setOblig(x => x.map(o => {
      if (o.id !== id) return o;
      const outstanding = Math.max(0, (+o.outstanding || 0) - amt);
      return { ...o, outstanding, paid: (+o.paid || 0) + amt, status: outstanding === 0 ? "closed" : o.status, closedAt: outstanding === 0 ? today : o.closedAt };
    }));
    setPayments(x => [...x, { id: crypto.randomUUID(), obligId: id, amount: amt, date: today, note: note || "" }]);
    if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) - amt } : a));
    onCelebrate(closes ? `Cleared ${o.name} in full. One less to carry.` : `Paid ${inr(amt)} off ${o.name}.`);
    setPayFor(null);
  }
  function addEvidence(id, key, entry) {
    setOblig(x => x.map(o => o.id === id ? { ...o, [key]: [...(o[key] || []), { ...entry, id: crypto.randomUUID() }] } : o));
  }
  function removeEvidence(id, key, entryId) {
    setOblig(x => x.map(o => o.id === id ? { ...o, [key]: (o[key] || []).filter(e => e.id !== entryId) } : o));
  }
  function copySummary(o) {
    const text = buildEvidenceSummary(o, payments);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => onCelebrate("Summary copied — paste it anywhere."),
        () => onCelebrate("Couldn't copy — your browser blocked it.")
      );
    }
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
  const feeCostDebts = oblig.filter(o => +o.amountTaken > 0 && +o.amountReceived > 0 && +o.amountTaken > +o.amountReceived);
  const totalFeeCost = feeCostDebts.reduce((s, o) => s + (+o.amountTaken - +o.amountReceived), 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {oblig.length === 0 && (
        <div className="card"><div style={{ fontWeight: 600, marginBottom: 6 }}>What you're clearing</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Loans and the money owed to friends and family, in one place. Load the starter list from your statement, set what's outstanding, and log each payment to watch it shrink.</div>
          <button className="btn" onClick={seed}>Load from statement</button></div>
      )}
      <div className="card" style={{ background: C.inverse, border: "none" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="lbl" style={{ margin: 0, color: "#9FB3D9" }}>Freedom Roadmap</div>
          {plan.order.length > 0 && !plan.insufficient && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8DF7C1", letterSpacing: ".03em" }}>DEBT-FREE BY {(fmtMonthYear(plan.debtFreeDate) || "").toUpperCase()}</div>
          )}
        </div>
        <div className="num" style={{ fontSize: 34, fontWeight: 700, color: C.onInverse, marginTop: 6 }}>{Math.round(pctCleared)}% Cleared</div>
        <div className="bar" style={{ marginTop: 10, height: 12, background: "rgba(255,255,255,.15)" }}>
          <div className="fill" style={{ width: pctCleared + "%", background: "#8DF7C1" }} />
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 10, fontSize: 13 }}>
          <span style={{ color: "#B8C4E0" }}><b className="num" style={{ color: C.onInverse }}>{inr(clearedAll)}</b> cleared</span>
          <span style={{ color: "#B8C4E0" }}><b className="num" style={{ color: C.onInverse }}>{inr(totalOwed)}</b> to go</span>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,.08)", borderRadius: 12, padding: "10px 12px" }}>
            <div className="num" style={{ fontSize: 18, fontWeight: 700, color: C.onInverse }}>{closedCount}</div>
            <div style={{ fontSize: 11.5, color: "#B8C4E0" }}>{closedCount === 1 ? "debt gone" : "debts gone"}</div>
          </div>
          <div style={{ flex: 1, background: "rgba(255,255,255,.08)", borderRadius: 12, padding: "10px 12px" }}>
            <div className="num" style={{ fontSize: 18, fontWeight: 700, color: C.onInverse }}>{inr(clearedThisMonth)}</div>
            <div style={{ fontSize: 11.5, color: "#B8C4E0" }}>cleared this month</div>
          </div>
        </div>
      </div>

      {totalFeeCost > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="lbl" style={{ margin: 0 }}>Fees & interest already baked into what you took</div>
          </div>
          <div className="num" style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: C.coral }}>{inr(totalFeeCost)}</div>
          <div className="foot" style={{ marginTop: 4 }}>Gap between amount taken and amount received across {feeCostDebts.length} {feeCostDebts.length === 1 ? "loan" : "loans"} — money that never reached you but you're still on the hook for.</div>
        </div>
      )}

      {oblig.length > 0 && (
        <div className="card">
          <div className="lbl" style={{ marginBottom: 8 }}>Payoff plan</div>
          <div className="row" style={{ gap: 6, marginBottom: 10 }}>
            <button className="btn ghost" onClick={() => setSettings(s => ({ ...s, payoffStrategy: "avalanche" }))}
              style={{ flex: 1, padding: "8px 6px", fontSize: 12, borderColor: strategy === "avalanche" ? C.primary : C.line, color: strategy === "avalanche" ? C.primary : C.muted }}>
              Avalanche (highest APR first)
            </button>
            <button className="btn ghost" onClick={() => setSettings(s => ({ ...s, payoffStrategy: "snowball" }))}
              style={{ flex: 1, padding: "8px 6px", fontSize: 12, borderColor: strategy === "snowball" ? C.primary : C.line, color: strategy === "snowball" ? C.primary : C.muted }}>
              Snowball (smallest balance first)
            </button>
          </div>
          <span className="lbl">Extra you can put toward debt each month</span>
          <div className="row" style={{ gap: 8 }}>
            <input className="in num" type="number" placeholder="0" value={settings.extraMonthly || ""}
              onChange={e => setSettings(s => ({ ...s, extraMonthly: +e.target.value }))} style={{ flex: 1 }} />
            {suggestedExtra > 0 && (
              <button className="btn ghost" onClick={() => setSettings(s => ({ ...s, extraMonthly: suggestedExtra }))} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                Use {inr(suggestedExtra)}
              </button>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {plan.order.length === 0 ? (
              <div className="foot">Add an APR to each debt below (0 for family & friends) to see a payoff timeline.</div>
            ) : plan.insufficient ? (
              <div className="foot" style={{ color: C.coral }}>Minimum payments don't cover the interest building up — add some extra above, even a little helps.</div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Debt-free by</span>
                  <span className="num" style={{ fontWeight: 700 }}>{fmtMonthYear(plan.debtFreeDate)} · {plan.months}mo</span>
                </div>
                <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Interest along the way</span>
                  <span className="num">{inr(plan.totalInterest)}</span>
                </div>
              </>
            )}
          </div>
          {plan.order.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="lbl" style={{ marginBottom: 6 }}>Attack order</div>
              {plan.order.map((o, i) => (
                <div key={o.id} className="li" style={{ padding: "8px 0" }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="chip" style={{ background: i === 0 ? C.primary : C.line, color: i === 0 ? "#fff" : C.muted, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13 }}>{o.name}</span>
                  </div>
                  <span style={{ fontSize: 12, color: C.faint }}>{o.monthCleared ? "cleared mo. " + o.monthCleared : "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div className="foot" style={{ marginTop: 10 }}>{strategy === "avalanche" ? "Avalanche pays the least interest overall — best if you can stick with it." : "Snowball clears small debts first for quick wins — good if you need momentum."} Extra payments go to the top of the list; once it's cleared, extra rolls to the next.</div>
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={() => setAdding(true)} style={{ flex: 1 }}><Plus size={16} /> Add something to clear</button>
        {oblig.length > 0 && (
          <button className="btn ghost" onClick={() => setConfirmClearAll(true)} style={{ borderColor: C.coral, color: C.coral }}><Trash2 size={16} /> Clear all</button>
        )}
      </div>
      {adding && <ObligForm onSave={add} onCancel={() => setAdding(false)} />}
      {confirmClearAll && (
        <div className="card" style={{ border: "1px solid " + C.coral }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: C.coral }}>Clear every debt?</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>This removes all {oblig.length} {oblig.length === 1 ? "entry" : "entries"} on this tab — including outstanding amounts, payment history, and any evidence log — so you can re-enter your real numbers from scratch. Your accounts and spending on other tabs aren't touched.</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => setConfirmClearAll(false)} style={{ flex: 1 }}>Cancel</button>
            <button className="btn" onClick={clearAllDebts} style={{ flex: 1, background: C.coral }}>Yes, clear all</button>
          </div>
        </div>
      )}

      {groups.map(({ t, items }) => items.length > 0 && (
        <div className="card" key={t}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            {(() => { const I = OTYPE[t].icon; return <I size={16} color={OTYPE[t].color} />; })()}
            <span style={{ fontSize: 12, fontWeight: 700, color: OTYPE[t].color, textTransform: "uppercase", letterSpacing: ".03em" }}>{OTYPE[t].label}</span>
          </div>
          {items.map(o => {
            const total = (+o.outstanding || 0) + (+o.paid || 0);
            const pct = total > 0 ? (o.paid / total) * 100 : (o.status === "closed" ? 100 : 0);
            const history = payments.filter(p => p.obligId === o.id).sort((a, b) => b.date.localeCompare(a.date));
            const od = overdueInfo(o, payments);
            const aprHint = suggestedAPR(o);
            const evidenceCount = (o.incidents || []).length + (o.complaints || []).length + (o.settlements || []).length;
            const minVsFull = o.isCreditCard && +o.outstanding > 0 ? {
              min: simulateMinPayment(+o.outstanding, +o.apr || 0),
              fixed6: simulateFixedPayoff(+o.outstanding, +o.apr || 0, 6),
            } : null;
            return (
              <div key={o.id} style={{ padding: "11px 0", borderBottom: "1px solid " + C.line, opacity: o.status === "closed" ? 0.6 : 1 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {o.status === "closed" && <Check size={15} color={C.teal} />}{o.name}
                    {od.overdue && <span className="chip" style={{ background: C.coral, color: "#fff" }}>overdue{od.daysLate ? " " + od.daysLate + "d" : ""}</span>}
                    {o.id === targetId && o.status !== "closed" && <span className="chip" style={{ background: C.primary, color: "#fff" }}>attack first</span>}
                    {o.cibilImpact && <span className="chip" style={{ background: C.amber, color: "#fff" }}>hits CIBIL</span>}
                    {o.harassment && <span className="chip" style={{ background: C.coral, color: "#fff" }}>frequent calls</span>}
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    {o.status === "closed"
                      ? <span className="chip" style={{ background: C.teal, color: "#fff" }}>cleared</span>
                      : <span className="num" style={{ fontWeight: 600 }}>{inr(o.outstanding)}</span>}
                    {o.status !== "closed" && <button className="chip" onClick={() => setPayFor(o.id)} style={{ background: od.overdue ? C.coral : C.primary, color: "#fff", cursor: "pointer" }}>{od.overdue ? "pay now" : "pay"}</button>}
                    <button className="ib" onClick={() => rm(o.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{o.paymentType === "onetime" ? "One-time payoff" : "Paid in installments"}</div>
                {pct > 0 && <div className="bar" style={{ marginTop: 8 }}><div className="fill" style={{ width: pct + "%", background: OTYPE[t].color }} /></div>}
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" placeholder="outstanding" value={o.outstanding || ""} onChange={e => upd(o.id, { outstanding: +e.target.value })} />
                  <input className="in num" style={{ padding: "5px 8px", fontSize: 12, width: 90 }} type="number" placeholder="monthly" value={o.monthly || ""} onChange={e => upd(o.id, { monthly: +e.target.value })} />
                  <input className="in num" style={{ padding: "5px 8px", fontSize: 12, width: 58 }} type="number" min="1" max="31" placeholder="due" value={o.dueDay || ""} onChange={e => upd(o.id, { dueDay: +e.target.value })} />
                  <input className="in num" style={{ padding: "5px 8px", fontSize: 12, width: 64 }} type="number" min="0" step="0.1" placeholder="APR%" value={o.apr || ""} onChange={e => upd(o.id, { apr: +e.target.value })} />
                </div>
                {aprHint !== null && (
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 6, background: C.surface2, borderRadius: 8, padding: "6px 10px" }}>
                    <span style={{ fontSize: 11.5, color: C.muted }}>Suggested APR from amount taken vs received: <b>{aprHint}%</b></span>
                    <button className="chip" onClick={() => upd(o.id, { apr: aprHint })} style={{ background: C.primary, color: "#fff", cursor: "pointer" }}>use</button>
                  </div>
                )}
                <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 120px" }}><span className="lbl" style={{ marginBottom: 2 }}>Started</span>
                    <input className="in" style={{ padding: "5px 8px", fontSize: 12 }} type="date" value={o.startDate || ""} onChange={e => upd(o.id, { startDate: e.target.value })} /></div>
                  <div style={{ flex: "1 1 100px" }}><span className="lbl" style={{ marginBottom: 2 }}>Taken</span>
                    <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" placeholder="0" value={o.amountTaken || ""} onChange={e => upd(o.id, { amountTaken: +e.target.value })} /></div>
                  <div style={{ flex: "1 1 100px" }}><span className="lbl" style={{ marginBottom: 2 }}>Received</span>
                    <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" placeholder="0" value={o.amountReceived || ""} onChange={e => upd(o.id, { amountReceived: +e.target.value })} /></div>
                </div>
                <input className="in" style={{ padding: "5px 8px", fontSize: 12, marginTop: 8 }} placeholder="Lender contact / account ref (optional)" value={o.lenderContact || ""} onChange={e => upd(o.id, { lenderContact: e.target.value })} />
                <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <button className="chip" onClick={() => upd(o.id, { cibilImpact: !o.cibilImpact })} style={{ background: "transparent", border: "1px solid " + (o.cibilImpact ? C.amber : C.line), color: o.cibilImpact ? C.amber : C.muted, cursor: "pointer" }}>CIBIL</button>
                  <button className="chip" onClick={() => upd(o.id, { harassment: !o.harassment })} style={{ background: "transparent", border: "1px solid " + (o.harassment ? C.coral : C.line), color: o.harassment ? C.coral : C.muted, cursor: "pointer" }}>calls</button>
                  <button className="chip" onClick={() => upd(o.id, { paymentType: o.paymentType === "onetime" ? "installments" : "onetime" })} style={{ background: "transparent", border: "1px solid " + C.line, color: C.muted, cursor: "pointer" }}>{o.paymentType === "onetime" ? "one-time" : "installments"}</button>
                  {t === "regulated" && (
                    <button className="chip" onClick={() => upd(o.id, { isCreditCard: !o.isCreditCard })} style={{ background: "transparent", border: "1px solid " + (o.isCreditCard ? C.violet : C.line), color: o.isCreditCard ? C.violet : C.muted, cursor: "pointer" }}>{o.isCreditCard ? "✓ credit card" : "mark as credit card"}</button>
                  )}
                  {history.length > 0 && (
                    <button className="chip" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)} style={{ background: "transparent", border: "1px solid " + C.line, color: C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      history ({history.length}){expandedId === o.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                  )}
                  <button className="chip" onClick={() => setExpandedEvidence(expandedEvidence === o.id ? null : o.id)} style={{ background: "transparent", border: "1px solid " + (evidenceCount > 0 ? C.coral : C.line), color: evidenceCount > 0 ? C.coral : C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    evidence log ({evidenceCount}){expandedEvidence === o.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                </div>
                {expandedId === o.id && history.length > 0 && (
                  <div style={{ marginTop: 8, background: C.surface2, borderRadius: 10, padding: 10 }}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11.5, color: C.muted }}>Paid so far</span>
                      <span className="num" style={{ fontSize: 12, fontWeight: 700, color: C.teal }}>{inr(o.paid)} of {inr(total)}</span>
                    </div>
                    {history.map(p => (
                      <div key={p.id} className="row" style={{ justifyContent: "space-between", padding: "3px 0", alignItems: "flex-start" }}>
                        <span style={{ fontSize: 12, color: C.muted }}>{p.date}{p.note ? <span style={{ display: "block", color: C.faint, fontStyle: "italic" }}>{p.note}</span> : null}</span>
                        <span className="num" style={{ fontSize: 12 }}>{inr(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {expandedEvidence === o.id && (
                  <div style={{ marginTop: 8, background: C.surface2, borderRadius: 10, padding: 10, display: "grid", gap: 12 }}>
                    <button className="btn ghost" onClick={() => copySummary(o)} style={{ fontSize: 12, alignSelf: "flex-start" }}>Copy evidence summary</button>

                    <div>
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>Contact / harassment log</span>
                        <button className="ib" onClick={() => setEvidenceForm(evidenceForm?.obligId === o.id && evidenceForm.kind === "incident" ? null : { obligId: o.id, kind: "incident" })}><Plus size={14} /></button>
                      </div>
                      {(o.incidents || []).length === 0 && !(evidenceForm?.obligId === o.id && evidenceForm.kind === "incident") && <div className="foot">Nothing logged yet.</div>}
                      {[...(o.incidents || [])].sort((a, b) => b.date.localeCompare(a.date)).map(i => (
                        <div key={i.id} className="row" style={{ justifyContent: "space-between", padding: "3px 0", alignItems: "flex-start" }}>
                          <span style={{ fontSize: 12, color: C.muted }}>{i.date} — {i.channel} to {i.target}{i.notes ? <span style={{ display: "block", color: C.faint, fontStyle: "italic" }}>{i.notes}</span> : null}</span>
                          <button className="ib" onClick={() => removeEvidence(o.id, "incidents", i.id)}><Trash2 size={12} /></button>
                        </div>
                      ))}
                      {evidenceForm?.obligId === o.id && evidenceForm.kind === "incident" && (
                        <IncidentForm onCancel={() => setEvidenceForm(null)} onSave={(entry) => { addEvidence(o.id, "incidents", entry); setEvidenceForm(null); }} />
                      )}
                    </div>

                    <div>
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>Complaints filed</span>
                        <button className="ib" onClick={() => setEvidenceForm(evidenceForm?.obligId === o.id && evidenceForm.kind === "complaint" ? null : { obligId: o.id, kind: "complaint" })}><Plus size={14} /></button>
                      </div>
                      {(o.complaints || []).length === 0 && !(evidenceForm?.obligId === o.id && evidenceForm.kind === "complaint") && <div className="foot">Nothing filed yet.</div>}
                      {[...(o.complaints || [])].sort((a, b) => b.date.localeCompare(a.date)).map(c => (
                        <div key={c.id} className="row" style={{ justifyContent: "space-between", padding: "3px 0", alignItems: "flex-start" }}>
                          <span style={{ fontSize: 12, color: C.muted }}>{c.date} — {c.filedWith} [{c.status}]{c.refNumber ? " · ref " + c.refNumber : ""}{c.notes ? <span style={{ display: "block", color: C.faint, fontStyle: "italic" }}>{c.notes}</span> : null}</span>
                          <button className="ib" onClick={() => removeEvidence(o.id, "complaints", c.id)}><Trash2 size={12} /></button>
                        </div>
                      ))}
                      {evidenceForm?.obligId === o.id && evidenceForm.kind === "complaint" && (
                        <ComplaintForm onCancel={() => setEvidenceForm(null)} onSave={(entry) => { addEvidence(o.id, "complaints", entry); setEvidenceForm(null); }} />
                      )}
                    </div>

                    <div>
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>Settlement offers</span>
                        <button className="ib" onClick={() => setEvidenceForm(evidenceForm?.obligId === o.id && evidenceForm.kind === "settlement" ? null : { obligId: o.id, kind: "settlement" })}><Plus size={14} /></button>
                      </div>
                      {(o.settlements || []).length === 0 && !(evidenceForm?.obligId === o.id && evidenceForm.kind === "settlement") && <div className="foot">None logged yet.</div>}
                      {[...(o.settlements || [])].sort((a, b) => b.date.localeCompare(a.date)).map(s => (
                        <div key={s.id} className="row" style={{ justifyContent: "space-between", padding: "3px 0", alignItems: "flex-start" }}>
                          <span style={{ fontSize: 12, color: C.muted }}>{s.date} — offered {inr(s.offeredAmount)}{s.accepted ? " (accepted)" : ""}{s.notes ? <span style={{ display: "block", color: C.faint, fontStyle: "italic" }}>{s.notes}</span> : null}</span>
                          <button className="ib" onClick={() => removeEvidence(o.id, "settlements", s.id)}><Trash2 size={12} /></button>
                        </div>
                      ))}
                      {evidenceForm?.obligId === o.id && evidenceForm.kind === "settlement" && (
                        <SettlementForm onCancel={() => setEvidenceForm(null)} onSave={(entry) => { addEvidence(o.id, "settlements", entry); setEvidenceForm(null); }} />
                      )}
                    </div>
                  </div>
                )}
                {minVsFull && (
                  <div style={{ marginTop: 8, background: C.surface2, borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><AlertTriangle size={13} color={C.coral} /> If you only pay the ~5% minimum due</div>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12 }}>Minimum only</span>
                      <span className="num" style={{ fontSize: 12, color: C.coral }}>{minVsFull.min.months ? minVsFull.min.months + " mo" : "50+ yrs"} · {inr(minVsFull.min.totalInterest)} interest</span>
                    </div>
                    <div className="row" style={{ justifyContent: "space-between", marginTop: 3 }}>
                      <span style={{ fontSize: 12 }}>Clear it in 6 months instead</span>
                      <span className="num" style={{ fontSize: 12, color: C.teal }}>{inr(minVsFull.fixed6.payment)}/mo · {inr(minVsFull.fixed6.totalInterest)} interest</span>
                    </div>
                  </div>
                )}
                {payFor === o.id && <PayForm accounts={accounts} onPay={(amt, acc, note) => pay(o.id, amt, acc, note)} onCancel={() => setPayFor(null)} />}
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
  const [f, setF] = useState({
    name: "", type: "family", outstanding: 0, monthly: 0, dueDay: "", apr: 0, cibilImpact: false, harassment: false,
    paymentType: "installments", isCreditCard: false, startDate: "", amountTaken: 0, amountReceived: 0, lenderContact: "",
  });
  const pickType = (t) => setF(s => ({ ...s, type: t, cibilImpact: t === "regulated", harassment: t === "payday" }));
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><div style={{ fontWeight: 600 }}>Add to clear</div><button className="ib" onClick={onCancel}><X size={18} /></button></div>
      <input className="in" placeholder="Name (lender or person)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <div className="row" style={{ gap: 6 }}>{Object.keys(OTYPE).map(t => (
        <button key={t} className="btn ghost" onClick={() => pickType(t)} style={{ flex: 1, padding: "8px 6px", fontSize: 12, borderColor: f.type === t ? OTYPE[t].color : C.line, color: f.type === t ? OTYPE[t].color : C.muted }}>{OTYPE[t].short}</button>
      ))}</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="in num" type="number" placeholder="Outstanding" value={f.outstanding || ""} onChange={e => setF({ ...f, outstanding: +e.target.value })} style={{ flex: 1 }} />
        <input className="in num" type="number" placeholder="Monthly" value={f.monthly || ""} onChange={e => setF({ ...f, monthly: +e.target.value })} style={{ width: 90 }} />
        <input className="in num" type="number" min="1" max="31" placeholder="Due" value={f.dueDay || ""} onChange={e => setF({ ...f, dueDay: +e.target.value })} style={{ width: 58 }} />
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn ghost" onClick={() => setF(s => ({ ...s, paymentType: "onetime" }))} style={{ flex: 1, padding: "7px 6px", fontSize: 12, borderColor: f.paymentType === "onetime" ? C.primary : C.line, color: f.paymentType === "onetime" ? C.primary : C.muted }}>One-time</button>
        <button className="btn ghost" onClick={() => setF(s => ({ ...s, paymentType: "installments" }))} style={{ flex: 1, padding: "7px 6px", fontSize: 12, borderColor: f.paymentType === "installments" ? C.primary : C.line, color: f.paymentType === "installments" ? C.primary : C.muted }}>Installments</button>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="btn ghost" onClick={() => setF(s => ({ ...s, cibilImpact: !s.cibilImpact }))} style={{ padding: "6px 10px", fontSize: 11, borderColor: f.cibilImpact ? C.amber : C.line, color: f.cibilImpact ? C.amber : C.muted }}>{f.cibilImpact ? "✓ " : ""}Hits CIBIL</button>
        <button className="btn ghost" onClick={() => setF(s => ({ ...s, harassment: !s.harassment }))} style={{ padding: "6px 10px", fontSize: 11, borderColor: f.harassment ? C.coral : C.line, color: f.harassment ? C.coral : C.muted }}>{f.harassment ? "✓ " : ""}Frequent calls</button>
        {f.type === "regulated" && (
          <button className="btn ghost" onClick={() => setF(s => ({ ...s, isCreditCard: !s.isCreditCard }))} style={{ padding: "6px 10px", fontSize: 11, borderColor: f.isCreditCard ? C.violet : C.line, color: f.isCreditCard ? C.violet : C.muted }}>{f.isCreditCard ? "✓ " : ""}Credit card</button>
        )}
      </div>
      <div className="foot" style={{ marginTop: 2 }}>Optional — helps prove what this loan actually cost you, and gives an APR suggestion.</div>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}><span className="lbl">Loan started</span>
          <input className="in" type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} /></div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}><span className="lbl">Amount taken (owed)</span>
          <input className="in num" type="number" placeholder="0" value={f.amountTaken || ""} onChange={e => setF({ ...f, amountTaken: +e.target.value })} /></div>
        <div style={{ flex: 1 }}><span className="lbl">Amount received</span>
          <input className="in num" type="number" placeholder="0" value={f.amountReceived || ""} onChange={e => setF({ ...f, amountReceived: +e.target.value })} /></div>
      </div>
      <div>
        <span className="lbl">Lender contact / account ref (optional)</span>
        <input className="in" placeholder="Phone, email, or account number" value={f.lenderContact} onChange={e => setF({ ...f, lenderContact: e.target.value })} />
      </div>
      <button className="btn" disabled={!f.name} onClick={() => onSave(f)} style={{ opacity: f.name ? 1 : 0.5 }}>Save</button>
    </div>
  );
}
function PayForm({ accounts, onPay, onCancel }) {
  const [amt, setAmt] = useState("");
  const [acc, setAcc] = useState(accounts.find(a => a.purpose === "debt")?.id || accounts[0]?.id || "");
  const [note, setNote] = useState("");
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 8, background: C.surface2, padding: 12, borderRadius: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <input className="in num" type="number" placeholder="Amount paid" value={amt} onChange={e => setAmt(e.target.value)} style={{ flex: 1 }} autoFocus />
        <button className="ib" onClick={onCancel}><X size={16} /></button>
      </div>
      {accounts.length > 0 && (
        <select className="in" value={acc} onChange={e => setAcc(e.target.value)}>
          <option value="">Don't deduct from any account</option>
          {accounts.map(a => <option key={a.id} value={a.id}>Pay from: {a.name} — {inr(a.balance)}</option>)}
        </select>
      )}
      <input className="in" placeholder="Reason / note (optional — e.g. Nov EMI, settled early)" value={note} onChange={e => setNote(e.target.value)} />
      <div className="foot">Picking an account lowers its balance too. Choose "don't deduct" only if you already paid outside the app.</div>
      <button className="btn" disabled={!amt} onClick={() => onPay(+amt, acc, note)} style={{ opacity: amt ? 1 : 0.5 }}><Check size={16} /> Record payment</button>
    </div>
  );
}

function IncidentForm({ onSave, onCancel }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), channel: "Call", target: "Me", notes: "" });
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <input className="in" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {CONTACT_CHANNELS.map(c => (
          <button key={c} className="btn ghost" onClick={() => setF({ ...f, channel: c })} style={{ padding: "5px 8px", fontSize: 11, borderColor: f.channel === c ? C.primary : C.line, color: f.channel === c ? C.primary : C.muted }}>{c}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {CONTACT_TARGETS.map(t => (
          <button key={t} className="btn ghost" onClick={() => setF({ ...f, target: t })} style={{ padding: "5px 8px", fontSize: 11, borderColor: f.target === t ? C.coral : C.line, color: f.target === t ? C.coral : C.muted }}>{t}</button>
        ))}
      </div>
      <input className="in" placeholder="Notes — what happened, what was said" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
        <button className="btn" onClick={() => onSave(f)} style={{ flex: 1 }}>Log it</button>
      </div>
    </div>
  );
}
function ComplaintForm({ onSave, onCancel }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), filedWith: COMPLAINT_TARGETS[0], refNumber: "", status: "Filed", notes: "" });
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <input className="in" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
      <select className="in" value={f.filedWith} onChange={e => setF({ ...f, filedWith: e.target.value })}>
        {COMPLAINT_TARGETS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {COMPLAINT_STATUSES.map(s => (
          <button key={s} className="btn ghost" onClick={() => setF({ ...f, status: s })} style={{ padding: "5px 8px", fontSize: 11, borderColor: f.status === s ? C.primary : C.line, color: f.status === s ? C.primary : C.muted }}>{s}</button>
        ))}
      </div>
      <input className="in" placeholder="Reference / complaint number (optional)" value={f.refNumber} onChange={e => setF({ ...f, refNumber: e.target.value })} />
      <input className="in" placeholder="Notes" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
        <button className="btn" onClick={() => onSave(f)} style={{ flex: 1 }}>Log it</button>
      </div>
    </div>
  );
}
function SettlementForm({ onSave, onCancel }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), offeredAmount: "", accepted: false, notes: "" });
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <input className="in" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} style={{ flex: 1 }} />
        <input className="in num" type="number" placeholder="Offered amount" value={f.offeredAmount} onChange={e => setF({ ...f, offeredAmount: e.target.value })} style={{ flex: 1 }} />
      </div>
      <button className="btn ghost" onClick={() => setF({ ...f, accepted: !f.accepted })} style={{ borderColor: f.accepted ? C.teal : C.line, color: f.accepted ? C.teal : C.muted }}>{f.accepted ? "✓ " : ""}Accepted</button>
      <input className="in" placeholder="Notes" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
        <button className="btn" disabled={!f.offeredAmount} onClick={() => onSave({ ...f, offeredAmount: +f.offeredAmount })} style={{ flex: 1, opacity: f.offeredAmount ? 1 : 0.5 }}>Log it</button>
      </div>
    </div>
  );
}

function EscalationHelper() {
  const [active, setActive] = useState(null);
  const situation = ESCALATION_SITUATIONS.find(s => s.key === active);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, color: C.muted }}>Tap what's actually happening right now — each one walks through exactly what to do next.</div>
      <div style={{ display: "grid", gap: 8 }}>
        {ESCALATION_SITUATIONS.map(s => {
          const I = s.icon;
          return (
            <button key={s.key} onClick={() => setActive(active === s.key ? null : s.key)} className="btn ghost"
              style={{ justifyContent: "flex-start", gap: 10, padding: "12px 14px", borderColor: active === s.key ? C.primary : C.line, color: active === s.key ? C.primary : C.text }}>
              <I size={16} /> {s.label}
            </button>
          );
        })}
      </div>
      {situation && (
        <div className="card" style={{ background: C.surface2, display: "grid", gap: 10 }}>
          {situation.steps.map((step, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <span className="chip" style={{ background: C.primary, color: "#fff", width: 18, height: 18, minWidth: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, marginTop: 2 }}>{i + 1}</span>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
          {situation.links && situation.links.length > 0 && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              {situation.links.map(l => (
                <a key={l.href} href={l.href} target={l.href.startsWith("tel:") ? undefined : "_blank"} rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <span className="chip" style={{ background: C.primary, color: "#fff", cursor: "pointer" }}>{l.label} →</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="foot">General guidance, not legal advice — for anything that turns into an actual notice or case, get it checked by someone qualified. NALSA free legal aid is a good first stop before paying anyone.</div>
    </div>
  );
}

function Support() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ border: "1px solid " + C.primary }}>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <ShieldCheck size={16} color={C.primary} />
          <span style={{ fontWeight: 600 }}>Escalation Helper</span>
        </div>
        <EscalationHelper />
      </div>

      <div className="card">
        <div className="row" style={{ gap: 8, marginBottom: 6 }}>
          <Phone size={16} color={C.coral} />
          <span style={{ fontWeight: 600 }}>If the calls feel like too much</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Lenders and their recovery agents have to follow RBI rules. A lot of what feels normal from these apps isn't actually allowed.</div>
        <div style={{ fontSize: 13, display: "grid", gap: 6, marginBottom: 12 }}>
          <div>• They can only call you between 8am and 7pm.</div>
          <div>• No threats, abuse, or calling your family or employer to shame you.</div>
          <div>• They can't access your contacts, photos, or location without your consent.</div>
          <div>• A woman borrower can only be contacted by a female agent, within set hours.</div>
        </div>
        <div className="foot" style={{ marginBottom: 10 }}>
          Getting nowhere with the lender directly? Write to their Grievance / Nodal Officer first (they get 30 days). Still stuck — file a free complaint at{" "}
          <a href="https://cms.rbi.org.in/" target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontWeight: 600 }}>cms.rbi.org.in</a>{" "}
          under the RBI Ombudsman Scheme. No lawyer, no fee, and it covers digital lending.
        </div>
        <div style={{ fontSize: 13, background: C.surface2, borderRadius: 10, padding: 10, marginBottom: 10 }}>
          If it crosses into threats, blackmail, or morphed photos — that's a crime, not a lending dispute, not something to handle alone.
        </div>
        <a href="https://cybercrime.gov.in/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          <div className="row" style={{ justifyContent: "space-between", background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: "1px solid " + C.line }}>
            <div><div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>National Cyber Crime Reporting Portal</div><div style={{ fontSize: 12, color: C.muted }}>cybercrime.gov.in</div></div>
            <span className="chip" style={{ background: C.coral, color: "#fff" }}>open</span>
          </div>
        </a>
        <a href="tel:1930" style={{ textDecoration: "none" }}>
          <div className="row" style={{ justifyContent: "space-between", background: "#fff", borderRadius: 12, padding: "12px 14px", border: "1px solid " + C.line }}>
            <div><div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>National Cyber Crime Helpline</div><div style={{ fontSize: 12, color: C.muted }}>24x7 · toll-free</div></div>
            <div className="num" style={{ fontWeight: 700, color: C.coral }}>1930</div>
          </div>
        </a>
      </div>

      <div className="card" style={{ background: C.surface2 }}>
        <div className="row" style={{ gap: 8, marginBottom: 6 }}>
          <Heart size={16} color={C.violet} />
          <span style={{ fontWeight: 600 }}>Feeling overwhelmed by all this?</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Debt stress is heavy, and it's common to feel it more than the numbers suggest. These lines are free, confidential, and run by trained counsellors — not lenders, not collectors. Calling doesn't cost anything and nothing is reported anywhere.</div>
        <a href="tel:18005990019" style={{ textDecoration: "none" }}>
          <div className="row" style={{ justifyContent: "space-between", background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: "1px solid " + C.line }}>
            <div><div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>KIRAN Mental Health Helpline</div><div style={{ fontSize: 12, color: C.muted }}>24x7 · toll-free · 13 languages</div></div>
            <div className="num" style={{ fontWeight: 700, color: C.teal }}>1800-599-0019</div>
          </div>
        </a>
        <a href="tel:14416" style={{ textDecoration: "none" }}>
          <div className="row" style={{ justifyContent: "space-between", background: "#fff", borderRadius: 12, padding: "12px 14px", border: "1px solid " + C.line }}>
            <div><div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>Tele MANAS</div><div style={{ fontSize: 12, color: C.muted }}>24x7 counselling · Govt of India</div></div>
            <div className="num" style={{ fontWeight: 700, color: C.teal }}>14416</div>
          </div>
        </a>
        <div className="foot" style={{ marginTop: 10 }}>If it ever feels like more than you can carry, please call one of these. That's exactly what they're there for.</div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 8, marginBottom: 6 }}>
          <MessageCircle size={16} color={C.amber} />
          <span style={{ fontWeight: 600 }}>You're not the only one dealing with this</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Plenty of people have clawed their way out of the exact same spot — payday apps, credit cards, family loans, all of it. It can help to read how others did it.</div>
        <a href="https://www.reddit.com/r/IndiaInvestments/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          <div className="row" style={{ justifyContent: "space-between", background: "#fff", borderRadius: 12, padding: "12px 14px", border: "1px solid " + C.line }}>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>r/IndiaInvestments</div>
            <span className="chip" style={{ background: C.line, color: C.muted }}>open</span>
          </div>
        </a>
        <div className="foot" style={{ marginTop: 8 }}>Search "debt free" or "payday loan" in there — r/CreditCardsIndia and r/personalfinanceindia are worth a look too. You don't have to post anything; reading is enough to start.</div>
      </div>
    </div>
  );
}

function Activity({ expenses, payments, incomes, oblig, accounts }) {
  const [payPeriod, setPayPeriod] = useState("month");
  const nameOf = (id, list) => (list.find((x) => x.id === id) || {}).name || "";
  const items = [
    ...(incomes || []).map((i) => ({ date: i.date, dir: "in", amount: +i.amount || 0, label: "Income" + (nameOf(i.accountId, accounts) ? " → " + nameOf(i.accountId, accounts) : "") })),
    ...(expenses || []).map((e) => ({ date: e.date, dir: "out", amount: +e.amount || 0, label: e.cat || "Spending" })),
    ...(payments || []).map((p) => ({ date: p.date, dir: "out", amount: +p.amount || 0, label: "Paid " + (nameOf(p.obligId, oblig) || "a debt") })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const monthKey = new Date().toISOString().slice(0, 7);
  const inM = items.filter((i) => i.dir === "in" && i.date.slice(0, 7) === monthKey).reduce((s, i) => s + i.amount, 0);
  const outM = items.filter((i) => i.dir === "out" && i.date.slice(0, 7) === monthKey).reduce((s, i) => s + i.amount, 0);

  const periodPayments = (payments || []).filter(p => inPeriod(p.date, payPeriod));
  const periodPaid = periodPayments.reduce((s, p) => s + (+p.amount || 0), 0);
  const paidByType = Object.keys(OTYPE).map(t => ({
    t, total: periodPayments.filter(p => { const o = oblig.find(x => x.id === p.obligId); return o && o.type === t; }).reduce((s, p) => s + (+p.amount || 0), 0),
  })).filter(x => x.total > 0);

  // group by date
  const groups = [];
  items.forEach((it) => {
    const g = groups.find((x) => x.date === it.date);
    if (g) g.rows.push(it); else groups.push({ date: it.date, rows: [it] });
  });
  const fmt = (d) => { try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return d; } };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ background: C.surface2 }}>
        <div className="lbl">This month, in and out</div>
        <div className="row" style={{ gap: 10, marginTop: 4 }}>
          <div style={{ flex: 1 }}><div className="num" style={{ fontSize: 20, fontWeight: 700, color: C.teal }}>+ {inr(inM)}</div><div style={{ fontSize: 12, color: C.muted }}>came in</div></div>
          <div style={{ flex: 1 }}><div className="num" style={{ fontSize: 20, fontWeight: 700, color: C.text }}>− {inr(outM)}</div><div style={{ fontSize: 12, color: C.muted }}>went out</div></div>
        </div>
      </div>

      <div className="card">
        <div className="lbl" style={{ marginBottom: 4 }}>Payments breakdown</div>
        <PeriodToggle period={payPeriod} setPeriod={setPayPeriod} />
        {paidByType.length === 0 ? <Empty>No payments logged in this period.</Empty> : (
          <div className="row" style={{ gap: 16, alignItems: "center" }}>
            <PieChart
              centerLabel={inr(periodPaid)}
              centerSub={PERIODS.find(p => p[0] === payPeriod)[1]}
              slices={paidByType.map(x => ({ label: OTYPE[x.t].short, value: x.total, color: OTYPE[x.t].color }))}
            />
            <ChartLegend items={paidByType.map(x => ({ label: OTYPE[x.t].label, value: x.total, color: OTYPE[x.t].color }))} />
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card"><Empty>Nothing recorded yet. Add income on Accounts, log spending on Spending, or record a payment on Clear, and it all shows up here.</Empty></div>
      ) : groups.map((g) => (
        <div className="card" key={g.date}>
          <div className="lbl" style={{ marginBottom: 4 }}>{fmt(g.date)}</div>
          {g.rows.map((r, i) => (
            <div className="li" key={i}>
              <div className="row" style={{ gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: r.dir === "in" ? C.teal : C.coral, display: "inline-block" }} />
                <span style={{ fontSize: 14 }}>{r.label}</span>
              </div>
              <span className="num" style={{ fontWeight: 600, color: r.dir === "in" ? C.teal : C.text }}>{r.dir === "in" ? "+ " : "− "}{inr(r.amount)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="foot">Green is money in, red-dot is money out. Loan and family repayments show here as "Paid …". Transfers between your own accounts aren't shown, since that money hasn't left you.</div>
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
