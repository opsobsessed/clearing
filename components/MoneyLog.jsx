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
  phone: "📱", medical: "💊", health: "💊", shopping: "🛍️", "loan repayments": "💸", "debt repayment": "💸", other: "🧾",
  donation: "🙏", subscription: "🔁", subscriptions: "🔁", office: "💼", invest: "📈", reward: "🎁", self: "🌸",
};
const emojiFor = (cat) => CAT_EMOJI[(cat || "").toLowerCase()] || (/^paid /i.test(cat || "") ? "💸" : "🧾");
const inr = (n) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
// Private mode (optional): no rupee amounts anywhere on the image — categories, counts and percentages only.
// In every mode, entries appear only as their category (grouped, with a total) — your notes never go on the image.
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
  const month = date.slice(0, 7);
  const net = (p) => (+p.amount || 0) - (+p.coversSpends || 0);
  const debtName = (id) => ((oblig || []).find(o => o.id === id) || {}).name || "a debt";
  const todayItems = [
    ...(expenses || []).filter(e => e.date === date).map(e => ({ label: e.cat || "Spending", note: e.note || "", amount: +e.amount || 0, cat: e.cat })),
    ...(payments || []).filter(p => p.date === date && net(p) > 0).map(p => ({ label: "Paid " + debtName(p.obligId).trim(), note: "", amount: net(p), cat: "Loan repayments" })),
  ].sort((a, b) => b.amount - a.amount);
  const monthExp = (expenses || []).filter(e => (e.date || "").slice(0, 7) === month && e.date <= date);
  // Debt repayments are always shown, but kept separate from everyday spending: they'd otherwise
  // swamp the chart (a single loan closure can be lakhs) and hide where everyday money goes.
  const monthPaid = (payments || []).filter(p => (p.date || "").slice(0, 7) === month && p.date <= date).reduce((s, p) => s + net(p), 0);
  const todayPaid = (payments || []).filter(p => p.date === date).reduce((s, p) => s + net(p), 0);
  const byCat = {};
  monthExp.forEach(e => { const c = e.cat || "Other"; byCat[c] = (byCat[c] || 0) + (+e.amount || 0); });
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
    todayTotal: todayItems.filter(x => x.cat !== "Loan repayments").reduce((s, x) => s + x.amount, 0),
    monthTotal: cats.reduce((s, x) => s + x.value, 0),
    todayPaid, monthPaid,
    slices, sources,
    inTotal: sources.reduce((s, x) => s + x.value, 0),
    budget: +budget || 0, budgetLeft: (+budget || 0) - monthLiving,
    // For private mode: today's categories (with how many entries each) and no-spend days so far.
    // Today's spending grouped by category (notes are never put on the image).
    todayCats: Object.values(todayItems.reduce((m, it) => {
      const k = it.cat === "Loan repayments" ? "Debt repayment" : (it.cat || it.label); // never lender / friend names
      m[k] = m[k] || { label: k, cat: it.cat || it.label, count: 0, amount: 0 };
      m[k].count++; m[k].amount += it.amount; return m;
    }, {})).sort((a, b) => b.amount - a.amount),
    noSpendDays: (() => { const days = new Set(monthExp.map(e => e.date)); let n = 0; for (let i = 1; i <= +date.slice(8, 10); i++) if (!days.has(`${month}-${String(i).padStart(2, "0")}`)) n++; return n; })(),
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
  highlight(ctx, HIDE ? "THIS MONTH" : "MONTHLY SPEND", L + 10, r1, "#F4A6A6", { size: 40 });
  highlight(ctx, HIDE ? "TODAY" : "TODAY'S SPEND", Rx + 10, r1, "#A9C8EE", { size: 40 });
  text(ctx, `( ${monthLabel} )`, L + 10, r1 + 44, { size: 28, color: INK_SOFT });
  text(ctx, snap.todayItems.length ? `${snap.todayCats.length} ${snap.todayCats.length === 1 ? "category" : "categories"}` : "no-spend day ✨", Rx + 10, r1 + 44, { size: 28, color: INK_SOFT });
  dashedBox(ctx, L, r1 + 64, colW, 132, "#D86A6A");
  dashedBox(ctx, Rx, r1 + 64, colW, 132, "#6D95CF");
  text(ctx, HIDE ? "NO-SPEND DAYS" : "TOTAL SPENT SO FAR", L + colW / 2, r1 + 106, { size: 28, align: "center", color: INK_SOFT });
  text(ctx, HIDE ? "CATEGORIES TODAY" : "SPENT TODAY", Rx + colW / 2, r1 + 106, { size: 28, align: "center", color: INK_SOFT });
  text(ctx, HIDE ? String(snap.noSpendDays) : money(snap.monthTotal), L + colW / 2, r1 + 176, { size: 68, weight: 700, align: "center", maxW: colW - 30 });
  text(ctx, HIDE ? String(snap.todayCats.length) : money(snap.todayTotal), Rx + colW / 2, r1 + 176, { size: 68, weight: 700, align: "center", maxW: colW - 30 });
  if (!HIDE && snap.monthPaid > 0) text(ctx, `+ ${inr(snap.monthPaid)} debt repaid`, L + colW / 2, r1 + 232, { size: 28, weight: 700, align: "center", color: "#6B5B8E", maxW: colW });
  if (!HIDE && snap.todayPaid > 0) text(ctx, `+ ${inr(snap.todayPaid)} debt repaid`, Rx + colW / 2, r1 + 232, { size: 28, weight: 700, align: "center", color: "#6B5B8E", maxW: colW });

  // Bottom-up: quote, then the one-line extra (came in / budget), then the chart.
  const qm = measureQuote(ctx, quote, L, R);
  const quoteTop = SAFE_BOTTOM - qm.h;
  const hasExtra = snap.sources.length > 0 || snap.budget > 0;
  const extraY = quoteTop - (hasExtra ? 62 : 0);
  let pieH = snap.slices.length ? 300 : 0;

  // Entries
  const listTop = r1 + ((!HIDE && (snap.monthPaid > 0 || snap.todayPaid > 0)) ? 292 : 262);
  const rowsFor = (pie) => (extraY - (hasExtra ? 40 : 10) - pie - (pie ? 24 : 0)) - (listTop + 50);
  const rows = snap.todayCats.map(c => ({ label: c.label + (c.count > 1 ? ` (${c.count})` : ""), cat: c.cat, amountText: HIDE ? "" : plain(c.amount) }));
  const n = Math.max(1, rows.length);
  let avail = rowsFor(pieH), cols = 1, rowH = Math.min(58, avail / n);
  if (rowH < 36) { cols = 2; rowH = Math.min(58, avail / Math.ceil(n / 2)); }
  if (rowH < 32 && pieH) { pieH = 0; avail = rowsFor(0); cols = 1; rowH = Math.min(58, avail / n); if (rowH < 36) { cols = 2; rowH = avail / Math.ceil(n / 2); } }
  const fs = Math.max(20, Math.min(36, Math.round(rowH * 0.62)));
  text(ctx, "WHERE IT WENT TODAY", L, listTop, { size: 26, weight: 700, color: INK_SOFT });
  if (!HIDE) text(ctx, "AMOUNT (₹)", R, listTop, { size: 26, weight: 700, color: INK_SOFT, align: "right" });
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L, listTop + 14); ctx.lineTo(R, listTop + 14); ctx.stroke();
  let y0 = listTop + 14 + rowH * 0.78 + 6;
  if (!rows.length) { text(ctx, "Nothing spent today — that counts too.", L + 10, y0 + 8, { size: 34, color: INK_SOFT }); }
  const perCol = cols === 2 ? Math.ceil(rows.length / 2) : rows.length;
  const cw = cols === 2 ? (R - L - 30) / 2 : R - L;
  rows.forEach((it, i) => {
    const c = Math.floor(i / perCol), r = i % perCol;
    const x0 = L + c * (cw + 30), x1 = x0 + cw, y = y0 + r * rowH;
    const amt = it.amountText;
    ctx.font = f(fs + 2, 700); const aw = amt ? ctx.measureText(amt).width : 0;
    text(ctx, `${emojiFor(it.cat)} ${it.label}`, x0 + 4, y, { size: fs, maxW: cw - aw - 24 });
    if (amt) text(ctx, amt, x1, y, { size: fs + 2, weight: 700, align: "right" });
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

// ---------- jar log (jar-first daily frame) ----------
// A dark, bold Reel frame: the jar balance leads, then what went in today, then one line each
// for spent, debt left and invested. Everything sits inside Instagram Reels' safe area (clear of
// the side buttons and the caption), so the same image works as a Story too.
const J = {
  BG: "#0D1220", SURF: "#171F33", LINE: "#262F47", TXT: "#F2F3F7", MUTED: "#8B92AC",
  GOLD: "#F2B544", GREEN: "#6FD39A", CORAL: "#FF7B6B",
};
export const JAR_FONTS = ['800 60px "Bricolage Grotesque"', '700 40px "Bricolage Grotesque"', '500 30px "Bricolage Grotesque"', '500 30px "DM Mono"'];
const JD = (s, w = 800) => `${w} ${s}px "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif`;
const JM = (s, w = 500) => `${w} ${s}px "DM Mono", ui-monospace, Menlo, monospace`;
function jt(ctx, s, x, y, font, color, align = "left", maxW, spacing = 0) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing + "px";
  if (maxW) { let size = parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]); while (ctx.measureText(s).width > maxW && size > 20) { size -= 4; ctx.font = font.replace(/\d+(\.\d+)?px/, size + "px"); } }
  ctx.fillText(s, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}
