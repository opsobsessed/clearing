"use client";
import { useEffect, useRef, useState } from "react";
import { X, Download, Share2 } from "lucide-react";

/* The Money Log — shareable Instagram story images (1080×1920) drawn on a canvas in a hand-written
   notebook style, computed from the app's own data:
   - the daily log: today's spends, the month so far by category, money that came in today
   - the monthly wrap-up: money out vs in, where it went, where it came from, debt repaid
   Each post carries a day number (editable, auto-increments per post) and a quote of the day. */

const W = 1080, H = 1920;
const FONT = "Kalam";
const INK = "#1F2A5C", INK_SOFT = "#4A5680", PAPER = "#FAF6EE", RULE = "#DCE6F2", MARGIN = "#F2B8B8";
const SLICE_COLORS = ["#E5534B", "#F0923A", "#F5CE47", "#74B85C", "#4A90D9", "#8A6FC4", "#3FB5A8", "#E07BB0", "#A9CB58", "#9A9A9A"];
const CAT_EMOJI = {
  food: "🍽️", "dine out": "🍽️", groceries: "🧺", transport: "🚕", travel: "✈️", rent: "🏠", utilities: "💡",
  phone: "📱", medical: "💊", health: "💊", shopping: "🛍️", "loan repayments": "💸", other: "🧾",
};
const emojiFor = (cat) => CAT_EMOJI[(cat || "").toLowerCase()] || (/^paid /i.test(cat || "") ? "💸" : "🧾");
const inr = (n) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
// "Hide amounts" mode: rupee figures become dots, percentages stay — for days you'd rather not share numbers.
let HIDE = false;
const money = (n) => HIDE ? "₹ ••••" : inr(n);
const plain = (n) => HIDE ? "•••" : new Intl.NumberFormat("en-IN").format(Math.round(n || 0));
// Quote of the day. Kept to quotes with well-established sources; add your own in the app and
// they join the rotation.
export const QUOTES = [
  { q: "Beware of little expenses; a small leak will sink a great ship.", a: "Benjamin Franklin" },
  { q: "You miss 100% of the shots you don't take.", a: "Wayne Gretzky" },
  { q: "A journey of a thousand miles begins with a single step.", a: "Lao Tzu" },
  { q: "Fall seven times, stand up eight.", a: "Japanese proverb" },
  { q: "It is not the man who has too little, but the man who craves more, that is poor.", a: "Seneca" },
  { q: "Money is a very excellent servant, but a terrible master.", a: "P. T. Barnum" },
  { q: "Well begun is half done.", a: "Aristotle" },
  { q: "Drop by drop is the water pot filled.", a: "The Dhammapada" },
  { q: "Energy and persistence conquer all things.", a: "Benjamin Franklin" },
  { q: "We must consult our means rather than our wishes.", a: "George Washington" },
  { q: "Small deeds done are better than great deeds planned.", a: "Peter Marshall" },
  { q: "The best time to plant a tree was 20 years ago. The second best time is now.", a: "Proverb" },
  { q: "Every rupee gets a job.", a: "" },
  { q: "Progress, not perfection.", a: "" },
];
export function quoteFor(dateStr, custom = []) {
  const all = [...(custom || []), ...QUOTES];
  const d = new Date(dateStr + "T00:00:00");
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return all[(dayOfYear + d.getFullYear()) % all.length];
}

