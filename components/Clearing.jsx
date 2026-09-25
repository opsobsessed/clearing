"use client";
import { supabase } from "../lib/supabaseClient";
import { useState, useEffect, useMemo, useRef } from "react";
import MoneyLogModal from "./MoneyLog";
import {
  Wallet, Landmark, PiggyBank, Users, Plus, Bell, BellRing, Trash2,
  ArrowRightLeft, X, Zap, ShieldCheck, Heart, Check, Download, Upload, ArrowDownUp,
  ChevronDown, ChevronUp, AlertTriangle, Camera
} from "lucide-react";

/* Clearing — money in hand, where it goes, what's due next,
   and paying back friends, family, and loans. Persists to Supabase (user_state.data jsonb) per signed-in user. */

// "Zenith Finance" design system — Clarity through Calm. Primary Blue drives brand/actions/nav;
// Success Green is reserved specifically for positive balances and cleared debts; Warning Orange
// and Danger Red flag things that need attention, sparingly, so they keep their meaning.
// Palette from your coolors board (Columbia Blue / Cadet Grey / Charcoal / Nyanza / Tomato), mapped
// where it fits directly — cream background, blue-gray secondary surface, charcoal-slate primary,
// tomato-red danger. Two deliberate exceptions: this app leans on color to mean "cleared" vs
// "overdue" vs "due soon", and the 5-color board has no clear green or second warning hue, so those
// two stay close to the app's original values rather than being forced into the board's palette.
const C = {
  bg: "#EEF5DB", surface: "#FFFFFF", surface2: "#B8D8D8", line: "#C7DBDB",
  text: "#2C3E42", muted: "#7A9E9F", faint: "#9DB8B8",
  primary: "#4F6367", teal: "#3F8B6F", amber: "#DC9245", coral: "#E5473D", violet: "#6B5B8E",
  inverse: "#26363A", onInverse: "#EEF5DB",
};
// Keys (income/living/debt) are unchanged for saved-data compatibility — only the displayed
// labels changed, from abstract category names to what the tag actually does: pick the default
// account for a form. "Debt" here means "accounts", never the loans on the Clear tab.
const PURPOSE = {
  income: { label: "Salary lands here", color: C.teal }, living: { label: "Everyday spending", color: C.amber }, debt: { label: "Pay debts from here", color: C.violet },
};
const OTYPE = {
  regulated: { label: "Marked Regulated", short: "Marked Regulated", color: C.primary, icon: ShieldCheck },
  payday: { label: "Payday / app loan", short: "Payday", color: C.coral, icon: Zap },
  family: { label: "Family & friends", short: "Family", color: C.violet, icon: Heart },
};
const EXP_CATS = ["Rent", "Food", "Groceries", "Transport", "Utilities", "Phone", "Medical", "Other"];
const REMIND_DAYS = 10;
// Dates are stored as local calendar days (YYYY-MM-DD). toISOString() is UTC, which in India
// files anything logged before 5:30am under the previous day — so always build dates locally.
const pad2 = (n) => String(n).padStart(2, "0");
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const localMonth = (d = new Date()) => localDay(d).slice(0, 7);
const INCOME_SOURCES = ["Salary", "Reimbursement", "Freelance / side income", "Refund / cashback", "Gift", "Other"];
const incomeSourceLabel = (i) => i.source || "Untagged";
const inr = (n) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const SEED_ACCOUNTS = [
  { name: "Kotak 811", purpose: "income" }, { name: "Spending", purpose: "living" }, { name: "Cash", purpose: "living", isCash: true },
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

// War chest helpers — the "period key" for a date is either the date itself (daily cadence) or
// that week's Monday (weekly cadence), so two logs land in the "same period" regardless of which
// day of the week they happened on.
function warChestPeriodKey(cadence, dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (cadence === "weekly") {
    const day = d.getDay(); const diff = (day === 0 ? -6 : 1) - day;
    return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff));
  }
  return dateStr;
}
// Returns null if this period was already logged (nothing to do), otherwise the new
// lastLoggedDate/streak to write back — streak continues only if the previous log was the
// immediately preceding period, otherwise it restarts at 1.
function nextWarChestLog(wc, todayStr) {
  const todayKey = warChestPeriodKey(wc.cadence, todayStr);
  const lastKey = wc.lastLoggedDate ? warChestPeriodKey(wc.cadence, wc.lastLoggedDate) : null;
  if (lastKey === todayKey) return null;
  const back = wc.cadence === "weekly" ? 7 : 1;
  const d = new Date(todayKey + "T00:00:00"); d.setDate(d.getDate() - back);
  const expectedPrevKey = localDay(d);
  return { lastLoggedDate: todayStr, streak: lastKey === expectedPrevKey ? (+wc.streak || 0) + 1 : 1 };
}
function buildUpiLink(vpa, amount, note) {
  return `upi://pay?pa=${encodeURIComponent(vpa)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note || "War chest")}`;
}

/* Is this debt past its due day with nothing paid since that due date? daysUntil() alone can't
   answer this — once the day passes it just rolls forward to next month, which quietly hides
   a missed payment instead of flagging it. */