function jarBackground(ctx) {
  ctx.fillStyle = J.BG; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(830, 520, 20, 830, 520, 620);
  g.addColorStop(0, "rgba(242,181,68,.20)"); g.addColorStop(1, "rgba(242,181,68,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.035)";
  for (let y = 40; y < H; y += 36) for (let x = 40; x < W; x += 36) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
}
// Glass jar meter, filled to how close the balance is to the next invest lot.
function jarMeter(ctx, x, y, w, h, fill, lot) {
  const lidH = 34, neckH = 26, top = y + lidH + neckH, bodyH = h - lidH - neckH;
  ctx.fillStyle = J.GOLD; roundRect(ctx, x + 18, y, w - 36, lidH, 10); ctx.fill();
  ctx.fillStyle = J.BG; for (let i = 1; i < 6; i++) ctx.fillRect(x + 18 + i * (w - 36) / 6, y + 6, 3, lidH - 12);
  ctx.strokeStyle = "rgba(242,243,247,.55)"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x + 28, y + lidH); ctx.lineTo(x + 28, top + 6); ctx.moveTo(x + w - 28, y + lidH); ctx.lineTo(x + w - 28, top + 6); ctx.stroke();
  const f = Math.max(0, Math.min(1, fill));
  ctx.save(); roundRect(ctx, x, top, w, bodyH, 44); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,.04)"; ctx.fillRect(x, top, w, bodyH);
  if (f > 0) {
    const lvl = top + bodyH * (1 - f);
    const g = ctx.createLinearGradient(0, lvl, 0, top + bodyH); g.addColorStop(0, "#FFD27A"); g.addColorStop(1, "#E08E1B");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, lvl);
    for (let i = 0; i <= w; i += 6) ctx.lineTo(x + i, lvl + Math.sin(i / 18) * 5);
    ctx.lineTo(x + w, top + bodyH); ctx.lineTo(x, top + bodyH); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = "rgba(13,18,32,.35)"; ctx.lineWidth = 3;
  for (let i = 1; i < 5; i++) { const ty = top + bodyH * (1 - i / 5); ctx.beginPath(); ctx.moveTo(x + w - 40, ty); ctx.lineTo(x + w, ty); ctx.stroke(); }
  ctx.fillStyle = "rgba(255,255,255,.14)"; roundRect(ctx, x + 18, top + 26, 16, bodyH * 0.55, 8); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(242,243,247,.7)"; ctx.lineWidth = 5; roundRect(ctx, x, top, w, bodyH, 44); ctx.stroke();
  jt(ctx, inr(lot), x + w / 2, y - 22, JM(26), J.MUTED, "center");
}