// ---------- data ----------
export function buildSnapshot({ date, expenses, payments, incomes, oblig, sourceLabel, budget = 0, includeLoans = true, showIncome = true }) {
  if (!includeLoans) payments = [];
  const month = date.slice(0, 7);
  const debtName = (id) => ((oblig || []).find(o => o.id === id) || {}).name || "a debt";
  const todayItems = [
    ...(expenses || []).filter(e => e.date === date).map(e => ({ label: e.cat || "Spending", note: e.note || "", amount: +e.amount || 0, cat: e.cat })),
    ...(payments || []).filter(p => p.date === date).map(p => ({ label: "Paid " + debtName(p.obligId), note: "", amount: +p.amount || 0, cat: "Loan repayments" })),
  ].sort((a, b) => b.amount - a.amount);
  const monthExp = (expenses || []).filter(e => (e.date || "").slice(0, 7) === month && e.date <= date);
  const monthPaid = (payments || []).filter(p => (p.date || "").slice(0, 7) === month && p.date <= date).reduce((s, p) => s + (+p.amount || 0), 0);
  const byCat = {};
  monthExp.forEach(e => { const c = e.cat || "Other"; byCat[c] = (byCat[c] || 0) + (+e.amount || 0); });
  if (monthPaid > 0) byCat["Loan repayments"] = monthPaid;
  const cats = Object.entries(byCat).map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  // Keep the legend readable: top 6 categories, the rest folded into "Everything else".
  const slices = cats.length > 7 ? [...cats.slice(0, 6), { label: "Everything else", value: cats.slice(6).reduce((s, x) => s + x.value, 0) }] : cats;
  // Money in is only shown on the day it arrives (salary day, a reimbursement landing) — repeating
  // the same monthly salary figure on every daily post adds nothing and puts income on display.
  const bySource = {};
  if (showIncome) (incomes || []).filter(i => i.date === date).forEach(i => { const s = sourceLabel(i); bySource[s] = (bySource[s] || 0) + (+i.amount || 0); });
  const sources = Object.entries(bySource).map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  // Budget covers everyday spending only (same rule as the Spending tab), not loan repayments.
  const monthLiving = monthExp.reduce((s, e) => s + (+e.amount || 0), 0);
  return {
    date, todayItems,
    todayTotal: todayItems.reduce((s, x) => s + x.amount, 0),
    monthTotal: cats.reduce((s, x) => s + x.value, 0),
    slices, sources,
    inTotal: sources.reduce((s, x) => s + x.value, 0),
    budget: +budget || 0, budgetLeft: (+budget || 0) - monthLiving,
  };
}

// ---------- drawing helpers ----------
const f = (size, weight = 400) => `${weight} ${size}px "${FONT}", "Comic Sans MS", cursive`;
function text(ctx, s, x, y, { size = 40, weight = 400, color = INK, align = "left", maxW } = {}) {
  ctx.font = f(size, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  if (maxW) { let t = s; while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + "…"; s = t; }
  ctx.fillText(s, x, y);
}
function highlight(ctx, label, x, y, color, { size = 46, align = "left" } = {}) {
  ctx.font = f(size, 700);
  const w = ctx.measureText(label).width;
  const left = align === "center" ? x - w / 2 : x;
  ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(left - 16, y - size * 0.72); ctx.lineTo(left + w + 18, y - size * 0.80);
  ctx.lineTo(left + w + 12, y + size * 0.22); ctx.lineTo(left - 12, y + size * 0.28); ctx.closePath(); ctx.fill(); ctx.restore();
  text(ctx, label, left, y, { size, weight: 700 });
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function dashedBox(ctx, x, y, w, h, color, dash = [14, 10]) {
  ctx.save(); ctx.setLineDash(dash); ctx.lineWidth = 3; ctx.strokeStyle = color; roundRect(ctx, x, y, w, h, 18); ctx.stroke(); ctx.restore();
}
function sparks(ctx, cx, cy, spread, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = "round";
  [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]].forEach(([sx, sy]) => {
    const x0 = cx + sx * spread, y0 = cy + sy * 22;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + sx * 26, y0 + sy * 10); ctx.stroke();
  });
  ctx.restore();
}
function dottedRule(ctx, x1, x2, y) { ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = "#8C96C4"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); ctx.restore(); }