function overdueInfo(o, payments) {
  if (!o.dueDay || o.status === "closed" || o.status === "settled" || !(+o.monthly > 0)) return { overdue: false };
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
    .map(o => ({ id: o.id, name: o.name, type: o.type, balance: +o.outstanding || 0, apr: +o.apr || 0, minPay: +o.monthly || 0, priority: o.priority ?? null }));
  if (open.length === 0) return { order: [], months: 0, totalInterest: 0, debtFreeDate: new Date(), insufficient: false };
  // Anything you've manually pinned goes to the front, in the order you pinned it — avalanche/
  // snowball only decides the order for whatever's left. Interest-rate math can't know that a
  // particular family loan matters more to you than the APR says it should; this is how you tell it.
  const pinned = open.filter(o => o.priority != null).sort((a, b) => a.priority - b.priority);
  const unpinned = open.filter(o => o.priority == null).sort((a, b) => strategy === "avalanche" ? b.apr - a.apr : a.balance - b.balance);
  const rank = [...pinned, ...unpinned];
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

export default function Clearing({ userId }) {
  const [tab, setTab] = useState("home");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [accounts, setAccountsRaw] = useState([]);
  // Wraps every account update so a physical-cash account (accounts marked isCash) never shows a
  // negative balance — you can't actually hold less than zero rupees. Bank/digital accounts are
  // left alone, since going briefly negative there is often legitimate (expense logged before
  // income lands, overdraft, timing). This floors the *displayed number*, it doesn't explain where
  // the mismatch came from — that's what "correct to actual" on the Accounts tab is for.
  const setAccounts = (updater) => {
    setAccountsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next.map(a => (a.isCash && (+a.balance || 0) < 0) ? { ...a, balance: 0 } : a);
    });
  };
  const [oblig, setOblig] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [celebrate, setCelebrate] = useState(null);
  const [settings, setSettings] = useState({ buffer: 0, budget: 0 });
  const [notif, setNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  // Loads the saved blob before anything is allowed to render or autosave. This distinguishes a
  // genuinely new user (no row yet, data === null, error === null) from an actual fetch failure
  // (network hiccup, RLS issue, etc). Treating both cases the same used to be a real data-loss bug:
  // any transient error on load would silently reset the UI to empty, and 600ms later the autosave
  // effect below would write that empty state back over the real saved data, erasing it for good.
  // Now a genuine error leaves `ready` false — nothing renders, nothing autosaves — until Retry succeeds.
  // ---- Sync with Supabase -------------------------------------------------------------------
  // The whole app state is one jsonb blob per user. Because every save replaces the whole blob,
  // a phone and a laptop used together used to overwrite each other: a device holding an older
  // copy would save it over newer data from the other device. To prevent that:
  //  * versionRef holds the updated_at of the copy this device last loaded/saved. Saves only
  //    succeed if the row still has that version (optimistic concurrency). If another device
  //    saved in between, the save is refused and we load the latest copy instead of clobbering it.
  //  * When the app comes back into view (tab switch, phone unlocked), it pulls the latest copy.
  //  * Pending edits are saved immediately when the app is hidden/closed, not after a delay.
  //  * Save failures are shown instead of silently ignored.
  const versionRef = useRef(null);        // updated_at of the copy we're based on (null = no row yet)
  const skipSaveRef = useRef(false);      // true while applying server data, so it isn't echoed back
  const dirtyRef = useRef(false);         // local edits not yet saved
  const savingRef = useRef(Promise.resolve());
  const latestRef = useRef(null);         // latest local data, for flushing outside React renders
  const [syncMsg, setSyncMsg] = useState(null); // { kind: "error" | "info", text }

  const applyRemote = (row) => {
    const d = (row && row.data) || {};
    versionRef.current = row ? row.updated_at : null;
    skipSaveRef.current = true;
    setAccounts(d.accounts || []); setOblig(d.oblig || []); setExpenses(d.expenses || []);
    setPayments(d.payments || []); setIncomes(d.incomes || []); setSettings(d.settings || { buffer: 0, budget: 0 });
  };
  const fetchRow = () => supabase.from("user_state").select("data, updated_at").eq("user_id", userId).maybeSingle();

  // Loads the saved blob before anything is allowed to render or autosave. This distinguishes a
  // genuinely new user (no row yet, data === null, error === null) from an actual fetch failure
  // (network hiccup, RLS issue, etc). Treating both cases the same used to be a real data-loss bug:
  // any transient error on load would silently reset the UI to empty, and 600ms later the autosave
  // effect below would write that empty state back over the real saved data, erasing it for good.
  // Now a genuine error leaves `ready` false — nothing renders, nothing autosaves — until Retry succeeds.
  useEffect(() => { (async () => {
    setLoadError(false);
    const { data, error } = await fetchRow();
    if (error) { setLoadError(true); return; }
    applyRemote(data);
    setReady(true);
  })(); }, [userId, loadAttempt]);

  const saveNow = () => {
    savingRef.current = savingRef.current.then(async () => {
      if (!dirtyRef.current || !latestRef.current) return;
      dirtyRef.current = false;
      const payload = latestRef.current;
      const now = new Date().toISOString();
      let res;
      if (versionRef.current) {
        res = await supabase.from("user_state").update({ data: payload, updated_at: now })
          .eq("user_id", userId).eq("updated_at", versionRef.current).select("updated_at");
      } else {
        res = await supabase.from("user_state").insert({ user_id: userId, data: payload, updated_at: now }).select("updated_at");
        if (res.error && res.error.code === "23505") res = { data: [], error: null }; // row appeared meanwhile → conflict
      }
      if (res.error) {
        dirtyRef.current = true;
        setSyncMsg({ kind: "error", text: "Couldn't save your last change. Check your connection — we'll keep trying." });
        return;
      }
      if (!res.data || res.data.length === 0) {
        // Another device saved since we loaded. Don't overwrite it — load the newer copy.
        const { data, error } = await fetchRow();
        if (error) { dirtyRef.current = true; setSyncMsg({ kind: "error", text: "Couldn't sync. Check your connection — we'll keep trying." }); return; }
        applyRemote(data);
        setSyncMsg({ kind: "info", text: "This was updated on another device, so we loaded the latest version. Your last change here wasn't saved — please redo it." });
        return;
      }
      versionRef.current = res.data[0].updated_at;
      setSyncMsg(m => (m && m.kind === "error") ? null : m);
    });
    return savingRef.current;
  };

  useEffect(() => {
    if (!ready) return;
    latestRef.current = { accounts, oblig, expenses, payments, incomes, settings };
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    dirtyRef.current = true;
    const t = setTimeout(saveNow, 600);
    return () => clearTimeout(t);
  }, [accounts, oblig, expenses, payments, incomes, settings, ready, userId]);

  // Retry failed saves every few seconds.
  useEffect(() => {
    if (!syncMsg || syncMsg.kind !== "error") return;
    const t = setInterval(() => { if (dirtyRef.current) saveNow(); }, 5000);
    return () => clearInterval(t);
  }, [syncMsg]);

  // Pull the latest copy when the app comes back into view; save pending edits when it's hidden.
  useEffect(() => {
    if (!ready) return;
    const refresh = async () => {
      await savingRef.current;
      if (dirtyRef.current) return; // unsaved edits here — let the save (and its conflict check) run first
      const { data, error } = await fetchRow();
      if (error || dirtyRef.current) return;
      if ((data ? data.updated_at : null) !== versionRef.current) applyRemote(data);
    };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); else if (dirtyRef.current) saveNow(); };
    const onHide = () => { if (dirtyRef.current) saveNow(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pagehide", onHide);
    };
  }, [ready, userId]);
  useEffect(() => { if (!celebrate) return; const t = setTimeout(() => setCelebrate(null), 4000); return () => clearTimeout(t); }, [celebrate]);

  useEffect(() => {
    if (!ready || notif !== "granted") return;
    (async () => {
      const today = new Date().toDateString();
      if (localStorage.getItem("clr2:lastNotify") === today) return;
      const soon = oblig.filter(o => o.status !== "closed" && o.status !== "settled" && daysUntil(o.dueDay) !== null && daysUntil(o.dueDay) <= REMIND_DAYS && +o.monthly > 0);
      soon.forEach(o => { const n = daysUntil(o.dueDay); try { new Notification("Due " + (n === 0 ? "today" : "in " + n + "d") + " · " + o.name, { body: inr(o.monthly) }); } catch {} });
      if (soon.length) localStorage.setItem("clr2:lastNotify", today);
    })();
  }, [ready, notif, oblig]);

  // Shared by Quick add and the Accounts tab so an entry always updates the account balance too.
  const logExpense = ({ amount, cat, note, date, accountId }) => {
    setExpenses(x => [...x, { id: crypto.randomUUID(), amount, cat, note: note || "", date: date || localDay(), accountId: accountId || "" }]);
    if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) - amount } : a));
    if (accountId && accountId !== settings.lastAccountId) setSettings(s => ({ ...s, lastAccountId: accountId }));
  };
  const logIncome = ({ amount, source, note, date, accountId }) => {
    setIncomes(x => [...x, { id: crypto.randomUUID(), amount, source: source || "Other", note: note || "", date: date || localDay(), accountId: accountId || "" }]);
    if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) + amount } : a));
  };
  const [quickAdd, setQuickAdd] = useState(false);
  const [logDate, setLogDate] = useState(null); // non-null = Money Log snapshot open for that day
  const snapshotInput = useMemo(() => ({ expenses, payments, incomes, oblig, sourceLabel: incomeSourceLabel, budget: settings.budget }), [expenses, payments, incomes, oblig, settings.budget]);
  const firstEntryDate = useMemo(() => [...expenses, ...incomes, ...payments].map(x => x.date).filter(Boolean).sort()[0] || localDay(), [expenses, incomes, payments]);
  // Day numbers count posts, not calendar days: the next post is your last posted day + 1, so a
  // missed day doesn't break the sequence. Before the first post, it counts from your first entry.
  const logPosts = settings.logPosts || {};
  const suggestedDay = (d) => {
    const before = Object.keys(logPosts).filter(k => k < d).sort();
    if (before.length) return (+logPosts[before[before.length - 1]].day || 0) + 1;
    return Math.max(1, Math.round((new Date(d + "T00:00:00") - new Date(firstEntryDate + "T00:00:00")) / 86400000) + 1);
  };
  const todayKey = localDay();
  const postedToday = logPosts[todayKey];
  // Posting streak: consecutive calendar days with a post, ending today (or yesterday, if today isn't posted yet).
  const postStreak = (() => {
    let n = 0; const d = new Date(); if (!postedToday) d.setDate(d.getDate() - 1);
    while (logPosts[localDay(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  })();

  const moneyInHand = accounts.reduce((s, a) => s + (+a.balance || 0), 0);
  const openOblig = oblig.filter(o => o.status !== "closed" && o.status !== "settled");
  const dueSoon = openOblig
    .map(o => ({ ...o, in: daysUntil(o.dueDay), ...overdueInfo(o, payments) }))
    .filter(o => +o.monthly > 0 && (o.overdue || (o.in !== null && o.in <= REMIND_DAYS)))
    .sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || a.in - b.in);
  const setAside = dueSoon.reduce((s, o) => s + (+o.monthly || 0), 0);
  const safeToSpend = moneyInHand - setAside - (+settings.buffer || 0);
  const monthKey = localMonth();
  const monthExp = expenses.filter(e => e.date.slice(0, 7) === monthKey);
  const monthSpend = monthExp.reduce((s, e) => s + (+e.amount || 0), 0);

  const debtStrategy = settings.payoffStrategy || "avalanche";
  const debtExtra = +settings.extraMonthly || 0;
  const debtPlan = useMemo(() => buildPayoffPlan(oblig, debtExtra, debtStrategy), [oblig, debtExtra, debtStrategy]);

  // "Money freed" only means something once the highest-risk debt is actually handled — surfacing
  // it while payday loans are still open would read as permission to relax before it's safe to.
  // Once that's true, what used to go to those minimum payments is suggested toward family/friends
  // first, since those carry relationship weight that a pure interest-rate strategy ignores.
  const openPayday = oblig.filter(o => o.type === "payday" && o.status !== "closed" && o.status !== "settled");
  const paydayUnderControl = openPayday.length === 0;
  const freedMonthly = oblig.filter(o => o.status === "closed" || o.status === "settled").reduce((s, o) => s + (+o.monthly || 0), 0);
  const openFamily = oblig.filter(o => o.type === "family" && o.status !== "closed" && o.status !== "settled");

  async function askNotif() { if (typeof Notification !== "undefined") setNotif(await Notification.requestPermission()); }

  // Logs one war-chest contribution: moves the target amount from the source account into the
  // war-chest account and advances the streak. This never touches a real bank — it's the same
  // honor-system logging as the rest of the app; actually sending the money (by hand, or via the
  // optional UPI deep link) is still on the person, this just keeps score.
  function logWarChest(accountId) {
    const today = localDay();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc || !acc.warChest?.on) return;
    const step = nextWarChestLog(acc.warChest, today);
    if (!step) return; // already logged this period
    const amt = +acc.warChest.target || 0;
    setAccounts(list => list.map(a => {
      if (a.id === accountId) return { ...a, balance: (+a.balance || 0) + amt, warChest: { ...a.warChest, ...step } };
      if (a.id === acc.warChest.fromAccountId) return { ...a, balance: (+a.balance || 0) - amt };
      return a;
    }));
    setCelebrate(step.streak > 1 ? `₹${amt} into your war chest — ${step.streak} in a row.` : `₹${amt} into your war chest.`);
  }

  // One-tap version of "pin every open family/friend debt to the top" — what the money-freed
  // card offers once payday loans are out of the way. Smallest balance first among them, so the
  // first relationship gets cleared fastest; strategy still decides everything else beneath them.
  function prioritizeFamily() {
    setOblig(x => {
      const openFam = x.filter(o => o.type === "family" && o.status !== "closed" && o.status !== "settled")
        .sort((a, b) => (+a.outstanding || 0) - (+b.outstanding || 0));
      if (openFam.length === 0) return x;
      const minP = Math.min(0, ...x.map(o => o.priority ?? 0));
      const order = openFam.map(o => o.id);
      return x.map(o => {
        const idx = order.indexOf(o.id);
        return idx === -1 ? o : { ...o, priority: minP - openFam.length + idx };
      });
    });
    setCelebrate("Family & friends moved to the top of the attack order.");
  }

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
  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: C.bg, fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ background: C.surface, border: "1px solid " + C.line, borderRadius: 16, padding: 24, maxWidth: 360, textAlign: "center" }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: C.text }}>Couldn't load your data</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Nothing has been changed or lost — we just couldn't reach your saved data this time. Check your connection and try again.</div>
          <button className="btn" onClick={() => setLoadAttempt(n => n + 1)} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      </div>
    );
  }
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

      {syncMsg && (
        <div className="card" style={{ marginBottom: 14, borderColor: syncMsg.kind === "error" ? C.coral : C.line, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1, fontSize: 13 }}>{syncMsg.text}</div>
          <button className="ib" onClick={() => setSyncMsg(null)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}
      {tab === "home" && (
        <button className="btn ghost" onClick={() => setLogDate(localDay())} style={{ width: "100%", marginBottom: 14, flexDirection: "column", gap: 2 }}>
          <span className="row" style={{ gap: 6 }}><Camera size={16} /> {postedToday ? `Day ${postedToday.day} posted ✓` : `Today's Money Log · Day ${suggestedDay(todayKey)}`}</span>
          <span style={{ fontSize: 11.5, fontWeight: 500, opacity: .75 }}>{postedToday ? "Tap to re-share or make the month wrap-up" : "Not posted yet — tap to make and share it"}{postStreak > 1 ? ` · ${postStreak}-day streak` : ""}</span>
        </button>
      )}
      {tab === "home" && <Home {...{ moneyInHand, setAside, safeToSpend, settings, setSettings, dueSoon, monthSpend, debtPlan, accounts, logWarChest, freedMonthly, paydayUnderControl, openFamily, setTab, prioritizeFamily }} />}
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
      {tab === "accounts" && <Accounts {...{ accounts, setAccounts, moneyInHand, setExpenses, incomes, logIncome, settings, setSettings }} />}
      {tab === "activity" && <Activity {...{ expenses, payments, incomes, oblig, accounts }} />}
      {tab === "spending" && <Spending {...{ expenses, setExpenses, accounts, setAccounts, settings, setSettings, monthExp, monthSpend, payments, oblig }} />}
      {tab === "clear" && <Clear {...{ oblig, setOblig, accounts, setAccounts, payments, setPayments, onCelebrate: setCelebrate, settings, setSettings, safeToSpend }} />}

      {celebrate && (
        <div className="toast"><Heart size={18} fill="#fff" /><span>{celebrate}</span></div>
      )}

      {!quickAdd && !logDate && (
        <button onClick={() => setQuickAdd(true)} aria-label="Quick add"
          style={{ position: "fixed", right: "max(16px, calc(50vw - 244px))", bottom: 86, width: 58, height: 58, borderRadius: 99, border: "none", background: C.primary, color: "#fff", boxShadow: "0 6px 18px rgba(4,27,60,.28)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 40 }}>
          <Plus size={28} />
        </button>
      )}
      {quickAdd && <QuickAdd {...{ accounts, expenses, settings, logExpense, logIncome }} onClose={(m) => { setQuickAdd(false); if (m) setCelebrate(m); }} />}
      {logDate && (
        <MoneyLogModal date={logDate} onDateChange={setLogDate} snapshotInput={snapshotInput} suggestedDay={suggestedDay(logDate)}
          posts={logPosts} customQuotes={settings.quotes || []}
          onAddQuote={(q) => setSettings(s => ({ ...s, quotes: [...(s.quotes || []), q] }))}
          onPosted={(d, rec) => setSettings(s => ({ ...s, logPosts: { ...(s.logPosts || {}), [d]: rec } }))}
          reminder={settings.logReminder} onReminder={(on) => setSettings(s => ({ ...s, logReminder: on }))}
          onClose={() => setLogDate(null)} />
      )}
      <div className="tabbar">
        {[["home", "Home", Wallet], ["accounts", "Accounts", Landmark], ["activity", "Activity", ArrowDownUp], ["spending", "Spending", PiggyBank], ["clear", "Clear", Users]]
          .map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>
          ))}
      </div>
    </div>
  );
}

