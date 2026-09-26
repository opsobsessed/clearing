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
  const net = (p) => (+p.amount || 0) - (+p.coversSpends || 0);
  const debtName = (id) => ((oblig || []).find(o => o.id === id) || {}).name || "a debt";
  const todayItems = [
    ...(expenses || []).filter(e => e.date === date).map(e => ({ label: e.cat || "Spending", note: e.note || "", amount: +e.amount || 0, cat: e.cat })),
    ...(payments || []).filter(p => p.date === date && net(p) > 0).map(p => ({ label: "Paid " + debtName(p.obligId).trim(), note: "", amount: net(p), cat: "Loan repayments" })),
  ].sort((a, b) => b.amount - a.amount);
  const monthExp = (expenses || []).filter(e => (e.date || "").slice(0, 7) === month && e.date <= date);
  const monthPaid = (payments || []).filter(p => (p.date || "").slice(0, 7) === month && p.date <= date).reduce((s, p) => s + net(p), 0);
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
// Fits the whole quote: tries a large size first, then smaller sizes, up to 5 lines — never cuts it off.
function measureQuote(ctx, quote, L, R) {
  const q = "“" + (((quote && quote.q) || "").trim()) + "”", a = ((quote && quote.a) || "").trim();
  const maxW = R - L - 150;
  let size = 38, lines;
  for (; size >= 26; size -= 2) {
    ctx.font = f(size);
    lines = wrapLines(ctx, q, maxW, 99);
    if (lines.length <= (size >= 34 ? 3 : 5)) break;
  }
  if (size < 26) { size = 26; ctx.font = f(size); lines = wrapLines(ctx, q, maxW, 99); }
  const lineH = size * 1.22;
  const h = Math.max(130, 64 + lines.length * lineH + (a ? 40 : 0));
  return { size, lines, lineH, a, h };
}
function quoteBox(ctx, L, R, by, m) {
  const bh = m.h;
  ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 4; roundRect(ctx, L - 10, by, R - L + 20, bh, 26); ctx.stroke(); ctx.restore();
  dashedBox(ctx, L + 6, by + 14, R - L - 12, bh - 28, "#E2B84A", [12, 9]);
  ctx.save(); ctx.strokeStyle = "#6B6B6B"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(L + 10, by + 50); ctx.lineTo(L + 10, by - 6); ctx.arc(L + 26, by - 6, 16, Math.PI, 0); ctx.lineTo(L + 42, by + 44); ctx.arc(L + 32, by + 44, 10, 0, Math.PI); ctx.lineTo(L + 22, by + 4); ctx.stroke(); ctx.restore();
  const blockH = m.lines.length * m.lineH + (m.a ? 40 : 0);
  let y = by + bh / 2 - blockH / 2 + m.size * 0.85;
  m.lines.forEach(l => { text(ctx, l, (L + R) / 2, y, { size: m.size, align: "center" }); y += m.lineH; });
  if (m.a) text(ctx, "— " + m.a, (L + R) / 2, y + 2, { size: 30, align: "center", color: "#C0504A" });
  ctx.save(); ctx.translate(R - 46, by + bh - 36); ctx.scale(0.85, 0.85); ctx.fillStyle = "#F2A0B4"; ctx.strokeStyle = "#C9607C"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 18); ctx.bezierCurveTo(-40, -10, -22, -40, 0, -20); ctx.bezierCurveTo(22, -40, 40, -10, 0, 18); ctx.fill(); ctx.stroke(); ctx.restore();
}
function header(ctx, L, R, title, sub, top = 250) {
  let ts = 96; ctx.font = f(ts, 700);
  while (ctx.measureText(title).width > R - L - 140 && ts > 60) { ts -= 4; ctx.font = f(ts, 700); }
  const ty = top + 90;
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

  // Instagram's profile bar covers roughly the top ~200px of a story and the reply field the
  // bottom ~250px, so everything that matters sits between SAFE_TOP and SAFE_BOTTOM. The layout
  // flows: header and totals at the top, the quote (sized to fit in full) at the bottom, and the
  // day's entries get whatever room is left — shrinking, then splitting into two columns, so every
  // entry shows no matter how many there are.
  const SAFE_TOP = 190, SAFE_BOTTOM = H - 250;
  const ty = header(ctx, L, R, title, `${dateLabel}  ·  Day ${dayStr}`, SAFE_TOP);

  // Totals
  const colW = (R - L - 40) / 2, r1 = ty + 168, Rx = L + colW + 40;
  highlight(ctx, "MONTHLY SPEND", L + 10, r1, "#F4A6A6", { size: 40 });
  highlight(ctx, "TODAY'S SPEND", Rx + 10, r1, "#A9C8EE", { size: 40 });
  text(ctx, `( ${monthLabel} )`, L + 10, r1 + 44, { size: 28, color: INK_SOFT });
  text(ctx, snap.todayItems.length ? `${snap.todayItems.length} ${snap.todayItems.length === 1 ? "entry" : "entries"}` : "no-spend day ✨", Rx + 10, r1 + 44, { size: 28, color: INK_SOFT });
  dashedBox(ctx, L, r1 + 64, colW, 132, "#D86A6A");
  dashedBox(ctx, Rx, r1 + 64, colW, 132, "#6D95CF");
  text(ctx, "TOTAL SPENT SO FAR", L + colW / 2, r1 + 106, { size: 28, align: "center", color: INK_SOFT });
  text(ctx, "SPENT TODAY", Rx + colW / 2, r1 + 106, { size: 28, align: "center", color: INK_SOFT });
  text(ctx, money(snap.monthTotal), L + colW / 2, r1 + 176, { size: 68, weight: 700, align: "center", maxW: colW - 30 });
  text(ctx, money(snap.todayTotal), Rx + colW / 2, r1 + 176, { size: 68, weight: 700, align: "center", maxW: colW - 30 });

  // Bottom-up: quote, then the one-line extra (came in / budget), then the chart.
  const qm = measureQuote(ctx, quote, L, R);
  const quoteTop = SAFE_BOTTOM - qm.h;
  const hasExtra = snap.sources.length > 0 || snap.budget > 0;
  const extraY = quoteTop - (hasExtra ? 62 : 0);
  let pieH = snap.slices.length ? 300 : 0;

  // Entries
  const listTop = r1 + 262;
  const rowsFor = (pie) => (extraY - (hasExtra ? 40 : 10) - pie - (pie ? 24 : 0)) - (listTop + 50);
  const n = Math.max(1, snap.todayItems.length);
  let avail = rowsFor(pieH), cols = 1, rowH = Math.min(58, avail / n);
  if (rowH < 36) { cols = 2; rowH = Math.min(58, avail / Math.ceil(n / 2)); }
  if (rowH < 32 && pieH) { pieH = 0; avail = rowsFor(0); cols = 1; rowH = Math.min(58, avail / n); if (rowH < 36) { cols = 2; rowH = avail / Math.ceil(n / 2); } }
  const fs = Math.max(20, Math.min(36, Math.round(rowH * 0.62)));
  text(ctx, "WHAT", L, listTop, { size: 26, weight: 700, color: INK_SOFT });
  text(ctx, "AMOUNT (₹)", R, listTop, { size: 26, weight: 700, color: INK_SOFT, align: "right" });
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L, listTop + 14); ctx.lineTo(R, listTop + 14); ctx.stroke();
  let y0 = listTop + 14 + rowH * 0.78 + 6;
  if (!snap.todayItems.length) { text(ctx, "Nothing spent today — that counts too.", L + 10, y0 + 8, { size: 34, color: INK_SOFT }); }
  const perCol = cols === 2 ? Math.ceil(snap.todayItems.length / 2) : snap.todayItems.length;
  const cw = cols === 2 ? (R - L - 30) / 2 : R - L;
  snap.todayItems.forEach((it, i) => {
    const c = Math.floor(i / perCol), r = i % perCol;
    const x0 = L + c * (cw + 30), x1 = x0 + cw, y = y0 + r * rowH;
    const amt = plain(it.amount);
    ctx.font = f(fs + 2, 700); const aw = ctx.measureText(amt).width;
    text(ctx, `${emojiFor(it.cat || it.label)} ${it.label}${it.note && cols === 1 ? " · " + it.note : ""}`, x0 + 4, y, { size: fs, maxW: cw - aw - 24 });
    text(ctx, amt, x1, y, { size: fs + 2, weight: 700, align: "right" });
    dottedRule(ctx, x0, x1, y + Math.min(18, rowH * 0.3));
  });

  // Where the money is going
  if (pieH) {
    const hy = extraY - (hasExtra ? 40 : 10) - pieH + 30;
    highlight(ctx, "WHERE MY MONEY IS GOING", (L + R) / 2, hy, "#BFD98A", { size: 40, align: "center" });
    const cy = hy + 145, cx = L + 125;
    donut(ctx, cx, cy, 110, snap.slices);
    text(ctx, "THIS", cx, cy - 6, { size: 24, align: "center", color: INK_SOFT });
    text(ctx, "MONTH", cx, cy + 22, { size: 24, align: "center", color: INK_SOFT });
    legendList(ctx, L + 290, R, cy, snap.slices.slice(0, 5), snap.monthTotal);
  }

  // One line: money that came in today if any, otherwise budget left (if a budget is set).
  if (snap.sources.length) {
    highlight(ctx, "CAME IN TODAY", L + 10, extraY, "#F7D774", { size: 38 });
    const label = snap.sources.map(s => HIDE ? s.label : `${s.label} ${inr(s.value)}`).join("  ·  ");
    text(ctx, label, R, extraY, { size: 30, weight: 700, align: "right", maxW: R - L - 380 });
  } else if (snap.budget > 0) {
    const left = snap.budgetLeft;
    const usedPct = Math.round(((snap.budget - left) / snap.budget) * 100);
    highlight(ctx, HIDE ? "BUDGET USED THIS MONTH" : left >= 0 ? "BUDGET LEFT THIS MONTH" : "OVER BUDGET BY", L + 10, extraY, left >= 0 ? "#F7D774" : "#F4A6A6", { size: 38 });
    text(ctx, HIDE ? usedPct + "%" : inr(Math.abs(left)), R, extraY, { size: 42, weight: 700, align: "right" });
  }

  quoteBox(ctx, L, R, quoteTop, qm);
  footer(ctx, L, R, H - 150, `DAY ${dayStr} / ∞`);
}

// ---------- monthly wrap-up ----------
export function buildMonthWrap({ month, today, expenses, payments, incomes, oblig, sourceLabel, includeLoans = true }) {
  const inMonth = (x) => (x.date || "").slice(0, 7) === month;
  const exp = (expenses || []).filter(inMonth);
  const pays = (payments || []).filter(inMonth);
  const loansPaid = pays.reduce((s, p) => s + (+p.amount || 0) - (+p.coversSpends || 0), 0);
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
    + (includeLoans ? (payments || []).filter(p => (p.date || "").slice(0, 7) === prev).reduce((s, p) => s + (+p.amount || 0) - (+p.coversSpends || 0), 0) : 0);
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
  const ty = header(ctx, L, R, "MONTH IN REVIEW", wrap.complete ? monthName : `${monthName} · so far (${wrap.daysSoFar} days)`, 190);

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

  const qm = measureQuote(ctx, quote, L, R);
  quoteBox(ctx, L, R, SAFE_BOTTOM - qm.h, qm);
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