function paper(ctx) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = RULE; ctx.lineWidth = 2;
  for (let y = 150; y < H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.strokeStyle = MARGIN; ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(110, H); ctx.stroke();
  // spiral binding
  for (let y = 40; y < H; y += 62) {
    ctx.fillStyle = "#2B2B2B"; ctx.beginPath(); ctx.ellipse(34, y, 20, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAPER; ctx.beginPath(); ctx.ellipse(38, y, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#555"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(8, y + 4); ctx.lineTo(56, y - 2); ctx.stroke();
  }
}

function wrapLines(ctx, str, maxW, maxLines) {
  const words = (str || "").split(/\s+/).filter(Boolean); const lines = []; let cur = "";
  words.forEach(w => { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
  return lines;
}
// Paper-clipped box with the quote of the day (up to two lines) and its author.
function quoteBox(ctx, L, R, by, bh, quote) {
  const q = (quote && quote.q) || "", a = (quote && quote.a) || "";
  ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 4; roundRect(ctx, L - 10, by, R - L + 20, bh, 26); ctx.stroke(); ctx.restore();
  dashedBox(ctx, L + 6, by + 14, R - L - 12, bh - 28, "#E2B84A", [12, 9]);
  ctx.save(); ctx.strokeStyle = "#6B6B6B"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(L + 10, by + 50); ctx.lineTo(L + 10, by - 6); ctx.arc(L + 26, by - 6, 16, Math.PI, 0); ctx.lineTo(L + 42, by + 44); ctx.arc(L + 32, by + 44, 10, 0, Math.PI); ctx.lineTo(L + 22, by + 4); ctx.stroke(); ctx.restore();
  let size = 38; ctx.font = f(size);
  let lines = wrapLines(ctx, "“" + q + "”", R - L - 170, 2);
  if (lines.length === 2 && lines[1].endsWith("…")) { size = 33; ctx.font = f(size); lines = wrapLines(ctx, "“" + q + "”", R - L - 170, 2); }
  const lineH = size * 1.2, blockH = lines.length * lineH + (a ? 40 : 0);
  let y = by + bh / 2 - blockH / 2 + size * 0.85;
  lines.forEach(l => { text(ctx, l, (L + R) / 2, y, { size, align: "center" }); y += lineH; });
  if (a) text(ctx, "— " + a, (L + R) / 2, y + 2, { size: 30, align: "center", color: "#C0504A" });
  ctx.save(); ctx.translate(R - 50, by + bh - 40); ctx.fillStyle = "#F2A0B4"; ctx.strokeStyle = "#C9607C"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 18); ctx.bezierCurveTo(-40, -10, -22, -40, 0, -20); ctx.bezierCurveTo(22, -40, 40, -10, 0, 18); ctx.fill(); ctx.stroke(); ctx.restore();
}
function header(ctx, L, R, title, sub) {
  let ts = 96; ctx.font = f(ts, 700);
  while (ctx.measureText(title).width > R - L - 140 && ts > 60) { ts -= 4; ctx.font = f(ts, 700); }
  const ty = 250 + 90;
  text(ctx, title, (L + R) / 2, ty, { size: ts, weight: 700, align: "center" });
  const tw = ctx.measureText(title).width;
  sparks(ctx, (L + R) / 2, ty - 30, tw / 2 + 24, INK);
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  [ty + 24, ty + 36].forEach(y => { ctx.beginPath(); ctx.moveTo((L + R) / 2 - tw / 2, y); ctx.lineTo((L + R) / 2 + tw / 2, y); ctx.stroke(); });
  text(ctx, sub, (L + R) / 2, ty + 96, { size: 38, color: INK_SOFT, align: "center" });
  return ty;
}
function legendList(ctx, lx, R, cy, slices, total) {
  const legend = slices.slice(0, 6);
  const lh = legend.length > 4 ? 44 : 54;
  let ly = cy - (legend.length - 1) * lh / 2 + 12;
  if (!legend.length) text(ctx, "Nothing logged yet.", lx, cy, { size: 32, color: INK_SOFT });
  legend.forEach((s, i) => {
    ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length]; ctx.beginPath(); ctx.arc(lx + 14, ly - 12, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#3A3A3A"; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, s.label, lx + 42, ly, { size: 34, maxW: R - lx - 140 });
    const pct = (s.value / total) * 100;
    text(ctx, (pct > 0 && pct < 1 ? "<1" : Math.round(pct)) + "%", R, ly, { size: 34, weight: 700, align: "right" });
    ly += lh;
  });
}
function footer(ctx, L, R, fy, label) {
  ctx.font = f(42, 700); const half = ctx.measureText(label).width / 2 + 30;
  dottedRule(ctx, L, (L + R) / 2 - half, fy - 12); dottedRule(ctx, (L + R) / 2 + half, R, fy - 12);
  text(ctx, label, (L + R) / 2, fy, { size: 42, weight: 700, align: "center" });
}
function donut(ctx, cx, cy, r, slices) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) { ctx.fillStyle = RULE; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
  let a = -Math.PI / 2;
  slices.forEach((s, i) => {
    const b = a + (s.value / total) * Math.PI * 2;
    ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length];
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, b); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#3A3A3A"; ctx.lineWidth = 2.5; ctx.stroke();
    a = b;
  });
  ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(cx, cy, r * 0.46, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#3A3A3A"; ctx.lineWidth = 2.5; ctx.stroke();
}

export function drawMoneyLog(canvas, snap, { dayNumber, quote, hide = false, title = "THE MONEY LOG" }) {
  HIDE = hide;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  paper(ctx);
  const L = 150, R = W - 70;
  const d = new Date(snap.date + "T00:00:00");
  const dateLabel = d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const monthLabel = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase();
  const dayStr = String(dayNumber).padStart(2, "0");

  // Instagram covers roughly the top and bottom 250px of a story with its own UI (profile bar,
  // reply field), so everything that matters sits between SAFE_TOP and SAFE_BOTTOM.
  const SAFE_TOP = 250, SAFE_BOTTOM = H - 250;

  const ty = header(ctx, L, R, title, `${dateLabel}  ·  Day ${dayStr}`);

  // Row 1: month total | today total
  const colW = (R - L - 40) / 2, r1 = ty + 186;
  highlight(ctx, "MONTHLY SPEND", L + 10, r1, "#F4A6A6", { size: 42 });
  text(ctx, `( ${monthLabel} )`, L + 10, r1 + 48, { size: 30, color: INK_SOFT });
  dashedBox(ctx, L, r1 + 70, colW, 150, "#D86A6A");
  text(ctx, "TOTAL SPENT SO FAR", L + colW / 2, r1 + 118, { size: 30, align: "center", color: INK_SOFT });
  text(ctx, money(snap.monthTotal), L + colW / 2, r1 + 195, { size: 72, weight: 700, align: "center", maxW: colW - 30 });

  const Rx = L + colW + 40;
  highlight(ctx, "TODAY'S SPEND", Rx + 10, r1, "#A9C8EE", { size: 42 });
  text(ctx, snap.todayItems.length ? `${snap.todayItems.length} ${snap.todayItems.length === 1 ? "entry" : "entries"}` : "no-spend day ✨", Rx + 10, r1 + 48, { size: 30, color: INK_SOFT });
  dashedBox(ctx, Rx, r1 + 70, colW, 150, "#6D95CF");
  text(ctx, "SPENT TODAY", Rx + colW / 2, r1 + 118, { size: 30, align: "center", color: INK_SOFT });
  text(ctx, money(snap.todayTotal), Rx + colW / 2, r1 + 195, { size: 72, weight: 700, align: "center", maxW: colW - 30 });

  // Today's list
  let y = r1 + 285;
  text(ctx, "WHAT", L, y, { size: 28, weight: 700, color: INK_SOFT });
  text(ctx, "AMOUNT (₹)", R, y, { size: 28, weight: 700, color: INK_SOFT, align: "right" });
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L, y + 16); ctx.lineTo(R, y + 16); ctx.stroke();
  const maxRows = 3;
  const rows = snap.todayItems.slice(0, maxRows);
  y += 70;
  if (!rows.length) { text(ctx, "Nothing spent today — that counts too.", L + 10, y, { size: 36, color: INK_SOFT }); dottedRule(ctx, L, R, y + 20); }
  rows.forEach((it, i) => {
    const extra = i === maxRows - 1 && snap.todayItems.length > maxRows ? snap.todayItems.length - maxRows + 1 : 0;
    if (extra) {
      const rest = snap.todayItems.slice(maxRows - 1).reduce((s, x) => s + x.amount, 0);
      text(ctx, `🧾  + ${extra} more`, L + 6, y, { size: 36 });
      text(ctx, plain(rest), R, y, { size: 38, weight: 700, align: "right" });
    } else {
      text(ctx, `${emojiFor(it.cat || it.label)}  ${it.label}${it.note ? " · " + it.note : ""}`, L + 6, y, { size: 36, maxW: R - L - 200 });
      text(ctx, plain(it.amount), R, y, { size: 38, weight: 700, align: "right" });
    }
    dottedRule(ctx, L, R, y + 20); y += 58;
  });

  // Where the money is going
  y = r1 + 555;
  highlight(ctx, "WHERE MY MONEY IS GOING", (L + R) / 2, y, "#BFD98A", { size: 42, align: "center" });
  const cy = y + 160, cx = L + 140;
  donut(ctx, cx, cy, 125, snap.slices);
  text(ctx, "THIS", cx, cy - 6, { size: 26, align: "center", color: INK_SOFT });
  text(ctx, "MONTH", cx, cy + 24, { size: 26, align: "center", color: INK_SOFT });
  const lx = L + 320;
  const legend = snap.slices.slice(0, 6);
  const lh = legend.length > 4 ? 44 : 54;
  let ly = cy - (legend.length - 1) * lh / 2 + 12;
  if (!legend.length) text(ctx, "No spends logged yet this month.", lx, cy, { size: 32, color: INK_SOFT });
  legend.forEach((s, i) => {
    ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length]; ctx.beginPath(); ctx.arc(lx + 14, ly - 12, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#3A3A3A"; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, s.label, lx + 42, ly, { size: 34, maxW: R - lx - 140 });
    const pct = (s.value / snap.monthTotal) * 100;
    text(ctx, (pct > 0 && pct < 1 ? "<1" : Math.round(pct)) + "%", R, ly, { size: 34, weight: 700, align: "right" });
    ly += lh;
  });

  // One bottom line: money that came in today if any, otherwise budget left (if a budget is set).
  y = cy + 190;
  if (snap.sources.length) {
    highlight(ctx, "CAME IN TODAY", L + 10, y, "#F7D774", { size: 40 });
    const label = snap.sources.map(s => HIDE ? s.label : `${s.label} ${inr(s.value)}`).join("  ·  ");
    text(ctx, label, R, y, { size: 32, weight: 700, align: "right", maxW: R - L - 400 });
  } else if (snap.budget > 0) {
    const left = snap.budgetLeft;
    const usedPct = Math.round(((snap.budget - left) / snap.budget) * 100);
    highlight(ctx, HIDE ? "BUDGET USED THIS MONTH" : left >= 0 ? "BUDGET LEFT THIS MONTH" : "OVER BUDGET BY", L + 10, y, left >= 0 ? "#F7D774" : "#F4A6A6", { size: 40 });
    text(ctx, HIDE ? usedPct + "%" : inr(Math.abs(left)), R, y, { size: 44, weight: 700, align: "right" });
    const bw = R - L, used = Math.min(1, Math.max(0, (snap.budget - left) / snap.budget));
    ctx.save(); roundRect(ctx, L, y + 26, bw, 18, 9); ctx.fillStyle = "#EFE6CF"; ctx.fill();
    roundRect(ctx, L, y + 26, Math.max(18, bw * used), 18, 9); ctx.fillStyle = left >= 0 ? "#F0923A" : "#E5534B"; ctx.fill(); ctx.restore();
  }

  quoteBox(ctx, L, R, SAFE_BOTTOM - 165, 165, quote);

  // Footer sits in the zone Instagram may cover — decorative only (Day N is also in the header).
  const fy = H - 150;
  footer(ctx, L, R, fy, `DAY ${dayStr} / ∞`);
}