function Home({ moneyInHand, setAside, safeToSpend, settings, setSettings, dueSoon, monthSpend, debtPlan, accounts, logWarChest, freedMonthly, paydayUnderControl, openFamily, setTab, prioritizeFamily }) {
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
      {(() => {
        const wcAccount = accounts.find(a => a.warChest?.on);
        if (!wcAccount) return null;
        const wc = wcAccount.warChest;
        const today = localDay();
        const alreadyLogged = !nextWarChestLog(wc, today);
        const upiLink = wc.vpa ? buildUpiLink(wc.vpa, wc.target, "War chest") : null;
        return (
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="lbl" style={{ margin: 0 }}>War chest — {wcAccount.name}</div>
              {wc.streak > 1 && <span className="chip" style={{ background: C.violet, color: "#fff" }}>{wc.streak} {wc.cadence === "weekly" ? "weeks" : "days"} running</span>}
            </div>
            <div className="num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{inr(wcAccount.balance)}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>saved toward friends & family so far</div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              {upiLink && !alreadyLogged && (
                <a href={upiLink} style={{ textDecoration: "none", flex: 1 }}>
                  <div className="btn ghost" style={{ justifyContent: "center" }}>Send ₹{wc.target} via UPI</div>
                </a>
              )}
              <button className="btn" disabled={alreadyLogged} onClick={() => logWarChest(wcAccount.id)}
                style={{ flex: 1, justifyContent: "center", opacity: alreadyLogged ? 0.5 : 1, background: C.violet }}>
                {alreadyLogged ? "✓ logged this " + (wc.cadence === "weekly" ? "week" : "day") : `Log today's ₹${wc.target}`}
              </button>
            </div>
            {(+wcAccount.balance || 0) > 0 && (
              <button className="btn ghost" onClick={() => setTab("clear")} style={{ marginTop: 8, width: "100%", justifyContent: "center", fontSize: 12 }}>Apply it to a debt →</button>
            )}
          </div>
        );
      })()}
      {paydayUnderControl && freedMonthly > 0 && (
        <div className="card" style={{ border: "1px solid " + C.teal }}>
          <div className="lbl">Money freed up each month</div>
          <div className="num" style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: C.teal }}>{inr(freedMonthly)}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            No payday loans left open — the monthly payments that used to go to them are free now.
            {openFamily.length > 0 ? " Worth putting toward family & friends next." : ""}
          </div>
          {openFamily.length > 0 && (
            <button className="btn ghost" onClick={() => { prioritizeFamily(); setTab("clear"); }} style={{ marginTop: 10, fontSize: 12 }}>Prioritize family & friends now →</button>
          )}
        </div>
      )}
      <div className="card" style={{ background: C.surface2 }}>
        <div className="lbl">Safe to spend right now</div>
        {!settings.seenSafeToSpendIntro && (
          <div style={{ marginTop: 8, marginBottom: 4, background: C.surface, border: "1px solid " + C.line, borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>What this number means</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
              This is what's left after everything due in the next {REMIND_DAYS} days — not just your balance. If it's negative, it means your upcoming dues are bigger than what you have right now. That's common when you're juggling multiple loans, and it's exactly why this exists — so you can see it clearly and plan, not be surprised by it.
            </div>
            <button className="btn" onClick={() => setSettings(s => ({ ...s, seenSafeToSpendIntro: true }))} style={{ marginTop: 10, padding: "7px 14px", fontSize: 13 }}>Got it</button>
          </div>
        )}
        <div className="num" style={{ fontSize: 42, fontWeight: 700, color: safeToSpend >= 0 ? C.teal : C.coral, lineHeight: 1.1 }}>
          {safeToSpend >= 0 ? inr(safeToSpend) : "−" + inr(Math.abs(safeToSpend))}
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>Based on money in hand vs. what's due in the next {REMIND_DAYS} days</div>
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

function Accounts({ accounts, setAccounts, moneyInHand, setExpenses, incomes, logIncome, settings, setSettings }) {
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [income, setIncome] = useState(false);
  const [reconc, setReconc] = useState(null);
  const seed = () => setAccounts(SEED_ACCOUNTS.map(a => ({ ...a, id: crypto.randomUUID(), balance: 0 })));
  const addIncome = (entry) => { logIncome(entry); setIncome(false); };
  const monthKey = localMonth();
  const monthIn = (incomes || []).filter(i => (i.date || "").slice(0, 7) === monthKey);
  const inBySource = Object.entries(monthIn.reduce((m, i) => { const k = incomeSourceLabel(i); m[k] = (m[k] || 0) + (+i.amount || 0); return m; }, {}))
    .map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value)
    .map((x, i) => ({ ...x, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  const inTotal = inBySource.reduce((s, x) => s + x.value, 0);
  function reconcile(id, actual) {
    const acc = accounts.find(a => a.id === id); const diff = (+acc.balance || 0) - actual;
    if (diff > 0) setExpenses(x => [...x, { id: crypto.randomUUID(), amount: diff, cat: "Other", date: localDay(), accountId: id, note: "cash correction" }]);
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
        <div className="card"><div style={{ fontWeight: 600, marginBottom: 6 }}>Add your first account</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Add each real place you hold money — your bank account, your wallet cash, whatever else. One is enough to get started; split into more only if you want per-account accuracy.</div>
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
        <div className="foot" style={{ marginTop: 8 }}>These three groups are optional — just so you can see at a glance where money sits. Tagging an account below doesn't change anything except which one gets pre-picked in a few forms.</div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={() => setIncome(true)} style={{ flex: 1 }}><Plus size={16} /> Add income</button>
        {accounts.length >= 2 && <button className="btn ghost" onClick={() => setMoving(true)} style={{ flex: 1 }}><ArrowRightLeft size={16} /> Move money</button>}
        <button className="btn ghost" onClick={() => setAdding(true)} style={{ flex: 1 }}><Plus size={16} /> Account</button>
      </div>
      {income && <IncomeForm accounts={accounts} onAdd={addIncome} onCancel={() => setIncome(false)} />}
      <div className="card">
        <div className="lbl">Money in this month</div>
        <div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{inr(inTotal)}</div>
        {inBySource.length > 0 ? (
          <div className="row" style={{ gap: 14, marginTop: 10, alignItems: "center" }}>
            <PieChart slices={inBySource} size={96} />
            <ChartLegend items={inBySource} />
          </div>
        ) : <Empty>Nothing logged in yet this month. Use "Add income" for salary, reimbursements, side income and anything else that comes in.</Empty>}
        {monthIn.some(i => !i.source) && <div className="foot" style={{ marginTop: 8 }}>"Untagged" is income logged before sources existed.</div>}
      </div>
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
          <button className="chip" onClick={() => upd(a.id, { isCash: !a.isCash })} style={{ marginTop: 8, background: "transparent", border: "1px solid " + (a.isCash ? C.teal : C.line), color: a.isCash ? C.teal : C.muted, cursor: "pointer" }}>
            {a.isCash ? "✓ physical cash" : "mark as physical cash"}
          </button>
          {a.isCash && <div className="foot" style={{ marginTop: 4 }}>Never shown below ₹0 — you can't hold negative cash. If it keeps hitting zero, use "correct to actual" below to reset it to what's really in your wallet.</div>}
          <button className="chip" onClick={() => upd(a.id, { warChest: a.warChest?.on ? { ...a.warChest, on: false } : { target: 10, cadence: "daily", vpa: "", fromAccountId: accounts.find(x => x.id !== a.id)?.id || "", streak: 0, lastLoggedDate: "", ...(a.warChest || {}), on: true } })}
            style={{ marginTop: 6, background: "transparent", border: "1px solid " + (a.warChest?.on ? C.violet : C.line), color: a.warChest?.on ? C.violet : C.muted, cursor: "pointer" }}>
            {a.warChest?.on ? "✓ war chest" : "use as war chest"}
          </button>
          {a.warChest?.on && (
            <div style={{ marginTop: 8, background: C.surface2, borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
              <div className="foot">Small, steady amounts you set aside here to put toward friends & family debt later. This only tracks the number — actually moving the money each day/week is on you, same as everything else in this app.</div>
              <div className="row" style={{ gap: 8 }}>
                <div style={{ flex: 1 }}><span className="lbl" style={{ marginBottom: 2 }}>Amount</span>
                  <input className="in num" style={{ padding: "6px 8px", fontSize: 13 }} type="number" placeholder="10" value={a.warChest.target || ""} onChange={e => upd(a.id, { warChest: { ...a.warChest, target: +e.target.value } })} /></div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn ghost" onClick={() => upd(a.id, { warChest: { ...a.warChest, cadence: "daily" } })} style={{ padding: "6px 10px", fontSize: 12, borderColor: a.warChest.cadence === "daily" ? C.violet : C.line, color: a.warChest.cadence === "daily" ? C.violet : C.muted }}>per day</button>
                  <button className="btn ghost" onClick={() => upd(a.id, { warChest: { ...a.warChest, cadence: "weekly" } })} style={{ padding: "6px 10px", fontSize: 12, borderColor: a.warChest.cadence === "weekly" ? C.violet : C.line, color: a.warChest.cadence === "weekly" ? C.violet : C.muted }}>per week</button>
                </div>
              </div>
              {accounts.length > 1 && (
                <select className="in" style={{ padding: "6px 8px", fontSize: 13 }} value={a.warChest.fromAccountId || ""} onChange={e => upd(a.id, { warChest: { ...a.warChest, fromAccountId: e.target.value } })}>
                  <option value="">Move from… (which account this comes out of)</option>
                  {accounts.filter(x => x.id !== a.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
              <input className="in" style={{ padding: "6px 8px", fontSize: 13 }} placeholder="Your UPI ID for this account (optional — lets Home open a pre-filled transfer)" value={a.warChest.vpa || ""} onChange={e => upd(a.id, { warChest: { ...a.warChest, vpa: e.target.value } })} />
            </div>
          )}
          {reconc === a.id && <ReconcileForm current={+a.balance || 0} onSave={(actual) => reconcile(a.id, actual)} onCancel={() => setReconc(null)} />}
        </div>
      ))}
      <div className="foot" style={{ marginTop: 2 }}>Cash leaks when you forget to log it. Once in a while, count what's really in your wallet and hit "correct to actual" — the difference is booked as spending so your numbers stay honest. Record an ATM withdrawal with "Move money" (bank to cash), not as an expense.</div>
    </div>
  );
}
function IncomeForm({ accounts, onAdd, onCancel }) {
  const [acc, setAcc] = useState(accounts.find(a => a.purpose === "income")?.id || accounts[0]?.id || "");
  const [amt, setAmt] = useState("");
  const [source, setSource] = useState("Salary");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(localDay());
  const finalSource = source === "Other" ? (custom.trim() || "Other") : source;
  const ok = +amt > 0;
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><div style={{ fontWeight: 600 }}>Add income</div><button className="ib" onClick={onCancel}><X size={18} /></button></div>
      <input className="in num" type="number" inputMode="decimal" placeholder="Amount received" value={amt} onChange={e => setAmt(e.target.value)} autoFocus />
      <SourcePicker source={source} setSource={setSource} custom={custom} setCustom={setCustom} />
      <input className="in" placeholder="Note (optional) — e.g. Sept salary, cab reimbursement" value={note} onChange={e => setNote(e.target.value)} />
      <div className="row" style={{ gap: 8 }}>
        <select className="in" style={{ flex: 1 }} value={acc} onChange={e => setAcc(e.target.value)}>
          <option value="">No account</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {inr(a.balance)}</option>)}
        </select>
        <input className="in" type="date" style={{ flex: 1 }} value={date} onChange={e => setDate(e.target.value || localDay())} />
      </div>
      <button className="btn" disabled={!ok} onClick={() => onAdd({ accountId: acc, amount: +amt, source: finalSource, note: note.trim(), date })} style={{ opacity: ok ? 1 : 0.5 }}>Add income</button>
    </div>
  );
}
function SourcePicker({ source, setSource, custom, setCustom }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {INCOME_SOURCES.map(x => (
          <button key={x} className="chip" onClick={() => setSource(x)}
            style={{ cursor: "pointer", background: source === x ? C.teal : "transparent", color: source === x ? "#fff" : C.muted, border: "1px solid " + (source === x ? C.teal : C.line) }}>{x}</button>
        ))}
      </div>
      {source === "Other" && <input className="in" placeholder="Where's it from? (e.g. Sold old phone)" value={custom} onChange={e => setCustom(e.target.value)} />}
    </div>
  );
}
// One-tap logging from any tab: a big amount field, recent categories first, and the account you
// used last time already picked — so logging a spend on the go takes a few seconds.
function QuickAdd({ accounts, expenses, settings, logExpense, logIncome, onClose }) {
  const [mode, setMode] = useState("out");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(localDay());
  const allCats = settings.categories && settings.categories.length ? settings.categories : EXP_CATS;
  const recent = [...new Set([...(expenses || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(e => e.cat).filter(Boolean))];
  const cats = [...new Set([...recent.filter(c => allCats.includes(c)).slice(0, 4), ...allCats])];
  const [cat, setCat] = useState(cats[0] || "Other");
  const [source, setSource] = useState("Salary");
  const [custom, setCustom] = useState("");
  const [acc, setAcc] = useState(settings.lastAccountId && accounts.some(a => a.id === settings.lastAccountId) ? settings.lastAccountId : (accounts.find(a => a.purpose === "living")?.id || accounts[0]?.id || ""));
  const [inAcc, setInAcc] = useState(accounts.find(a => a.purpose === "income")?.id || accounts[0]?.id || "");
  const yesterday = localDay(new Date(Date.now() - 86400000));
  const ok = +amt > 0;
  function save() {
    if (!ok) return;
    if (mode === "out") logExpense({ amount: +amt, cat, note: note.trim(), date, accountId: acc });
    else logIncome({ amount: +amt, source: source === "Other" ? (custom.trim() || "Other") : source, note: note.trim(), date, accountId: inAcc });
    onClose(mode === "out" ? `Logged ${inr(+amt)} · ${cat}` : `Logged ${inr(+amt)} in · ${source === "Other" ? (custom.trim() || "Other") : source}`);
  }
  const tabBtn = (id, label, color) => (
    <button className="btn ghost" onClick={() => setMode(id)} style={{ flex: 1, borderColor: mode === id ? color : C.line, color: mode === id ? color : C.muted, fontWeight: 700 }}>{label}</button>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,28,40,.45)", zIndex: 55, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => onClose()}>
      <div className="card" style={{ width: "100%", maxWidth: 520, borderRadius: "18px 18px 0 0", display: "grid", gap: 12, paddingBottom: 28 }} onClick={e => e.stopPropagation()}>
        <div className="row" style={{ gap: 8 }}>
          {tabBtn("out", "Spent", C.coral)}{tabBtn("in", "Received", C.teal)}
          <button className="ib" onClick={() => onClose()} aria-label="Close"><X size={20} /></button>
        </div>
        <input className="in num" type="number" inputMode="decimal" placeholder="₹ 0" value={amt} onChange={e => setAmt(e.target.value)} autoFocus
          onKeyDown={e => { if (e.key === "Enter") save(); }} style={{ fontSize: 30, fontWeight: 700, textAlign: "center", padding: "14px" }} />
        {mode === "out" ? (
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {cats.map(c => (
              <button key={c} className="chip" onClick={() => setCat(c)}
                style={{ cursor: "pointer", padding: "7px 12px", fontSize: 13, background: cat === c ? C.primary : "transparent", color: cat === c ? "#fff" : C.muted, border: "1px solid " + (cat === c ? C.primary : C.line) }}>{c}</button>
            ))}
          </div>
        ) : <SourcePicker source={source} setSource={setSource} custom={custom} setCustom={setCustom} />}
        <input className="in" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }} />
        <div className="row" style={{ gap: 8 }}>
          {accounts.length > 0 && (
            <select className="in" style={{ flex: 1 }} value={mode === "out" ? acc : inAcc} onChange={e => (mode === "out" ? setAcc : setInAcc)(e.target.value)}>
              <option value="">No account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button className="chip" onClick={() => setDate(date === yesterday ? localDay() : yesterday)}
            style={{ cursor: "pointer", padding: "9px 12px", background: "transparent", border: "1px solid " + C.line, color: C.muted, whiteSpace: "nowrap" }}>
            {date === localDay() ? "Today" : date === yesterday ? "Yesterday" : date} ⇄
          </button>
        </div>
        <button className="btn" disabled={!ok} onClick={save} style={{ opacity: ok ? 1 : 0.5, padding: 14, fontSize: 16 }}>{mode === "out" ? "Log spend" : "Log income"}</button>
      </div>
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

function Spending({ expenses, setExpenses, accounts, setAccounts, settings, setSettings, monthExp, monthSpend, payments, oblig }) {
  const [f, setF] = useState({ amount: "", cat: "Food", custom: "", note: "", date: localDay(), accountId: "" });
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [editingCats, setEditingCats] = useState(false);
  const [chartPeriod, setChartPeriod] = useState("month");
  const list = [...monthExp].sort((a, b) => b.date.localeCompare(a.date));
  const over = settings.budget > 0 && monthSpend > settings.budget;
  const categoryOptions = settings.categories && settings.categories.length ? settings.categories : EXP_CATS;
  const monthKey = localMonth();
  // Loan/debt repayments live in `payments`, not `expenses` — folded in here as one more slice
  // ("Loan repayments") so the category breakdown gives the full picture of where money went, not
  // just discretionary spending. The monthly budget total above stays expenses-only on purpose,
  // since "budget" is about discretionary spending, not debt payoff.
  const monthPaid = (payments || []).filter(p => p.date.slice(0, 7) === monthKey).reduce((s, p) => s + (+p.amount || 0), 0);
  const cats = [...new Set(monthExp.map(e => e.cat).filter(Boolean))];
  const byCat = [
    ...cats.map(c => ({ c, total: monthExp.filter(e => e.cat === c).reduce((s, e) => s + (+e.amount || 0), 0) })),
    ...(monthPaid > 0 ? [{ c: "Loan repayments", total: monthPaid, isLoan: true }] : []),
  ].filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const maxCat = byCat[0]?.total || 1;
  const periodExpenses = expenses.filter(e => inPeriod(e.date, chartPeriod));
  const periodPaid = (payments || []).filter(p => inPeriod(p.date, chartPeriod)).reduce((s, p) => s + (+p.amount || 0), 0);
  const periodTotal = periodExpenses.reduce((s, e) => s + (+e.amount || 0), 0) + periodPaid;
  const periodByCat = [
    ...[...new Set(periodExpenses.map(e => e.cat).filter(Boolean))].map(c => ({ c, total: periodExpenses.filter(e => e.cat === c).reduce((s, e) => s + (+e.amount || 0), 0) })),
    ...(periodPaid > 0 ? [{ c: "Loan repayments", total: periodPaid, isLoan: true }] : []),
  ].filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const colorFor = (x, i) => x.isLoan ? C.violet : CHART_PALETTE[i % CHART_PALETTE.length];
  const now = new Date();
  const lastMonthKey = localMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthSpend = expenses.filter(e => e.date.slice(0, 7) === lastMonthKey).reduce((s, e) => s + (+e.amount || 0), 0);
  const trendPct = lastMonthSpend > 0 ? Math.round(((monthSpend - lastMonthSpend) / lastMonthSpend) * 100) : null;
  function add() {
    if (!f.amount) return;
    const cat = (f.cat === "Other" && f.custom.trim()) ? f.custom.trim() : f.cat;
    setExpenses(x => [...x, { amount: +f.amount, cat, date: f.date, accountId: f.accountId, note: f.note.trim(), id: crypto.randomUUID() }]);
    if (f.accountId) setAccounts(x => x.map(a => a.id === f.accountId ? { ...a, balance: (+a.balance || 0) - +f.amount } : a));
    setF({ ...f, amount: "", custom: "", note: "" });
  }
  // One CSV per month: every expense plus every loan repayment in monthKey, so the whole month's
  // outflow can be kept outside the app (backup, tax records, sharing with someone helping you).
  function downloadMonth() {
    const rows = [["Date", "Type", "Category / Debt", "Amount", "Note"]];
    [...monthExp].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => rows.push([e.date, "Expense", e.cat, e.amount, e.note || ""]));
    (payments || []).filter(p => p.date.slice(0, 7) === monthKey).sort((a, b) => a.date.localeCompare(b.date)).forEach(p => {
      const debtName = (oblig || []).find(o => o.id === p.obligId)?.name || "Debt";
      rows.push([p.date, "Loan repayment", debtName, p.amount, p.note || ""]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `clearing-${monthKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  // Deletes an expense and, if it had been deducted from an account, adds that amount back —
  // otherwise money-in-hand would stay permanently understated after removing a mistaken entry.
  const rm = (id) => {
    const e = expenses.find(x => x.id === id);
    setExpenses(x => x.filter(x => x.id !== id));
    if (e && e.accountId) setAccounts(x => x.map(a => a.id === e.accountId ? { ...a, balance: (+a.balance || 0) + (+e.amount || 0) } : a));
  };
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
        <input className="in" placeholder="What exactly was this? (optional — e.g. Swiggy order, so you remember later)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
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
              slices={periodByCat.map((x, i) => ({ label: x.c, value: x.total, color: colorFor(x, i) }))}
            />
            <ChartLegend items={periodByCat.map((x, i) => ({ label: x.c, value: x.total, color: colorFor(x, i) }))} />
          </div>
        )}
        <div className="foot" style={{ marginTop: 8 }}>Includes loan/debt repayments alongside spending categories, so this is the full picture of where money went — not just discretionary spending.</div>
      </div>

      {byCat.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div className="lbl" style={{ margin: 0 }}>Where it went this month</div>
            <button className="btn ghost" onClick={downloadMonth} style={{ padding: "6px 10px", fontSize: 11 }}><Download size={12} /> Download CSV</button>
          </div>
          {byCat.map(({ c, total, isLoan }) => {
            const catBudget = isLoan ? 0 : (settings.catBudgets || {})[c] || 0;
            const catOver = catBudget > 0 && total > catBudget;
            return (
              <div key={c} style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: isLoan ? C.violet : C.text, fontWeight: isLoan ? 600 : 400 }}>{c}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="num" style={{ fontSize: 13, color: catOver ? C.coral : C.muted }}>{inr(total)}</span>
                    {!isLoan && <input className="in num" style={{ width: 60, padding: "2px 6px", fontSize: 11 }} type="number" placeholder="budget" value={catBudget || ""}
                      onChange={e => setSettings(s => ({ ...s, catBudgets: { ...(s.catBudgets || {}), [c]: +e.target.value } }))} />}
                  </div>
                </div>
                <div className="bar"><div className="fill" style={{ width: (total / maxCat) * 100 + "%", background: isLoan ? C.violet : (catOver ? C.coral : C.teal) }} /></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        {list.length === 0 ? <Empty>No spending logged this month yet.</Empty> :
          list.map(e => (<div key={e.id} className="li">
            <div><div style={{ fontSize: 14 }}>{e.cat}</div>
              <div style={{ fontSize: 12, color: C.faint }}>{e.date}{e.note ? " · " + e.note : ""}</div></div>
            <div className="row" style={{ gap: 8 }}><span className="num" style={{ fontWeight: 600 }}>{inr(e.amount)}</span>
              <button className="ib" onClick={() => rm(e.id)}><Trash2 size={15} /></button></div></div>))}
      </div>
    </div>
  );
}

function Clear({ oblig, setOblig, accounts, setAccounts, payments, setPayments, onCelebrate, settings, setSettings, safeToSpend }) {
  const [adding, setAdding] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [settleFor, setSettleFor] = useState(null);
  // Which single debt currently has its "Edit" panel open — everything past the basics (APR,
  // monthly/due day, loan origin, CIBIL/calls/credit-card toggles, and payment history) lives
  // behind this one toggle so the default list stays scannable.
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  // Which type-groups' cleared debts are expanded — closed/settled debts sink to the bottom of
  // their group and stay collapsed by default, so the default view is just what's still pending.
  const [showClosed, setShowClosed] = useState({});
  const [deltaExtra, setDeltaExtra] = useState(5000);
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
  // Same plan, with a bit more thrown at it each month — answers "what if I added ₹X more?"
  // without having to manually change the extra field and remember what the date used to be.
  const deltaPlan = useMemo(() => buildPayoffPlan(oblig, (+extra || 0) + (+deltaExtra || 0), strategy), [oblig, extra, deltaExtra, strategy]);
  const add = (o) =>{ setOblig(x => [...x, { ...o, id: crypto.randomUUID(), paid: 0, status: "open" }]); setAdding(false); };
  const upd = (id, p) => setOblig(x => x.map(o => o.id === id ? { ...o, ...p } : o));
  const rm = (id) => {
    setOblig(x => x.filter(o => o.id !== id));
    setPayments(x => x.filter(p => p.obligId !== id)); // drop this debt's payment history too, so it can't linger in "cleared" totals
  };
  function pay(id, amt, accountId, note) {
    const o = oblig.find(x => x.id === id);
    const closes = o && (+o.outstanding || 0) - amt <= 0;
    const today = localDay();
    setOblig(x => x.map(o => {
      if (o.id !== id) return o;
      const outstanding = Math.max(0, (+o.outstanding || 0) - amt);
      return { ...o, outstanding, paid: (+o.paid || 0) + amt, status: outstanding === 0 ? "closed" : o.status, closedAt: outstanding === 0 ? today : o.closedAt };
    }));
    setPayments(x => [...x, { id: crypto.randomUUID(), obligId: id, amount: amt, date: today, note: note || "", accountId: accountId || "" }]);
    if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) - amt } : a));
    onCelebrate(closes ? `Cleared ${o.name} in full. One less to carry.` : `Paid ${inr(amt)} off ${o.name}.`);
    setPayFor(null);
  }
  // Closes a debt via a negotiated payoff for less than what's owed — distinct from a normal
  // full payment. Keeps a record of what was actually paid vs. what was waived, since that's
  // often useful evidence (and worth celebrating) on its own.
  function settle(id, amt, accountId, note) {
    const o = oblig.find(x => x.id === id);
    if (!o) return;
    const waived = Math.max(0, (+o.outstanding || 0) - amt);
    const today = localDay();
    setOblig(x => x.map(o => o.id === id
      ? { ...o, outstanding: 0, paid: (+o.paid || 0) + amt, status: "settled", closedAt: today, settledAmount: amt, settledSavings: waived }
      : o));
    setPayments(x => [...x, { id: crypto.randomUUID(), obligId: id, amount: amt, date: today, note: note || "Settlement — closed for less than owed", accountId: accountId || "" }]);
    if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) - amt } : a));
    onCelebrate(waived > 0 ? `Settled ${o.name} for ${inr(amt)} — ${inr(waived)} waived.` : `Settled ${o.name}.`);
    setSettleFor(null);
  }
  // Undoes a single logged payment/settlement — for when one was added by mistake (wrong debt,
  // wrong amount, duplicate entry). Reverses everything it did: gives the amount back to the
  // debt's outstanding balance, reduces what's recorded as paid, restores the account balance it
  // was deducted from (if any), and reopens the debt if this payment was the one that closed or
  // settled it. Older payments made before this field existed won't have accountId set, so their
  // account balance can't be auto-restored — worth double-checking that account's balance by hand
  // if you delete one of those.
  function rmPayment(paymentId) {
    const p = payments.find(x => x.id === paymentId);
    if (!p) return;
    const amt = +p.amount || 0;
    setPayments(x => x.filter(x => x.id !== paymentId));
    setOblig(x => x.map(o => {
      if (o.id !== p.obligId) return o;
      const wasSettled = o.status === "settled" && o.settledAmount === p.amount;
      const wasClosedByThis = o.status === "closed" && (+o.outstanding || 0) === 0;
      if (wasSettled) {
        // Restore what was owed right before the settlement (settledAmount + what was waived).
        const restoredOutstanding = (+o.settledAmount || 0) + (+o.settledSavings || 0);
        const { settledAmount, settledSavings, closedAt, ...rest } = o;
        return { ...rest, status: "open", outstanding: restoredOutstanding, paid: Math.max(0, (+o.paid || 0) - amt) };
      }
      if (wasClosedByThis) {
        const { closedAt, ...rest } = o;
        return { ...rest, status: "open", outstanding: amt, paid: Math.max(0, (+o.paid || 0) - amt) };
      }
      return { ...o, outstanding: (+o.outstanding || 0) + amt, paid: Math.max(0, (+o.paid || 0) - amt) };
    }));
    if (p.accountId) setAccounts(x => x.map(a => a.id === p.accountId ? { ...a, balance: (+a.balance || 0) + amt } : a));
    onCelebrate("Payment removed — you can log it again if you re-add it correctly.");
  }
  // Pins a debt to the front of the attack order, ahead of whatever avalanche/snowball would pick.
  // Each tap goes to the very top of the pinned group — last pinned, first attacked.
  function prioritize(id) {
    setOblig(x => {
      const minP = Math.min(0, ...x.map(o => o.priority ?? 0));
      return x.map(o => o.id === id ? { ...o, priority: minP - 1 } : o);
    });
  }
  function unprioritize(id) {
    setOblig(x => x.map(o => o.id === id ? { ...o, priority: null } : o));
  }
  const groups = Object.keys(OTYPE).map(t => ({ t, items: oblig.filter(o => o.type === t) }));
  const q = search.trim().toLowerCase();
  const filteredGroups = q
    ? groups.map(g => ({ ...g, items: g.items.filter(o => (o.name || "").toLowerCase().includes(q) || (o.legalName || "").toLowerCase().includes(q)) }))
    : groups;
  // Closed/settled debts sink to the bottom of each group and stay collapsed behind a toggle —
  // the default Clear tab view should only show what's still actually pending.
  const searchedGroups = filteredGroups.map(g => ({
    ...g,
    open: g.items.filter(o => o.status !== "closed" && o.status !== "settled"),
    closed: g.items.filter(o => o.status === "closed" || o.status === "settled"),
  }));
  const noMatches = q && searchedGroups.every(g => g.items.length === 0);
  const owed = t => oblig.filter(o => o.type === t && o.status !== "closed").reduce((s, o) => s + (+o.outstanding || 0), 0);
  const totalOwed = owed("regulated") + owed("payday") + owed("family");
  const clearedAll = (payments || []).reduce((s, p) => s + (+p.amount || 0), 0);
  const grandTotal = totalOwed + clearedAll;
  const pctCleared = grandTotal > 0 ? (clearedAll / grandTotal) * 100 : 0;
  const closedCount = oblig.filter(o => o.status === "closed" || o.status === "settled").length;
  const monthKey = localMonth();
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

      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={() => setAdding(true)} style={{ flex: 1 }}><Plus size={16} /> Add something to clear</button>
      </div>
      {adding && <ObligForm onSave={add} onCancel={() => setAdding(false)} />}
      {oblig.length > 3 && (
        <input className="in" placeholder="Search a loan or person…" value={search} onChange={e => setSearch(e.target.value)} />
      )}

      {noMatches && <div className="card"><Empty>No loan or person matches "{search}".</Empty></div>}
      {searchedGroups.map(({ t, open, closed }) => (open.length > 0 || closed.length > 0) && (
        <div className="card" key={t}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            {(() => { const I = OTYPE[t].icon; return <I size={16} color={OTYPE[t].color} />; })()}
            <span style={{ fontSize: 12, fontWeight: 700, color: OTYPE[t].color, textTransform: "uppercase", letterSpacing: ".03em" }}>{OTYPE[t].label}</span>
          </div>
          {(showClosed[t] ? [...open, ...closed] : open).map(o => {
            const total = (+o.outstanding || 0) + (+o.paid || 0);
            const pct = total > 0 ? (o.paid / total) * 100 : (o.status === "closed" || o.status === "settled" ? 100 : 0);
            const history = payments.filter(p => p.obligId === o.id).sort((a, b) => b.date.localeCompare(a.date));
            const od = overdueInfo(o, payments);
            const aprHint = suggestedAPR(o);
            const minVsFull = o.isCreditCard && +o.outstanding > 0 ? {
              min: simulateMinPayment(+o.outstanding, +o.apr || 0),
              fixed6: simulateFixedPayoff(+o.outstanding, +o.apr || 0, 6),
            } : null;
            const editing = expandedId === o.id;
            return (
              <div key={o.id} style={{ padding: "11px 0", borderBottom: "1px solid " + C.line, opacity: (o.status === "closed" || o.status === "settled") ? 0.6 : 1 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {(o.status === "closed" || o.status === "settled") && <Check size={15} color={C.teal} />}{o.name}
                    {o.priority != null && <span className="chip" style={{ background: C.violet, color: "#fff" }}>your priority</span>}
                    {od.overdue && <span className="chip" style={{ background: C.coral, color: "#fff" }}>overdue{od.daysLate ? " " + od.daysLate + "d" : ""}</span>}
                    {o.cibilImpact && <span className="chip" style={{ background: C.amber, color: "#fff" }}>hits CIBIL</span>}
                    {o.harassment && <span className="chip" style={{ background: C.coral, color: "#fff" }}>frequent calls</span>}
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    {o.status === "closed"
                      ? <span className="chip" style={{ background: C.teal, color: "#fff" }}>cleared</span>
                      : o.status === "settled"
                      ? <span className="chip" style={{ background: C.violet, color: "#fff" }}>settled</span>
                      : <span className="num" style={{ fontWeight: 600 }}>{inr(o.outstanding)}</span>}
                    {o.status !== "closed" && o.status !== "settled" && (
                      <>
                        <button className="chip" onClick={() => setPayFor(o.id)} style={{ background: od.overdue ? C.coral : C.primary, color: "#fff", cursor: "pointer" }}>{od.overdue ? "pay now" : "pay"}</button>
                        <button className="chip" onClick={() => setSettleFor(o.id)} style={{ background: "transparent", border: "1px solid " + C.violet, color: C.violet, cursor: "pointer", whiteSpace: "nowrap" }}>settle for less</button>
                      </>
                    )}
                  </div>
                </div>
                {o.status === "settled" && (
                  <div style={{ fontSize: 11.5, color: C.violet, marginTop: 2 }}>
                    Settled for {inr(o.settledAmount || o.paid)}{o.settledSavings > 0 ? ` — ${inr(o.settledSavings)} waived` : ""}
                  </div>
                )}
                {(o.status === "closed" || o.status === "settled") && (
                  <div style={{ marginTop: 6, background: C.surface2, borderRadius: 8, padding: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: C.muted }}>
                        {o.nocReceived ? <>NOC / No Due Certificate received{o.nocDate ? " on " + o.nocDate : ""}</> : "NOC / No Due Certificate not marked received"}
                      </span>
                      <button className="chip" onClick={() => upd(o.id, { nocReceived: !o.nocReceived, nocDate: !o.nocReceived ? localDay() : o.nocDate })}
                        style={{ background: o.nocReceived ? C.teal : "transparent", border: "1px solid " + (o.nocReceived ? C.teal : C.coral), color: o.nocReceived ? "#fff" : C.coral, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {o.nocReceived ? "✓ received" : "mark received"}
                      </button>
                    </div>
                    {!o.nocReceived && (
                      <div className="foot" style={{ marginTop: 4 }}>
                        You're entitled to this once a loan is fully closed or settled — it's your proof there's nothing left outstanding.
                        {o.cibilImpact ? " Especially important here since this one hits CIBIL — without it, your credit report can keep showing the account as unpaid." : ""} Ask the lender for it if they haven't sent one.
                      </div>
                    )}
                  </div>
                )}
                {pct > 0 && <div className="bar" style={{ marginTop: 8 }}><div className="fill" style={{ width: pct + "%", background: OTYPE[t].color }} /></div>}
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
                {settleFor === o.id && <SettleForm accounts={accounts} outstanding={+o.outstanding || 0} onSettle={(amt, acc, note) => settle(o.id, amt, acc, note)} onCancel={() => setSettleFor(null)} />}

                <button className="chip" onClick={() => setExpandedId(editing ? null : o.id)} style={{ marginTop: 8, background: "transparent", border: "1px solid " + C.line, color: C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
                  {editing ? "close edit" : "edit"} {editing ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>

                {editing && (
                  <div style={{ marginTop: 8, background: C.surface2, borderRadius: 10, padding: 10, display: "grid", gap: 12 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: "2 1 100px" }}><span className="lbl" style={{ marginBottom: 2 }}>Outstanding</span>
                        <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" placeholder="0" value={o.outstanding || ""} onChange={e => upd(o.id, { outstanding: +e.target.value })} /></div>
                      <div style={{ flex: "1 1 80px" }}><span className="lbl" style={{ marginBottom: 2 }}>Monthly</span>
                        <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" placeholder="0" value={o.monthly || ""} onChange={e => upd(o.id, { monthly: +e.target.value })} /></div>
                      <div style={{ flex: "1 1 56px" }}><span className="lbl" style={{ marginBottom: 2 }}>Due day</span>
                        <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" min="1" max="31" placeholder="—" value={o.dueDay || ""} onChange={e => upd(o.id, { dueDay: +e.target.value })} /></div>
                      <div style={{ flex: "1 1 62px" }}><span className="lbl" style={{ marginBottom: 2 }}>APR %</span>
                        <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" min="0" step="0.1" placeholder="0" value={o.apr || ""} onChange={e => upd(o.id, { apr: +e.target.value })} /></div>
                    </div>
                    {aprHint !== null && (
                      <div className="row" style={{ justifyContent: "space-between", marginTop: -6, background: C.surface, borderRadius: 8, padding: "6px 10px" }}>
                        <span style={{ fontSize: 11.5, color: C.muted }}>Suggested APR from amount taken vs received: <b>{aprHint}%</b></span>
                        <button className="chip" onClick={() => upd(o.id, { apr: aprHint })} style={{ background: C.primary, color: "#fff", cursor: "pointer" }}>use</button>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Loan origin (optional)</div>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 120px" }}><span className="lbl" style={{ marginBottom: 2 }}>Started</span>
                          <input className="in" style={{ padding: "5px 8px", fontSize: 12 }} type="date" value={o.startDate || ""} onChange={e => upd(o.id, { startDate: e.target.value })} /></div>
                        <div style={{ flex: "1 1 100px" }}><span className="lbl" style={{ marginBottom: 2 }}>Taken</span>
                          <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" placeholder="0" value={o.amountTaken || ""} onChange={e => upd(o.id, { amountTaken: +e.target.value })} /></div>
                        <div style={{ flex: "1 1 100px" }}><span className="lbl" style={{ marginBottom: 2 }}>Received</span>
                          <input className="in num" style={{ padding: "5px 8px", fontSize: 12 }} type="number" placeholder="0" value={o.amountReceived || ""} onChange={e => upd(o.id, { amountReceived: +e.target.value })} /></div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <button className="chip" onClick={() => o.priority != null ? unprioritize(o.id) : prioritize(o.id)}
                        style={{ background: "transparent", border: "1px solid " + (o.priority != null ? C.violet : C.line), color: o.priority != null ? C.violet : C.muted, cursor: "pointer" }}>
                        {o.priority != null ? "✓ your priority — tap to unpin" : "attack this first, regardless of strategy"}
                      </button>
                      <button className="chip" onClick={() => upd(o.id, { cibilImpact: !o.cibilImpact })} style={{ background: "transparent", border: "1px solid " + (o.cibilImpact ? C.amber : C.line), color: o.cibilImpact ? C.amber : C.muted, cursor: "pointer" }}>CIBIL</button>
                      <button className="chip" onClick={() => upd(o.id, { harassment: !o.harassment })} style={{ background: "transparent", border: "1px solid " + (o.harassment ? C.coral : C.line), color: o.harassment ? C.coral : C.muted, cursor: "pointer" }}>calls</button>
                      <button className="chip" onClick={() => upd(o.id, { paymentType: o.paymentType === "onetime" ? "installments" : "onetime" })} style={{ background: "transparent", border: "1px solid " + C.line, color: C.muted, cursor: "pointer" }}>{o.paymentType === "onetime" ? "one-time" : "installments"}</button>
                      {t === "regulated" && (
                        <button className="chip" onClick={() => upd(o.id, { isCreditCard: !o.isCreditCard })} style={{ background: "transparent", border: "1px solid " + (o.isCreditCard ? C.violet : C.line), color: o.isCreditCard ? C.violet : C.muted, cursor: "pointer" }}>{o.isCreditCard ? "✓ credit card" : "mark as credit card"}</button>
                      )}
                      <button className="chip" onClick={() => rm(o.id)} style={{ background: "transparent", border: "1px solid " + C.coral, color: C.coral, cursor: "pointer" }}><Trash2 size={11} /> delete debt</button>
                    </div>

                    {history.length > 0 && (
                      <div>
                        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>Payment history</span>
                          <span className="num" style={{ fontSize: 12, fontWeight: 700, color: C.teal }}>{inr(o.paid)} of {inr(total)}</span>
                        </div>
                        {history.map(p => (
                          <div key={p.id} className="row" style={{ justifyContent: "space-between", padding: "3px 0", alignItems: "flex-start", gap: 8 }}>
                            <span style={{ fontSize: 12, color: C.muted }}>{p.date}{p.note ? <span style={{ display: "block", color: C.faint, fontStyle: "italic" }}>{p.note}</span> : null}</span>
                            <div className="row" style={{ gap: 6, alignItems: "center" }}>
                              <span className="num" style={{ fontSize: 12 }}>{inr(p.amount)}</span>
                              <button className="ib" title="Remove this payment — logged by mistake?" onClick={() => { if (confirm("Remove this payment of " + inr(p.amount) + "? This puts the amount back on the debt (and back in the account, if one was set) so you can re-add it correctly.")) rmPayment(p.id); }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}
          {closed.length > 0 && (
            <button className="chip" onClick={() => setShowClosed(s => ({ ...s, [t]: !s[t] }))}
              style={{ marginTop: 4, background: "transparent", border: "1px solid " + C.line, color: C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {showClosed[t] ? "Hide" : "Show"} {closed.length} cleared {closed.length === 1 ? "debt" : "debts"} {showClosed[t] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      ))}

      {/* Payoff plan / attack order — deliberately placed after the debt list, not before it.
          It's a planning tool you check in on now and then, not something that should push the
          actual debts you need to act on below the fold every time you open this tab. */}
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
              <div className="foot">Add an APR to each debt above (0 for family & friends — open "Edit" on each one) to see a payoff timeline.</div>
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
                <div style={{ marginTop: 12, background: C.surface2, borderRadius: 10, padding: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: C.muted }}>What if I added</span>
                    <input className="in num" type="number" value={deltaExtra || ""} onChange={e => setDeltaExtra(+e.target.value)}
                      style={{ width: 90, padding: "5px 8px", fontSize: 13 }} />
                    <span style={{ fontSize: 12.5, color: C.muted }}>more/month?</span>
                  </div>
                  {deltaExtra > 0 && (
                    deltaPlan.insufficient || deltaPlan.order.length === 0 ? (
                      <div className="foot" style={{ marginTop: 6 }}>Not enough to project — try a smaller or larger amount.</div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13 }}>Debt-free</span>
                          <span className="num" style={{ fontWeight: 700, color: C.teal }}>
                            {plan.months - deltaPlan.months > 0 ? `${plan.months - deltaPlan.months} mo sooner` : "same timeline"} · {fmtMonthYear(deltaPlan.debtFreeDate)}
                          </span>
                        </div>
                        <div className="row" style={{ justifyContent: "space-between", marginTop: 3 }}>
                          <span style={{ fontSize: 13 }}>Interest saved</span>
                          <span className="num" style={{ color: C.teal }}>{inr(Math.max(0, plan.totalInterest - deltaPlan.totalInterest))}</span>
                        </div>
                      </div>
                    )
                  )}
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
                    {o.priority != null && <span className="chip" style={{ background: "transparent", border: "1px solid " + C.violet, color: C.violet }}>your pick</span>}
                  </div>
                  <span style={{ fontSize: 12, color: C.faint }}>{o.monthCleared ? "cleared mo. " + o.monthCleared : "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div className="foot" style={{ marginTop: 10 }}>{strategy === "avalanche" ? "Avalanche pays the least interest overall — best if you can stick with it." : "Snowball clears small debts first for quick wins — good if you need momentum."} Anything you've pinned as "your priority" jumps ahead of the strategy entirely. Extra payments go to the top of the list; once it's cleared, extra rolls to the next.</div>
        </div>
      )}

      <div className="foot">Tap "Edit" on any debt to set outstanding, monthly amount, due day, APR, and everything else. "Monthly" and "due day" drive the week-ahead reminder on Home. Log a payment and it comes off the balance (and the account, if you pick one).</div>
    </div>
  );
}
function ObligForm({ onSave, onCancel }) {
  const [f, setF] = useState({
    name: "", type: "family", outstanding: 0, monthly: 0, dueDay: "", apr: 0, cibilImpact: false, harassment: false,
    paymentType: "installments", isCreditCard: false, startDate: "", amountTaken: 0, amountReceived: 0,
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
      <div className="foot" style={{ marginTop: 2 }}>Optional — shows what this loan really cost you, and suggests an APR.</div>
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
function SettleForm({ accounts, outstanding, onSettle, onCancel }) {
  const [amt, setAmt] = useState("");
  const [acc, setAcc] = useState(accounts.find(a => a.purpose === "debt")?.id || accounts[0]?.id || "");
  const [note, setNote] = useState("");
  const waived = amt !== "" ? Math.max(0, outstanding - +amt) : 0;
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 8, background: C.surface2, padding: 12, borderRadius: 12, border: "1px solid " + C.violet }}>
      <div style={{ fontSize: 12.5, color: C.muted }}>Use this when the lender agreed to close the account for less than what's owed — this marks it <b>settled</b>, not just paid down, and closes it even if the amount is less than the outstanding balance.</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="in num" type="number" placeholder={"Amount actually paid (owed " + inr(outstanding) + ")"} value={amt} onChange={e => setAmt(e.target.value)} style={{ flex: 1 }} autoFocus />
        <button className="ib" onClick={onCancel}><X size={16} /></button>
      </div>
      {waived > 0 && <div className="foot" style={{ color: C.teal }}>{inr(waived)} waived by the lender.</div>}
      {accounts.length > 0 && (
        <select className="in" value={acc} onChange={e => setAcc(e.target.value)}>
          <option value="">Don't deduct from any account</option>
          {accounts.map(a => <option key={a.id} value={a.id}>Pay from: {a.name} — {inr(a.balance)}</option>)}
        </select>
      )}
      <input className="in" placeholder="Note (optional — e.g. one-time settlement via WhatsApp)" value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn" disabled={!amt} onClick={() => onSettle(+amt, acc, note)} style={{ opacity: amt ? 1 : 0.5, background: C.violet }}><Check size={16} /> Mark settled & close</button>
    </div>
  );
}

function Activity({ expenses, payments, incomes, oblig, accounts }) {
  const [payPeriod, setPayPeriod] = useState("month");
  const nameOf = (id, list) => (list.find((x) => x.id === id) || {}).name || "";
  const items = [
    ...(incomes || []).map((i) => ({ date: i.date, dir: "in", amount: +i.amount || 0, label: "Income · " + incomeSourceLabel(i) + (i.note ? " — " + i.note : "") + (nameOf(i.accountId, accounts) ? " → " + nameOf(i.accountId, accounts) : "") })),
    ...(expenses || []).map((e) => ({ date: e.date, dir: "out", amount: +e.amount || 0, label: e.cat || "Spending" })),
    ...(payments || []).map((p) => ({ date: p.date, dir: "out", amount: +p.amount || 0, label: "Paid " + (nameOf(p.obligId, oblig) || "a debt") })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const monthKey = localMonth();
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
