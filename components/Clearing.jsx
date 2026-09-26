"use client";
import { supabase } from "../lib/supabaseClient";
import { useState, useEffect, useMemo, useRef } from "react";
import MoneyLogModal from "./MoneyLog";
import {
  Wallet, Landmark, PiggyBank, Users, Plus, Bell, BellRing, Trash2, Settings as SettingsIcon, Repeat,
  ArrowRightLeft, X, Zap, ShieldCheck, Heart, Check, Download, Upload, ArrowDownUp,
  ChevronDown, ChevronUp, AlertTriangle, Camera
} from "lucide-react";

/* Clearing — money in hand, where it goes, what's due next,
   and paying back friends, family, and loans. Persists to Supabase (user_state.data jsonb) per signed-in user. */

// "Zenith Finance" design system — Clarity through Calm. Primary Blue drives brand/actions/nav;
// Palette: warm ivory paper, deep forest-green primary, and muted earth accents — calm rather
// than loud. Green = money in / cleared, terracotta = over or overdue, ochre = everyday spending,
// plum = debt repayments. Headings and figures use Fraunces; body text uses Inter.
const C = {
  bg: "#F5F1EA", surface: "#FFFFFF", surface2: "#EFE9DF", line: "#E4DCCF",
  text: "#1D2B2F", muted: "#5F6B6E", faint: "#8E979A",
  primary: "#1F4D46", teal: "#2E7D5B", amber: "#C38A2E", coral: "#C4553D", violet: "#6A5A93",
  inverse: "#1F3A36", onInverse: "#F5F1EA",
};
// Keys (income/living/debt) are unchanged for saved-data compatibility — only the displayed
// labels changed, from abstract category names to what the tag actually does: pick the default
// account for a form. "Debt" here means "accounts", never the loans on the Clear tab.
const PURPOSE = {
  income: { label: "Salary lands here", short: "Salary", color: C.teal }, living: { label: "Everyday spending", short: "Spending", color: C.amber }, debt: { label: "Pay debts from here", short: "Debt", color: C.violet },
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
// Credit-card payments: the part that just pays for spends already logged on that card is a
// transfer, not debt repayment — it's stored as coversSpends so totals don't count it twice.
function cardCoverFor(o, amt, expenses, payments) {
  if (!o || !o.isCreditCard) return 0;
  const charged = (expenses || []).filter(e => e.cardId === o.id).reduce((t, e) => t + (+e.amount || 0), 0);
  const covered = (payments || []).filter(p => p.obligId === o.id).reduce((t, p) => t + (+p.coversSpends || 0), 0);
  return Math.max(0, Math.min(amt, charged - covered));
}
const ordinal = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const netPaid = (p) => (+p.amount || 0) - (+p.coversSpends || 0);
const nextMonthKey = (m) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
const daysInMonthKey = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo, 0).getDate(); };
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
// Credit cards: you set the next payment due date (from your statement). A payment made in the 30
// days before a due date (or up to 25 days after it) counts for that due date, and the next due
// date rolls forward a month on its own. Daily charges never make the card "overdue" — only a due
// date that passes with nothing paid does.
const addDaysStr = (ds, n) => { const d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() + n); return localDay(d); };
const addMonthsStr = (ds, n) => { const d = new Date(ds + "T00:00:00"); d.setMonth(d.getMonth() + n); return localDay(d); };
function cardDueDate(o, payments) {
  if (!o.nextDue) return null;
  for (let k = 0; k < 36; k++) {
    const due = addMonthsStr(o.nextDue, k);
    const paid = (payments || []).some(p => p.obligId === o.id && p.date > addDaysStr(due, -30) && p.date <= addDaysStr(due, 25));
    if (!paid) return due;
  }
  return null;
}
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
function dueInDays(o, payments) {
  if (o.isCreditCard) { const due = cardDueDate(o, payments); return due ? daysBetween(localDay(), due) : null; }
  return daysUntil(o.dueDay);
}
function overdueInfo(o, payments) {
  if (o.isCreditCard) {
    if (o.status === "closed" || o.status === "settled") return { overdue: false };
    const due = cardDueDate(o, payments);
    const late = due ? daysBetween(due, localDay()) : 0;
    return late > 0 ? { overdue: true, daysLate: late } : { overdue: false, cardDue: due };
  }
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
const CHART_PALETTE = ["#1F4D46", "#C38A2E", "#C4553D", "#3E8DA0", "#8BA356", "#B5698A", "#7C6650", "#4F6D93", "#D0A86A", "#A59E93"];

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
  // A spend paid by credit card ("card:<debt id>") adds to that card's outstanding on Clear instead
  // of reducing a bank balance — the bank only moves when you pay the card off.
  const logExpense = ({ amount, cat, note, date, accountId }) => {
    const cardId = accountId && accountId.startsWith("card:") ? accountId.slice(5) : "";
    setExpenses(x => [...x, { id: crypto.randomUUID(), amount, cat, note: note || "", date: date || localDay(), accountId: cardId ? "" : (accountId || ""), cardId }]);
    if (cardId) setOblig(x => x.map(o => o.id === cardId ? { ...o, outstanding: (+o.outstanding || 0) + amount, status: o.status === "closed" ? "open" : o.status } : o));
    else if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) - amount } : a));
    if (accountId && accountId !== settings.lastAccountId) setSettings(s => ({ ...s, lastAccountId: accountId }));
  };
  const logIncome = ({ amount, source, note, date, accountId }) => {
    setIncomes(x => [...x, { id: crypto.randomUUID(), amount, source: source || "Other", note: note || "", date: date || localDay(), accountId: accountId || "" }]);
    if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) + amount } : a));
  };
  const [quickAdd, setQuickAdd] = useState(false); // false | "out" | "in"
  const [planOpen, setPlanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Repeating spends (subscriptions, rent, phone…): each one is logged automatically on its day
  // every month, catching up on any month the app wasn't opened.
  const addRecurring = (r) => setSettings(s => ({ ...s, recurring: [...(s.recurring || []), { id: crypto.randomUUID(), active: true, ...r }] }));
  const [wantsOpen, setWantsOpen] = useState(false);
  // Records a debt payment exactly like the Clear tab does (used by the salary plan).
  const payDebt = (id, amt, accountId, note) => {
    const d = localDay();
    setOblig(x => x.map(o => {
      if (o.id !== id) return o;
      const outstanding = Math.max(0, (+o.outstanding || 0) - amt);
      return { ...o, outstanding, paid: (+o.paid || 0) + amt, status: outstanding === 0 ? "closed" : o.status, closedAt: outstanding === 0 ? d : o.closedAt };
    }));
    const coversSpends = cardCoverFor(oblig.find(o => o.id === id), amt, expenses, payments);
    setPayments(x => [...x, { id: crypto.randomUUID(), obligId: id, amount: amt, date: d, note: note || "", accountId: accountId || "", ...(coversSpends ? { coversSpends } : {}) }]);
    if (accountId) setAccounts(x => x.map(a => a.id === accountId ? { ...a, balance: (+a.balance || 0) - amt } : a));
  };
  const plan = settings.plan || {};
  const setPlan = (p) => setSettings(s => ({ ...s, plan: p }));
  const planResult = useMemo(() => buildSalaryPlan({ plan, oblig, accounts, expenses }), [plan, oblig, accounts, expenses]);
  function logPlan(lines, fromAcc) {
    lines.forEach(l => {
      if (l.kind === "salary") logIncome({ amount: l.amount, source: "Salary", note: "", accountId: fromAcc });
      else if (l.kind === "due" || l.kind === "ff") payDebt(l.id, l.amount, fromAcc, "Salary plan");
      else if (l.kind === "safety" && planResult.safetyAcc) setAccounts(x => x.map(a => a.id === fromAcc ? { ...a, balance: Math.round(((+a.balance || 0) - l.amount) * 100) / 100 } : a.id === planResult.safetyAcc.id ? { ...a, balance: Math.round(((+a.balance || 0) + l.amount) * 100) / 100 } : a));
      else if (l.kind === "trading") logExpense({ amount: l.amount, cat: "Invest", note: "to trading", accountId: fromAcc });
    });
    setPlan({ ...plan, lastLogged: localMonth() });
    setPlanOpen(false);
    const cleared = lines.filter(l => l.kind === "ff" && planResult.ff.find(x => x.id === l.id && x.clears));
    setCelebrate(cleared.length ? `Logged. ${cleared.map(c => c.label).join(", ")} fully repaid — that's a milestone.` : "Salary plan logged.");
  }
  const [logDate, setLogDate] = useState(null); // non-null = Money Log snapshot open for that day
  const achievements = computeAchievements({ oblig, settings });
  const wantsList = settings.wants || [];
  // Milestones you haven't been told about yet — shown as a celebration the next time the app is open.
  const unseenAch = settings.wantsSince ? achievements.filter(a => !(settings.seenAch || []).includes(a.key)) : [];
  const markAchSeen = () => setSettings(s => ({ ...s, seenAch: [...new Set([...(s.seenAch || []), ...unseenAch.map(a => a.key)])] }));
  const picks = Math.max(0, achievements.length - wantsList.filter(w => w.chosenAt || w.boughtAt).length);
  const safetyBal = planResult.safetyAcc ? Math.max(0, +planResult.safetyAcc.balance || 0) : 0;
  const nextWantHint = (() => {
    if (planResult.nextUp) return `repay ${planResult.nextUp.name.trim()} (${inr(planResult.nextUp.left)} to go)`;
    if (planResult.safetyAcc && planResult.starter && planResult.bal < planResult.starter) return `${planResult.safetyAcc.name} to ${inr(planResult.starter)} (${inr(planResult.starter - planResult.bal)} to go)`;
    return null;
  })();
  useEffect(() => {
    if (!ready) return;
    const rec = settings.recurring || [];
    if (!rec.length) return;
    const today = localDay(), cm = localMonth();
    let logged = 0;
    const updated = rec.map(r => {
      if (!r.active || !r.lastMonth) return r;
      let m = r.lastMonth; const out = { ...r };
      while (m < cm) {
        m = nextMonthKey(m);
        const day = `${m}-${String(Math.min(+r.day || 1, daysInMonthKey(m))).padStart(2, "0")}`;
        if (day > today) break;
        logExpense({ amount: +r.amount, cat: r.cat, note: r.note || "", date: day, accountId: r.accountId || "" });
        out.lastMonth = m; logged++;
      }
      return out;
    });
    if (logged) { setSettings(s => ({ ...s, recurring: updated })); setCelebrate(`Logged ${logged} repeating spend${logged > 1 ? "s" : ""} for you.`); }
  }, [ready, localDay()]);
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

  // Safety-net and streak milestones are recorded the first time they happen (balances can dip later).
  useEffect(() => {
    if (!ready || !settings.wantsSince) return;
    const ach = settings.achieved || {}; const add = {};
    if (planResult.safetyAcc && planResult.starter > 0 && planResult.bal >= planResult.starter && !ach.safetyStarter) add.safetyStarter = localDay();
    if (planResult.safetyAcc && planResult.full > 0 && planResult.bal >= planResult.full && !ach.safetyFull) add.safetyFull = localDay();
    if (postStreak >= 30 && !ach.streak30) add.streak30 = localDay();
    if (Object.keys(add).length) setSettings(s => ({ ...s, achieved: { ...(s.achieved || {}), ...add } }));
  }, [ready, settings.wantsSince, planResult.bal, planResult.starter, planResult.full, postStreak]);
  const moneyInHand = accounts.reduce((s, a) => s + (+a.balance || 0), 0);
  const openOblig = oblig.filter(o => o.status !== "closed" && o.status !== "settled");
  const dueSoon = openOblig
    .map(o => ({ ...o, in: dueInDays(o, payments), ...overdueInfo(o, payments) }))
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
    .clr{font-family:'Inter',system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:${C.text};background:${C.bg};min-height:100vh;max-width:520px;margin:0 auto;padding:22px 16px 110px;font-size:14.5px;-webkit-font-smoothing:antialiased}
    .num{font-family:'Fraunces',Georgia,serif;font-variant-numeric:lining-nums tabular-nums;font-weight:600;letter-spacing:-.01em}
    .hd{font-family:'Fraunces',Georgia,serif;letter-spacing:-.01em}
    .card{background:${C.surface};border:1px solid ${C.line};border-radius:20px;padding:18px;box-shadow:0 1px 2px rgba(29,43,47,.04),0 10px 30px -12px rgba(29,43,47,.10)}
    .card.hero{background:linear-gradient(160deg,#FFFFFF 0%,${C.surface2} 100%)}
    .clr div{min-width:0}
    .clr .num{white-space:nowrap}
    .row{display:flex;align-items:center}
    .btn{border:none;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;border-radius:12px;padding:11px 15px;color:#fff;background:${C.primary};display:inline-flex;align-items:center;gap:7px;box-shadow:0 6px 16px -6px rgba(31,77,70,.45)}
    .btn:disabled{opacity:.45;cursor:default}
    .btn.ghost{background:${C.surface};color:${C.text};border:1px solid ${C.line};box-shadow:none}
    .btn.danger{color:${C.coral};border-color:${C.coral}55}
    .btn:active{transform:translateY(1px)}
    .link{background:none;border:none;padding:0;color:${C.primary};font:inherit;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;text-align:left}
    .chip{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:999px}
    .tag{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid ${C.line};color:${C.muted};white-space:nowrap}
    .pill{font:inherit;font-size:13px;font-weight:500;padding:7px 13px;border-radius:999px;border:1px solid ${C.line};background:${C.surface};color:${C.text};cursor:pointer;text-align:left}
    .seg{display:inline-flex;background:${C.surface2};border-radius:10px;padding:3px;gap:2px}
    .seg button{font:inherit;font-size:12px;font-weight:600;border:none;background:none;color:${C.muted};padding:5px 9px;border-radius:8px;cursor:pointer}
    .seg button.on{background:${C.surface};color:${C.text};box-shadow:0 1px 3px rgba(29,43,47,.12)}
    .in{width:100%;background:${C.surface};border:1px solid ${C.line};color:${C.text};border-radius:12px;padding:11px 13px;font-size:15px;font-family:inherit;outline:none}
    .in.big{font-family:'Fraunces',Georgia,serif;font-size:30px;font-weight:600;text-align:center;padding:14px}
    .in:focus{border-color:${C.primary};box-shadow:0 0 0 3px rgba(31,77,70,.14)}
    .lbl{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${C.muted};margin-bottom:6px;display:block}
    .sub{font-size:12.5px;color:${C.muted}}
    .dot{display:inline-block;width:8px;height:8px;border-radius:99px;margin-right:6px;vertical-align:middle}
    .split{display:flex;height:8px;border-radius:99px;overflow:hidden;background:${C.line};gap:2px}
    .panel{background:${C.surface2};border-radius:14px;padding:12px 14px}
    .legend{display:flex;justify-content:space-between;align-items:center;font:inherit;font-size:13px;color:${C.text};background:none;border:none;border-radius:8px;padding:5px 8px;cursor:pointer;width:100%}
    .tabbar{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid ${C.line};display:flex;max-width:520px;margin:0 auto;padding-bottom:env(safe-area-inset-bottom)}
    .tabbar button{flex:1;background:none;border:none;color:${C.faint};padding:10px 0 13px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;font-weight:500;font-family:inherit}
    .tabbar button.on{color:${C.primary};font-weight:700}
    .li{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid ${C.line};gap:12px}
    .li:last-child{border-bottom:none}
    .li-btn{width:100%;background:none;border:none;border-bottom:1px solid ${C.line};font:inherit;color:inherit;cursor:pointer;text-align:left}
    .card.li-btn{border:1px solid ${C.line}}
    .ib{background:none;border:none;color:${C.faint};cursor:pointer;padding:6px;border-radius:8px}
    .ib:hover{color:${C.text};background:${C.surface2}}
    .bar{height:8px;border-radius:99px;background:${C.line};overflow:hidden}
    .fill{height:100%;border-radius:99px}
    .foot{font-size:12px;color:${C.faint};line-height:1.55}
    .toast{position:fixed;left:16px;right:16px;top:14px;max-width:488px;margin:0 auto;background:${C.inverse};color:${C.onInverse};border-radius:16px;padding:14px 16px;font-weight:600;display:flex;align-items:center;gap:10px;box-shadow:0 14px 34px -10px rgba(29,43,47,.5);z-index:60}
    @media (prefers-reduced-motion: no-preference){
      .fill{transition:width .7s cubic-bezier(.22,1,.36,1)}
      .card,.btn{transition:box-shadow .15s ease,transform .1s ease}
      .toast{animation:pop .35s cubic-bezier(.22,1.4,.36,1)}
      .sheet{animation:up .28s cubic-bezier(.22,1,.36,1)}
      @keyframes pop{from{transform:translateY(-16px) scale(.96);opacity:0}to{transform:none;opacity:1}}
      @keyframes up{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}
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
        <div><div className="row hd" style={{ fontSize: 28, fontWeight: 600, gap: 10 }}><Logo size={30} />Clearing</div>
          <div style={{ fontSize: 13, color: C.muted }}>What you can spend, what's due, what's left to clear.</div></div>
        <button className="ib" onClick={() => setSettingsOpen(true)} aria-label="Settings" style={{ color: C.muted, marginRight: 64 }}><SettingsIcon size={22} /></button>
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
      {tab === "home" && (
        <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
          <SalaryPlanCard plan={plan} result={planResult} onOpen={() => setPlanOpen(true)} />
          <WantsCard wants={wantsList} picks={picks} nextHint={nextWantHint} onOpen={() => setWantsOpen(true)} />
        </div>
      )}
      {tab === "home" && <Home {...{ moneyInHand, setAside, safeToSpend, settings, setSettings, dueSoon, monthSpend, debtPlan, accounts, logWarChest, freedMonthly, paydayUnderControl, openFamily, setTab, prioritizeFamily }} />}
      {tab === "accounts" && <AccountsTab {...{ accounts, setAccounts, incomes, logExpense, logIncome, moneyInHand }} openQuickAdd={(m) => setQuickAdd(m)} />}
      {tab === "money" && <MoneyTab {...{ expenses, setExpenses, payments, incomes, setIncomes, oblig, setOblig, accounts, setAccounts, settings, setSettings, setTab }} />}
      {tab === "clear" && <Clear {...{ oblig, setOblig, accounts, setAccounts, payments, setPayments, expenses, onCelebrate: setCelebrate, settings, setSettings, safeToSpend }} />}
      {tab === "clear" && <RepaymentsBreakdown {...{ payments, oblig }} />}
      {planOpen && <SalaryPlanSheet {...{ plan, setPlan, accounts }} salaryLogged={incomes.some(i => (i.date || "").slice(0, 7) === localMonth() && (i.source === "Salary" || !i.source))} result={planResult} onLog={logPlan} onClose={() => setPlanOpen(false)} />}
      {ready && unseenAch.length > 0 && !quickAdd && !planOpen && !wantsOpen && !logDate && (
        <Sheet title="You unlocked a pick 🎉" onClose={markAchSeen}>
          <div className="panel" style={{ display: "grid", gap: 4 }}>
            {unseenAch.map(a => <div key={a.key} style={{ fontSize: 15, fontWeight: 600 }}>✓ {a.label}</div>)}
          </div>
          <div className="sub">That's {unseenAch.length === 1 ? "one milestone" : unseenAch.length + " milestones"} closer to rebuilt. You now have {picks} pick{picks === 1 ? "" : "s"} to spend on something from your wants list — as long as it fits in what's free right now.</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={markAchSeen}>Later</button>
            <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => { markAchSeen(); setWantsOpen(true); }}>Choose a treat</button>
          </div>
        </Sheet>
      )}
      {settingsOpen && <SettingsSheet {...{ settings, setSettings, notif, askNotif, exportData, importData, accounts, debtPlan }} cards={oblig.filter(o => o.isCreditCard)} onClose={() => setSettingsOpen(false)} />}
      {wantsOpen && <WantsSheet {...{ settings, setSettings, achievements, picks, logExpense }} nextHint={nextWantHint} available={safeToSpend - safetyBal} onClose={() => setWantsOpen(false)} />}

      {celebrate && (
        <div className="toast"><Heart size={18} fill="#fff" /><span>{celebrate}</span></div>
      )}

      {!quickAdd && !logDate && !planOpen && !wantsOpen && !settingsOpen && (
        <button onClick={() => setQuickAdd("out")} aria-label="Quick add"
          style={{ position: "fixed", right: "max(16px, calc(50vw - 244px))", bottom: 90, width: 58, height: 58, borderRadius: 20, border: "none", background: C.primary, color: "#fff", boxShadow: "0 14px 28px -10px rgba(31,77,70,.6)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 40 }}>
          <Plus size={28} />
        </button>
      )}
      {quickAdd && <QuickAdd {...{ accounts, expenses, settings, logExpense, logIncome }} cards={oblig.filter(o => o.isCreditCard && o.status !== "settled")} onAddRecurring={addRecurring} initialMode={quickAdd} onClose={(m) => { setQuickAdd(false); if (m) setCelebrate(m); }} />}
      {logDate && (
        <MoneyLogModal date={logDate} onDateChange={setLogDate} snapshotInput={snapshotInput} suggestedDay={suggestedDay(logDate)}
          posts={logPosts} customQuotes={settings.quotes || []}
          onAddQuote={(q) => setSettings(s => ({ ...s, quotes: [...(s.quotes || []), q] }))}
          onPosted={(d, rec) => setSettings(s => ({ ...s, logPosts: { ...(s.logPosts || {}), [d]: rec } }))}
          reminder={settings.logReminder} onReminder={(on) => setSettings(s => ({ ...s, logReminder: on }))}
          onClose={() => setLogDate(null)} />
      )}
      <div className="tabbar">
        {[["home", "Home", Wallet], ["money", "Money", ArrowDownUp], ["accounts", "Accounts", Landmark], ["clear", "Clear", Users]]
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
          <Line l="Buffer you keep aside (Settings)" v={"− " + inr(settings.buffer)} c={C.muted} />
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
                  <span className="chip" style={{ background: C.coral, color: "#fff", textAlign: "center", whiteSpace: "nowrap" }}>overdue</span>
                ) : (
                  <span className="chip" style={{ background: o.in <= 3 ? C.coral : C.amber, color: C.bg, width: 60, textAlign: "center" }}>
                    {o.in === 0 ? "today" : o.in + "d"}</span>
                )}
              </div>
            </div>
          ))}
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

function SourcePicker({ source, setSource, custom, setCustom }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {INCOME_SOURCES.map(x => <Pill key={x} on={source === x} color={C.teal} onClick={() => setSource(x)}>{x}</Pill>)}
      </div>
      {source === "Other" && <input className="in" placeholder="Where's it from? (e.g. Sold old phone)" value={custom} onChange={e => setCustom(e.target.value)} />}
    </div>
  );
}
// One-tap logging from any tab: a big amount field, recent categories first, and the account you
// used last time already picked — so logging a spend on the go takes a few seconds.
function QuickAdd({ accounts, cards = [], expenses, settings, logExpense, logIncome, onAddRecurring, onClose, initialMode = "out" }) {
  const [repeat, setRepeat] = useState(false);
  const [mode, setMode] = useState(initialMode === "in" ? "in" : "out");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(localDay());
  const allCats = settings.categories && settings.categories.length ? settings.categories : EXP_CATS;
  const recent = [...new Set([...(expenses || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(e => e.cat).filter(Boolean))];
  const cats = [...new Set([...recent.filter(c => allCats.includes(c)).slice(0, 4), ...allCats])];
  const [cat, setCatRaw] = useState(cats[0] || "Other");
  const [catTouched, setCatTouched] = useState(false);
  const setCat = (c) => { setCatRaw(c); setCatTouched(true); };
  const suggested = useMemo(() => suggestCategory(note, expenses, allCats), [note]);
  useEffect(() => { if (!catTouched && suggested) setCatRaw(suggested); }, [suggested]);
  const [source, setSource] = useState("Salary");
  const [custom, setCustom] = useState("");
  const [acc, setAcc] = useState(settings.lastAccountId && (accounts.some(a => a.id === settings.lastAccountId) || cards.some(c => "card:" + c.id === settings.lastAccountId)) ? settings.lastAccountId : (accounts.find(a => a.purpose === "living")?.id || accounts[0]?.id || ""));
  const [inAcc, setInAcc] = useState(accounts.find(a => a.purpose === "income")?.id || accounts[0]?.id || "");
  const yesterday = localDay(new Date(Date.now() - 86400000));
  const ok = +amt > 0;
  function save() {
    if (!ok) return;
    if (mode === "out") {
      logExpense({ amount: +amt, cat, note: note.trim(), date, accountId: acc });
      if (repeat && onAddRecurring) onAddRecurring({ amount: +amt, cat, note: note.trim(), accountId: acc, day: +date.slice(8, 10), lastMonth: date.slice(0, 7) });
    }
    else logIncome({ amount: +amt, source: source === "Other" ? (custom.trim() || "Other") : source, note: note.trim(), date, accountId: inAcc });
    onClose(mode === "out" ? `Logged ${inr(+amt)} · ${cat}` : `Logged ${inr(+amt)} in · ${source === "Other" ? (custom.trim() || "Other") : source}`);
  }
  const tabBtn = (id, label, color) => (
    <button className="btn ghost" onClick={() => setMode(id)} style={{ flex: 1, borderColor: mode === id ? color : C.line, color: mode === id ? color : C.muted, fontWeight: 700 }}>{label}</button>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,28,40,.45)", zIndex: 55, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => onClose()}>
      <div className="card sheet" style={{ width: "100%", maxWidth: 520, borderRadius: "22px 22px 0 0", display: "grid", gap: 12, paddingBottom: 28 }} onClick={e => e.stopPropagation()}>
        <div className="row" style={{ gap: 8 }}>
          {tabBtn("out", "Spent", C.coral)}{tabBtn("in", "Received", C.teal)}
          <button className="ib" onClick={() => onClose()} aria-label="Close"><X size={20} /></button>
        </div>
        <input className="in big" type="number" inputMode="decimal" placeholder="₹ 0" value={amt} onChange={e => setAmt(e.target.value)} autoFocus
          onKeyDown={e => { if (e.key === "Enter") save(); }} />
        <input className="in" placeholder={mode === "out" ? "What was it? (e.g. auto, swiggy, blinkit)" : "Note (optional)"} value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }} />
        {mode === "out" ? (
          <div>
            {suggested && cat === suggested && !catTouched && <div className="sub" style={{ marginBottom: 6 }}>✨ Suggested from your note — tap another to change</div>}
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {cats.map(c => <Pill key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Pill>)}
            </div>
          </div>
        ) : <SourcePicker source={source} setSource={setSource} custom={custom} setCustom={setCustom} />}
        <div className="row" style={{ gap: 8 }}>
          {accounts.length > 0 && (
            <select className="in" style={{ flex: 1 }} value={mode === "out" ? acc : inAcc} onChange={e => (mode === "out" ? setAcc : setInAcc)(e.target.value)}>
              <option value="">No account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              {mode === "out" && cards.length > 0 && <optgroup label="Paid by credit card">{cards.map(c => <option key={c.id} value={"card:" + c.id}>💳 {c.name.trim()}</option>)}</optgroup>}
            </select>
          )}
          <button className="pill" onClick={() => setDate(date === yesterday ? localDay() : yesterday)} style={{ whiteSpace: "nowrap" }}>
            {date === localDay() ? "Today" : date === yesterday ? "Yesterday" : date} ⇄
          </button>
        </div>
        {mode === "out" && (
          <label className="row" style={{ gap: 8, fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} style={{ accentColor: C.primary, width: 18, height: 18 }} />
            Repeats every month on the {ordinal(+date.slice(8, 10))} (log it automatically)
          </label>
        )}
        <button className="btn" disabled={!ok} onClick={save} style={{ padding: 14, fontSize: 16, justifyContent: "center" }}>{mode === "out" ? "Log spend" : "Log income"}</button>
      </div>
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

function Clear({ oblig, setOblig, accounts, setAccounts, payments, setPayments, expenses = [], onCelebrate, settings, setSettings, safeToSpend }) {
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
    const coversSpends = cardCoverFor(o, amt, expenses, payments);
    setPayments(x => [...x, { id: crypto.randomUUID(), obligId: id, amount: amt, date: today, note: note || "", accountId: accountId || "", ...(coversSpends ? { coversSpends } : {}) }]);
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
  // Groups with nothing left open (e.g. every payday loan cleared) sink below the ones still in play.
  searchedGroups.sort((a, b) => (b.open.length > 0) - (a.open.length > 0));
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
          <div className="lbl" style={{ margin: 0, color: "#B9CEC6" }}>Freedom Roadmap</div>
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
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {(o.status === "closed" || o.status === "settled") && <Check size={15} color={C.teal} />}{o.name}
                    {o.priority != null && <span className="chip" style={{ background: C.violet, color: "#fff" }}>your priority</span>}
                    {od.overdue && <span className="chip" style={{ background: C.coral, color: "#fff" }}>overdue{od.daysLate ? " " + od.daysLate + "d" : ""}</span>}
                    {!od.overdue && od.cardDue && <span className="chip" style={{ background: "transparent", border: "1px solid " + C.line, color: C.muted }}>due {new Date(od.cardDue + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                    {o.cibilImpact && <span className="chip" style={{ background: C.amber, color: "#fff" }}>hits CIBIL</span>}
                    {o.harassment && <span className="chip" style={{ background: C.coral, color: "#fff" }}>frequent calls</span>}
                  </span>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0, maxWidth: "58%" }}>
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
                      {o.isCreditCard && (
                        <label className="row" style={{ gap: 6, fontSize: 12, color: C.muted, width: "100%" }}>Next payment due
                          <input className="in" type="date" style={{ padding: "5px 8px", fontSize: 12, width: "auto" }} value={o.nextDue || ""} onChange={e => upd(o.id, { nextDue: e.target.value })} />
                        </label>
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
      {f.isCreditCard && (
        <div><span className="lbl">Next payment due (from your statement)</span>
          <input className="in" type="date" value={f.nextDue || ""} onChange={e => setF({ ...f, nextDue: e.target.value })} /></div>
      )}
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

/* ================================================================================================
   Shared helpers for the Money tab, Accounts, Salary plan and Wants
   ================================================================================================ */
const sum = (arr, f = (x) => x) => (arr || []).reduce((s, x) => s + (+f(x) || 0), 0);
const fmtDay = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); } catch { return d; } };
const NON_LIVING = ["invest", "account transfer"]; // money moved, not spent on living

// Average everyday spend over the last (up to 3) complete months — the starting guess for the plan.
function recentLivingAverage(expenses) {
  const now = new Date();
  const months = [1, 2, 3].map(k => localMonth(new Date(now.getFullYear(), now.getMonth() - k, 1)));
  const totals = months.map(m => sum((expenses || []).filter(e => (e.date || "").slice(0, 7) === m && !NON_LIVING.includes((e.cat || "").toLowerCase())), e => e.amount)).filter(t => t > 0);
  return totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length / 100) * 100 : 0;
}

// Picks a category from what you type in the note: first from your own past entries (same or
// similar note), then from common Indian merchants/words. Only returns categories you actually have.
const CAT_KEYWORDS = [
  [/swiggy|zomato|restaurant|cafe|coffee|lunch|dinner|breakfast|starbucks|chai|biryani|pizza|domino|kfc|mcd|burger|eat ?out/, ["Dine Out", "Eating out", "Food"]],
  [/blinkit|zepto|bigbasket|big basket|instamart|dmart|d-mart|grocer|vegetable|veggies|\bmilk\b|fruit|kirana|jiomart/, ["Groceries", "Food"]],
  [/uber|\bola\b|rapido|\bauto\b|\bcab\b|taxi|metro|\bbus\b|train|irctc|petrol|fuel|diesel|toll|parking|fastag/, ["Transport"]],
  [/netflix|spotify|prime video|hotstar|youtube|icloud|google one|chatgpt|claude|subscription|apple music|jiocinema|zee5|sonyliv/, ["Subscription", "Subscriptions"]],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|shopping|clothes|shoes|dress/, ["Shopping"]],
  [/recharge|\bjio\b|airtel|vodafone|\bvi\b|phone bill|postpaid|prepaid/, ["Phone"]],
  [/pharmacy|medicine|doctor|hospital|clinic|apollo|medplus|pharmeasy|1mg|\blab\b|tablet/, ["Medical"]],
  [/electricity|wifi|wi-fi|broadband|internet|\bgas\b|water bill|bescom|mseb|adani|tata power|cylinder/, ["Utilities"]],
  [/\brent\b|landlord|maintenance|society/, ["Rent"]],
  [/church|\bmass\b|offering|tithe/, ["Church"]],
  [/donation|charity|donate/, ["Donation"]],
  [/office|wework|cowork/, ["Office"]],
];
function suggestCategory(note, expenses, cats) {
  const n = (note || "").toLowerCase().trim();
  if (n.length < 2) return null;
  const has = (c) => cats.find(x => x.toLowerCase() === c.toLowerCase());
  const words = n.split(/[^a-z0-9]+/).filter(w => w.length > 2);
  const score = {};
  (expenses || []).forEach(e => {
    const en = (e.note || "").toLowerCase().trim();
    if (!en || !e.cat || !has(e.cat)) return;
    if (en === n) score[e.cat] = (score[e.cat] || 0) + 5;
    else words.forEach(w => { if (en.includes(w)) score[e.cat] = (score[e.cat] || 0) + 1; });
  });
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best) return has(best[0]);
  for (const [re, options] of CAT_KEYWORDS) if (re.test(n)) for (const o of options) { const c = has(o); if (c) return c; }
  return null;
}

function Sheet({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,32,30,.42)", zIndex: 55, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div className="card sheet" style={{ width: "100%", maxWidth: 520, borderRadius: "22px 22px 0 0", display: "grid", gap: 12, paddingBottom: 28, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="hd" style={{ fontWeight: 600, fontSize: 18 }}>{title}</div>
          <button className="ib" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
function Pill({ on, onClick, children, color = C.primary }) {
  return (
    <button className="pill" onClick={onClick} style={on ? { background: color, borderColor: color, color: "#fff" } : undefined}>{children}</button>
  );
}

/* ================================================================================================
   MONEY TAB — spending, repayments and income in one place
   ================================================================================================ */
function MoneyTab({ expenses, setExpenses, payments, incomes, setIncomes, oblig, setOblig, accounts, setAccounts, settings, setSettings, setTab }) {
  const [period, setPeriod] = useState("month");
  const [filter, setFilter] = useState("all"); // all | spent | repay | in
  const [catFilter, setCatFilter] = useState(null);
  const [days, setDays] = useState(7);
  const [editing, setEditing] = useState(null); // { kind: 'expense'|'income', item }
  const [managing, setManaging] = useState(false);
  const [budgetEdit, setBudgetEdit] = useState(false);
  const categories = settings.categories && settings.categories.length ? settings.categories : EXP_CATS;
  const nameOf = (id, list) => ((list || []).find(x => x.id === id) || {}).name || "";

  const monthKey = localMonth();
  const now = new Date();
  const lastMonthKey = localMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const inMonth = (x, m) => (x.date || "").slice(0, 7) === m;
  const monthSpend = sum(expenses.filter(e => inMonth(e, monthKey)), e => e.amount);
  const monthRepaid = sum(payments.filter(p => inMonth(p, monthKey)), netPaid);
  const monthIn = sum(incomes.filter(i => inMonth(i, monthKey)), i => i.amount);
  const monthOut = monthSpend + monthRepaid;
  const lastSpend = sum(expenses.filter(e => inMonth(e, lastMonthKey)), e => e.amount);
  const trend = lastSpend > 0 ? Math.round(((monthSpend - lastSpend) / lastSpend) * 100) : null;
  const budget = +settings.budget || 0;

  // Breakdown for the chosen period: spending categories + repayments as one slice.
  const pExp = expenses.filter(e => inPeriod(e.date, period));
  const pPaid = sum(payments.filter(p => inPeriod(p.date, period)), netPaid);
  const byCat = [
    ...[...new Set(pExp.map(e => e.cat || "Other"))].map(c => ({ c, total: sum(pExp.filter(e => (e.cat || "Other") === c), e => e.amount) })),
    ...(pPaid > 0 ? [{ c: "Loan repayments", total: pPaid, isLoan: true }] : []),
  ].filter(x => x.total > 0).sort((a, b) => b.total - a.total).map((x, i) => ({ ...x, color: x.isLoan ? C.violet : CHART_PALETTE[i % CHART_PALETTE.length] }));
  const pTotal = sum(byCat, x => x.total);

  // Unified list
  const items = [
    ...expenses.map(e => ({ kind: "expense", id: e.id, date: e.date, amount: +e.amount || 0, label: e.cat || "Spending", sub: [e.note, e.cardId ? "💳 " + nameOf(e.cardId, oblig).trim() : nameOf(e.accountId, accounts)].filter(Boolean).join(" · "), item: e, cat: e.cat })),
    ...payments.map(p => ({ kind: "repay", id: p.id, date: p.date, amount: +p.amount || 0, label: "Paid " + (nameOf(p.obligId, oblig).trim() || "a debt"), sub: [p.coversSpends ? inr(p.coversSpends) + " of it covers card spends already counted" : "", p.note, nameOf(p.accountId, accounts)].filter(Boolean).join(" · "), item: p, cat: "Loan repayments" })),
    ...incomes.map(i => ({ kind: "income", id: i.id, date: i.date, amount: +i.amount || 0, label: incomeSourceLabel(i), sub: [i.note, nameOf(i.accountId, accounts)].filter(Boolean).join(" · "), item: i })),
  ].filter(it => filter === "all" || (filter === "spent" && it.kind === "expense") || (filter === "repay" && it.kind === "repay") || (filter === "in" && it.kind === "income"))
    .filter(it => !catFilter || it.cat === catFilter)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const groups = [];
  items.forEach(it => { const g = groups.find(x => x.date === it.date); if (g) g.rows.push(it); else groups.push({ date: it.date, rows: [it] }); });
  const shown = groups.slice(0, days);

  function downloadMonth() {
    const rows = [["Date", "Type", "Category / Debt / Source", "Amount", "Note"]];
    expenses.filter(e => inMonth(e, monthKey)).forEach(e => rows.push([e.date, "Spent", e.cat, e.amount, e.note || ""]));
    payments.filter(p => inMonth(p, monthKey)).forEach(p => rows.push([p.date, "Repayment", nameOf(p.obligId, oblig), p.amount, p.note || ""]));
    incomes.filter(i => inMonth(i, monthKey)).forEach(i => rows.push([i.date, "In", incomeSourceLabel(i), i.amount, i.note || ""]));
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `clearing-${monthKey}.csv`; a.click();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card hero">
        <div className="lbl">This month</div>
        <div className="row" style={{ gap: 10, marginTop: 2, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}><div className="num" style={{ fontSize: 20, whiteSpace: "nowrap", color: C.teal }}>+{inr(monthIn)}</div><div className="sub">came in</div></div>
          <div style={{ flex: 1 }}><div className="num" style={{ fontSize: 20, whiteSpace: "nowrap" }}>−{inr(monthOut)}</div><div className="sub">went out</div></div>
          <div style={{ flex: 1 }}><div className="num" style={{ fontSize: 20, whiteSpace: "nowrap", color: monthIn - monthOut >= 0 ? C.teal : C.coral }}>{monthIn - monthOut >= 0 ? "" : "−"}{inr(Math.abs(monthIn - monthOut))}</div><div className="sub">left</div></div>
        </div>
        <div className="split" style={{ marginTop: 14 }}>
          <div style={{ width: (monthOut ? (monthSpend / monthOut) * 100 : 50) + "%", background: C.amber }} />
          <div style={{ width: (monthOut ? (monthRepaid / monthOut) * 100 : 50) + "%", background: C.violet }} />
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
          <span><span className="dot" style={{ background: C.amber }} />Everyday {inr(monthSpend)}{trend !== null && <span style={{ color: trend > 0 ? C.coral : C.teal }}> · {trend > 0 ? "+" : ""}{trend}% vs last month</span>}</span>
          <span><span className="dot" style={{ background: C.violet }} />Repayments {inr(monthRepaid)}</span>
        </div>
        {budget > 0 && !budgetEdit ? (
          <div style={{ marginTop: 14 }}>
            <div className="bar"><div className="fill" style={{ width: Math.min(100, (monthSpend / budget) * 100) + "%", background: monthSpend > budget ? C.coral : C.teal }} /></div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6, fontSize: 12.5, color: C.muted }}>
              <span>{monthSpend > budget ? `${inr(monthSpend - budget)} over` : `${inr(budget - monthSpend)} left`} of {inr(budget)} everyday budget</span>
              <button className="link" onClick={() => setBudgetEdit(true)}>Change</button>
            </div>
          </div>
        ) : budgetEdit ? (
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <input className="in num" type="number" inputMode="numeric" autoFocus placeholder="Monthly everyday budget" defaultValue={budget || ""} id="budgetIn" />
            <button className="btn" onClick={() => { const v = +document.getElementById("budgetIn").value || 0; setSettings(s => ({ ...s, budget: v })); setBudgetEdit(false); }}>Save</button>
          </div>
        ) : (
          <button className="link" style={{ marginTop: 12 }} onClick={() => setBudgetEdit(true)}>Set an everyday budget</button>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <div className="hd" style={{ fontWeight: 600, fontSize: 16, whiteSpace: "nowrap" }}>Where it went</div>
          <Seg options={PERIODS} value={period} onChange={setPeriod} />
        </div>
        {byCat.length === 0 ? <Empty>Nothing out in this period yet.</Empty> : (
          <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
            <PieChart slices={byCat.map(x => ({ value: x.total, color: x.color }))} size={112} centerLabel={inr(pTotal)} centerSub={PERIODS.find(p => p[0] === period)[1]} />
            <div style={{ flex: 1, display: "grid", gap: 2 }}>
              {byCat.slice(0, 8).map(x => (
                <button key={x.c} className="legend" onClick={() => { setCatFilter(catFilter === x.c ? null : x.c); if (x.isLoan) setFilter("all"); }} style={catFilter === x.c ? { background: C.surface2 } : undefined}>
                  <span className="row" style={{ gap: 7 }}><span className="dot" style={{ background: x.color, margin: 0 }} />{x.c}</span>
                  <span className="num" style={{ fontSize: 13 }}>{Math.round((x.total / pTotal) * 100)}%</span>
                </button>
              ))}
              {byCat.length > 8 && <div className="sub" style={{ paddingLeft: 8 }}>+ {byCat.length - 8} more</div>}
            </div>
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {[["all", "All"], ["spent", "Spent"], ["repay", "Repayments"], ["in", "In"]].map(([v, l]) => <Pill key={v} on={filter === v} onClick={() => { setFilter(v); setCatFilter(null); }}>{l}</Pill>)}
        {catFilter && <Pill on onClick={() => setCatFilter(null)} color={C.text}>{catFilter} ✕</Pill>}
      </div>

      {shown.length === 0 ? <div className="card"><Empty>Nothing here yet. Tap + to log something.</Empty></div> : shown.map(g => {
        const out = sum(g.rows.filter(r => r.kind !== "income"), r => r.amount);
        const inn = sum(g.rows.filter(r => r.kind === "income"), r => r.amount);
        return (
          <div className="card" key={g.date} style={{ padding: "12px 16px" }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
              <span className="lbl" style={{ margin: 0 }}>{g.date === localDay() ? "Today" : fmtDay(g.date)}</span>
              <span className="sub">{inn > 0 && <span style={{ color: C.teal }}>+{inr(inn)} </span>}{out > 0 && <>−{inr(out)}</>}</span>
            </div>
            {g.rows.map(r => (
              <button key={r.kind + r.id} className="li li-btn" onClick={() => r.kind === "repay" ? setTab("clear") : setEditing({ kind: r.kind, item: r.item })}>
                <div style={{ textAlign: "left", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{r.label}</div>
                  {r.sub && <div className="sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</div>}
                </div>
                <span className="num" style={{ fontSize: 15, color: r.kind === "income" ? C.teal : r.kind === "repay" ? C.violet : C.text }}>{r.kind === "income" ? "+" : "−"}{inr(r.amount)}</span>
              </button>
            ))}
          </div>
        );
      })}
      {groups.length > days && <button className="btn ghost" onClick={() => setDays(d => d + 14)} style={{ justifyContent: "center" }}>Show more</button>}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="link" onClick={() => setManaging(true)}>Manage categories</button>
        <button className="link" onClick={downloadMonth}><Download size={13} /> This month as CSV</button>
      </div>
      <div className="foot">Tap any entry to fix it. Repayments open on the Clear tab, where undoing one also restores the debt.</div>

      {editing && <EntrySheet {...{ editing, accounts, setAccounts, setExpenses, setIncomes, setOblig, categories }} cards={oblig.filter(o => o.isCreditCard)} onClose={() => setEditing(null)} />}
      {managing && <CategoryManager {...{ categories, expenses, setExpenses, setSettings }} onClose={() => setManaging(false)} />}
    </div>
  );
}

// Edit or delete a spend / income. Changing the amount or account also corrects the account balances.
function EntrySheet({ editing, accounts, setAccounts, setExpenses, setIncomes, setOblig, cards = [], categories, onClose }) {
  const isExp = editing.kind === "expense";
  const orig = editing.item;
  const [f, setF] = useState({ amount: String(orig.amount || ""), cat: orig.cat || categories[0], source: orig.source || "Other", note: orig.note || "", date: orig.date, accountId: orig.cardId ? "card:" + orig.cardId : (orig.accountId || "") });
  const sign = isExp ? -1 : 1;
  const origKey = orig.cardId ? "card:" + orig.cardId : orig.accountId;
  // Bank accounts move with the entry; a card's outstanding moves the opposite way (a spend adds to it).
  const applyBalance = (key, amt) => {
    if (!key) return;
    if (key.startsWith("card:")) { const id = key.slice(5); setOblig(x => x.map(o => o.id === id ? { ...o, outstanding: Math.max(0, (+o.outstanding || 0) - amt) } : o)); }
    else setAccounts(x => x.map(a => a.id === key ? { ...a, balance: (+a.balance || 0) + amt } : a));
  };
  function save() {
    const amount = +f.amount || 0; if (!amount) return;
    applyBalance(origKey, -sign * (+orig.amount || 0)); // undo old
    applyBalance(f.accountId, sign * amount);           // apply new
    const isCard = f.accountId.startsWith("card:");
    const where = { accountId: isCard ? "" : f.accountId, cardId: isCard ? f.accountId.slice(5) : "" };
    const next = isExp ? { ...orig, amount, cat: f.cat, note: f.note.trim(), date: f.date, ...where } : { ...orig, amount, source: f.source, note: f.note.trim(), date: f.date, accountId: f.accountId };
    (isExp ? setExpenses : setIncomes)(x => x.map(e => e.id === orig.id ? next : e));
    onClose();
  }
  function del() {
    if (!confirm(`Delete this ${isExp ? "spend" : "income"} of ${inr(orig.amount)}?`)) return;
    applyBalance(origKey, -sign * (+orig.amount || 0));
    (isExp ? setExpenses : setIncomes)(x => x.filter(e => e.id !== orig.id));
    onClose();
  }
  return (
    <Sheet title={isExp ? "Edit spend" : "Edit income"} onClose={onClose}>
      <input className="in num big" type="number" inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} />
      {isExp ? (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {[...new Set([...categories, f.cat])].map(c => <Pill key={c} on={f.cat === c} onClick={() => setF({ ...f, cat: c })}>{c}</Pill>)}
        </div>
      ) : (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {[...new Set([...INCOME_SOURCES.filter(s => s !== "Other"), f.source])].map(s => <Pill key={s} on={f.source === s} color={C.teal} onClick={() => setF({ ...f, source: s })}>{s}</Pill>)}
        </div>
      )}
      <input className="in" placeholder="Note" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
      <div className="row" style={{ gap: 8 }}>
        <select className="in" style={{ flex: 1 }} value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}>
          <option value="">No account</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          {isExp && cards.length > 0 && <optgroup label="Paid by credit card">{cards.map(c => <option key={c.id} value={"card:" + c.id}>💳 {c.name.trim()}</option>)}</optgroup>}
        </select>
        <input className="in" type="date" style={{ flex: 1 }} value={f.date} onChange={e => setF({ ...f, date: e.target.value || f.date })} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost danger" onClick={del}><Trash2 size={15} /> Delete</button>
        <button className="btn" onClick={save} style={{ flex: 1, justifyContent: "center" }}>Save</button>
      </div>
    </Sheet>
  );
}

// Rename, merge or add categories. Renaming/merging moves every past entry with it.
function CategoryManager({ categories, expenses, setExpenses, setSettings, onClose }) {
  const [sel, setSel] = useState(null);
  const [name, setName] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const [adding, setAdding] = useState("");
  const counts = {}; expenses.forEach(e => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
  const all = [...new Set([...categories, ...Object.keys(counts).filter(Boolean)])];
  const saveCats = (list) => setSettings(s => ({ ...s, categories: list }));
  function rename() {
    const to = name.trim(); if (!to || to === sel) return;
    setExpenses(x => x.map(e => e.cat === sel ? { ...e, cat: to } : e));
    saveCats([...new Set(all.map(c => c === sel ? to : c))]);
    setSel(null);
  }
  function merge() {
    if (!mergeTo || mergeTo === sel) return;
    if (!confirm(`Move all ${counts[sel] || 0} "${sel}" entries into "${mergeTo}" and remove "${sel}"?`)) return;
    setExpenses(x => x.map(e => e.cat === sel ? { ...e, cat: mergeTo } : e));
    saveCats(all.filter(c => c !== sel));
    setSel(null);
  }
  function remove() { saveCats(all.filter(c => c !== sel)); setSel(null); }
  return (
    <Sheet title="Categories" onClose={onClose}>
      {!sel ? (
        <>
          <div style={{ display: "grid" }}>
            {all.map(c => (
              <button key={c} className="li li-btn" onClick={() => { setSel(c); setName(c); setMergeTo(""); }}>
                <span style={{ fontSize: 14.5 }}>{c}</span><span className="sub">{counts[c] || 0} entries ›</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="in" placeholder="New category" value={adding} onChange={e => setAdding(e.target.value)} />
            <button className="btn" disabled={!adding.trim()} onClick={() => { saveCats([...new Set([...all, adding.trim()])]); setAdding(""); }}>Add</button>
          </div>
        </>
      ) : (
        <>
          <div className="sub">{counts[sel] || 0} entries in "{sel}"</div>
          <span className="lbl">Rename</span>
          <div className="row" style={{ gap: 8 }}>
            <input className="in" value={name} onChange={e => setName(e.target.value)} />
            <button className="btn" onClick={rename}>Rename</button>
          </div>
          <span className="lbl">Merge into another category</span>
          <div className="row" style={{ gap: 8 }}>
            <select className="in" value={mergeTo} onChange={e => setMergeTo(e.target.value)}>
              <option value="">Choose…</option>
              {all.filter(c => c !== sel).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn" disabled={!mergeTo} onClick={merge}>Merge</button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => setSel(null)}>Back</button>
            {!counts[sel] && <button className="btn ghost danger" onClick={remove}><Trash2 size={15} /> Remove</button>}
          </div>
        </>
      )}
    </Sheet>
  );
}

// Repayments by debt type — moved here from the old Activity tab.
function RepaymentsBreakdown({ payments, oblig }) {
  const [period, setPeriod] = useState("month");
  const pp = payments.filter(p => inPeriod(p.date, period));
  const total = sum(pp, netPaid);
  const byType = Object.keys(OTYPE).map(t => ({ t, total: sum(pp.filter(p => (oblig.find(o => o.id === p.obligId) || {}).type === t), netPaid) })).filter(x => x.total > 0);
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="hd" style={{ fontWeight: 600, fontSize: 16 }}>Repaid</div>
        <Seg options={PERIODS} value={period} onChange={setPeriod} />
      </div>
      {byType.length === 0 ? <Empty>No repayments in this period.</Empty> : (
        <div className="row" style={{ gap: 16 }}>
          <PieChart centerLabel={inr(total)} centerSub={PERIODS.find(p => p[0] === period)[1]} slices={byType.map(x => ({ value: x.total, color: OTYPE[x.t].color }))} size={104} />
          <ChartLegend items={byType.map(x => ({ label: OTYPE[x.t].label, value: x.total, color: OTYPE[x.t].color }))} />
        </div>
      )}
    </div>
  );
}

/* ================================================================================================
   ACCOUNTS
   ================================================================================================ */
function AccountsTab({ accounts, setAccounts, incomes, logExpense, logIncome, openQuickAdd, moneyInHand }) {
  const [open, setOpen] = useState(null);      // account id for the detail sheet
  const [mode, setMode] = useState(null);      // 'move' | 'pickUpdate' | 'add'
  const monthIn = sum(incomes.filter(i => (i.date || "").slice(0, 7) === localMonth()), i => i.amount);
  const byPurpose = Object.keys(PURPOSE).map(p => ({ p, total: sum(accounts.filter(a => a.purpose === p), a => a.balance) }));
  const positive = byPurpose.reduce((s, x) => s + Math.max(0, x.total), 0);
  const acc = accounts.find(a => a.id === open);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card hero">
        <div className="lbl">Money in hand</div>
        <div className="num" style={{ fontSize: 36, color: moneyInHand < 0 ? C.coral : C.text }}>{moneyInHand < 0 ? "−" : ""}{inr(Math.abs(moneyInHand))}</div>
        {positive > 0 && (
          <div className="split" style={{ marginTop: 12 }}>
            {byPurpose.filter(x => x.total > 0).map(x => <div key={x.p} style={{ width: (x.total / positive) * 100 + "%", background: PURPOSE[x.p].color }} />)}
          </div>
        )}
        <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: "wrap", fontSize: 12.5 }}>
          {byPurpose.map(x => <span key={x.p}><span className="dot" style={{ background: PURPOSE[x.p].color }} />{PURPOSE[x.p].short} {inr(x.total)}</span>)}
        </div>
        <div className="sub" style={{ marginTop: 10 }}>{inr(monthIn)} came in this month</div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => openQuickAdd("in")}><Plus size={16} /> Add income</button>
        {accounts.length >= 2 && <button className="btn ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setMode("move")}><ArrowRightLeft size={16} /> Move</button>}
        <button className="btn ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setMode("pickUpdate")}>Update balance</button>
      </div>

      <div className="card" style={{ padding: "6px 16px" }}>
        {accounts.length === 0 && <Empty>No accounts yet — add the places you hold money.</Empty>}
        {accounts.map(a => (
          <button key={a.id} className="li li-btn" onClick={() => setOpen(a.id)}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{a.name}</div>
              <div className="row" style={{ gap: 6, marginTop: 3 }}>
                {a.purpose && <span className="tag" style={{ color: PURPOSE[a.purpose].color, borderColor: PURPOSE[a.purpose].color }}>{PURPOSE[a.purpose].short}</span>}
                {a.isCash && <span className="tag">💵 Cash</span>}
                {a.warChest?.on && <span className="tag">War chest</span>}
              </div>
            </div>
            <span className="num" style={{ fontSize: 19, color: (+a.balance || 0) < 0 ? C.coral : C.text }}>{(+a.balance || 0) < 0 ? "−" : ""}{inr(Math.abs(+a.balance || 0))}</span>
          </button>
        ))}
        <button className="li li-btn" onClick={() => setMode("add")} style={{ color: C.primary, fontWeight: 600 }}><span className="row" style={{ gap: 6 }}><Plus size={16} /> Add account</span><span /></button>
      </div>

      {mode === "move" && (
        <Sheet title="Move money" onClose={() => setMode(null)}>
          <MoveForm accounts={accounts} onMove={(from, to, amt) => { setAccounts(x => x.map(a => a.id === from ? { ...a, balance: (+a.balance || 0) - amt } : a.id === to ? { ...a, balance: (+a.balance || 0) + amt } : a)); setMode(null); }} onCancel={() => setMode(null)} />
          <div className="foot">For ATM withdrawals too (bank → cash). Moving money isn't spending, so it doesn't show up in Money.</div>
        </Sheet>
      )}
      {mode === "pickUpdate" && (
        <Sheet title="Update which account?" onClose={() => setMode(null)}>
          {accounts.map(a => <button key={a.id} className="li li-btn" onClick={() => { setMode(null); setOpen(a.id + ":update"); }}><span>{a.name}</span><span className="num">{inr(a.balance)}</span></button>)}
        </Sheet>
      )}
      {mode === "add" && (
        <Sheet title="New account" onClose={() => setMode(null)}>
          <AccountForm onSave={(a) => { setAccounts(x => [...x, { ...a, id: crypto.randomUUID() }]); setMode(null); }} onCancel={() => setMode(null)} />
        </Sheet>
      )}
      {open && (acc || accounts.find(a => a.id === open.split(":")[0])) && (
        <AccountSheet account={acc || accounts.find(a => a.id === open.split(":")[0])} startOnUpdate={open.endsWith(":update")}
          {...{ accounts, setAccounts, logExpense, logIncome }} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function AccountSheet({ account: a, startOnUpdate, accounts, setAccounts, logExpense, logIncome, onClose }) {
  const [actual, setActual] = useState(startOnUpdate ? "" : null);
  const [how, setHow] = useState("set");
  const [name, setName] = useState(a.name);
  const upd = (p) => setAccounts(x => x.map(y => y.id === a.id ? { ...y, ...p } : y));
  const cur = +a.balance || 0;
  const diff = actual === null || actual === "" ? 0 : (+actual - cur);
  function applyUpdate() {
    if (actual === "" || actual === null) return;
    const target = +actual;
    if (how === "spend" && diff < 0) logExpense({ amount: -diff, cat: "Other", note: "balance correction", accountId: "" });
    if (how === "income" && diff > 0) logIncome({ amount: diff, source: "Other", note: "balance correction", accountId: "" });
    upd({ balance: target });
    setActual(null); setHow("set");
  }
  return (
    <Sheet title={a.name} onClose={onClose}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="sub">Balance in the app</span>
        <span className="num" style={{ fontSize: 26, color: cur < 0 ? C.coral : C.text }}>{cur < 0 ? "−" : ""}{inr(Math.abs(cur))}</span>
      </div>

      {actual === null ? (
        <button className="btn" style={{ justifyContent: "center" }} onClick={() => setActual("")}>Update balance</button>
      ) : (
        <div className="panel">
          <span className="lbl">What does {a.name} actually have right now?</span>
          <input className="in num big" type="number" inputMode="decimal" autoFocus value={actual} onChange={e => setActual(e.target.value)} placeholder="₹ 0" />
          {actual !== "" && diff !== 0 && (
            <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
              <div className="sub">That's {diff > 0 ? "₹" + Math.abs(diff).toLocaleString("en-IN") + " more" : "₹" + Math.abs(diff).toLocaleString("en-IN") + " less"} than the app shows.</div>
              <Pill on={how === "set"} onClick={() => setHow("set")}>Just correct the balance</Pill>
              {diff < 0 && <Pill on={how === "spend"} onClick={() => setHow("spend")}>Log the difference as spending I forgot</Pill>}
              {diff > 0 && <Pill on={how === "income"} onClick={() => setHow("income")} color={C.teal}>Log the difference as income</Pill>}
            </div>
          )}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn ghost" onClick={() => setActual(null)}>Cancel</button>
            <button className="btn" style={{ flex: 1, justifyContent: "center" }} disabled={actual === ""} onClick={applyUpdate}>Save balance</button>
          </div>
        </div>
      )}

      <span className="lbl" style={{ marginTop: 6 }}>Name</span>
      <input className="in" value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== a.name && upd({ name: name.trim() })} />
      <span className="lbl">What this account is for</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {Object.keys(PURPOSE).map(p => <Pill key={p} on={a.purpose === p} color={PURPOSE[p].color} onClick={() => upd({ purpose: p })}>{PURPOSE[p].label}</Pill>)}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <Pill on={!!a.isCash} color={C.teal} onClick={() => upd({ isCash: !a.isCash })}>💵 Physical cash</Pill>
        <Pill on={!!a.warChest?.on} color={C.violet} onClick={() => upd({ warChest: a.warChest?.on ? { ...a.warChest, on: false } : { target: 10, cadence: "daily", vpa: "", fromAccountId: accounts.find(x => x.id !== a.id)?.id || "", streak: 0, lastLoggedDate: "", ...(a.warChest || {}), on: true } })}>War chest</Pill>
      </div>
      {a.warChest?.on && (
        <div className="panel" style={{ display: "grid", gap: 8 }}>
          <div className="sub">Small, steady amounts set aside here for friends & family repayments.</div>
          <div className="row" style={{ gap: 8 }}>
            <input className="in num" style={{ flex: 1 }} type="number" placeholder="10" value={a.warChest.target || ""} onChange={e => upd({ warChest: { ...a.warChest, target: +e.target.value } })} />
            <Seg options={[["daily", "per day"], ["weekly", "per week"]]} value={a.warChest.cadence} onChange={(v) => upd({ warChest: { ...a.warChest, cadence: v } })} />
          </div>
          {accounts.length > 1 && (
            <select className="in" value={a.warChest.fromAccountId || ""} onChange={e => upd({ warChest: { ...a.warChest, fromAccountId: e.target.value } })}>
              <option value="">Comes out of…</option>
              {accounts.filter(x => x.id !== a.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <input className="in" placeholder="Your UPI ID for this account (optional)" value={a.warChest.vpa || ""} onChange={e => upd({ warChest: { ...a.warChest, vpa: e.target.value } })} />
        </div>
      )}
      <button className="btn ghost danger" style={{ justifyContent: "center", marginTop: 6 }} onClick={() => { if (confirm(`Delete ${a.name}? Past entries stay, they just won't be linked to an account.`)) { setAccounts(x => x.filter(y => y.id !== a.id)); onClose(); } }}><Trash2 size={15} /> Delete account</button>
    </Sheet>
  );
}

/* ================================================================================================
   SALARY PLAN — splits a salary across dues, living, safety net, F&F snowball and trading
   ================================================================================================ */
function buildSalaryPlan({ plan, oblig, accounts, expenses }) {
  const salary = +plan.salary || 0;
  const open = oblig.filter(o => o.status !== "closed" && o.status !== "settled" && (+o.outstanding || 0) > 0);
  const dues = open.filter(o => +o.monthly > 0).map(o => ({ id: o.id, name: o.name.trim(), amount: Math.min(+o.monthly, +o.outstanding), type: o.type }));
  const duesTotal = sum(dues, d => d.amount);
  const livingSuggested = recentLivingAverage(expenses);
  const living = plan.living !== undefined && plan.living !== "" ? +plan.living : livingSuggested;
  const leftover = salary - duesTotal - living;
  const safetyAcc = accounts.find(a => a.id === plan.safetyAccountId);
  const bal = safetyAcc ? +safetyAcc.balance || 0 : 0;
  const starter = +plan.starterTarget || 0;
  const full = Math.max(+plan.fullTarget || 0, starter);
  let safety = 0, phase = "none";
  if (safetyAcc && leftover > 0 && full > 0) {
    if (bal < starter) { phase = "starter"; safety = Math.round(leftover * (+(plan.starterPct ?? 60)) / 100); }
    else if (bal < full) { phase = "building"; safety = Math.round(leftover * (+(plan.afterPct ?? 20)) / 100); }
    else phase = "full";
    safety = Math.max(0, Math.min(safety, full - bal));
  }
  const afterSafety = Math.max(0, leftover - safety);
  const tradingOk = !starter || bal >= starter;
  const trading = tradingOk ? Math.round(afterSafety * (+plan.tradingPct || 0) / 100) : 0;
  let pool = Math.max(0, afterSafety - trading);
  const duesById = Object.fromEntries(dues.map(d => [d.id, d.amount]));
  const fam = open.filter(o => o.type === "family").map(o => ({ ...o, left: (+o.outstanding || 0) - (duesById[o.id] || 0) })).filter(o => o.left > 0)
    .sort((a, b) => {
      const pa = a.priority ?? null, pb = b.priority ?? null;
      if (pa !== null || pb !== null) return (pa ?? Infinity) - (pb ?? Infinity);
      return a.left - b.left;
    });
  const ff = [];
  for (const o of fam) { if (pool <= 0) break; const amt = Math.min(pool, o.left); ff.push({ id: o.id, name: o.name.trim(), amount: Math.round(amt), clears: amt >= o.left, left: o.left }); pool -= amt; }
  const ffTotal = sum(ff, x => x.amount);
  const nextUp = fam.find(o => !ff.some(x => x.id === o.id && x.clears));
  return { salary, dues, duesTotal, living, livingSuggested, leftover, safetyAcc, bal, starter, full, safety, phase, trading, tradingOk, ff, ffTotal, nextUp, famOpen: fam.length };
}

function SalaryPlanCard({ plan, result, onOpen }) {
  const isPayday = plan && plan.salary && plan.payday && new Date().getDate() >= +plan.payday && plan.lastLogged !== localMonth();
  if (!plan || !plan.salary) {
    return (
      <button className="card li-btn" onClick={onOpen} style={{ display: "block", textAlign: "left", width: "100%" }}>
        <div className="hd" style={{ fontWeight: 600, fontSize: 16 }}>Plan your salary</div>
        <div className="sub" style={{ marginTop: 4 }}>Split each payday across dues, living, your safety net and friends & family — snowball style.</div>
      </button>
    );
  }
  const logged = plan.lastLogged === localMonth();
  return (
    <button className="card li-btn" onClick={onOpen} style={{ display: "block", textAlign: "left", width: "100%", ...(isPayday ? { border: "2px solid " + C.primary, background: C.surface2 } : {}) }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="hd" style={{ fontWeight: 600, fontSize: 16 }}>{isPayday ? "It's payday — log your plan" : "Salary plan"}</div>
        <span className="tag" style={logged ? { color: C.teal, borderColor: C.teal } : undefined}>{logged ? "Logged this month ✓" : "Tap to see this month"}</span>
      </div>
      {result.leftover < 0 ? (
        <div style={{ color: C.coral, fontSize: 13.5, marginTop: 6 }}>Dues + living are {inr(-result.leftover)} more than your salary.</div>
      ) : (
        <div className="row" style={{ gap: 10, marginTop: 10 }}>
          <Stat n={inr(result.safety)} l={"Safety net" + (result.safetyAcc ? " → " + result.safetyAcc.name : "")} />
          <Stat n={inr(result.ffTotal)} l="Friends & family" />
          {result.trading > 0 && <Stat n={inr(result.trading)} l="Trading" />}
        </div>
      )}
      {result.ff[0] && <div className="sub" style={{ marginTop: 8 }}>{result.ff[0].clears ? `${result.ff[0].name} fully repaid this month 🎉` : `Next up: ${result.ff[0].name} — ${inr(result.ff[0].left - result.ff[0].amount)} left after this month`}</div>}
    </button>
  );
}

function SalaryPlanSheet({ plan, setPlan, result, accounts, salaryLogged, onLog, onClose }) {
  const [edit, setEdit] = useState(!plan.salary);
  const [checked, setChecked] = useState({});
  const incomeAcc = accounts.find(a => a.purpose === "income")?.id || accounts[0]?.id || "";
  const fromAcc = plan.fromAccountId || incomeAcc;
  const lines = [
    ...(!salaryLogged ? [{ key: "salary", kind: "salary", label: "Salary received", sub: "Not logged as income this month yet", amount: result.salary, def: true, isIn: true }] : []),
    ...result.dues.map(d => ({ key: "due:" + d.id, kind: "due", id: d.id, label: d.name, sub: "Monthly due", amount: d.amount, def: false })),
    ...(result.safety > 0 ? [{ key: "safety", kind: "safety", label: "Safety net → " + result.safetyAcc.name, sub: `${result.phase === "starter" ? "Starter" : "Full"} goal ${inr(result.phase === "starter" ? result.starter : result.full)} · has ${result.bal < 0 ? "−" : ""}${inr(Math.abs(result.bal))}`, amount: result.safety, def: true }] : []),
    ...result.ff.map(x => ({ key: "ff:" + x.id, kind: "ff", id: x.id, label: x.name, sub: x.clears ? "Fully repaid with this 🎉" : `${inr(x.left - x.amount)} left after this`, amount: x.amount, def: true })),
    ...(result.trading > 0 ? [{ key: "trading", kind: "trading", label: "Trading", sub: `${plan.tradingPct}% of what's left after the safety net`, amount: result.trading, def: true }] : []),
  ];
  const isOn = (l) => checked[l.key] ?? l.def;
  const n = (k) => (e) => setPlan({ ...plan, [k]: e.target.value === "" ? "" : +e.target.value });
  return (
    <Sheet title="Salary plan" onClose={onClose}>
      {edit ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 2 }}><span className="lbl">Take-home salary</span><input className="in num" type="number" inputMode="numeric" value={plan.salary ?? ""} onChange={n("salary")} /></div>
            <div style={{ flex: 1 }}><span className="lbl">Payday</span><input className="in num" type="number" min="1" max="31" value={plan.payday ?? ""} onChange={n("payday")} placeholder="1" /></div>
          </div>
          <div><span className="lbl">Everyday living per month {result.livingSuggested > 0 && <>· your recent average is {inr(result.livingSuggested)}</>}</span>
            <input className="in num" type="number" inputMode="numeric" value={plan.living ?? ""} placeholder={String(result.livingSuggested || "")} onChange={n("living")} /></div>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><span className="lbl">Salary lands in</span>
              <select className="in" value={fromAcc} onChange={e => setPlan({ ...plan, fromAccountId: e.target.value })}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div style={{ flex: 1 }}><span className="lbl">Safety net account</span>
              <select className="in" value={plan.safetyAccountId || ""} onChange={e => setPlan({ ...plan, safetyAccountId: e.target.value })}><option value="">None</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><span className="lbl">Starter safety net</span><input className="in num" type="number" inputMode="numeric" value={plan.starterTarget ?? ""} onChange={n("starterTarget")} /></div>
            <div style={{ flex: 1 }}><span className="lbl">Full safety net</span><input className="in num" type="number" inputMode="numeric" value={plan.fullTarget ?? ""} onChange={n("fullTarget")} /></div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><span className="lbl">To safety net until starter (%)</span><input className="in num" type="number" value={plan.starterPct ?? 60} onChange={n("starterPct")} /></div>
            <div style={{ flex: 1 }}><span className="lbl">After starter, until full (%)</span><input className="in num" type="number" value={plan.afterPct ?? 20} onChange={n("afterPct")} /></div>
          </div>
          <div><span className="lbl">To trading, once the starter net is in place (% of what's left)</span><input className="in num" type="number" value={plan.tradingPct ?? 0} onChange={n("tradingPct")} /></div>
          <div className="foot">Monthly dues come from the Clear tab (every open debt with a monthly amount). A loan you can't prepay just needs its monthly amount there — the plan never adds extra to it. Friends & family without a monthly amount get the snowball: smallest first, or whoever you've pinned on Clear.</div>
          <button className="btn" style={{ justifyContent: "center" }} disabled={!plan.salary} onClick={() => setEdit(false)}>See the plan</button>
        </div>
      ) : (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="sub">From {inr(result.salary)} salary</span>
            <button className="link" onClick={() => setEdit(true)}>Edit numbers</button>
          </div>
          <div className="panel" style={{ display: "grid", gap: 4 }}>
            <Line l="Monthly dues" v={"− " + inr(result.duesTotal)} c={C.text} />
            <Line l="Everyday living" v={"− " + inr(result.living)} c={C.text} />
            <Line l="Left to plan" v={(result.leftover < 0 ? "− " : "") + inr(Math.abs(result.leftover))} c={result.leftover < 0 ? C.coral : C.teal} />
          </div>
          {result.leftover < 0 && <div style={{ color: C.coral, fontSize: 13.5 }}>Dues and living are more than your salary this month — lower the living figure, or check the monthly amounts on Clear.</div>}
          {!result.safetyAcc && result.leftover > 0 && <div className="sub">Pick a safety net account in "Edit numbers" to start building one.</div>}
          {result.trading === 0 && +plan.tradingPct > 0 && !result.tradingOk && <div className="sub">Trading starts once {result.safetyAcc?.name} reaches your starter safety net ({inr(result.starter)}).</div>}
          <div style={{ display: "grid" }}>
            {lines.map(l => (
              <label key={l.key} className="li" style={{ cursor: "pointer", gap: 10 }}>
                <input type="checkbox" checked={isOn(l)} onChange={e => setChecked(c => ({ ...c, [l.key]: e.target.checked }))} style={{ accentColor: C.primary, width: 18, height: 18 }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 500 }}>{l.label}</div><div className="sub">{l.sub}</div></div>
                <span className="num" style={{ fontSize: 15, color: l.isIn ? C.teal : l.kind === "ff" ? C.violet : l.kind === "safety" ? C.teal : C.text }}>{l.isIn ? "+" : ""}{inr(l.amount)}</span>
              </label>
            ))}
          </div>
          {result.nextUp && result.ffTotal > 0 && !result.ff.some(x => x.id === result.nextUp.id) && <div className="sub">After that: {result.nextUp.name.trim()}.</div>}
          <button className="btn" style={{ justifyContent: "center", padding: 14 }} disabled={!lines.some(isOn)} onClick={() => onLog(lines.filter(isOn), fromAcc)}>Log checked from {accounts.find(a => a.id === fromAcc)?.name || "no account"}</button>
          <div className="foot">Dues start unticked — tick them if they don't auto-debit. Paying someone else instead? Just log that on Clear; next month's plan recalculates from the real balances. This plan does the maths on your own numbers — it isn't financial advice.</div>
        </>
      )}
    </Sheet>
  );
}

/* ================================================================================================
   WANTS & MILESTONES — reaching a milestone earns a pick; spend it on one thing you can afford
   ================================================================================================ */
function computeAchievements({ oblig, settings }) {
  const since = settings.wantsSince || localDay();
  const list = [];
  oblig.filter(o => o.type === "family" && (o.status === "closed" || o.status === "settled") && o.closedAt && o.closedAt >= since)
    .forEach(o => list.push({ key: "ff:" + o.id, label: "Repaid " + o.name.trim(), date: o.closedAt }));
  const ach = settings.achieved || {};
  if (ach.safetyStarter) list.push({ key: "safetyStarter", label: "Starter safety net reached", date: ach.safetyStarter });
  if (ach.safetyFull) list.push({ key: "safetyFull", label: "Full safety net reached", date: ach.safetyFull });
  if (ach.streak30) list.push({ key: "streak30", label: "30-day Money Log streak", date: ach.streak30 });
  return list.sort((a, b) => b.date.localeCompare(a.date));
}
const WAIT_HOURS = 48;
function WantsCard({ wants, picks, nextHint, onOpen }) {
  const active = wants.filter(w => !w.boughtAt);
  return (
    <button className="card li-btn" onClick={onOpen} style={{ display: "block", textAlign: "left", width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="hd" style={{ fontWeight: 600, fontSize: 16 }}>Earned wants</div>
        {picks > 0 && <span className="tag" style={{ color: C.amber, borderColor: C.amber }}>{picks} pick{picks > 1 ? "s" : ""} to use</span>}
      </div>
      <div className="sub" style={{ marginTop: 4 }}>
        {active.length === 0 ? "List things you want. Each milestone you hit earns one pick." : picks > 0 ? "You've earned a pick — choose one thing you can afford." : nextHint ? "Next pick: " + nextHint : `${active.length} on your list`}
      </div>
    </button>
  );
}
function WantsSheet({ settings, setSettings, achievements, picks, available, nextHint, logExpense, onClose }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const wants = settings.wants || [];
  const setWants = (fn) => setSettings(s => ({ ...s, wantsSince: s.wantsSince || localDay(), wants: fn(s.wants || []) }));
  const nowMs = Date.now();
  return (
    <Sheet title="Earned wants" onClose={onClose}>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>{picks} pick{picks === 1 ? "" : "s"} available</span>
          <span className="sub">Free to spend now: <b className="num">{inr(Math.max(0, available))}</b></span>
        </div>
        {nextHint && <div className="sub" style={{ marginTop: 4 }}>Next pick: {nextHint}</div>}
        {achievements.length > 0 && <div className="sub" style={{ marginTop: 6 }}>Earned: {achievements.slice(0, 4).map(a => a.label).join(" · ")}</div>}
      </div>
      <div style={{ display: "grid" }}>
        {wants.filter(w => !w.boughtAt).map(w => {
          const chosen = !!w.chosenAt;
          const readyAt = chosen ? new Date(w.chosenAt).getTime() + WAIT_HOURS * 3600e3 : 0;
          const ready = chosen && nowMs >= readyAt;
          const affordable = (+w.price || 0) <= available;
          return (
            <div key={w.id} className="li" style={{ alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{w.name}</div>
                <div className="sub">{inr(w.price)}{chosen ? (ready ? " · ready to buy" : " · buy after " + new Date(readyAt).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })) : !affordable ? ` · ${inr(w.price - Math.max(0, available))} more than you have free` : ""}</div>
              </div>
              {!chosen && <button className="btn" style={{ padding: "7px 12px", fontSize: 13 }} disabled={picks < 1 || !affordable} onClick={() => setWants(ws => ws.map(x => x.id === w.id ? { ...x, chosenAt: new Date().toISOString() } : x))}>Use a pick</button>}
              {chosen && !ready && <button className="btn ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => setWants(ws => ws.map(x => x.id === w.id ? { ...x, chosenAt: null } : x))}>Changed my mind</button>}
              {chosen && ready && <button className="btn" style={{ padding: "7px 12px", fontSize: 13, background: C.teal }} onClick={() => { logExpense({ amount: +w.price, cat: "Reward", note: w.name }); setWants(ws => ws.map(x => x.id === w.id ? { ...x, boughtAt: localDay() } : x)); }}>Bought it</button>}
              {!chosen && <button className="ib" onClick={() => setWants(ws => ws.filter(x => x.id !== w.id))}><Trash2 size={14} /></button>}
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input className="in" placeholder="Something you want" value={name} onChange={e => setName(e.target.value)} style={{ flex: 2 }} />
        <input className="in num" type="number" inputMode="numeric" placeholder="₹" value={price} onChange={e => setPrice(e.target.value)} style={{ flex: 1 }} />
        <button className="btn" disabled={!name.trim() || !+price} onClick={() => { setWants(ws => [...ws, { id: crypto.randomUUID(), name: name.trim(), price: +price, addedAt: localDay() }]); setName(""); setPrice(""); }}><Plus size={16} /></button>
      </div>
      {wants.some(w => w.boughtAt) && <div className="sub">Bought: {wants.filter(w => w.boughtAt).map(w => w.name).join(", ")}</div>}
      <div className="foot">Milestones: fully repaying a friend or family member, reaching your starter and full safety net, and a 30-day Money Log streak. A pick can only go to something that fits in what's free to spend now (safe-to-spend, not counting your safety net). After you choose, there's a {WAIT_HOURS}-hour wait before it's marked ready — if you still want it then, buy it.</div>
    </Sheet>
  );
}
// The mark: a hexagon (six — the number both "Clearing" and your full name reduce to, ruled by
// Venus, whose metal is copper) around a crescent moon (the Moon rules Cancer), which also reads as
// the C of Clearing.
function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="60 60 392 392" aria-hidden="true">
      <polygon points="256,80 408.42,168 408.42,344 256,432 103.58,344 103.58,168" fill="none" stroke={C.amber} strokeWidth="22" strokeLinejoin="round" />
      <path d="M 308.86 166.44 A 104 104 0 1 0 308.86 345.56 A 90 90 0 1 1 308.86 166.44 Z" fill={C.primary} />
    </svg>
  );
}
function SettingsSheet({ settings, setSettings, notif, askNotif, exportData, importData, accounts, cards, debtPlan, onClose }) {
  const rec = settings.recurring || [];
  const setRec = (fn) => setSettings(s => ({ ...s, recurring: fn(s.recurring || []) }));
  const whereName = (id) => !id ? "no account" : id.startsWith("card:") ? "💳 " + ((cards.find(c => "card:" + c.id === id) || {}).name || "card").trim() : (accounts.find(a => a.id === id) || {}).name || "account";
  const toggle = (k, def) => setSettings(s => ({ ...s, [k]: !(s[k] ?? def) }));
  const Row = ({ on, onClick, children }) => (
    <label className="li" style={{ cursor: "pointer" }}><span style={{ fontSize: 14.5 }}>{children}</span>
      <input type="checkbox" checked={on} onChange={onClick} style={{ accentColor: C.primary, width: 20, height: 20 }} /></label>
  );
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="lbl" style={{ margin: 0 }}>Buffer to keep aside</span>
          <span className="num" style={{ fontSize: 15 }}>{inr(settings.buffer || 0)}</span>
        </div>
        <input type="range" min={0} max={10000} step={100} value={Math.min(10000, +settings.buffer || 0)} onChange={e => setSettings(s => ({ ...s, buffer: +e.target.value }))} style={{ width: "100%", accentColor: C.primary, marginTop: 8 }} />
        <div className="sub">Taken off "safe to spend" on Home, so there's always a little left.</div>
      </div>

      <div>
        <span className="lbl">Repeating spends</span>
        {rec.length === 0 ? <div className="sub">None yet. When you log a spend with +, tick "Repeats every month".</div> : rec.map(r => (
          <div key={r.id} className="li" style={{ gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 500, opacity: r.active ? 1 : .5 }}>{r.note || r.cat} · {inr(r.amount)}</div>
              <div className="sub">{r.cat} · on the {ordinal(+r.day)} · {whereName(r.accountId)}{r.active ? "" : " · paused"}</div>
            </div>
            <button className="pill" onClick={() => setRec(list => list.map(x => x.id === r.id ? { ...x, active: !x.active, lastMonth: !x.active ? localMonth() : x.lastMonth } : x))}>{r.active ? "Pause" : "Resume"}</button>
            <button className="ib" onClick={() => { if (confirm("Stop repeating this spend? Past entries stay.")) setRec(list => list.filter(x => x.id !== r.id)); }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      <div>
        <span className="lbl">Reminders & backups</span>
        <Row on={notif === "granted"} onClick={askNotif}>Phone notifications for dues</Row>
        <Row on={!!settings.logReminder} onClick={() => toggle("logReminder", false)}>Email me at 8:30pm if today's Money Log isn't posted</Row>
        <Row on={settings.backupEmail ?? true} onClick={() => toggle("backupEmail", true)}>Email me a backup of everything on the 1st of each month</Row>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={exportData} style={{ flex: 1, justifyContent: "center" }}><Download size={16} /> Back up now</button>
        <label className="btn ghost" style={{ flex: 1, cursor: "pointer", justifyContent: "center" }}>
          <Upload size={16} /> Restore
          <input type="file" accept="application/json" onChange={importData} style={{ display: "none" }} />
        </label>
      </div>
      {debtPlan && debtPlan.order.length > 0 && !debtPlan.insufficient && <div className="sub">Debt-free target: {fmtMonthYear(debtPlan.debtFreeDate)} at your current pace (details on Clear).</div>}
    </Sheet>
  );
}
function Stat({ n, l }) {
  return (
    <div style={{ flex: 1, background: C.surface2, borderRadius: 14, padding: "10px 12px" }}>
      <div className="num" style={{ fontSize: 18 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: C.muted }}>{l}</div>
    </div>
  );
}
function Empty({ children }) { return <div style={{ fontSize: 13, color: C.faint, padding: "8px 0" }}>{children}</div>; }