// ---------- monthly wrap-up ----------
export function buildMonthWrap({ month, today, expenses, payments, incomes, oblig, sourceLabel, includeLoans = true }) {
  const inMonth = (x) => (x.date || "").slice(0, 7) === month;
  const exp = (expenses || []).filter(inMonth);
  const pays = (payments || []).filter(inMonth);
  const loansPaid = pays.reduce((s, p) => s + (+p.amount || 0), 0);
  const byCat = {};
  exp.forEach(e => { const c = e.cat || "Other"; byCat[c] = (byCat[c] || 0) + (+e.amount || 0); });
  if (includeLoans && loansPaid > 0) byCat["Loan repayments"] = loansPaid;
  const cats = Object.entries(byCat).map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const slices = cats.length > 6 ? [...cats.slice(0, 5), { label: "Everything else", value: cats.slice(5).reduce((s, x) => s + x.value, 0) }] : cats;
  const outTotal = cats.reduce((s, x) => s + x.value, 0);
  const bySource = {};
  (incomes || []).filter(inMonth).forEach(i => { const k = sourceLabel(i); bySource[k] = (bySource[k] || 0) + (+i.amount || 0); });
  const sources = Object.entries(bySource).map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  // Same basis as outTotal, for last month.
  const [y, m] = month.split("-").map(Number);
  const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const prevOut = (expenses || []).filter(e => (e.date || "").slice(0, 7) === prev).reduce((s, e) => s + (+e.amount || 0), 0)
    + (includeLoans ? (payments || []).filter(p => (p.date || "").slice(0, 7) === prev).reduce((s, p) => s + (+p.amount || 0), 0) : 0);
  // No-spend days: days so far this month (or the whole month, if it's over) with no everyday spend logged.
  const daysInMonth = new Date(y, m, 0).getDate();
  const lastDay = today.slice(0, 7) === month ? +today.slice(8, 10) : daysInMonth;
  const spendDays = new Set(exp.map(e => e.date));
  let noSpend = 0;
  for (let d = 1; d <= lastDay; d++) if (!spendDays.has(`${month}-${String(d).padStart(2, "0")}`)) noSpend++;
  return {
    month, slices, sources, outTotal, loansPaid, noSpend, daysSoFar: lastDay,
    inTotal: sources.reduce((s, x) => s + x.value, 0),
    vsLast: prevOut > 0 ? Math.round(((outTotal - prevOut) / prevOut) * 100) : null,
    complete: lastDay === daysInMonth && today.slice(0, 7) !== month,
  };
}