// What the jar frame needs for one day. A day can have the daily entry (base + engagement) and
// any number of top-ups; money moved into the funds that day shows as its own banner.
export function buildJarSnapshot({ date, jar, spentToday, paidToday = 0, debtLeft = 0 }) {
  const hist = ((jar && jar.history) || []).filter(h => h.date === date);
  const entry = hist.find(h => !h.topUp) || null;
  const topUp = hist.filter(h => h.topUp).reduce((t, h) => t + (+h.amount || 0), 0);
  const invested = ((jar && jar.invested) || []);
  const inv = invested.filter(x => x.date === date).reduce((t, x) => ({ a: t.a + (+x.a || 0), b: t.b + (+x.b || 0) }), { a: 0, b: 0 });
  return {
    date, entry, topUp,
    // Reactions are counted from the post before the day they're logged.
    forPost: entry ? (entry.forPost || (() => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()) : null,
    lot: +(jar && jar.lot) || 500,
    balance: Math.max(0, +(jar && jar.balance) || 0),
    base: entry ? (entry.base ?? (entry.comments === undefined ? +entry.amount || 0 : 0)) : 0,
    comments: entry ? +entry.comments || 0 : 0,
    shares: entry ? +entry.shares || 0 : 0,
    saves: entry ? +entry.saves || 0 : 0,
    perAction: +(jar && jar.perAction) || 1,
    inToday: (entry ? +entry.amount || 0 : 0) + topUp,
    spentToday: +spentToday || 0, paidToday: +paidToday || 0, debtLeft: +debtLeft || 0,
    investA: inv.a, investB: inv.b,
    investedTotal: invested.filter(x => x.date <= date).reduce((t, x) => t + (+x.a || 0) + (+x.b || 0), 0),
    fundA: (jar && jar.fundAName) || "Fund 1", fundB: (jar && jar.fundBName) || "Fund 2",
  };
}

export function drawJarLog(canvas, s, { dayNumber, hide = false, handle = "@financiallyclueless.in" }) {
  HIDE = hide;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  jarBackground(ctx);
  const L = 80, R = 940;

  // meta row
  jt(ctx, `DAY ${String(dayNumber).padStart(2, "0")}`, L, 250, JM(34), J.GOLD, "left", null, 6);
  const d = new Date(s.date + "T00:00:00");
  jt(ctx, d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase(), R, 250, JM(28), J.MUTED, "right", null, 4);
  ctx.fillStyle = J.LINE; ctx.fillRect(L, 280, R - L, 2);

  // hero: the jar
  const into = s.balance % s.lot, invested = s.investA + s.investB;
  const ready = s.balance >= s.lot;
  jarMeter(ctx, 760, 360, 180, 440, ready ? 1 : into / s.lot, s.lot);
  jt(ctx, "IN THE JAR", L, 360, JM(28), J.MUTED, "left", null, 5);
  jt(ctx, inr(s.balance), L - 6, 560, JD(230), J.TXT, "left", 650);
  jt(ctx, s.inToday > 0 ? `+${inr(s.inToday)} today` : "not logged yet", L, 640, JD(56, 700), s.inToday > 0 ? J.GREEN : J.MUTED);
  if (s.inToday > 0 && s.forPost) {
    const fromYou = Math.max(0, (s.entry ? +s.entry.amount || 0 : 0) - s.base);
    jt(ctx, `my ${inr(s.base)} + ${inr(fromYou)} from your reactions yesterday${s.topUp ? ` + ${inr(s.topUp)} top-up` : ""}`, L, 680, JM(24), J.MUTED, "left", 640);
  }
  if (invested) {
    roundRect(ctx, L, 690, 640, 118, 22); ctx.fillStyle = J.GOLD; ctx.fill();
    jt(ctx, `${inr(invested)} INVESTED TODAY`, L + 28, 740, JD(40), J.BG, "left", 590);
    jt(ctx, `${inr(s.investA)} ${s.fundA}${s.investB ? `  ·  ${inr(s.investB)} ${s.fundB}` : ""}`, L + 28, 786, JM(26), J.BG, "left", 590);
    // Naming real funds: keep the disclaimer next to them.
    jt(ctx, "Not financial advice — just what I'm doing.", L, 846, JM(22), J.MUTED, "left", 640);
  } else {
    jt(ctx, ready ? `${inr(Math.floor(s.balance / s.lot) * s.lot)} ready to invest` : `${inr(s.lot - into)} to go before it's invested`, L, 732, JD(40, 500), ready ? J.GOLD : J.MUTED, "left", 640);
  }

  // what went in: tiles (a top-up takes the place of the saves tile's neighbour when there is one)
  const fp = s.forPost ? new Date(s.forPost + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }).toUpperCase() : "";
  jt(ctx, s.forPost ? `WHAT WENT IN · FROM YESTERDAY'S POST (${fp})` : "WHAT WENT IN", L, 890, JM(26), J.MUTED, "left", R - L, 4);
  const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "S"}`;
  const tiles = [["BASE", s.base], [pl(s.comments, "COMMENT"), s.comments * s.perAction], [pl(s.shares, "SHARE"), s.shares * s.perAction], [pl(s.saves, "SAVE"), s.saves * s.perAction]];
  if (s.topUp > 0) tiles.push(["TOP-UP", s.topUp]);
  const n = tiles.length, gap = 16, tw = (R - L - (n - 1) * gap) / n;
  tiles.forEach(([label, v], i) => {
    const x = L + i * (tw + gap);
    roundRect(ctx, x, 916, tw, 150, 22); ctx.fillStyle = i > 0 && v > 0 ? "rgba(111,211,154,.14)" : J.SURF; ctx.fill();
    jt(ctx, "+" + Math.round(v), x + tw / 2, 1000, JD(n > 4 ? 54 : 64), v > 0 ? J.TXT : J.MUTED, "center", tw - 16);
    jt(ctx, label, x + tw / 2, 1042, JM(20), J.MUTED, "center", tw - 16, 2);
  });

  // ledger: spent, debt left (with today's repayment), invested so far
  const rows = [
    ["Spent today", s.spentToday > 0 ? money(s.spentToday) : "₹0", J.TXT, ""],
    ["Debt left", money(s.debtLeft), J.CORAL, s.paidToday > 0 ? `↓ ${money(s.paidToday)} paid today` : ""],
    ["Invested so far", inr(s.investedTotal), J.GOLD, ""],
  ];
  let y = 1150;
  rows.forEach(([label, val, color, note], i) => {
    jt(ctx, label, L, y, JD(40, 500), J.MUTED);
    jt(ctx, val, R, y, JD(52), color, "right", 520);
    if (note) jt(ctx, note, R, y + 42, JM(26), J.GREEN, "right");
    y += note ? 70 : 0;
    if (i < rows.length - 1) { ctx.fillStyle = J.LINE; ctx.fillRect(L, y + 30, R - L, 2); }
    y += 90;
  });

  // call to action + handle
  const cy = y - 10;
  roundRect(ctx, L, cy, R - L, 96, 48); ctx.fillStyle = "rgba(242,181,68,.12)"; ctx.fill();
  ctx.strokeStyle = J.GOLD; ctx.lineWidth = 3; roundRect(ctx, L, cy, R - L, 96, 48); ctx.stroke();
  jt(ctx, `Comment · Share · Save  →  ${inr(s.perAction)} each in my jar`, (L + R) / 2, cy + 50, JD(36, 700), J.GOLD, "center", R - L - 60);
  jt(ctx, "One comment per person per video counts", (L + R) / 2, cy + 82, JM(22), J.GOLD, "center", R - L - 80);
  if (handle) jt(ctx, handle, (L + R) / 2, cy + 150, JM(26), J.MUTED, "center", null, 2);
}

// ---------- the Clearing Log (debt-first daily post) ----------
// Answers "what did I do for my debt today, and how far along am I?" — progress against a fixed
// starting line, today's repayment moves (never with names), what's next in the snowball, streaks,
// and everyday spending reduced to one line.
const TYPE_MOVE = { family: ["🤝", "Repaid family & friends"], regulated: ["🏦", "Loan payment"], payday: ["⚡", "Payday loan paid"] };
export function buildClearingSnapshot({ date, expenses, payments, oblig, accounts, baseline, budget = 0, ffMonthly = 0 }) {
  const open = (oblig || []).filter(o => o.status !== "closed" && o.status !== "settled");
  const owed = open.reduce((t, o) => t + (+o.outstanding || 0), 0);
  const start = (baseline && +baseline.total) || owed;
  const net = (p) => (+p.amount || 0) - (+p.coversSpends || 0);
  // "Cleared" counts actual repayments since the starting line — so deleting or editing a debt in
  // Clear never shows up as progress, and interest added to the loan never erases what you paid.
  const since = (baseline && baseline.date) || "0000";
  const cleared = (payments || []).filter(p => p.date >= since).reduce((t, p) => t + Math.max(0, net(p)), 0);
  const pct = start > 0 ? Math.min(100, (cleared / start) * 100) : 0;
  const byId = Object.fromEntries((oblig || []).map(o => [o.id, o]));
  // Today's moves — never with names or initials of the people you're repaying.
  const moves = {};
  (payments || []).filter(p => p.date === date && net(p) > 0).forEach(p => {
    const o = byId[p.obligId] || {};
    const key = o.isCreditCard ? "card" : (o.type || "regulated");
    const [icon, label] = key === "card" ? ["💳", "Card bill paid"] : (TYPE_MOVE[key] || ["💸", "Debt payment"]);
    moves[key] = moves[key] || { icon, label, amount: 0, count: 0, closed: 0 };
    moves[key].amount += net(p); moves[key].count++;
    if ((o.status === "closed" || o.status === "settled") && o.closedAt === date) moves[key].closed++;
  });
  const moveList = Object.values(moves).sort((a, b) => b.amount - a.amount);
  const wc = (accounts || []).find(a => a.warChest?.on && a.warChest.lastLoggedDate === date);
  if (wc) moveList.push({ icon: "🪙", label: "Into the war chest", amount: +wc.warChest.target || 0, count: 1 });
  const todaySpend = (expenses || []).filter(e => e.date === date).reduce((t, e) => t + (+e.amount || 0), 0);
  const noSpend = todaySpend === 0;
  // Next up: the snowball target (pinned first, otherwise smallest friends & family balance)
  const fam = open.filter(o => o.type === "family" && (+o.outstanding || 0) > 0).sort((a, b) => {
    const pa = a.priority ?? null, pb = b.priority ?? null;
    if (pa !== null || pb !== null) return (pa ?? Infinity) - (pb ?? Infinity);
    return (+a.outstanding) - (+b.outstanding);
  });
  const next = fam[0] ? { left: +fam[0].outstanding, months: ffMonthly > 0 ? Math.ceil(+fam[0].outstanding / ffMonthly) : null } : null;
  // Streaks
  const acted = (d) => (payments || []).some(p => p.date === d && net(p) > 0) || !(expenses || []).some(e => e.date === d);
  // Streak only counts days since you started tracking (starting line, or your first entry).
  const firstDay = [baseline && baseline.date, ...(expenses || []).map(e => e.date), ...(payments || []).map(p => p.date)].filter(Boolean).sort()[0] || date;
  let streak = 0; { const d = new Date(date + "T00:00:00"); if (!acted(date)) d.setDate(d.getDate() - 1); for (let k = 0; k < 400 && localDate(d) >= firstDay && acted(localDate(d)); k++) { streak++; d.setDate(d.getDate() - 1); } }
  const lastBorrow = (oblig || []).map(o => o.addedOn || o.startDate || "").filter(Boolean).sort().pop();
  const noBorrowDays = lastBorrow ? Math.max(0, Math.round((new Date(date + "T00:00:00") - new Date(lastBorrow + "T00:00:00")) / 86400000)) : null;
  const total = (oblig || []).length, closed = total - open.length;
  const openLoans = open.filter(o => o.type !== "family" && !o.isCreditCard).length, // a card you pay off monthly isn't a debt to clear
    openFam = open.filter(o => o.type === "family").length;
  const monthSpend = (expenses || []).filter(e => (e.date || "").slice(0, 7) === date.slice(0, 7) && e.date <= date).reduce((t, e) => t + (+e.amount || 0), 0);
  const monthKey = date.slice(0, 7);
  const monthRepaid = (payments || []).filter(p => (p.date || "").slice(0, 7) === monthKey && p.date <= date).reduce((t, p) => t + net(p), 0);
  const monthClosed = (oblig || []).filter(o => (o.status === "closed" || o.status === "settled") && (o.closedAt || "").slice(0, 7) === monthKey && o.closedAt <= date).length;
  return { date, owed, start, startDate: baseline && baseline.date, cleared, pct, moveList, monthRepaid, monthClosed, openLoans, openFam, noSpend, todaySpend, next, streak, noBorrowDays, total, closed, budget: +budget || 0, monthSpend };
}
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function drawClearingLog(canvas, snap, { dayNumber, quote, hide = false }) {
  HIDE = hide;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  paper(ctx);
  const L = 150, R = W - 70, SAFE_BOTTOM = H - 250;
  const d = new Date(snap.date + "T00:00:00");
  const dayStr = String(dayNumber).padStart(2, "0");
  const ty = header(ctx, L, R, "THE CLEARING LOG", `${d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}  ·  Day ${dayStr}`, 190);

  // Progress
  let y = ty + 165;
  const since = snap.startDate ? new Date(snap.startDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "the start";
  highlight(ctx, "DEBT CLEARED", L + 10, y, "#BFD98A", { size: 42 });
  text(ctx, `since ${since}`, R, y, { size: 28, color: INK_SOFT, align: "right" });
  y += 150;
  // Early on the % is tiny against ₹1 Cr+ — show enough decimals that each repayment visibly moves it.
  const pctLabel = (snap.pct === 0 ? "0" : snap.pct < 1 ? snap.pct.toFixed(2) : snap.pct < 10 ? snap.pct.toFixed(1) : Math.round(snap.pct)) + "%";
  text(ctx, pctLabel, L + 4, y, { size: 150, weight: 700, color: "#2E7D5B" });
  ctx.font = f(150, 700); const pw = ctx.measureText(pctLabel).width;
  text(ctx, HIDE ? "of what I owed" : `${inr(snap.cleared)} gone`, L + pw + 36, y - 70, { size: 36, weight: 700, maxW: R - L - pw - 40 });
  text(ctx, HIDE ? "is gone" : `${inr(snap.owed)} to go`, L + pw + 36, y - 22, { size: 32, color: INK_SOFT, maxW: R - L - pw - 40 });
  y += 36;
  ctx.save(); roundRect(ctx, L, y, R - L, 30, 15); ctx.fillStyle = "#EFE6CF"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  const fw = Math.max(30, (R - L) * Math.min(1, snap.pct / 100)); roundRect(ctx, L, y, fw, 30, 15); ctx.fillStyle = "#74B85C"; ctx.fill(); ctx.restore();
  y += 76;
  const parts = [snap.openLoans ? `${snap.openLoans} loan${snap.openLoans > 1 ? "s" : ""}` : "", snap.openFam ? `${snap.openFam} family & friends` : ""].filter(Boolean).join(" + ");
  text(ctx, `${snap.openLoans + snap.openFam} left${parts ? ": " + parts : ""}`, L + 4, y, { size: 32, weight: 700, maxW: R - L - 250 });
  text(ctx, `${snap.closed} closed so far`, R, y, { size: 28, color: INK_SOFT, align: "right" });

  const qm = measureQuote(ctx, quote, L, R);
  const quoteTop = SAFE_BOTTOM - qm.h;
  const spendY = quoteTop - 48;

  // Today's moves
  y += 96;
  highlight(ctx, "TODAY'S MOVES", L + 10, y, "#F7D774", { size: 40 });
  y += 64;
  const rows = snap.moveList.slice();
  if (snap.noSpend) rows.push({ icon: "🌱", label: "No-spend day", amount: null });
  const rowH = rows.length > 4 ? 48 : 60, fs = rows.length > 4 ? 32 : 36;
  if (!rows.length) {
    text(ctx, "Held the line today — no new debt,", L + 10, y, { size: 36, color: INK_SOFT });
    text(ctx, "spending kept in check.", L + 10, y + 50, { size: 36, color: INK_SOFT });
    y += 100;
  }
  rows.slice(0, 6).forEach((m, i) => {
    const yy = y + i * rowH;
    const amt = m.amount == null ? "✓" : HIDE ? (m.count > 1 ? "×" + m.count : "✓") : inr(m.amount);
    ctx.font = f(fs + 2, 700); const aw = ctx.measureText(amt).width;
    text(ctx, `${m.icon}  ${m.label}${m.count > 1 ? ` (${m.count})` : ""}${m.closed ? ` · ${m.closed} closed 🎉` : ""}`, L + 6, yy, { size: fs, maxW: R - L - aw - 30 });
    text(ctx, amt, R, yy, { size: fs + 2, weight: 700, align: "right", color: m.amount == null ? "#2E7D5B" : INK });
    dottedRule(ctx, L, R, yy + 18);
  });
  if (rows.length) y += Math.min(rows.length, 6) * rowH;

  // This month
  y += 50;
  const sw = (R - L) / 2;
  const stat = (i, label, value, color) => {
    const cx = L + sw * i + sw / 2;
    text(ctx, label, cx, y, { size: 24, align: "center", color: INK_SOFT });
    text(ctx, value, cx, y + 54, { size: 46, weight: 700, align: "center", color, maxW: sw - 20 });
  };
  const divider = () => { ctx.save(); ctx.setLineDash([8, 8]); ctx.strokeStyle = "#8C96C4"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L + sw, y - 28); ctx.lineTo(L + sw, y + 62); ctx.stroke(); ctx.restore(); };
  stat(0, "REPAID THIS MONTH", HIDE ? "✓" : inr(snap.monthRepaid), INK);
  stat(1, "DEBTS CLOSED THIS MONTH", String(snap.monthClosed), "#2E7D5B");
  divider();

  // Next up
  y += 150;
  if (snap.next) {
    dashedBox(ctx, L, y - 42, R - L, 116, "#6D95CF");
    text(ctx, "➡️  Next to clear: a family & friends loan", L + 22, y + 2, { size: 32, weight: 700, maxW: R - L - 44 });
    const eta = snap.next.months ? `about ${snap.next.months <= 1 ? "a month" : snap.next.months + " months"} at this pace` : "";
    text(ctx, [HIDE ? "" : inr(snap.next.left) + " to go", eta].filter(Boolean).join(" · ") || "one step at a time", L + 70, y + 50, { size: 30, color: INK_SOFT, maxW: R - L - 90 });
    y += 150;
  }

  // Streaks
  y += 10;
  stat(0, "DAY STREAK", snap.streak + (snap.streak === 1 ? " day" : " days"), "#2E7D5B");
  stat(1, "WITHOUT NEW BORROWING", snap.noBorrowDays == null ? "—" : snap.noBorrowDays + (snap.noBorrowDays === 1 ? " day" : " days"), "#6B5B8E");
  divider();

  // Everyday spending, one line
  const under = snap.budget > 0 ? (snap.monthSpend <= snap.budget ? " · under budget ✓" : " · over budget this month") : "";
  text(ctx, snap.noSpend ? `Everyday spend today: nothing${under}` : `Everyday spend today: ${HIDE ? "kept small" : inr(snap.todaySpend)}${under}`, (L + R) / 2, spendY, { size: 30, align: "center", color: INK_SOFT, maxW: R - L });

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
  const cats = Object.entries(byCat).map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const slices = cats.length > 6 ? [...cats.slice(0, 5), { label: "Everything else", value: cats.slice(5).reduce((s, x) => s + x.value, 0) }] : cats;
  const outTotal = cats.reduce((s, x) => s + x.value, 0); // everyday spending (the chart)
  const outAll = outTotal + loansPaid;                    // everything that went out
  const bySource = {};
  (incomes || []).filter(inMonth).forEach(i => { const k = sourceLabel(i); bySource[k] = (bySource[k] || 0) + (+i.amount || 0); });
  const sources = Object.entries(bySource).map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  // Same basis as outTotal, for last month.
  const [y, m] = month.split("-").map(Number);
  const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const prevOut = (expenses || []).filter(e => (e.date || "").slice(0, 7) === prev).reduce((s, e) => s + (+e.amount || 0), 0)
;
  // No-spend days: days so far this month (or the whole month, if it's over) with no everyday spend logged.
  const daysInMonth = new Date(y, m, 0).getDate();
  const lastDay = today.slice(0, 7) === month ? +today.slice(8, 10) : daysInMonth;
  const spendDays = new Set(exp.map(e => e.date));
  let noSpend = 0;
  for (let d = 1; d <= lastDay; d++) if (!spendDays.has(`${month}-${String(d).padStart(2, "0")}`)) noSpend++;
  return {
    month, slices, sources, outTotal, outAll, loansPaid, noSpend, daysSoFar: lastDay,
    debtsCleared: (oblig || []).filter(o => (o.status === "closed" || o.status === "settled") && (o.closedAt || "").slice(0, 7) === month).length,
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
  highlight(ctx, HIDE ? "DAYS LOGGED" : "MONEY OUT", L + 10, r1, "#F4A6A6", { size: 42 });
  highlight(ctx, HIDE ? "CATEGORIES" : "MONEY IN", Rx + 10, r1, "#F7D774", { size: 42 });
  dashedBox(ctx, L, r1 + 30, colW, 150, "#D86A6A");
  dashedBox(ctx, Rx, r1 + 30, colW, 150, "#D9B64A");
  text(ctx, HIDE ? String(wrap.daysSoFar - wrap.noSpend) : money(wrap.outAll), L + colW / 2, r1 + 132, { size: 72, weight: 700, align: "center", maxW: colW - 30 });
  text(ctx, HIDE ? String(wrap.slices.filter(x => x.label !== "Loan repayments").length) : money(wrap.inTotal), Rx + colW / 2, r1 + 132, { size: 72, weight: 700, align: "center", maxW: colW - 30 });

  // Three stats
  const sy = r1 + 250, sw = (R - L) / 3;
  const stats = [
    ["vs last month", wrap.vsLast === null ? "—" : (wrap.vsLast > 0 ? "+" : "") + wrap.vsLast + "%", wrap.vsLast !== null && wrap.vsLast > 0 ? "#C0504A" : "#3E8E5A"],
    ["no-spend days", String(wrap.noSpend), INK],
    HIDE ? ["debts cleared", String(wrap.debtsCleared || 0), "#6B5B8E"] : ["debt repaid", money(wrap.loansPaid), "#6B5B8E"],
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
export default function MoneyLogModal({ date, onDateChange, snapshotInput, suggestedDay, posts, customQuotes, onAddQuote, onPosted, reminder, onReminder, privateDefault = false, onPrivateChange, onClose, jar = null }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState(jar ? "jar" : "clear");
  const daily = mode !== "month";
  const [month, setMonth] = useState(date.slice(0, 7));
  const [fontReady, setFontReady] = useState(false);
  const [url, setUrl] = useState(null);
  const [msg, setMsg] = useState("");
  const includeLoans = true;
  const [showIncome, setShowIncome] = useState(true);
  const [hide, setHideRaw] = useState(privateDefault);
  const setHide = (v) => { setHideRaw(v); onPrivateChange && onPrivateChange(v); };
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
    Promise.all([document.fonts.load(f(40, 400)), document.fonts.load(f(40, 700)), ...JAR_FONTS.map(x => document.fonts.load(x))]).catch(() => {}).finally(() => alive && setFontReady(true));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!fontReady || !canvasRef.current) return;
    if (mode === "jar") {
      // Spent today is everyday spending only; repayments get their own "paid today" line.
      const snap = buildSnapshot({ ...snapshotInput, date, includeLoans: false, showIncome: false });
      const paidToday = (snapshotInput.payments || []).filter(p => p.date === date).reduce((t, p) => t + Math.max(0, (+p.amount || 0) - (+p.coversSpends || 0)), 0);
      // Same total as the Clear tab's "to go" (closed and settled debts don't count).
      const debtLeft = (snapshotInput.oblig || []).filter(o => o.status !== "closed" && o.status !== "settled").reduce((t, o) => t + (+o.outstanding || 0), 0);
      drawJarLog(canvasRef.current, buildJarSnapshot({ date, jar, spentToday: snap.todayTotal, paidToday, debtLeft }), { dayNumber: +day || 1, hide });
    } else if (mode === "clear") drawClearingLog(canvasRef.current, buildClearingSnapshot({ ...snapshotInput, date }), { dayNumber: +day || 1, quote, hide });
    else if (mode === "day") drawMoneyLog(canvasRef.current, buildSnapshot({ ...snapshotInput, date, includeLoans, showIncome }), { dayNumber: +day || 1, quote, hide });
    else drawMonthWrap(canvasRef.current, buildMonthWrap({ ...snapshotInput, month, today: date, includeLoans }), { quote, hide });
    setUrl(canvasRef.current.toDataURL("image/png"));
  }, [fontReady, snapshotInput, date, day, quote, includeLoans, showIncome, hide, mode, month, jar]);

  function nextQuote() {
    const all = [...(customQuotes || []), ...QUOTES];
    const i = all.findIndex(x => x.q === quote.q);
    setQuote(all[(i + 1 + shuffle) % all.length]); setShuffle(0);
  }
  const fileName = mode === "jar" ? `jar-log-${date}.png` : mode === "month" ? `money-wrap-${month}.png` : `${mode === "clear" ? "clearing" : "money"}-log-${date}.png`;
  const markPosted = () => { if (daily) onPosted(date, { day: +day || 1, quote }); };
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
        <div className="row" style={{ gap: 6 }}>{tab("clear", "Clearing")}{jar && tab("jar", "Jar")}{tab("day", "Spending")}{tab("month", "Month")}</div>
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
          {daily ? (
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
          {daily && <div className="foot" style={{ marginTop: -4 }}>{saved ? `You posted this day as Day ${saved.day}.` : "Next day number counts up from your last post, so skipping a day doesn't break the count. Change it here if you need to."}</div>}

          {mode !== "jar" && <div>
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
          </div>}

          <label className="row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={!hide} onChange={e => setHide(!e.target.checked)} /> {mode === "jar" ? "Show spent and debt amounts (jar and invested amounts always show)" : "Show rupee amounts (notes are never shown)"}
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
