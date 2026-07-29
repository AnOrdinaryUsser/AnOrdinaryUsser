#!/usr/bin/env node
/**
 * GitHub Jet Heatmap — animated contribution grid with a jet flying over it.
 * Generates dist/github-jet-dark.svg and dist/github-jet-light.svg (pure SMIL, no JS).
 *
 * Env: GH_USERNAME (required), GH_TOKEN (GraphQL token; falls back to demo data if missing)
 */
import { writeFileSync, mkdirSync } from "node:fs";

const USER = process.env.GH_USERNAME || "AnOrdinaryUsser";
const TOKEN = process.env.GH_TOKEN;

const THEMES = {
  dark: {
    bg: "#030712", panel: "#0F172A", border: "rgba(255,255,255,0.08)",
    text: "#F8FAFC", muted: "#94A3B8",
    levels: ["#111C33", "#1E3A5F", "#1D4ED8", "#22D3EE", "#7DF9E9"],
    jet: "#22D3EE", trail: "#7C3AED", accent: "#7C3AED",
  },
  light: {
    bg: "#FFFFFF", panel: "#F8FAFC", border: "rgba(15,23,42,0.08)",
    text: "#0F172A", muted: "#475569",
    levels: ["#E8EEF7", "#BFDBFE", "#60A5FA", "#2563EB", "#1E40AF"],
    jet: "#2563EB", trail: "#06B6D4", accent: "#06B6D4",
  },
};

async function fetchCalendar() {
  if (!TOKEN) return demoCalendar();
  const query = `query($login:String!){ user(login:$login){ contributionsCollection{
    contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount contributionLevel } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user.contributionsCollection.contributionCalendar;
}

function demoCalendar() {
  const weeks = [];
  let total = 0;
  const start = new Date();
  start.setDate(start.getDate() - 371);
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      if (date > new Date()) continue;
      const r = Math.random();
      const count = r < 0.35 ? 0 : Math.floor(r * r * 14);
      total += count;
      const LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
      const lvl = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4;
      days.push({ date: date.toISOString().slice(0, 10), contributionCount: count, contributionLevel: LEVELS[lvl] });
    }
    weeks.push({ contributionDays: days });
  }
  return { totalContributions: total, weeks };
}

const LEVEL_IDX = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

function buildSvg(cal, t) {
  const CELL = 17, GAP = 4, STEP = CELL + GAP;
  const nW = cal.weeks.length;
  const GX = 34, GY = 58;
  const W = GX * 2 + nW * STEP - GAP;
  const H = GY + 7 * STEP - GAP + 30;
  const s = [];

  s.push(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub contributions of ${USER}">`);
  s.push(`<defs>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <linearGradient id="trail" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.trail}" stop-opacity="0"/><stop offset="1" stop-color="${t.jet}" stop-opacity=".85"/>
    </linearGradient>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.jet}"/>
    </linearGradient>
    <clipPath id="panel"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>`);
  s.push(`<g clip-path="url(#panel)">`);
  s.push(`<rect width="${W}" height="${H}" rx="18" fill="${t.panel}" stroke="${t.border}"/>`);

  // header
  s.push(`<text x="${GX}" y="34" font-family="${MONO}" font-size="15" font-weight="700" fill="url(#hdr)">// flight log</text>`);
  s.push(`<text x="${W - GX}" y="34" text-anchor="end" font-family="${MONO}" font-size="13" fill="${t.muted}">${cal.totalContributions} contributions in the last year</text>`);

  // month labels
  let lastMonth = -1;
  cal.weeks.forEach((wk, i) => {
    const d0 = wk.contributionDays[0];
    if (!d0) return;
    const m = new Date(d0.date + "T00:00:00").getMonth();
    if (m !== lastMonth) {
      if (i > 0) s.push(`<text x="${GX + i * STEP}" y="${GY - 8}" font-family="${MONO}" font-size="10" fill="${t.muted}">${MONTHS[m]}</text>`);
      lastMonth = m;
    }
  });

  // cells with wave reveal + pulse on hottest
  cal.weeks.forEach((wk, wi) => {
    wk.contributionDays.forEach((day) => {
      const di = new Date(day.date + "T00:00:00").getDay();
      const lvl = LEVEL_IDX[day.contributionLevel] ?? 0;
      const x = GX + wi * STEP, y = GY + di * STEP;
      const b = (wi * 0.03).toFixed(2);
      let cell = `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="4" fill="${t.levels[lvl]}" opacity="0">` +
        `<animate attributeName="opacity" values="0;1" begin="${b}s" dur="0.3s" fill="freeze"/>`;
      if (lvl === 4) cell += `<animate attributeName="opacity" values="1;.55;1" begin="${(2 + wi * 0.05).toFixed(2)}s" dur="3s" repeatCount="indefinite"/>`;
      cell += `</rect>`;
      s.push(cell);
    });
  });

  // flight path (sine wave over the grid)
  const midY = GY + 3.5 * STEP - GAP / 2;
  const amp = 34;
  const x0 = -60, x1 = W + 60;
  const seg = (x1 - x0) / 4;
  const path = `M ${x0} ${midY} q ${seg / 2} ${-amp} ${seg} 0 t ${seg} 0 t ${seg} 0 t ${seg} 0`;
  const DUR = 11;

  s.push(`<path d="${path}" fill="none" stroke="url(#trail)" stroke-width="1.6" stroke-dasharray="6 7" opacity=".5">
    <animate attributeName="stroke-dashoffset" values="0;-260" dur="8s" repeatCount="indefinite"/>
  </path>`);

  // the jet
  s.push(`<g filter="url(#glow)">
    <g>
      <path d="M 30 0 L 8 6 L -14 3 L -20 9 L -14 0 L -20 -9 L -14 -3 L 8 -6 Z" fill="${t.jet}"/>
      <circle r="2.6" cx="-19" cy="0" fill="${t.trail}">
        <animate attributeName="r" values="2.6;4.6;2.6" dur=".5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".9;.35;.9" dur=".5s" repeatCount="indefinite"/>
      </circle>
      <animateMotion dur="${DUR}s" repeatCount="indefinite" rotate="auto" path="${path}"/>
    </g>
  </g>`);

  // legend
  const ly = H - 16;
  s.push(`<text x="${W - GX - 5 * (CELL * 0.75 + 4) - 44} " y="${ly}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${t.muted}">less</text>`);
  t.levels.forEach((c, i) => {
    s.push(`<rect x="${W - GX - (5 - i) * (CELL * 0.75 + 4) - 36}" y="${ly - 9}" width="${CELL * 0.75}" height="${CELL * 0.75}" rx="3" fill="${c}"/>`);
  });
  s.push(`<text x="${W - GX}" y="${ly}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${t.muted}">more</text>`);

  s.push(`</g></svg>`);
  return s.join("\n");
}

const cal = await fetchCalendar();
mkdirSync("dist", { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(`dist/github-jet-${name}.svg`, buildSvg(cal, theme));
  console.log(`dist/github-jet-${name}.svg written`);
}
console.log(`total: ${cal.totalContributions}${TOKEN ? "" : " (demo data — set GH_TOKEN for real data)"}`);