export function drawMonthWrap(canvas, wrap, { quote, hide = false }) {
  HIDE = hide;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  paper(ctx);
  const L = 150, R = W - 70, SAFE_BOTTOM = H - 250;
  const d = new Date(wrap.month + "-01T00:00:00");
  const monthName = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const ty = header(ctx, L, R, "MONTH IN REVIEW", wrap.complete ? monthName : `${monthName} · so far (${wrap.daysSoFar} days)`);

  // Money out | money in
  const colW = (R - L - 40) / 2, r1 = ty + 186, Rx = L + colW + 40;
  highlight(ctx, "MONEY OUT", L + 10, r1, "#F4A6A6", { size: 42 });
  highlight(ctx, "MONEY IN", Rx + 10, r1, "#F7D774", { size: 42 });
  dashedBox(ctx, L, r1 + 30, colW, 150, "#D86A6A");
  dashedBox(ctx, Rx, r1 + 30, colW, 150, "#D9B64A");
  text(ctx, money(wrap.outTotal), L + colW / 2, r1 + 132, { size: 72, weight: 700, align: "center", maxW: colW - 30 });
  text(ctx, money(wrap.inTotal), Rx + colW / 2, r1 + 132, { size: 72, weight: 700, align: "center", maxW: colW - 30 });

  // Three stats
  const sy = r1 + 250, sw = (R - L) / 3;
  const stats = [
    ["vs last month", wrap.vsLast === null ? "—" : (wrap.vsLast > 0 ? "+" : "") + wrap.vsLast + "%", wrap.vsLast !== null && wrap.vsLast > 0 ? "#C0504A" : "#3E8E5A"],
    ["no-spend days", String(wrap.noSpend), INK],
    ["debt repaid", money(wrap.loansPaid), "#6B5B8E"],
  ];
  stats.forEach(([l, v, c], i) => {
    const cx = L + sw * i + sw / 2;
    text(ctx, l.toUpperCase(), cx, sy, { size: 26, align: "center", color: INK_SOFT });
    text(ctx, v, cx, sy + 58, { size: 50, weight: 700, align: "center", color: c, maxW: sw - 20 });
    if (i) { ctx.save(); ctx.setLineDash([8, 8]); ctx.strokeStyle = "#8C96C4"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L + sw * i, sy - 30); ctx.lineTo(L + sw * i, sy + 70); ctx.stroke(); ctx.restore(); }
  });

  // Where it went
  let y = sy + 160;
  highlight(ctx, "WHERE IT WENT", L + 10, y, "#BFD98A", { size: 42 });
  const cy = y + 150, cx = L + 125;
  donut(ctx, cx, cy, 115, wrap.slices);
  legendList(ctx, L + 290, R, cy, wrap.slices, wrap.outTotal);

  // Where it came from
  y = cy + 185;
  highlight(ctx, "WHERE IT CAME FROM", L + 10, y, "#F7D774", { size: 42 });
  y += 58;
  const src = wrap.sources.slice(0, 3);
  if (!src.length) text(ctx, "Nothing logged in this month.", L + 10, y, { size: 32, color: INK_SOFT });
  src.forEach(s => {
    const pct = wrap.inTotal ? Math.round((s.value / wrap.inTotal) * 100) : 0;
    text(ctx, s.label, L + 10, y, { size: 34, maxW: R - L - 300 });
    text(ctx, HIDE ? pct + "%" : `${inr(s.value)}  ·  ${pct}%`, R, y, { size: 34, weight: 700, align: "right" });
    dottedRule(ctx, L, R, y + 16); y += 50;
  });

  quoteBox(ctx, L, R, SAFE_BOTTOM - 165, 165, quote);
  const fy = H - 150;
  footer(ctx, L, R, fy, d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase() + " · WRAPPED");
}

// ---------- modal ----------
// Shared-state settings used here (all saved with the rest of the app's data, so they sync across devices):
//   settings.logPosts[date]  = { day, quote: {q, a} }  — recorded when you share/save a daily post
//   settings.quotes          = [{q, a}]                — your own quotes, added to the rotation
//   settings.logReminder     = true/false              — evening email if today's log isn't posted
export default function MoneyLogModal({ date, onDateChange, snapshotInput, suggestedDay, posts, customQuotes, onAddQuote, onPosted, reminder, onReminder, onClose }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("day");
  const [month, setMonth] = useState(date.slice(0, 7));
  const [fontReady, setFontReady] = useState(false);
  const [url, setUrl] = useState(null);
  const [msg, setMsg] = useState("");
  const [includeLoans, setIncludeLoans] = useState(true);
  const [showIncome, setShowIncome] = useState(true);
  const [hide, setHide] = useState(false);
  const [showSafe, setShowSafe] = useState(false);
  const saved = (posts || {})[date];
  const [day, setDay] = useState(saved ? saved.day : suggestedDay);
  const [quote, setQuote] = useState(saved && saved.quote ? saved.quote : quoteFor(date, customQuotes));
  const [shuffle, setShuffle] = useState(0);
  useEffect(() => {
    const p = (posts || {})[date];
    setDay(p ? p.day : suggestedDay);
    setQuote(p && p.quote ? p.quote : quoteFor(date, customQuotes));
    setMonth(date.slice(0, 7));
  }, [date]);
  useEffect(() => {
    let alive = true;
    Promise.all([document.fonts.load(f(40, 400)), document.fonts.load(f(40, 700))]).catch(() => {}).finally(() => alive && setFontReady(true));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!fontReady || !canvasRef.current) return;
    if (mode === "day") drawMoneyLog(canvasRef.current, buildSnapshot({ ...snapshotInput, date, includeLoans, showIncome }), { dayNumber: +day || 1, quote, hide });
    else drawMonthWrap(canvasRef.current, buildMonthWrap({ ...snapshotInput, month, today: date, includeLoans }), { quote, hide });
    setUrl(canvasRef.current.toDataURL("image/png"));
  }, [fontReady, snapshotInput, date, day, quote, includeLoans, showIncome, hide, mode, month]);

  function nextQuote() {
    const all = [...(customQuotes || []), ...QUOTES];
    const i = all.findIndex(x => x.q === quote.q);
    setQuote(all[(i + 1 + shuffle) % all.length]); setShuffle(0);
  }
  const fileName = mode === "day" ? `money-log-${date}.png` : `money-wrap-${month}.png`;
  const markPosted = () => { if (mode === "day") onPosted(date, { day: +day || 1, quote }); };
  const toBlob = () => new Promise(res => canvasRef.current.toBlob(res, "image/png"));
  async function share() {
    setMsg("");
    const blob = await toBlob();
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "The Money Log" }); markPosted(); } catch (e) { if (e && e.name !== "AbortError") setMsg("Couldn't open sharing — use Save image instead."); }
    } else { download(); setMsg("Sharing isn't supported in this browser, so the image was saved instead."); }
  }
  function download() { const a = document.createElement("a"); a.href = url; a.download = fileName; a.click(); markPosted(); }

  const tab = (id, label) => (
    <button className="btn ghost" onClick={() => setMode(id)} style={{ flex: 1, padding: "8px 10px", fontSize: 13, borderColor: mode === id ? "#1F2A5C" : undefined, fontWeight: mode === id ? 700 : 500 }}>{label}</button>
  );
  const isCustom = (customQuotes || []).some(x => x.q === quote.q);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,28,40,.55)", zIndex: 60, overflowY: "auto", padding: "16px 12px 40px" }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 440, margin: "0 auto", display: "grid", gap: 12 }} onClick={e => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>The Money Log</div>
          <button className="ib" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="row" style={{ gap: 8 }}>{tab("day", "Daily log")}{tab("month", "Month wrap-up")}</div>
        <canvas ref={canvasRef} style={{ display: "none" }} />
        {url ? (
          <div style={{ position: "relative" }}>
            <img src={url} alt="Money Log image" style={{ width: "100%", display: "block", borderRadius: 10, border: "1px solid #ddd" }} />
            {showSafe && <>
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: (250 / 1920 * 100) + "%", background: "rgba(0,0,0,.35)", borderRadius: "10px 10px 0 0" }} />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: (250 / 1920 * 100) + "%", background: "rgba(0,0,0,.35)", borderRadius: "0 0 10px 10px" }} />
            </>}
          </div>
        ) : <div style={{ aspectRatio: "9 / 16", background: "#FAF6EE", borderRadius: 10 }} />}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={share} style={{ flex: 1 }}><Share2 size={16} /> Share to Instagram</button>
          <button className="btn ghost" onClick={download} style={{ flex: 1 }}><Download size={16} /> Save image</button>
        </div>
        {msg && <div className="foot">{msg}</div>}

        <div style={{ display: "grid", gap: 10 }}>
          {mode === "day" ? (
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 2 }}><span className="lbl">Log for</span>
                <input className="in" type="date" value={date} onChange={e => e.target.value && onDateChange(e.target.value)} /></div>
              <div style={{ flex: 1 }}><span className="lbl">Day number</span>
                <input className="in num" type="number" min="1" inputMode="numeric" value={day} onChange={e => setDay(e.target.value)} /></div>
            </div>
          ) : (
            <div><span className="lbl">Month</span>
              <input className="in" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></div>
          )}
          {mode === "day" && <div className="foot" style={{ marginTop: -4 }}>{saved ? `You posted this day as Day ${saved.day}.` : "Next day number counts up from your last post, so skipping a day doesn't break the count. Change it here if you need to."}</div>}

          <div>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
              <span className="lbl" style={{ margin: 0 }}>Quote of the day</span>
              <button className="chip" onClick={nextQuote} style={{ cursor: "pointer", background: "transparent", border: "1px solid #ccc" }}>Another quote ↻</button>
            </div>
            <textarea className="in" rows={2} maxLength={120} value={quote.q} onChange={e => setQuote({ ...quote, q: e.target.value })} style={{ marginTop: 6, resize: "vertical", fontFamily: "inherit" }} />
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <input className="in" placeholder="Who said it (optional)" value={quote.a} onChange={e => setQuote({ ...quote, a: e.target.value })} style={{ flex: 1 }} />
              {!isCustom && quote.q.trim() && !QUOTES.some(x => x.q === quote.q && x.a === quote.a) && (
                <button className="btn ghost" onClick={() => onAddQuote({ q: quote.q.trim(), a: quote.a.trim() })} style={{ padding: "8px 10px", fontSize: 12 }}>Save to my quotes</button>
              )}
            </div>
          </div>

          <label className="row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} /> Hide amounts (show percentages only)
          </label>
          <label className="row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={includeLoans} onChange={e => setIncludeLoans(e.target.checked)} /> Include loan repayments
          </label>
          {mode === "day" && (
            <label className="row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={showIncome} onChange={e => setShowIncome(e.target.checked)} /> Show money that came in today (only on days something came in)
            </label>
          )}
          <label className="row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={showSafe} onChange={e => setShowSafe(e.target.checked)} /> Preview where Instagram's buttons will cover
          </label>
          <label className="row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={!!reminder} onChange={e => onReminder(e.target.checked)} /> Email me at 8:30pm if I haven't posted that day's log
          </label>
          <div className="foot">On your phone, "Share to Instagram" opens the share sheet — pick Instagram → Story. Sharing or saving a daily log marks that day as posted.</div>
        </div>
      </div>
    </div>
  );
}
