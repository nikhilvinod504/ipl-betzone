import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import Lottie from "lottie-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get, update } from "firebase/database";

// ─── Firebase Config ───────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCgefT3o9B3RVfPjILAVkPeLmNmGfg6c-4",
  authDomain: "ipl-betzone.firebaseapp.com",
  databaseURL: "https://ipl-betzone-default-rtdb.firebaseio.com",
  projectId: "ipl-betzone",
  storageBucket: "ipl-betzone.firebasestorage.app",
  messagingSenderId: "1093070128973",
  appId: "1:1093070128973:web:b9adfb43db5a800c1ad904",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const CHAT_SCROLL_TOP_KEY = "betzone_chatScrollTop";

/** CSS animation value when motion is OK vs reduced-motion users */
function uxMotion(enabled, cssWhenEnabled) {
  return enabled ? cssWhenEnabled : "none";
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch { return false; }
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduce(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    setReduce(mq.matches);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return reduce;
}

/** League matches in schedule — must match length of getLeagueSchedule() */
const IPL_LEAGUE_MATCH_COUNT = 70;

/** Knockout slot dates/venues (edit when BCCI confirms) — teams filled automatically */
const IPL_2026_PLAYOFF_SCHEDULE = {
  q1:    { rawDate: "2026-05-27T14:00:00Z", date: "27 May", time: "7:30 PM", venue: "Narendra Modi Stadium, Ahmedabad" },
  elim:  { rawDate: "2026-05-28T14:00:00Z", date: "28 May", time: "7:30 PM", venue: "Narendra Modi Stadium, Ahmedabad" },
  q2:    { rawDate: "2026-05-30T14:00:00Z", date: "30 May", time: "7:30 PM", venue: "Narendra Modi Stadium, Ahmedabad" },
  final: { rawDate: "2026-06-01T14:00:00Z", date: "01 Jun", time: "7:30 PM", venue: "Narendra Modi Stadium, Ahmedabad" },
};

function fbKeyStatic(id) {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** IPL format: Q1 = 1v2, Elim = 3v4; Q2 = loser Q1 vs winner Elim; Final = winner Q1 vs winner Q2 */
function buildIplPlayoffFixtures(iplTable, manualResults, leagueCompletedCount) {
  if (leagueCompletedCount < IPL_LEAGUE_MATCH_COUNT) return [];

  const sorted = [...iplTable].sort((a, b) => b.pts - a.pts || parseFloat(b.nrr) - parseFloat(a.nrr));
  const top = sorted.slice(0, 4).map(r => r.team);
  if (top.length < 4 || top.some(t => !t)) return [];

  const [t1, t2, t3, t4] = top;
  const key = fbKeyStatic;
  const out = [];

  const pm = (id, home, away, schedKey, playoffRound) => {
    const meta = IPL_2026_PLAYOFF_SCHEDULE[schedKey];
    return {
      id, home, away,
      playoffAutoHome: home,
      playoffAutoAway: away,
      rawDate: meta.rawDate, date: meta.date, time: meta.time, venue: meta.venue,
      status: "upcoming", apiWinner: null, stage: "playoff", playoffRound,
    };
  };

  out.push(pm("ipl26-po-q1", t1, t2, "q1", "Qualifier 1"));
  out.push(pm("ipl26-po-elim", t3, t4, "elim", "Eliminator"));

  const wQ1 = manualResults[key("ipl26-po-q1")]?.winner;
  const wElim = manualResults[key("ipl26-po-elim")]?.winner;
  if (wQ1 && wElim) {
    const loserQ1 = wQ1 === t1 ? t2 : t1;
    out.push(pm("ipl26-po-q2", loserQ1, wElim, "q2", "Qualifier 2"));
  }

  const wQ2 = manualResults[key("ipl26-po-q2")]?.winner;
  if (wQ1 && wQ2) {
    out.push(pm("ipl26-po-final", wQ1, wQ2, "final", "Final"));
  }

  return out;
}

/** Apply Admin playoff overrides from Firebase; playoffBettingOpen === true only when confirmed */
function mergePlayoffAdminRows(playoffRows, playoffAdmin) {
  return playoffRows.map(m => {
    const k = fbKeyStatic(m.id);
    const o = playoffAdmin[k] || {};
    const autoH = m.playoffAutoHome ?? m.home;
    const autoA = m.playoffAutoAway ?? m.away;
    const playoffDefaultVenue = m.venue;
    const playoffDefaultRawDate = m.rawDate;

    let home = autoH;
    let away = autoA;
    if (o.home != null && String(o.home).trim() !== "") home = String(o.home).trim();
    if (o.away != null && String(o.away).trim() !== "") away = String(o.away).trim();

    let rawDate = m.rawDate;
    let venue = m.venue;
    let date = m.date;
    let time = m.time;

    if (o.rawDate != null && String(o.rawDate).trim() !== "") {
      rawDate = String(o.rawDate).trim();
      const d = new Date(rawDate);
      if (!Number.isNaN(d.getTime())) {
        date = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
        time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      }
    }
    if (o.venue != null && String(o.venue).trim() !== "") venue = String(o.venue).trim();
    if (o.date != null && String(o.date).trim() !== "") date = String(o.date).trim();
    if (o.time != null && String(o.time).trim() !== "") time = String(o.time).trim();

    return {
      ...m,
      home,
      away,
      rawDate,
      date,
      time,
      venue,
      playoffAutoHome: autoH,
      playoffAutoAway: autoA,
      playoffDefaultVenue,
      playoffDefaultRawDate,
      playoffBettingOpen: o.confirmed === true,
    };
  });
}

function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(s) {
  if (!s || !String(s).trim()) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

// ─── CricketData API ───────────────────────────────────────────────
// CricketData API removed — all results managed manually via Admin panel

// ─── Constants ─────────────────────────────────────────────────────
const PLAYERS = ["Nakel", "Mitthu", "Megs"];

// ─── Avatar options ────────────────────────────────────────────────
// Categorised avatar emojis — 100+ choices
const AVATAR_EMOJI_LIST = [
  // 😀 Smileys & Faces (38)
  "😀","😂","🤣","😍","🥰","😘","😜","🤪","😎","🤩",
  "🥳","😇","🤓","🥸","😈","👿","👻","💀","🎃","🤡",
  "🥶","🤯","😤","🤑","😏","🫡","🤠","🧐","😱","😡",
  "🤬","🥺","😴","🫠","🤭","🫣","😵","🤮",
  // 🎉 Celebrations (19)
  "🎉","🎊","🎆","🎇","🧨","🎂","🎁","🎈","👑","🏅",
  "🥇","🥂","🍾","🎀","✨","🌟","💫","🎯","🏆",
  // 🔥 Fire & Power (10)
  "🔥","⚡","💥","🚀","☄️","💎","🌊","❄️","🌋","⚔️",
  // 🐾 Animals (20)
  "🦁","🐯","🐻","🦊","🐺","🦈","🐲","🦅","🦉","🐼",
  "🦄","🦂","🐉","🦋","🐸","🦓","🦒","🐘","🦏","🐆",
  // 👐 Hands & Hearts (20)
  "👍","👎","🤝","🙌","🤜","🤛","✌️","🤞","🫶","❤️",
  "🧡","💛","💚","💙","💜","🖤","🤍","💔","💕","💯",
  // 🌈 Extra (20)
  "🌈","⭐","🌙","☀️","🍀","🎸","🎮","🤖","👽","🧠",
  "🦸","🥷","🧙","🔮","💣","🎭","🎨","🧬","🌺","🪐",
]

const AVATAR_COLORS = [
  { color: "#FF6B2B", light: "#FF6B2B18", name: "Orange" },
  { color: "#00C2FF", light: "#00C2FF18", name: "Blue" },
  { color: "#A855F7", light: "#A855F718", name: "Purple" },
  { color: "#22C55E", light: "#22C55E18", name: "Green" },
  { color: "#EF4444", light: "#EF444418", name: "Red" },
  { color: "#FFD700", light: "#FFD70018", name: "Gold" },
  { color: "#EC4899", light: "#EC489918", name: "Pink" },
  { color: "#14B8A6", light: "#14B8A618", name: "Teal" },
  { color: "#F97316", light: "#F9731618", name: "Amber" },
  { color: "#6366F1", light: "#6366F118", name: "Indigo" },
];

// ── Lottie URL map — Google Noto Animated Emoji ─────────────────────────
const LOTTIE_BASE = "https://fonts.gstatic.com/s/e/notoemoji/latest";
const LOTTIE_MAP = {
  // Smileys
  "😀":"1f600","😂":"1f602","🤣":"1f923","😍":"1f60d","🥰":"1f970",
  "😘":"1f618","😜":"1f61c","🤪":"1f92a","😎":"1f60e","🤩":"1f929",
  "🥳":"1f973","😇":"1f607","🤓":"1f913","🥸":"1f978","😈":"1f608",
  "👿":"1f47f","👻":"1f47b","💀":"1f480","🎃":"1f383","🤡":"1f921",
  "🥶":"1f976","🤯":"1f92f","😤":"1f624","🤑":"1f911","😏":"1f60f",
  "🫡":"1fae1","🤠":"1f920","🧐":"1f9d0","😱":"1f631","😡":"1f621",
  "🤬":"1f92c","🥺":"1f97a","😴":"1f634","🫠":"1fae0","🤭":"1f92d",
  "🫣":"1fae3","😵":"1f635","🤮":"1f92e",
  // Celebrations
  "🎉":"1f389","🎊":"1f38a","🎆":"1f386","🎇":"1f387","🧨":"1f9e8",
  "🎂":"1f382","🎁":"1f381","🎈":"1f388","👑":"1f451","🏅":"1f3c5",
  "🥇":"1f947","🥂":"1f942","🍾":"1f37e","🎀":"1f380","✨":"2728",
  "🌟":"1f31f","💫":"1f4ab","🎯":"1f3af","🏆":"1f3c6",
  // Fire & Power
  "🔥":"1f525","⚡":"26a1","💥":"1f4a5","🚀":"1f680","☄️":"2604",
  "💎":"1f48e","🌊":"1f30a","❄️":"2744","🌋":"1f30b","⚔️":"2694",
  // Animals
  "🦁":"1f981","🐯":"1f42f","🐻":"1f43b","🦊":"1f98a","🐺":"1f43a",
  "🦈":"1f988","🐲":"1f432","🦅":"1f985","🦉":"1f989","🐼":"1f43c",
  "🦄":"1f984","🦂":"1f982","🐉":"1f409","🦋":"1f98b","🐸":"1f438",
  "🦓":"1f993","🦒":"1f992","🐘":"1f418","🦏":"1f98f","🐆":"1f406",
  // Hands & Hearts
  "👍":"1f44d","👎":"1f44e","🤝":"1f91d","🙌":"1f64c","🤜":"1f91c",
  "🤛":"1f91b","🤞":"1f91e","🫶":"1faf6","❤️":"2764","🧡":"1f9e1",
  "💛":"1f49b","💚":"1f49a","💙":"1f499","💜":"1f49c","🖤":"1f5a4",
  "🤍":"1f90d","💔":"1f494","💕":"1f495","💯":"1f4af",
  // Extra
  "🌈":"1f308","⭐":"2b50","🌙":"1f319","☀️":"2600","🍀":"1f340",
  "🎸":"1f3b8","🎮":"1f3ae","🤖":"1f916","👽":"1f47d","🧠":"1f9e0",
  "🦸":"1f9b8","🥷":"1f977","🧙":"1f9d9","🔮":"1f52e","💣":"1f4a3",
  "🎭":"1f3ad","🎨":"1f3a8","🧬":"1f9ec","🌺":"1f33a","🪐":"1fa90",
};
function getLottieUrl(emoji) {
  const cp = LOTTIE_MAP[emoji];
  return cp ? `${LOTTIE_BASE}/${cp}/lottie.json` : null;
}

// Default avatars if nothing saved
const DEFAULT_AVATARS = {
  Nakel:  { emoji: "🦁", colorIdx: 0 },
  Mitthu: { emoji: "🐯", colorIdx: 1 },
  Megs:   { emoji: "🦅", colorIdx: 2 },
};
// Base PLAYER_META — overridden dynamically by customAvatars from Firebase
const BASE_PLAYER_META = {
  Nakel:  { emoji: "🦁", color: "#FF6B2B", light: "#FF6B2B18" },
  Mitthu: { emoji: "🐯", color: "#00C2FF", light: "#00C2FF18" },
  Megs:   { emoji: "🦅", color: "#A855F7", light: "#A855F718" },
};


// ─── IPL 2026 Squads (verified from CricTracker/Outlook) ──────────────
const IPL_SQUADS = {
  RCB: {
    captain: "Rajat Patidar", coach: "Andy Flower",
    players: [
      { name:"Rajat Patidar",      role:"Batter",      country:"India",       cap:"₹11Cr",   isOverseas:false, isCap:true  },
      { name:"Virat Kohli",        role:"Batter",      country:"India",       cap:"₹21Cr",   isOverseas:false, isCap:false },
      { name:"Devdutt Padikkal",   role:"Batter",      country:"India",       cap:"₹14Cr",   isOverseas:false, isCap:false },
      { name:"Phil Salt",          role:"WK-Batter",   country:"England",     cap:"₹11.5Cr", isOverseas:true,  isCap:false },
      { name:"Jitesh Sharma",      role:"WK-Batter",   country:"India",       cap:"₹11Cr",   isOverseas:false, isCap:false },
      { name:"Jordan Cox",         role:"WK-Batter",   country:"England",     cap:"₹2.4Cr",  isOverseas:true,  isCap:false },
      { name:"Venkatesh Iyer",     role:"All-Rounder", country:"India",       cap:"₹23.75Cr",isOverseas:false, isCap:false },
      { name:"Krunal Pandya",      role:"All-Rounder", country:"India",       cap:"₹5.75Cr", isOverseas:false, isCap:false },
      { name:"Tim David",          role:"All-Rounder", country:"Singapore",   cap:"₹3.4Cr",  isOverseas:true,  isCap:false },
      { name:"Jacob Bethell",      role:"All-Rounder", country:"England",     cap:"₹2.8Cr",  isOverseas:true,  isCap:false },
      { name:"Romario Shepherd",   role:"All-Rounder", country:"W. Indies",   cap:"₹3.5Cr",  isOverseas:true,  isCap:false },
      { name:"Swapnil Singh",      role:"All-Rounder", country:"India",       cap:"₹3.8Cr",  isOverseas:false, isCap:false },
      { name:"Liam Livingstone",   role:"All-Rounder", country:"England",     cap:"₹8.75Cr", isOverseas:true,  isCap:false },
      { name:"Josh Hazlewood",     role:"Bowler",      country:"Australia",   cap:"₹12.5Cr", isOverseas:true,  isCap:false },
      { name:"Suyash Sharma",      role:"Bowler",      country:"India",       cap:"₹8.25Cr", isOverseas:false, isCap:false },
      { name:"Bhuvneshwar Kumar",  role:"Bowler",      country:"India",       cap:"₹6.5Cr",  isOverseas:false, isCap:false },
      { name:"Rasikh Salam",       role:"Bowler",      country:"India",       cap:"₹4.6Cr",  isOverseas:false, isCap:false },
      { name:"Nuwan Thushara",     role:"Bowler",      country:"Sri Lanka",   cap:"₹4.8Cr",  isOverseas:true,  isCap:false },
      { name:"Vicky Ostwal",       role:"Bowler",      country:"India",       cap:"₹3Cr",    isOverseas:false, isCap:false },
      { name:"Jacob Duffy",        role:"Bowler",      country:"N. Zealand",  cap:"₹75L",    isOverseas:true,  isCap:false },
    ]
  },
  CSK: {
    captain: "Ruturaj Gaikwad", coach: "Stephen Fleming",
    players: [
      { name:"Ruturaj Gaikwad",    role:"Batter",      country:"India",       cap:"₹18Cr",   isOverseas:false, isCap:true  },
      { name:"MS Dhoni",           role:"WK-Batter",   country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Sanju Samson",       role:"WK-Batter",   country:"India",       cap:"₹14.5Cr", isOverseas:false, isCap:false },
      { name:"Urvil Patel",        role:"WK-Batter",   country:"India",       cap:"₹5Cr",    isOverseas:false, isCap:false },
      { name:"Ayush Mhatre",       role:"Batter",      country:"India",       cap:"₹14.2Cr", isOverseas:false, isCap:false },
      { name:"Dewald Brevis",      role:"Batter",      country:"S. Africa",   cap:"₹3Cr",    isOverseas:true,  isCap:false },
      { name:"Sarfaraz Khan",      role:"Batter",      country:"India",       cap:"₹6Cr",    isOverseas:false, isCap:false },
      { name:"Kartik Sharma",      role:"Batter",      country:"India",       cap:"₹14.2Cr", isOverseas:false, isCap:false },
      { name:"Shivam Dube",        role:"All-Rounder", country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Jamie Overton",      role:"All-Rounder", country:"England",     cap:"₹7.4Cr",  isOverseas:true,  isCap:false },
      { name:"Ramakrishna Ghosh",  role:"All-Rounder", country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Prashant Veer",      role:"All-Rounder", country:"India",       cap:"₹14.2Cr", isOverseas:false, isCap:false },
      { name:"Matthew Short",      role:"All-Rounder", country:"Australia",   cap:"₹3Cr",    isOverseas:true,  isCap:false },
      { name:"Aman Khan",          role:"All-Rounder", country:"India",       cap:"₹3Cr",    isOverseas:false, isCap:false },
      { name:"Zak Foulkes",        role:"All-Rounder", country:"England",     cap:"₹1Cr",    isOverseas:true,  isCap:false },
      { name:"Khaleel Ahmed",      role:"Bowler",      country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Noor Ahmad",         role:"Bowler",      country:"Afghanistan", cap:"₹10Cr",   isOverseas:true,  isCap:false },
      { name:"Matt Henry",         role:"Bowler",      country:"N. Zealand",  cap:"₹4.8Cr",  isOverseas:true,  isCap:false },
      { name:"Rahul Chahar",       role:"Bowler",      country:"India",       cap:"₹5Cr",    isOverseas:false, isCap:false },
      { name:"Shreyas Gopal",      role:"Bowler",      country:"India",       cap:"₹3Cr",    isOverseas:false, isCap:false },
      { name:"Mukesh Choudhary",   role:"Bowler",      country:"India",       cap:"₹4.5Cr",  isOverseas:false, isCap:false },
      { name:"Anshul Kamboj",      role:"Bowler",      country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Gurjapneet Singh",   role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Akeal Hosein",       role:"Bowler",      country:"W. Indies",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Spencer Johnson",    role:"Bowler",      country:"Australia",   cap:"₹2Cr",    isOverseas:true,  isCap:false },
    ]
  },
  MI: {
    captain: "Hardik Pandya", coach: "Mark Boucher",
    players: [
      { name:"Hardik Pandya",      role:"All-Rounder", country:"India",       cap:"₹16.35Cr",isOverseas:false, isCap:true  },
      { name:"Rohit Sharma",       role:"Batter",      country:"India",       cap:"₹16.3Cr", isOverseas:false, isCap:false },
      { name:"Suryakumar Yadav",   role:"Batter",      country:"India",       cap:"₹16.35Cr",isOverseas:false, isCap:false },
      { name:"Tilak Varma",        role:"Batter",      country:"India",       cap:"₹17Cr",   isOverseas:false, isCap:false },
      { name:"Quinton de Kock",    role:"WK-Batter",   country:"S. Africa",   cap:"₹1Cr",    isOverseas:true,  isCap:false },
      { name:"Robin Minz",         role:"WK-Batter",   country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Ryan Rickelton",     role:"WK-Batter",   country:"S. Africa",   cap:"₹3Cr",    isOverseas:true,  isCap:false },
      { name:"Danish Malewar",     role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Sherfane Rutherford",role:"All-Rounder", country:"W. Indies",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Naman Dhir",         role:"All-Rounder", country:"India",       cap:"₹5.25Cr", isOverseas:false, isCap:false },
      { name:"Will Jacks",         role:"All-Rounder", country:"England",     cap:"₹4Cr",    isOverseas:true,  isCap:false },
      { name:"Raj Bawa",           role:"All-Rounder", country:"India",       cap:"₹1Cr",    isOverseas:false, isCap:false },
      { name:"Corbin Bosch",       role:"All-Rounder", country:"S. Africa",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Mitchell Santner",   role:"All-Rounder", country:"N. Zealand",  cap:"₹4Cr",    isOverseas:true,  isCap:false },
      { name:"Shardul Thakur",     role:"All-Rounder", country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Atharva Ankolekar",  role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Jasprit Bumrah",     role:"Bowler",      country:"India",       cap:"₹18Cr",   isOverseas:false, isCap:false },
      { name:"Trent Boult",        role:"Bowler",      country:"N. Zealand",  cap:"₹4Cr",    isOverseas:true,  isCap:false },
      { name:"Deepak Chahar",      role:"Bowler",      country:"India",       cap:"₹9.25Cr", isOverseas:false, isCap:false },
      { name:"AM Ghazanfar",       role:"Bowler",      country:"Afghanistan", cap:"₹4Cr",    isOverseas:true,  isCap:false },
      { name:"Mayank Markande",    role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Ashwani Kumar",      role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Mayank Rawat",       role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Mohd Izhar",         role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Raghu Sharma",       role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
    ]
  },
  KKR: {
    captain: "Ajinkya Rahane", coach: "Chandrakant Pandit",
    players: [
      { name:"Ajinkya Rahane",      role:"Batter",      country:"India",       cap:"₹1.5Cr",  isOverseas:false, isCap:true  },
      { name:"Rinku Singh",         role:"Batter",      country:"India",       cap:"₹13Cr",   isOverseas:false, isCap:false },
      { name:"Angkrish Raghuvanshi",role:"Batter",      country:"India",       cap:"₹3Cr",    isOverseas:false, isCap:false },
      { name:"Manish Pandey",       role:"Batter",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Rahul Tripathi",      role:"Batter",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Finn Allen",          role:"WK-Batter",   country:"N. Zealand",  cap:"₹2Cr",    isOverseas:true,  isCap:false },
      { name:"Tim Seifert",         role:"WK-Batter",   country:"N. Zealand",  cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Tejasvi Dahiya",      role:"WK-Batter",   country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Cameron Green",       role:"All-Rounder", country:"Australia",   cap:"₹18Cr",   isOverseas:true,  isCap:false },
      { name:"Sunil Narine",        role:"All-Rounder", country:"W. Indies",   cap:"₹12Cr",   isOverseas:true,  isCap:false },
      { name:"Rovman Powell",       role:"All-Rounder", country:"W. Indies",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Rachin Ravindra",     role:"All-Rounder", country:"N. Zealand",  cap:"₹4Cr",    isOverseas:true,  isCap:false },
      { name:"Ramandeep Singh",     role:"All-Rounder", country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Anukul Roy",          role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Daksh Kamra",         role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Sarthak Ranjan",      role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Varun Chakravarthy",  role:"Bowler",      country:"India",       cap:"₹14Cr",   isOverseas:false, isCap:false },
      { name:"Matheesha Pathirana", role:"Bowler",      country:"Sri Lanka",   cap:"₹18Cr",   isOverseas:true,  isCap:false },
      { name:"Blessing Muzarabani", role:"Bowler",      country:"Zimbabwe",    cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Vaibhav Arora",       role:"Bowler",      country:"India",       cap:"₹2Cr",    isOverseas:false, isCap:false },
      { name:"Kartik Tyagi",        role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Saurabh Dubey",       role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Prashant Solanki",    role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Umran Malik",         role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
    ]
  },
  SRH: {
    captain: "Pat Cummins", coach: "Daniel Vettori",
    players: [
      { name:"Pat Cummins",         role:"Bowler",      country:"Australia",   cap:"₹18Cr",   isOverseas:true,  isCap:true  },
      { name:"Travis Head",         role:"Batter",      country:"Australia",   cap:"₹14.1Cr", isOverseas:true,  isCap:false },
      { name:"Abhishek Sharma",     role:"Batter",      country:"India",       cap:"₹14Cr",   isOverseas:false, isCap:false },
      { name:"Aniket Verma",        role:"Batter",      country:"India",       cap:"₹3Cr",    isOverseas:false, isCap:false },
      { name:"R. Smaran",           role:"Batter",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Heinrich Klaasen",    role:"WK-Batter",   country:"S. Africa",   cap:"₹23Cr",   isOverseas:true,  isCap:false },
      { name:"Ishan Kishan",        role:"WK-Batter",   country:"India",       cap:"₹11.25Cr",isOverseas:false, isCap:false },
      { name:"Nitish Kumar Reddy",  role:"All-Rounder", country:"India",       cap:"₹13Cr",   isOverseas:false, isCap:false },
      { name:"Kamindu Mendis",      role:"All-Rounder", country:"Sri Lanka",   cap:"₹2Cr",    isOverseas:true,  isCap:false },
      { name:"Brydon Carse",        role:"All-Rounder", country:"England",     cap:"₹8Cr",    isOverseas:true,  isCap:false },
      { name:"Harshal Patel",       role:"Bowler",      country:"India",       cap:"₹7.25Cr", isOverseas:false, isCap:false },
      { name:"Mohammed Shami",      role:"Bowler",      country:"India",       cap:"₹10Cr",   isOverseas:false, isCap:false },
      { name:"Jaydev Unadkat",      role:"Bowler",      country:"India",       cap:"₹1Cr",    isOverseas:false, isCap:false },
      { name:"Zeeshan Ansari",      role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"David Payne",         role:"Bowler",      country:"England",     cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Harsh Dubey",         role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Jack Edwards",        role:"All-Rounder", country:"Australia",   cap:"₹75L",    isOverseas:true,  isCap:false },
    ]
  },
  RR: {
    captain: "Riyan Parag", coach: "Rahul Dravid",
    players: [
      { name:"Riyan Parag",         role:"All-Rounder", country:"India",       cap:"₹14Cr",   isOverseas:false, isCap:true  },
      { name:"Yashasvi Jaiswal",    role:"Batter",      country:"India",       cap:"₹18Cr",   isOverseas:false, isCap:false },
      { name:"Vaibhav Suryavanshi", role:"Batter",      country:"India",       cap:"₹1.1Cr",  isOverseas:false, isCap:false },
      { name:"Shimron Hetmyer",     role:"Batter",      country:"W. Indies",   cap:"₹11.5Cr", isOverseas:true,  isCap:false },
      { name:"Donovan Ferreira",    role:"Batter",      country:"S. Africa",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Lhuan-dre Pretorius", role:"Batter",      country:"S. Africa",   cap:"₹30L",    isOverseas:true,  isCap:false },
      { name:"Dhruv Jurel",         role:"WK-Batter",   country:"India",       cap:"₹14Cr",   isOverseas:false, isCap:false },
      { name:"Aman Rao",            role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Ravi Singh",          role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Ravindra Jadeja",     role:"All-Rounder", country:"India",       cap:"₹18Cr",   isOverseas:false, isCap:false },
      { name:"Dasun Shanaka",       role:"All-Rounder", country:"Sri Lanka",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Shubham Dubey",       role:"All-Rounder", country:"India",       cap:"₹6Cr",    isOverseas:false, isCap:false },
      { name:"Jofra Archer",        role:"Bowler",      country:"England",     cap:"₹17.5Cr", isOverseas:true,  isCap:false },
      { name:"Sandeep Sharma",      role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Nandre Burger",       role:"Bowler",      country:"S. Africa",   cap:"₹50L",    isOverseas:true,  isCap:false },
      { name:"Adam Milne",          role:"Bowler",      country:"N. Zealand",  cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Kwena Maphaka",       role:"Bowler",      country:"S. Africa",   cap:"₹30L",    isOverseas:true,  isCap:false },
      { name:"Tushar Deshpande",    role:"Bowler",      country:"India",       cap:"₹2Cr",    isOverseas:false, isCap:false },
      { name:"Kuldeep Sen",         role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Vignesh Puthur",      role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Yudhvir Singh",       role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Sushant Mishra",      role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Yash Raj Punja",      role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Brijesh Sharma",      role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
    ]
  },
  DC: {
    captain: "Axar Patel", coach: "Hemang Badani",
    players: [
      { name:"Axar Patel",          role:"All-Rounder", country:"India",       cap:"₹16.5Cr", isOverseas:false, isCap:true  },
      { name:"KL Rahul",            role:"WK-Batter",   country:"India",       cap:"₹14Cr",   isOverseas:false, isCap:false },
      { name:"Prithvi Shaw",        role:"Batter",      country:"India",       cap:"₹7.5Cr",  isOverseas:false, isCap:false },
      { name:"Karun Nair",          role:"Batter",      country:"India",       cap:"₹6Cr",    isOverseas:false, isCap:false },
      { name:"David Miller",        role:"Batter",      country:"S. Africa",   cap:"₹3.5Cr",  isOverseas:true,  isCap:false },
      { name:"Tristan Stubbs",      role:"Batter",      country:"S. Africa",   cap:"₹4.7Cr",  isOverseas:true,  isCap:false },
      { name:"Abishek Porel",       role:"WK-Batter",   country:"India",       cap:"₹3Cr",    isOverseas:false, isCap:false },
      { name:"Sameer Rizvi",        role:"Batter",      country:"India",       cap:"₹3Cr",    isOverseas:false, isCap:false },
      { name:"Pathum Nissanka",     role:"Batter",      country:"Sri Lanka",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Ashutosh Sharma",     role:"All-Rounder", country:"India",       cap:"₹3.4Cr",  isOverseas:false, isCap:false },
      { name:"Nitish Rana",         role:"All-Rounder", country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Kyle Jamieson",       role:"All-Rounder", country:"N. Zealand",  cap:"₹4Cr",    isOverseas:true,  isCap:false },
      { name:"Vipraj Nigam",        role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Kuldeep Yadav",       role:"Bowler",      country:"India",       cap:"₹17Cr",   isOverseas:false, isCap:false },
      { name:"Mitchell Starc",      role:"Bowler",      country:"Australia",   cap:"₹11.5Cr", isOverseas:true,  isCap:false },
      { name:"T Natarajan",         role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Mukesh Kumar",        role:"Bowler",      country:"India",       cap:"₹2Cr",    isOverseas:false, isCap:false },
      { name:"Lungi Ngidi",         role:"Bowler",      country:"S. Africa",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Dushmantha Chameera", role:"Bowler",      country:"Sri Lanka",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Auqib Nabi",          role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Ajay Mandal",         role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Madhav Tiwari",       role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Tripurana Vijay",     role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Sahil Parakh",        role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
    ]
  },
  GT: {
    captain: "Shubman Gill", coach: "Gary Kirsten",
    players: [
      { name:"Shubman Gill",        role:"Batter",      country:"India",       cap:"₹17Cr",   isOverseas:false, isCap:true  },
      { name:"Sai Sudharsan",       role:"Batter",      country:"India",       cap:"₹8.5Cr",  isOverseas:false, isCap:false },
      { name:"Shahrukh Khan",       role:"Batter",      country:"India",       cap:"₹7.4Cr",  isOverseas:false, isCap:false },
      { name:"Tom Banton",          role:"WK-Batter",   country:"England",     cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Jos Buttler",         role:"WK-Batter",   country:"England",     cap:"₹15Cr",   isOverseas:true,  isCap:false },
      { name:"Kumar Kushagra",      role:"WK-Batter",   country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Anuj Rawat",          role:"WK-Batter",   country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Glenn Phillips",      role:"All-Rounder", country:"N. Zealand",  cap:"₹2Cr",    isOverseas:true,  isCap:false },
      { name:"Rashid Khan",         role:"All-Rounder", country:"Afghanistan", cap:"₹18Cr",   isOverseas:true,  isCap:false },
      { name:"Washington Sundar",   role:"All-Rounder", country:"India",       cap:"₹3.2Cr",  isOverseas:false, isCap:false },
      { name:"Rahul Tewatia",       role:"All-Rounder", country:"India",       cap:"₹5Cr",    isOverseas:false, isCap:false },
      { name:"Nishant Sindhu",      role:"All-Rounder", country:"India",       cap:"₹3.2Cr",  isOverseas:false, isCap:false },
      { name:"Jason Holder",        role:"All-Rounder", country:"W. Indies",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Arshad Khan",         role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Jayant Yadav",        role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Kagiso Rabada",       role:"Bowler",      country:"S. Africa",   cap:"₹17.5Cr", isOverseas:true,  isCap:false },
      { name:"Mohammed Siraj",      role:"Bowler",      country:"India",       cap:"₹11Cr",   isOverseas:false, isCap:false },
      { name:"Prasidh Krishna",     role:"Bowler",      country:"India",       cap:"₹10Cr",   isOverseas:false, isCap:false },
      { name:"Sai Kishore",         role:"Bowler",      country:"India",       cap:"₹2Cr",    isOverseas:false, isCap:false },
      { name:"Ishant Sharma",       role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Manav Suthar",        role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Gurnoor Brar",        role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Luke Wood",           role:"Bowler",      country:"England",     cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Ashok Sharma",        role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Prithvi Raj",         role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
    ]
  },
  PBKS: {
    captain: "Shreyas Iyer", coach: "Ricky Ponting",
    players: [
      { name:"Shreyas Iyer",        role:"Batter",      country:"India",       cap:"₹26.75Cr",isOverseas:false, isCap:true  },
      { name:"Prabhsimran Singh",   role:"WK-Batter",   country:"India",       cap:"₹4.4Cr",  isOverseas:false, isCap:false },
      { name:"Priyansh Arya",       role:"Batter",      country:"India",       cap:"₹3.8Cr",  isOverseas:false, isCap:false },
      { name:"Nehal Wadhera",       role:"Batter",      country:"India",       cap:"₹4.2Cr",  isOverseas:false, isCap:false },
      { name:"Pyla Avinash",        role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Harnoor Pannu",       role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Vishnu Vinod",        role:"WK-Batter",   country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Musheer Khan",        role:"Batter",      country:"India",       cap:"₹2Cr",    isOverseas:false, isCap:false },
      { name:"Shashank Singh",      role:"All-Rounder", country:"India",       cap:"₹5.6Cr",  isOverseas:false, isCap:false },
      { name:"Marcus Stoinis",      role:"All-Rounder", country:"Australia",   cap:"₹11Cr",   isOverseas:true,  isCap:false },
      { name:"Marco Jansen",        role:"All-Rounder", country:"S. Africa",   cap:"₹13Cr",   isOverseas:true,  isCap:false },
      { name:"Azmatullah Omarzai",  role:"All-Rounder", country:"Afghanistan", cap:"₹2.8Cr",  isOverseas:true,  isCap:false },
      { name:"Mitchell Owen",       role:"All-Rounder", country:"Australia",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Cooper Connolly",     role:"All-Rounder", country:"Australia",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Suryansh Shedge",     role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Harpreet Brar",       role:"All-Rounder", country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Arshdeep Singh",      role:"Bowler",      country:"India",       cap:"₹18Cr",   isOverseas:false, isCap:false },
      { name:"Yuzvendra Chahal",    role:"Bowler",      country:"India",       cap:"₹18Cr",   isOverseas:false, isCap:false },
      { name:"Lockie Ferguson",     role:"Bowler",      country:"N. Zealand",  cap:"₹2Cr",    isOverseas:true,  isCap:false },
      { name:"Xavier Bartlett",     role:"Bowler",      country:"Australia",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Ben Dwarshuis",       role:"Bowler",      country:"Australia",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Vijaykumar Vyshak",   role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Yash Thakur",         role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Praveen Dubey",       role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Vishal Nishad",       role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
    ]
  },
  LSG: {
    captain: "Rishabh Pant", coach: "Justin Langer",
    players: [
      { name:"Rishabh Pant",        role:"WK-Batter",   country:"India",       cap:"₹27Cr",   isOverseas:false, isCap:true  },
      { name:"Nicholas Pooran",     role:"WK-Batter",   country:"W. Indies",   cap:"₹21Cr",   isOverseas:true,  isCap:false },
      { name:"Josh Inglis",         role:"WK-Batter",   country:"Australia",   cap:"₹75L",    isOverseas:true,  isCap:false },
      { name:"Aiden Markram",       role:"Batter",      country:"S. Africa",   cap:"₹2Cr",    isOverseas:true,  isCap:false },
      { name:"Himmat Singh",        role:"Batter",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Matthew Breetzke",    role:"Batter",      country:"S. Africa",   cap:"₹30L",    isOverseas:true,  isCap:false },
      { name:"Akshat Raghuwanshi",  role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Ayush Badoni",        role:"All-Rounder", country:"India",       cap:"₹4Cr",    isOverseas:false, isCap:false },
      { name:"Mitchell Marsh",      role:"All-Rounder", country:"Australia",   cap:"₹3.4Cr",  isOverseas:true,  isCap:false },
      { name:"Shahbaz Ahmed",       role:"All-Rounder", country:"India",       cap:"₹2Cr",    isOverseas:false, isCap:false },
      { name:"Arshin Kulkarni",     role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Abdul Samad",         role:"All-Rounder", country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Arjun Tendulkar",     role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Mayank Yadav",        role:"Bowler",      country:"India",       cap:"₹11Cr",   isOverseas:false, isCap:false },
      { name:"Ravi Bishnoi",        role:"Bowler",      country:"India",       cap:"₹11Cr",   isOverseas:false, isCap:false },
      { name:"Anrich Nortje",       role:"Bowler",      country:"S. Africa",   cap:"₹6.5Cr",  isOverseas:true,  isCap:false },
      { name:"Avesh Khan",          role:"Bowler",      country:"India",       cap:"₹2Cr",    isOverseas:false, isCap:false },
      { name:"Mohsin Khan",         role:"Bowler",      country:"India",       cap:"₹75L",    isOverseas:false, isCap:false },
      { name:"Akash Singh",         role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Digvesh Rathi",       role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Manimaran Siddharth", role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Prince Yadav",        role:"Bowler",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Naman Tiwari",        role:"Batter",      country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
      { name:"Mukul Choudhary",     role:"All-Rounder", country:"India",       cap:"₹30L",    isOverseas:false, isCap:false },
    ]
  },
};

const IPL_TEAMS = {
  MI:   { name: "Mumbai Indians",               color: "#005DA0", accent: "#D4AF37", logo: "https://scores.iplt20.com/ipl/teamlogos/MI.png" },
  CSK:  { name: "Chennai Super Kings",           color: "#F9CD05", accent: "#0081E9", logo: "https://scores.iplt20.com/ipl/teamlogos/CSK.png" },
  RCB:  { name: "Royal Challengers Bengaluru",   color: "#C8102E", accent: "#FFD700", logo: "https://scores.iplt20.com/ipl/teamlogos/RCB.png" },
  KKR:  { name: "Kolkata Knight Riders",         color: "#3A225D", accent: "#F4C430", logo: "https://scores.iplt20.com/ipl/teamlogos/KKR.png" },
  DC:   { name: "Delhi Capitals",                color: "#004C93", accent: "#EF1C25", logo: "https://scores.iplt20.com/ipl/teamlogos/DC.png" },
  SRH:  { name: "Sunrisers Hyderabad",           color: "#FF6600", accent: "#000000", logo: "https://scores.iplt20.com/ipl/teamlogos/SRH.png" },
  RR:   { name: "Rajasthan Royals",              color: "#E8116E", accent: "#254AA5", logo: "https://scores.iplt20.com/ipl/teamlogos/RR.png" },
  PBKS: { name: "Punjab Kings",                  color: "#C8122A", accent: "#DCDDDF", logo: "https://scores.iplt20.com/ipl/teamlogos/PBKS.png" },
  LSG:  { name: "Lucknow Super Giants",          color: "#A72B2A", accent: "#FBCA05", logo: "https://scores.iplt20.com/ipl/teamlogos/LSG.png" },
  GT:   { name: "Gujarat Titans",                color: "#1D4E8F", accent: "#A0C0F0", logo: "https://scores.iplt20.com/ipl/teamlogos/GT.png" },
};

// IPL 2026 season ID - we search for it dynamically
const IPL_SEARCH_TERM = "Indian Premier League";

// ─── Styles ────────────────────────────────────────────────────────
const THEME_PACKS = {
  default: {
    name: "Default Theme",
    appBg: "#060D1A",
    text: "#E2E8F8",
    headerBg: "linear-gradient(135deg, #0A1628 0%, #0F2040 50%, #0A1628 100%)",
    tabBarBg: "#080F1E",
    cardBg: "#0D1828",
    border: "#1A3050",
    accent: "#FF6B2B",
    muted: "#4A6080",
    watermark: { right: -14, top: -18, size: 128, opacity: 0.12 },
  },
  csk: { name: "CSK Theme", appBg: "#120F03", text: "#FFFBEA", headerBg: "linear-gradient(135deg, #FFE04D 0%, #F9CD05 48%, #D4A017 100%)", tabBarBg: "#2B2408", cardBg: "#33290A", border: "#7A6110", accent: "#FFD700", muted: "#E8CF73", watermark: { right: -8, top: -20, size: 132, opacity: 0.16 } },
  mi: { name: "MI Theme", appBg: "#071326", text: "#E8F4FF", headerBg: "linear-gradient(135deg, #002B5B 0%, #005DA0 55%, #0A1D38 100%)", tabBarBg: "#081A31", cardBg: "#0C203C", border: "#20446B", accent: "#4FC3F7", muted: "#7E9CC0", watermark: { right: -16, top: -22, size: 134, opacity: 0.14 } },
  rcb: { name: "RCB Theme", appBg: "#120A10", text: "#FCEEF2", headerBg: "linear-gradient(135deg, #3A0A16 0%, #C8102E 55%, #1B0F14 100%)", tabBarBg: "#180E15", cardBg: "#22111A", border: "#4A2030", accent: "#FFD700", muted: "#A88391", watermark: { right: -10, top: -20, size: 128, opacity: 0.15 } },
  kkr: { name: "KKR Theme", appBg: "#0E0A1A", text: "#F1EAFF", headerBg: "linear-gradient(135deg, #2A1448 0%, #3A225D 55%, #120B22 100%)", tabBarBg: "#151028", cardBg: "#1A1330", border: "#3A2A58", accent: "#F4C430", muted: "#9889B8", watermark: { right: -12, top: -18, size: 126, opacity: 0.14 } },
  dc: { name: "DC Theme", appBg: "#081224", text: "#EAF4FF", headerBg: "linear-gradient(135deg, #002D62 0%, #004C93 55%, #0A1A34 100%)", tabBarBg: "#0A1730", cardBg: "#0E1D3A", border: "#26456D", accent: "#EF1C25", muted: "#7F9BC0", watermark: { right: -18, top: -20, size: 136, opacity: 0.13 } },
  srh: { name: "SRH Theme", appBg: "#150E0A", text: "#FFF1E7", headerBg: "linear-gradient(135deg, #4A1800 0%, #FF6600 55%, #1E130F 100%)", tabBarBg: "#1A120D", cardBg: "#24170F", border: "#523322", accent: "#FF9A3C", muted: "#B28E77", watermark: { right: -10, top: -18, size: 130, opacity: 0.15 } },
  rr: { name: "RR Theme", appBg: "#120913", text: "#FFEFFC", headerBg: "linear-gradient(135deg, #5C0D46 0%, #E8116E 55%, #2B1030 100%)", tabBarBg: "#1A0F20", cardBg: "#24122D", border: "#5A2B70", accent: "#69A7FF", muted: "#B28CC6", watermark: { right: -14, top: -20, size: 128, opacity: 0.14 } },
  pbks: { name: "PBKS Theme", appBg: "#130A12", text: "#FFF0F3", headerBg: "linear-gradient(135deg, #5A091D 0%, #C8122A 55%, #220E16 100%)", tabBarBg: "#190E16", cardBg: "#24121B", border: "#5A2937", accent: "#F3F4F6", muted: "#AD8D98", watermark: { right: -16, top: -18, size: 130, opacity: 0.14 } },
  lsg: { name: "LSG Theme", appBg: "#130C0A", text: "#FFF2EB", headerBg: "linear-gradient(135deg, #4A1A14 0%, #A72B2A 55%, #231411 100%)", tabBarBg: "#1A110F", cardBg: "#241713", border: "#5C3B32", accent: "#FBCA05", muted: "#B69A88", watermark: { right: -14, top: -16, size: 126, opacity: 0.14 } },
  gt: { name: "GT Theme", appBg: "#091225", text: "#EDF4FF", headerBg: "linear-gradient(135deg, #132B4E 0%, #1D4E8F 55%, #0D1E38 100%)", tabBarBg: "#0C1730", cardBg: "#11203C", border: "#2D4F78", accent: "#A0C0F0", muted: "#86A2C7", watermark: { right: -15, top: -20, size: 134, opacity: 0.13 } },
};

const S = {
  app: {
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    background: "var(--bg-app)",
    minHeight: "100vh",
    color: "var(--text-main)",
  },
  header: {
    background: "var(--bg-header)",
    borderBottom: "1px solid var(--border-main)",
    padding: "12px 18px 6px",
  },
  tabBar: {
    background: "var(--bg-tabbar)",
    borderBottom: "1px solid var(--border-main)",
    display: "flex",
    padding: "0 18px",
  },
  tab: (active) => ({
    flex: 1,
    padding: "11px 4px",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--accent-main)" : "2px solid transparent",
    color: active ? "var(--accent-main)" : "var(--text-muted)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 0.3,
    transition: "all .18s",
  }),
  card: (border = "#1A3050") => ({
    background: "var(--bg-card)",
    border: `1px solid ${border}`,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  }),
  btn: (bg = "#FF6B2B", color = "#fff") => ({
    background: bg,
    color,
    border: "none",
    borderRadius: 10,
    padding: "9px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "opacity .15s, transform .09s ease, box-shadow .12s ease",
    willChange: "transform",
  }),
  pill: (active, accentColor) => ({
    flex: 1,
    padding: "9px 6px",
    borderRadius: 10,
    border: `2px solid ${active ? accentColor : "var(--border-main)"}`,
    background: active ? accentColor + "22" : "var(--bg-app)",
    color: active ? accentColor : "var(--text-muted)",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "all .18s, transform .09s ease, box-shadow .12s ease",
    willChange: "transform",
  }),
};

// ─── Helpers ───────────────────────────────────────────────────────
function teamShort(name = "") {
  const map = {
    "mumbai indians": "MI", "chennai super kings": "CSK",
    "royal challengers bengaluru": "RCB", "royal challengers bangalore": "RCB",
    "kolkata knight riders": "KKR", "delhi capitals": "DC",
    "sunrisers hyderabad": "SRH", "rajasthan royals": "RR",
    "punjab kings": "PBKS", "lucknow super giants": "LSG",
    "gujarat titans": "GT",
  };
  return map[name.toLowerCase()] || null;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      day: "numeric", month: "short",
    });
  } catch { return dateStr; }
}

function fmtTime(dateStr) {
  if (!dateStr) return "";
  try {
    // Use device's local timezone — Mitthu/Megs in Americas see their local time
    return new Date(dateStr).toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
  } catch { return ""; }
}

// Shows match time in local TZ with IST reference
function fmtMatchTime(rawDate) {
  if (!rawDate) return "";
  try {
    const d = new Date(rawDate);
    const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const isIndia = localTZ.includes("Kolkata") || localTZ.includes("India");

    // IST time always computed
    const ist = d.toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
    });

    // India users — always just show IST, no GMT offset
    if (isIndia) return `${ist} IST`;

    // Outside India — get local time (no TZ name, avoids GMT+X mess)
    const localTime = d.toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit",
    });

    // Get a clean TZ abbreviation (EDT, PDT etc) by parsing from a
    // date string rather than using timeZoneName which gives GMT+X on Android
    const tzStr = d.toLocaleString("en-US", { timeZoneName: "short" });
    const tzMatch = tzStr.match(/([A-Z]{2,5})\s*$/);
    const tzCode = tzMatch ? tzMatch[1] : "";

    return tzCode
      ? `${localTime} ${tzCode} · ${ist} IST`
      : `${localTime} · ${ist} IST`;
  } catch { return ""; }
}

function fmtMatchDate(rawDate) {
  if (!rawDate) return "";
  try {
    return new Date(rawDate).toLocaleDateString(undefined, {
      day: "numeric", month: "short",
    });
  } catch { return ""; }
}

// ─── Wikipedia IPL table → NRR (browser-safe; not Google-scraped) ───
function normalizeWikiTeamTitle(name) {
  return String(name || "").trim().toLowerCase();
}

function buildWikiTeamTitleLookup() {
  const lookup = {};
  for (const [code, meta] of Object.entries(IPL_TEAMS)) {
    lookup[normalizeWikiTeamTitle(meta.name)] = code;
  }
  lookup[normalizeWikiTeamTitle("Royal Challengers Bangalore")] = "RCB";
  lookup[normalizeWikiTeamTitle("Delhi Daredevils")] = "DC";
  return lookup;
}

function formatNrrSigned(raw) {
  // Wikipedia uses Unicode minus (U+2212); parseFloat would return NaN.
  const n = parseFloat(
    String(raw)
      .replace(/\u2212/g, "-")
      .replace(/\u2013/g, "-")
      .replace(/^\+/, "")
      .trim()
  );
  if (Number.isNaN(n)) return null;
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(3);
}

function wikiHeaderNrrIndex(headerRow) {
  if (!headerRow) return -1;
  const ths = [...headerRow.querySelectorAll("th")];
  const labels = ths.map(th => {
    const t = th.textContent.replace(/\s+/g, " ").trim().toLowerCase();
    const href = th.querySelector("a")?.getAttribute("href") || "";
    return { t, href };
  });
  return labels.findIndex(({ t, href }) =>
    t === "nrr" ||
    t.includes("nrr") ||
    t.includes("net run rate") ||
    href.includes("Net_run_rate")
  );
}

function parseNrrMapFromWikipediaPointsHtml(html) {
  const titleToCode = buildWikiTeamTitleLookup();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = [...doc.querySelectorAll("table.wikitable, table[class*='wikitable']")];

  for (const table of tables) {
    let headerRow = null;
    let nrrIdx = -1;
    for (const tr of table.querySelectorAll("tr")) {
      const idx = wikiHeaderNrrIndex(tr);
      if (idx !== -1) {
        headerRow = tr;
        nrrIdx = idx;
        break;
      }
    }
    if (!headerRow || nrrIdx === -1) continue;

    const out = {};
    const rows = [...table.querySelectorAll("tbody tr")];
    for (const row of rows) {
      const teamTh = row.querySelector('th[scope="row"]');
      if (!teamTh) continue;
      const link = teamTh.querySelector("a");
      const wikiTitle = (link?.getAttribute("title") || link?.textContent || teamTh.textContent || "").trim();
      if (!wikiTitle || /^pos\.?$/i.test(wikiTitle)) continue;

      const cells = [...row.children];
      const nrrCell = cells[nrrIdx];
      if (!nrrCell) continue;
      const formatted = formatNrrSigned(nrrCell.textContent);
      if (!formatted) continue;

      const code = titleToCode[normalizeWikiTeamTitle(wikiTitle)];
      if (code) {
        out[code] = formatted;
        continue;
      }
      const fallbackCode = teamShort(wikiTitle);
      if (fallbackCode) out[fallbackCode] = formatted;
    }
    const n = Object.keys(out).length;
    if (n >= 8) return out;
  }
  return {};
}

async function fetchIplNrrMapFromWikipedia() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const errors = [];
  for (const year of years) {
    const pageTitle = `${year}_Indian_Premier_League`;
    const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&formatversion=2&format=json&origin=*`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        errors.push(`${year}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data.error) {
        errors.push(`${year}: ${data.error.info || "wiki error"}`);
        continue;
      }
      const rawText = data?.parse?.text;
      const html = typeof rawText === "string" ? rawText : (rawText && typeof rawText === "object" ? rawText["*"] : "") || "";
      if (!html) {
        errors.push(`${year}: empty response`);
        continue;
      }
      const nrrMap = parseNrrMapFromWikipediaPointsHtml(html);
      const n = Object.keys(nrrMap).length;
      if (n >= 8) return { year, nrrMap };
      errors.push(`${year}: parsed ${n} teams`);
    } catch (e) {
      errors.push(`${year}: ${e?.message || "network error"}`);
    }
  }
  const tail = errors.slice(-3).join(" · ");
  throw new Error(`Could not load NRR (${tail}). You can still type NRR manually.`);
}

// ─── ESPN IPL live scores (public site API; pairs fixtures by date + teams) ───
const ESPN_IPL_SITE_LEAGUE = "8048";

function sameUtcCalendarDay(isoA, isoB) {
  const d = x => String(x || "").slice(0, 10);
  const a = d(isoA);
  const b = d(isoB);
  return Boolean(a && a === b);
}

function espnEventTeamsMatchOurMatch(match, event) {
  const comps = event?.competitions?.[0]?.competitors;
  if (!comps || comps.length < 2) return false;
  const abbrevs = new Set(comps.map(c => c.team?.abbreviation).filter(Boolean));
  return abbrevs.has(match.home) && abbrevs.has(match.away);
}

function pickEspnEventForMatch(match, events, manualRow) {
  const rawId = manualRow?.espnEventId;
  if (rawId != null && String(rawId).trim() !== "") {
    const eid = String(rawId).trim();
    const found = events.find(e => String(e.id) === eid);
    if (found) return found;
  }
  const candidates = events.filter(
    e => sameUtcCalendarDay(match.rawDate, e.date) && espnEventTeamsMatchOurMatch(match, e)
  );
  return candidates[0] || null;
}

function espnMatchIsLiveOrFinished(event) {
  const comp = event?.competitions?.[0];
  const st = comp?.status || event?.status;
  const state = st?.type?.state;
  return state === "in" || state === "post";
}

function formatEspnEventScoreLine(event) {
  if (!event) return null;
  const comp = event.competitions?.[0];
  const st = comp?.status || event.status;
  const summary = st?.summary || event.status?.summary;
  const comps = comp?.competitors || [];
  const teamBits = comps
    .map(c => {
      const ab = c.team?.abbreviation;
      if (!ab) return null;
      const sc = c.score && String(c.score).trim();
      return sc ? `${ab} ${sc}` : null;
    })
    .filter(Boolean);
  const joined = teamBits.join(" · ");
  const state = st?.type?.state;
  if (joined && (state === "in" || teamBits.length >= 2))
    return joined + (summary && summary !== joined ? ` — ${summary}` : "");
  if (summary) return summary;
  return st?.shortDetail || st?.detail || event.status?.type?.shortDetail || null;
}

async function fetchEspnIplScoreboardJson() {
  const url = `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_SITE_LEAGUE}/scoreboard`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  return res.json();
}

async function fetchEspnMatchSummaryJson(eventId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_SITE_LEAGUE}/summary?event=${encodeURIComponent(eventId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  return res.json();
}

function fmtEspnCardDate(iso) {
  if (iso == null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    const wd = d.toLocaleDateString("en-US", { weekday: "short" });
    const day = d.getDate();
    const mo = d.toLocaleDateString("en-US", { month: "short" });
    const y = d.getFullYear();
    if (!Number.isFinite(day) || !Number.isFinite(y)) return "";
    return `${wd}, ${day} ${mo} '${String(y).slice(-2)}`;
  } catch {
    return "";
  }
}

function pickEspnMatchDateIso(hdr, comp) {
  return hdr?.date || comp?.date || comp?.startDate || null;
}

function buildEspnCompletedMetaLine(hdr, comp, fallbackFixtureIso) {
  const dateStr =
    fmtEspnCardDate(pickEspnMatchDateIso(hdr, comp)) ||
    fmtEspnCardDate(fallbackFixtureIso);
  const venueShort = (comp?.venue?.fullName || "").split(",")[0].trim();
  const desc = String(hdr?.description || "");
  let matchBit = desc.replace(/,?\s*Indian Premier League.*$/i, "").replace(/\s+at\s+.*/i, "").trim();
  matchBit = matchBit.replace(/,\s*$/, "").trim();
  const parts = [dateStr, "RESULT", matchBit || comp?.shortDescription, venueShort, "Indian Premier League"].filter(p => {
    const s = String(p || "").trim();
    if (!s) return false;
    if (/invalid date|^nan$|nan,/i.test(s)) return false;
    return true;
  });
  return parts.join(" · ");
}

function splitCricketScoreDisplay(scoreRaw) {
  const s = String(scoreRaw || "").trim();
  const i = s.indexOf("(");
  if (i === -1) return { main: s, extra: "" };
  let extra = s.slice(i).trim();
  extra = extra.replace(/\btarget\b/gi, "T");
  return { main: s.slice(0, i).trim(), extra };
}

function parseEspnSummaryToCompletedDetail(summaryJson, fixtureMatch) {
  const hdr = summaryJson?.header;
  const comp = hdr?.competitions?.[0];
  if (!hdr || !comp) return null;
  const state = comp.status?.type?.state;
  if (state !== "post") return null;
  const metaLine = buildEspnCompletedMetaLine(hdr, comp, fixtureMatch?.rawDate);
  const resultLine = comp.status?.summary || "";
  const rows = (comp.competitors || []).map(c => {
    const abbr = c.team?.abbreviation || "";
    const name = c.team?.displayName || c.team?.name || abbr;
    const win = c.winner === true || c.winner === "true";
    const { main, extra } = splitCricketScoreDisplay(c.score);
    return { abbr, name, main, extra, winner: win };
  });
  if (!rows.length) return null;
  const safeMeta =
    metaLine && !/invalid date|\bnan\b/i.test(metaLine) ? metaLine : "";
  const topBatters = [];
  const topBowlers = [];
  const teamLeaders = summaryJson?.leaders || [];
  for (const teamBlock of teamLeaders) {
    const teamAbbr = teamBlock?.team?.abbreviation || "";
    const lines = teamBlock?.linescores || [];
    for (const ls of lines) {
      const cats = ls?.leaders || [];
      for (const cat of cats) {
        const key = String(cat?.name || "").toLowerCase();
        const first = cat?.leaders?.[0];
        if (!first) continue;
        const entry = {
          team: teamAbbr,
          name: first?.athlete?.displayName || first?.athlete?.shortName || "—",
          value: first?.displayValue || first?.value || "",
          label: cat?.displayName || cat?.name || "",
        };
        if ((key.includes("run") || key.includes("score")) && !topBatters.some(x => x.name === entry.name && x.team === entry.team)) {
          topBatters.push(entry);
        }
        if ((key.includes("wicket") || key.includes("economy")) && !topBowlers.some(x => x.name === entry.name && x.team === entry.team)) {
          topBowlers.push(entry);
        }
      }
    }
  }
  return { metaLine: safeMeta, rows, resultLine, topBatters: topBatters.slice(0, 6), topBowlers: topBowlers.slice(0, 6) };
}

// ─── IST calendar week (Mon–Sun) for weekly mini-league ───────────────
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function istMidnightUtcMs(year, monthIndex0, day) {
  return Date.UTC(year, monthIndex0, day, 0, 0, 0, 0) - IST_OFFSET_MS;
}

function getNowIstYmdParts(ref = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ref);
  return {
    y: +p.find(x => x.type === "year").value,
    m: +p.find(x => x.type === "month").value,
    d: +p.find(x => x.type === "day").value,
  };
}

function istCalendarAddDays(y, m, d, delta) {
  const refUtc = istMidnightUtcMs(y, m - 1, d) + 12 * 3600000;
  return getNowIstYmdParts(new Date(refUtc + delta * 86400000));
}

function istMondaySundayBoundsUtc(now = new Date()) {
  const wdStr = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(now);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = map[wdStr] ?? 1;
  const fromMon = (dow + 6) % 7;
  const { y, m, d } = getNowIstYmdParts(now);
  const mon = istCalendarAddDays(y, m, d, -fromMon);
  const sun = istCalendarAddDays(mon.y, mon.m, mon.d, 6);
  const startMs = istMidnightUtcMs(mon.y, mon.m - 1, mon.d);
  const endMs = istMidnightUtcMs(sun.y, sun.m - 1, sun.d) + 86400000 - 1;
  const label = `Mon ${mon.d} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mon.m - 1]} – Sun ${sun.d} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][sun.m - 1]} · IST`;
  return { startMs, endMs, label };
}

// ─── Team Badge ────────────────────────────────────────────────────
function LottieEmojiTile({ emoji, size=36, active, accentColor, onClick }) {
  const lUrl = getLottieUrl(emoji);
  const [animData, setAnimData] = useState(null);
  useEffect(() => {
    if (!lUrl) return;
    let cancelled = false;
    fetch(lUrl).then(r=>r.ok?r.json():null).then(d=>{ if(!cancelled&&d) setAnimData(d); }).catch(()=>{});
    return () => { cancelled = true; };
  }, [lUrl]);
  return (
    <button type="button" onClick={onClick}
      style={{ aspectRatio:"1", borderRadius:8, border:`2px solid ${active ? accentColor : "#1A3050"}`, background:active ? accentColor+"22" : "#0A1420", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:2 }}>
      {animData ? <Lottie animationData={animData} loop autoplay style={{ width:size, height:size }} /> : <span style={{ fontSize:Math.round(size*0.75) }}>{emoji}</span>}
    </button>
  );
}

function TeamBadge({ short, size = 40 }) {
  const t = IPL_TEAMS[short];
  const [imgError, setImgError] = useState(false);
  if (t?.logo && !imgError) {
    return (
      <div style={{ width:size, height:size, borderRadius:"50%", background:t.color, border:`2px solid ${t.accent}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" }}>
        <img src={t.logo} alt={short} onError={()=>setImgError(true)} style={{ width:"85%", height:"85%", objectFit:"contain" }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: t?.color || "#1A3050",
      border: `2px solid ${t?.accent || "#2A4060"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.28, fontWeight: 800,
      color: t?.accent || "#fff", flexShrink: 0,
      letterSpacing: -0.5,
    }}>
      {short}
    </div>
  );
}

// ─── Notification ──────────────────────────────────────────────────
function Toast({ msg, type, reduceMotion }) {
  return (
    <div style={{
      position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999,
      background: type === "error" ? "#7F1D1D" : type === "info" ? "#1E3A5F" : "#14532D",
      color: "#fff", padding: "11px 22px", borderRadius: 14,
      fontSize: 13, fontWeight: 600,
      boxShadow: "0 6px 30px #000c", maxWidth: 340, textAlign: "center",
      animation: uxMotion(!reduceMotion, "bzToastIn .32s cubic-bezier(.22,1,.36,1) both"),
    }}>
      {msg}
    </div>
  );
}

/** Circular frame with static emoji */
function PlayerAvatarBubble({ meta, size, border = 2, borderColor, bgLight = true, style }) {
  const bc = borderColor ?? meta?.color ?? "#2A4060";
  const emoji = meta?.emoji ?? "❓";
  const lottieUrl = getLottieUrl(emoji);
  const [animData, setAnimData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (!lottieUrl) return;
    setAnimData(null); setLoadFailed(false);
    let cancelled = false;
    fetch(lottieUrl).then(r => r.ok ? r.json() : Promise.reject()).then(d => { if (!cancelled) setAnimData(d); }).catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [lottieUrl]);
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", border:`${border}px solid ${bc}`, background:(bgLight ? meta?.light : "transparent")||"#1A3050", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, ...style }}>
      {animData && !loadFailed ? (
        <Lottie animationData={animData} loop autoplay style={{ width:Math.round(size*0.85), height:Math.round(size*0.85) }} />
      ) : (
        <span style={{ fontSize:Math.round(size*0.52), lineHeight:1 }}>{emoji}</span>
      )}
    </div>
  );
}

function PlayerAvatarMark({ meta, size = 18, style }) {
  return (
    <span style={{ fontSize: Math.round(size * 0.85), lineHeight: 1, display: "inline-flex", verticalAlign: "middle", ...style }}>
      {meta?.emoji ?? "❓"}
    </span>
  );
}

function getLeagueSchedule() {
  const m = (id, home, away, rawDate, date, time, venue, stage = "league", playoffRound = null) => ({
    id, home, away, rawDate, date, time, venue, status: "upcoming", apiWinner: null, stage,
    ...(playoffRound ? { playoffRound } : {}),
  });
  return [
    m("ipl26-1",  "RCB",  "SRH",  "2026-03-28T14:00:00Z", "28 Mar", "7:30 PM", "M. Chinnaswamy Stadium, Bengaluru"),
    m("ipl26-2",  "MI",   "KKR",  "2026-03-29T14:00:00Z", "29 Mar", "7:30 PM", "Wankhede Stadium, Mumbai"),
    m("ipl26-3",  "RR",   "CSK",  "2026-03-30T14:00:00Z", "30 Mar", "7:30 PM", "ACA Stadium, Guwahati"),
    m("ipl26-4",  "PBKS", "GT",   "2026-03-31T14:00:00Z", "31 Mar", "7:30 PM", "Mullanpur, New Chandigarh"),
    m("ipl26-5",  "LSG",  "DC",   "2026-04-01T14:00:00Z", "01 Apr", "7:30 PM", "BRSABV Ekana Stadium, Lucknow"),
    m("ipl26-6",  "KKR",  "SRH",  "2026-04-02T14:00:00Z", "02 Apr", "7:30 PM", "Eden Gardens, Kolkata"),
    m("ipl26-7",  "CSK",  "PBKS", "2026-04-03T14:00:00Z", "03 Apr", "7:30 PM", "MA Chidambaram Stadium, Chennai"),
    m("ipl26-8",  "DC",   "MI",   "2026-04-04T10:00:00Z", "04 Apr", "3:30 PM", "Arun Jaitley Stadium, Delhi"),
    m("ipl26-9",  "GT",   "RR",   "2026-04-04T14:00:00Z", "04 Apr", "7:30 PM", "Narendra Modi Stadium, Ahmedabad"),
    m("ipl26-10", "SRH",  "LSG",  "2026-04-05T10:00:00Z", "05 Apr", "3:30 PM", "Rajiv Gandhi Intl. Stadium, Hyderabad"),
    m("ipl26-11", "RCB",  "CSK",  "2026-04-05T14:00:00Z", "05 Apr", "7:30 PM", "M. Chinnaswamy Stadium, Bengaluru"),
    m("ipl26-12", "KKR",  "PBKS", "2026-04-06T14:00:00Z", "06 Apr", "7:30 PM", "Eden Gardens, Kolkata"),
    m("ipl26-13", "RR",   "MI",   "2026-04-07T14:00:00Z", "07 Apr", "7:30 PM", "ACA Stadium, Guwahati"),
    m("ipl26-14", "DC",   "GT",   "2026-04-08T14:00:00Z", "08 Apr", "7:30 PM", "Arun Jaitley Stadium, Delhi"),
    m("ipl26-15", "KKR",  "LSG",  "2026-04-09T14:00:00Z", "09 Apr", "7:30 PM", "Eden Gardens, Kolkata"),
    m("ipl26-16", "RR",   "RCB",  "2026-04-10T14:00:00Z", "10 Apr", "7:30 PM", "ACA Stadium, Guwahati"),
    m("ipl26-17", "PBKS", "SRH",  "2026-04-11T10:00:00Z", "11 Apr", "3:30 PM", "Mullanpur, New Chandigarh"),
    m("ipl26-18", "CSK",  "DC",   "2026-04-11T14:00:00Z", "11 Apr", "7:30 PM", "MA Chidambaram Stadium, Chennai"),
    m("ipl26-19", "LSG",  "GT",   "2026-04-12T10:00:00Z", "12 Apr", "3:30 PM", "BRSABV Ekana Stadium, Lucknow"),
    m("ipl26-20", "MI",   "RCB",  "2026-04-12T14:00:00Z", "12 Apr", "7:30 PM", "Wankhede Stadium, Mumbai"),
    m("ipl26-21", "SRH",  "RR",   "2026-04-13T14:00:00Z", "13 Apr", "7:30 PM", "Rajiv Gandhi Intl. Stadium, Hyderabad"),
    m("ipl26-22", "CSK",  "KKR",  "2026-04-14T14:00:00Z", "14 Apr", "7:30 PM", "MA Chidambaram Stadium, Chennai"),
    m("ipl26-23", "RCB",  "LSG",  "2026-04-15T14:00:00Z", "15 Apr", "7:30 PM", "M. Chinnaswamy Stadium, Bengaluru"),
    m("ipl26-24", "MI",   "PBKS", "2026-04-16T14:00:00Z", "16 Apr", "7:30 PM", "Wankhede Stadium, Mumbai"),
    m("ipl26-25", "GT",   "KKR",  "2026-04-17T14:00:00Z", "17 Apr", "7:30 PM", "Narendra Modi Stadium, Ahmedabad"),
    m("ipl26-26", "RCB",  "DC",   "2026-04-18T10:00:00Z", "18 Apr", "3:30 PM", "M. Chinnaswamy Stadium, Bengaluru"),
    m("ipl26-27", "SRH",  "CSK",  "2026-04-18T14:00:00Z", "18 Apr", "7:30 PM", "Rajiv Gandhi Intl. Stadium, Hyderabad"),
    m("ipl26-28", "KKR",  "RR",   "2026-04-19T10:00:00Z", "19 Apr", "3:30 PM", "Eden Gardens, Kolkata"),
    m("ipl26-29", "PBKS", "LSG",  "2026-04-19T14:00:00Z", "19 Apr", "7:30 PM", "Mullanpur, New Chandigarh"),
    m("ipl26-30", "GT",   "MI",   "2026-04-20T14:00:00Z", "20 Apr", "7:30 PM", "Narendra Modi Stadium, Ahmedabad"),
    m("ipl26-31", "SRH",  "DC",   "2026-04-21T14:00:00Z", "21 Apr", "7:30 PM", "Rajiv Gandhi Intl. Stadium, Hyderabad"),
    m("ipl26-32", "LSG",  "RR",   "2026-04-22T14:00:00Z", "22 Apr", "7:30 PM", "BRSABV Ekana Stadium, Lucknow"),
    m("ipl26-33", "MI",   "CSK",  "2026-04-23T14:00:00Z", "23 Apr", "7:30 PM", "Wankhede Stadium, Mumbai"),
    m("ipl26-34", "RCB",  "GT",   "2026-04-24T14:00:00Z", "24 Apr", "7:30 PM", "M. Chinnaswamy Stadium, Bengaluru"),
    m("ipl26-35", "DC",   "PBKS", "2026-04-25T10:00:00Z", "25 Apr", "3:30 PM", "Arun Jaitley Stadium, Delhi"),
    m("ipl26-36", "RR",   "SRH",  "2026-04-25T14:00:00Z", "25 Apr", "7:30 PM", "Sawai Mansingh Stadium, Jaipur"),
    m("ipl26-37", "GT",   "CSK",  "2026-04-26T10:00:00Z", "26 Apr", "3:30 PM", "Narendra Modi Stadium, Ahmedabad"),
    m("ipl26-38", "LSG",  "KKR",  "2026-04-26T14:00:00Z", "26 Apr", "7:30 PM", "BRSABV Ekana Stadium, Lucknow"),
    m("ipl26-39", "DC",   "RCB",  "2026-04-27T14:00:00Z", "27 Apr", "7:30 PM", "Arun Jaitley Stadium, Delhi"),
    m("ipl26-40", "PBKS", "RR",   "2026-04-28T14:00:00Z", "28 Apr", "7:30 PM", "Mullanpur, New Chandigarh"),
    m("ipl26-41", "MI",   "SRH",  "2026-04-29T14:00:00Z", "29 Apr", "7:30 PM", "Wankhede Stadium, Mumbai"),
    m("ipl26-42", "GT",   "RCB",  "2026-04-30T14:00:00Z", "30 Apr", "7:30 PM", "Narendra Modi Stadium, Ahmedabad"),
    m("ipl26-43", "RR",   "DC",   "2026-05-01T14:00:00Z", "01 May", "7:30 PM", "Sawai Mansingh Stadium, Jaipur"),
    m("ipl26-44", "CSK",  "MI",   "2026-05-02T14:00:00Z", "02 May", "7:30 PM", "MA Chidambaram Stadium, Chennai"),
    m("ipl26-45", "SRH",  "KKR",  "2026-05-03T10:00:00Z", "03 May", "3:30 PM", "Rajiv Gandhi Intl. Stadium, Hyderabad"),
    m("ipl26-46", "GT",   "PBKS", "2026-05-03T14:00:00Z", "03 May", "7:30 PM", "Narendra Modi Stadium, Ahmedabad"),
    m("ipl26-47", "MI",   "LSG",  "2026-05-04T14:00:00Z", "04 May", "7:30 PM", "Wankhede Stadium, Mumbai"),
    m("ipl26-48", "DC",   "CSK",  "2026-05-05T14:00:00Z", "05 May", "7:30 PM", "Arun Jaitley Stadium, Delhi"),
    m("ipl26-49", "SRH",  "PBKS", "2026-05-06T14:00:00Z", "06 May", "7:30 PM", "Rajiv Gandhi Intl. Stadium, Hyderabad"),
    m("ipl26-50", "LSG",  "RCB",  "2026-05-07T14:00:00Z", "07 May", "7:30 PM", "BRSABV Ekana Stadium, Lucknow"),
    m("ipl26-51", "DC",   "KKR",  "2026-05-08T14:00:00Z", "08 May", "7:30 PM", "Arun Jaitley Stadium, Delhi"),
    m("ipl26-52", "RR",   "GT",   "2026-05-09T14:00:00Z", "09 May", "7:30 PM", "Sawai Mansingh Stadium, Jaipur"),
    m("ipl26-53", "CSK",  "LSG",  "2026-05-10T10:00:00Z", "10 May", "3:30 PM", "MA Chidambaram Stadium, Chennai"),
    m("ipl26-54", "RCB",  "MI",   "2026-05-10T14:00:00Z", "10 May", "7:30 PM", "Shaheed Veer Narayan Singh Stadium, Raipur"),
    m("ipl26-55", "PBKS", "DC",   "2026-05-11T14:00:00Z", "11 May", "7:30 PM", "HPCA Stadium, Dharamshala"),
    m("ipl26-56", "GT",   "SRH",  "2026-05-12T14:00:00Z", "12 May", "7:30 PM", "Narendra Modi Stadium, Ahmedabad"),
    m("ipl26-57", "RCB",  "KKR",  "2026-05-13T14:00:00Z", "13 May", "7:30 PM", "Shaheed Veer Narayan Singh Stadium, Raipur"),
    m("ipl26-58", "PBKS", "MI",   "2026-05-14T14:00:00Z", "14 May", "7:30 PM", "HPCA Stadium, Dharamshala"),
    m("ipl26-59", "LSG",  "CSK",  "2026-05-15T14:00:00Z", "15 May", "7:30 PM", "BRSABV Ekana Stadium, Lucknow"),
    m("ipl26-60", "KKR",  "GT",   "2026-05-16T14:00:00Z", "16 May", "7:30 PM", "Eden Gardens, Kolkata"),
    m("ipl26-61", "PBKS", "RCB",  "2026-05-17T10:00:00Z", "17 May", "3:30 PM", "HPCA Stadium, Dharamshala"),
    m("ipl26-62", "DC",   "RR",   "2026-05-17T14:00:00Z", "17 May", "7:30 PM", "Arun Jaitley Stadium, Delhi"),
    m("ipl26-63", "CSK",  "SRH",  "2026-05-18T14:00:00Z", "18 May", "7:30 PM", "MA Chidambaram Stadium, Chennai"),
    m("ipl26-64", "RR",   "LSG",  "2026-05-19T14:00:00Z", "19 May", "7:30 PM", "Sawai Mansingh Stadium, Jaipur"),
    m("ipl26-65", "KKR",  "MI",   "2026-05-20T14:00:00Z", "20 May", "7:30 PM", "Eden Gardens, Kolkata"),
    m("ipl26-66", "CSK",  "GT",   "2026-05-21T14:00:00Z", "21 May", "7:30 PM", "MA Chidambaram Stadium, Chennai"),
    m("ipl26-67", "SRH",  "RCB",  "2026-05-22T14:00:00Z", "22 May", "7:30 PM", "Rajiv Gandhi Intl. Stadium, Hyderabad"),
    m("ipl26-68", "LSG",  "PBKS", "2026-05-23T14:00:00Z", "23 May", "7:30 PM", "BRSABV Ekana Stadium, Lucknow"),
    m("ipl26-69", "MI",   "RR",   "2026-05-24T10:00:00Z", "24 May", "3:30 PM", "Wankhede Stadium, Mumbai"),
    m("ipl26-70", "KKR",  "DC",   "2026-05-24T14:00:00Z", "24 May", "7:30 PM", "Eden Gardens, Kolkata"),
  ];
}


function getPlaceholderMatches() { return getLeagueSchedule(); }

// ─── Main App ──────────────────────────────────────────────────────
export default function App() {
  const reduceMotion = usePrefersReducedMotion();
  const uxMotionOn = !reduceMotion;

  const [themeId, setThemeId] = useState(() => {
    try { return localStorage.getItem("betzone_theme") || "default"; } catch { return "default"; }
  });
  const [tab, setTab] = useState("leaderboard");
  const [selectedPlayer, setSelectedPlayer] = useState(PLAYERS[0]);
  const [revealedPicks, setRevealedPicks] = useState({}); // tracks which match picks are revealed
  const [spyLog, setSpyLog] = useState([]); // local session log of peek events
  const [expandedMatch, setExpandedMatch] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState("RCB");
  const [standingsFetchStatus, setStandingsFetchStatus] = useState("idle"); // idle | loading | success | error
  const [fetchSource, setFetchSource] = useState(""); // which source succeeded
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSender, setChatSender] = useState(null); // auto-detected from device
  const [devicePlayer, setDevicePlayer] = useState(null); // strict player identity inferred from device
  const [replyTo, setReplyTo] = useState(null); // { id, sender, text } of message being replied to
  const [reactionPicker, setReactionPicker] = useState(null); // msgId showing emoji picker
  const [longPressMsg, setLongPressMsg] = useState(null); // msgId showing context menu
  const longPressTimer = useRef(null);
  const chatScrollRef = useRef(null);
  const prevChatTailRef = useRef({ len: 0, lastId: null });
  const chatPulseTimersRef = useRef({});
  const [chatPulseById, setChatPulseById] = useState({});
  const chatScrollSaveTimer = useRef(null);
  const prevTabRef = useRef(tab);
  const pendingChatScrollRestore = useRef(false);
  const [lastSeenChat, setLastSeenChat] = useState(() => {
    // Persist last seen timestamp in localStorage per device
    try { return parseInt(localStorage.getItem("betzone_lastSeenChat") || "0"); } catch { return 0; }
  });
  const [matchConfirm, setMatchConfirm] = useState(null); // matchId pending confirmation before opening
  const [customAvatars, setCustomAvatars] = useState({}); // avatar overrides from Firebase
  const [avatarPicker, setAvatarPicker] = useState(null); // player name whose avatar is being edited
  const [toast, setToast] = useState(null);
  const [scorecardModalMatchId, setScorecardModalMatchId] = useState(null);
  const [rankFlash, setRankFlash] = useState({});
  const prevRanksRef = useRef(null);
  const [confettiPieces, setConfettiPieces] = useState([]);
  const confettiTimerRef = useRef(null);
  const espnPollSnapRef = useRef({ matches: [], manualResults: {} });
  const [liveEspnByMatch, setLiveEspnByMatch] = useState({}); // matchId → { text, at }
  const [completedEspnByMatch, setCompletedEspnByMatch] = useState({}); // matchId → { metaLine, rows, resultLine }

  // Firebase state
  const [bets, setBets] = useState({});
  const [tossGuesses, setTossGuesses] = useState({});
  const [manualResults, setManualResults] = useState({});
  const [playoffAdmin, setPlayoffAdmin] = useState({}); // per playoff match: overrides + confirmed (betting gate)

  // IPL points table (Firebase) — used to seed Qualifier 1 / Eliminator when the league is complete
  const [iplTable, setIplTable] = useState([
    { team:"RCB",  played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"MI",   played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"CSK",  played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"KKR",  played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"SRH",  played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"DC",   played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"RR",   played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"PBKS", played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"LSG",  played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
    { team:"GT",   played:0, won:0, lost:0, nr:0, nrr:"+0.000", pts:0 },
  ]);

  // League 70 + auto play-offs (top 4 from iplTable after all league games are resulted)
  const matches = useMemo(() => {
    const league = getLeagueSchedule();
    const leagueDone = league.filter(m => {
      const k = fbKeyStatic(m.id);
      const st = manualResults[k]?.status || m.status;
      return st === "completed" || st === "abandoned";
    }).length;
    const playoffs = mergePlayoffAdminRows(
      buildIplPlayoffFixtures(iplTable, manualResults, leagueDone),
      playoffAdmin
    );
    return [...league, ...playoffs];
  }, [iplTable, manualResults, playoffAdmin]);

  // Cricket API state
  const [loading, setLoading] = useState(true);
  const [contentBootAnim, setContentBootAnim] = useState(false);
  const [apiError, setApiError] = useState(null); // kept for compatibility
  const [lastFetched, setLastFetched] = useState(null); // kept for compatibility

  useEffect(() => {
    if (loading) {
      setContentBootAnim(false);
      return;
    }
    if (reduceMotion) return;
    setContentBootAnim(true);
    const tid = window.setTimeout(() => setContentBootAnim(false), 520);
    return () => window.clearTimeout(tid);
  }, [loading, reduceMotion]);

  // Admin
  const [adminMode, setAdminMode] = useState(false);
  const [adminTaps, setAdminTaps] = useState(0);
  const adminTimer = useRef(null);
  const [nrrFetchBusy, setNrrFetchBusy] = useState(false);
  const activeTheme = THEME_PACKS[themeId] || THEME_PACKS.default;
  const themeTeamCode = themeId === "default" ? null : themeId.toUpperCase();
  const themeTeam = themeTeamCode ? IPL_TEAMS[themeTeamCode] : null;
  const wm = activeTheme.watermark || { right: -14, top: -18, size: 128, opacity: 0.12 };

  // ── Firebase listeners ────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      onValue(ref(db, "bets"), snap => setBets(snap.val() || {})),
      onValue(ref(db, "avatars"), snap => setCustomAvatars(snap.val() || {})),
      onValue(ref(db, "tossGuesses"), snap => setTossGuesses(snap.val() || {})),
      onValue(ref(db, "manualResults"), snap => setManualResults(snap.val() || {})),
      onValue(ref(db, "playoffAdmin"), snap => setPlayoffAdmin(snap.val() || {})),
      onValue(ref(db, "iplTable"), snap => { if (snap.val()) setIplTable(snap.val()); }),
      onValue(ref(db, "chat"), snap => {
        const data = snap.val() || {};
        const msgs = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
        setChatMessages(msgs);
      }),
      onValue(ref(db, "spyLog"), snap => {
        const data = snap.val() || {};
        const entries = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        setSpyLog(entries);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // ── Loading gate (schedule merged with auto-playoffs when iplTable / manualResults update) ──
  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => () => clearTimeout(confettiTimerRef.current), []);

  // Computed PLAYER_META merging base + custom avatars from Firebase
  const PLAYER_META = Object.fromEntries(PLAYERS.map(p => {
    const custom = customAvatars[p];
    const base = BASE_PLAYER_META[p];
    if (custom) {
      const colorTheme = AVATAR_COLORS[custom.colorIdx ?? 0] || AVATAR_COLORS[0];
      return [p, {
        emoji: custom.emoji || base.emoji,
        color: colorTheme.color,
        light: colorTheme.light,
      }];
    }
    return [p, base];
  }));

  // Collapse expanded match and clear revealed picks when player or tab changes
  useEffect(() => {
    setExpandedMatch(null);
    setMatchConfirm(null);
    setRevealedPicks({});
    // Mark all messages as seen when chat tab is opened
    if (tab === "chat") {
      const now = Date.now();
      setLastSeenChat(now);
      try { localStorage.setItem("betzone_lastSeenChat", now.toString()); } catch {}
    }
  }, [selectedPlayer, tab]);

  // Brief highlight when a new chat message lands (Firebase tail changes)
  useEffect(() => {
    if (reduceMotion || chatMessages.length === 0) {
      prevChatTailRef.current = {
        len: chatMessages.length,
        lastId: chatMessages.length ? chatMessages[chatMessages.length - 1].id : null,
      };
      return;
    }
    const last = chatMessages[chatMessages.length - 1];
    const prev = prevChatTailRef.current;
    const isAppend = prev.len > 0 && last && last.id !== prev.lastId;
    prevChatTailRef.current = { len: chatMessages.length, lastId: last?.id ?? null };
    if (!isAppend || last?.id == null) return;
    setChatPulseById(p => ({ ...p, [last.id]: true }));
    clearTimeout(chatPulseTimersRef.current[last.id]);
    chatPulseTimersRef.current[last.id] = window.setTimeout(() => {
      setChatPulseById(p => {
        const n = { ...p };
        delete n[last.id];
        return n;
      });
      delete chatPulseTimersRef.current[last.id];
    }, 1100);
  }, [chatMessages, reduceMotion]);

  // Persist chat scroll position per device (localStorage); restore when opening Chat tab
  useLayoutEffect(() => {
    const entered = prevTabRef.current !== "chat" && tab === "chat";
    prevTabRef.current = tab;
    if (entered) pendingChatScrollRestore.current = true;
    if (!pendingChatScrollRestore.current || tab !== "chat" || !chatScrollRef.current || chatMessages.length === 0) return;
    pendingChatScrollRestore.current = false;
    const el = chatScrollRef.current;
    const apply = () => {
      let raw;
      try { raw = localStorage.getItem(CHAT_SCROLL_TOP_KEY); } catch { raw = null; }
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (raw == null || raw === "") {
        el.scrollTop = maxScroll;
        return;
      }
      const saved = parseInt(raw, 10);
      el.scrollTop = Number.isFinite(saved) ? Math.min(Math.max(0, saved), maxScroll) : maxScroll;
    };
    apply();
    requestAnimationFrame(apply);
  }, [tab, chatMessages]);

  useEffect(() => {
    if (tab !== "chat") return;
    return () => {
      const el = chatScrollRef.current;
      if (!el) return;
      try { localStorage.setItem(CHAT_SCROLL_TOP_KEY, String(el.scrollTop)); } catch {}
    };
  }, [tab]);

  function schedulePersistChatScroll() {
    if (tab !== "chat" || !chatScrollRef.current) return;
    clearTimeout(chatScrollSaveTimer.current);
    chatScrollSaveTimer.current = setTimeout(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      try { localStorage.setItem(CHAT_SCROLL_TOP_KEY, String(el.scrollTop)); } catch {}
    }, 200);
  }

  // Auto-detect chat sender from device profile on mount
  useEffect(() => {
    const info = getPlatformInfo();
    if (info.likelyUser) {
      setChatSender(info.likelyUser);
      setDevicePlayer(info.likelyUser);
    }
  }, []);

  // ── Auto-lock: check every 5 mins if any match is within 30 mins ──
  useEffect(() => {
    function checkAutoLock() {
      const now = Date.now();
      matches.forEach(match => {
        const matchTime = new Date(match.rawDate).getTime();
        const minsUntil = (matchTime - now) / 60000;
        const key = match.id.replace(/[^a-zA-Z0-9_]/g, "_");
        // Lock if within 30 mins and not already locked by admin
        if (minsUntil <= 60 && minsUntil > -60) {
          // Only auto-lock if no manual result exists yet
          const existing = manualResults[key];
          if (!existing || existing.status === "upcoming") {
            update(ref(db, `manualResults/${key}`), {
              status: "live",
              autoLocked: true,
              autoLockedAt: now,
            });
          }
        }
      });
    }
    // Run immediately and then every 5 minutes
    checkAutoLock();
    const interval = setInterval(checkAutoLock, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [manualResults, matches]);


  // ── Notifications ─────────────────────────────────────────────
  function notify(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    try { localStorage.setItem("betzone_theme", themeId); } catch {}
  }, [themeId]);

  function launchConfetti() {
    if (reduceMotion) return;
    clearTimeout(confettiTimerRef.current);
    const emojis = ["🎉", "✨", "🏏", "🎊", "🥳", "⭐"];
    const pieces = Array.from({ length: 42 }, (_, i) => ({
      id: `${Date.now()}_${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.45,
      duration: 1.8 + Math.random() * 1.1,
      drift: (Math.random() - 0.5) * 120,
      rotate: (Math.random() - 0.5) * 180,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      size: 16 + Math.random() * 12,
    }));
    setConfettiPieces(pieces);
    confettiTimerRef.current = setTimeout(() => setConfettiPieces([]), 3200);
  }

  // ── Bets ──────────────────────────────────────────────────────
  function fbKey(id) { return id.replace(/[^a-zA-Z0-9_]/g, "_"); }

  /** League-table / NRR context only — playoff knockouts use stage "playoff" */
  function isLeagueStageMatch(match) {
    return match?.stage !== "playoff";
  }

  function getEffectiveStatus(match) {
    const manual = manualResults[fbKey(match.id)];
    if (manual?.status) return manual.status;
    return match.status;
  }

  function getEffectiveWinner(match) {
    const manual = manualResults[fbKey(match.id)];
    return manual?.winner || null;
  }

  function getEffectiveTossWinner(match) {
    const manual = manualResults[fbKey(match.id)];
    return manual?.tossWinner || null;
  }

  async function placeBet(matchId, player, team) {
    const match = matches.find(m => m.id === matchId);
    if (!match || getEffectiveStatus(match) !== "upcoming") {
      return notify("Betting is closed for this match!", "error");
    }
    if (match.stage === "playoff" && !match.playoffBettingOpen) {
      return notify("🔒 This playoff is not confirmed in Admin yet — betting stays locked.", "error");
    }
    const key = `${matchId}__${player}`;
    await set(ref(db, `bets/${key}`), team);
    notify(`${PLAYER_META[player].emoji} ${player} bets on ${team}!`);
  }

  async function placeToss(matchId, player, team) {
    const match = matches.find(m => m.id === matchId);
    if (!match || getEffectiveStatus(match) !== "upcoming") {
      return notify("Betting is closed for this match!", "error");
    }
    if (match.stage === "playoff" && !match.playoffBettingOpen) {
      return notify("🔒 This playoff is not confirmed in Admin yet — betting stays locked.", "error");
    }
    const key = `${matchId}__${player}`;
    await set(ref(db, `tossGuesses/${key}`), team);
    notify(`${PLAYER_META[player].emoji} ${player} picks ${team} for the toss!`);
  }

  async function setManualResult(matchId, winner, tossWinner, status = "completed") {
    const key = fbKey(matchId);
    // update() patches ONLY the fields provided — never wipes autoLocked, tossWinner, etc.
    const patch = {};
    if (status)     patch.status     = status;
    if (winner)     patch.winner     = winner;
    if (tossWinner) patch.tossWinner = tossWinner;
    await update(ref(db, `manualResults/${key}`), patch);
    if (status === "live" && !winner) notify("🔒 Bets locked! Match is live.");
    else if (status === "completed" && winner) notify(`🏆 ${winner} set as winner! Points updated.`);
    else if (tossWinner) notify(`🪙 Toss winner set: ${tossWinner}!`);
    else notify("✅ Saved!");
  }

  // ── Points Calculation ────────────────────────────────────────
  function calcPoints() {
    const pts = Object.fromEntries(PLAYERS.map(p => [p, 0]));
    const breakdown = Object.fromEntries(PLAYERS.map(p => [p, []]));

    for (const match of matches) {
      const status = getEffectiveStatus(match);
      const isAbandoned = status === "abandoned";
      if (status !== "completed" && status !== "live" && !isAbandoned) continue;

      const winner = getEffectiveWinner(match);
      const tossWinner = getEffectiveTossWinner(match);
      const manual = manualResults[fbKey(match.id)];

      // Abandoned match logic:
      // Scenario 1 — wash before toss: everyone gets +1 flat
      // Scenario 2 — wash after toss: correct toss = +1 toss + +1 abandon = +2, wrong toss = +1 abandon only
      if (isAbandoned) {
        const tossHappened = manual?.abandonedWithToss === true;
        for (const player of PLAYERS) {
          const betKey = `${match.id}__${player}`;
          const myToss = tossGuesses[betKey];
          let gained = 0;
          const parts = [];

          if (tossHappened && tossWinner) {
            // Wash after toss — toss correct gets +1, everyone also gets +1 abandon
            if (myToss === tossWinner) {
              gained += 1; parts.push("+1 toss 🪙");
            }
            gained += 1; parts.push("+1 abandon 🌧️");
          } else {
            // Wash before toss — flat +1 for everyone
            gained = 1; parts.push("+1 abandon 🌧️");
          }

          pts[player] += gained;
          breakdown[player].push({
            matchId: match.id, home: match.home, away: match.away,
            winner: null, myBet: bets[`${match.id}__${player}`], myToss, gained, parts,
            abandoned: true,
          });
        }
        continue;
      }

      // Normal match — need at least toss winner or match winner
      if (!winner && !tossWinner) continue;

      for (const player of PLAYERS) {
        const betKey = `${match.id}__${player}`;
        const myBet = bets[betKey];
        const myToss = tossGuesses[betKey];
        let gained = 0;
        const parts = [];

        if (winner && myBet === winner) { gained += 2; parts.push("+2 winner ✅"); }
        if (tossWinner && myToss === tossWinner) { gained += 1; parts.push("+1 toss 🪙"); }

        pts[player] += gained;
        if (parts.length > 0 || myBet) {
          breakdown[player].push({
            matchId: match.id, home: match.home, away: match.away,
            winner, myBet, myToss, gained, parts,
          });
        }
      }
    }

    return { pts, breakdown };
  }

  const { pts, breakdown } = calcPoints();
  const ranked = [...PLAYERS].sort((a, b) => pts[b] - pts[a]);

  // Compute ranks respecting ties (e.g. two players on same pts = same rank)
  function getRank(player) {
    const playerPts = pts[player];
    // rank = number of players with strictly more points + 1
    return PLAYERS.filter(p => pts[p] > playerPts).length + 1;
  }

  function getRankLabel(rank) {
    if (rank === 1) return "👑";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  }

  function getRankCrown(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    return "🥉";
  }
  const rankByPlayer = Object.fromEntries(PLAYERS.map(p => [p, getRank(p)]));
  const rankSnapshot = PLAYERS.map(p => `${p}:${rankByPlayer[p]}:${pts[p]}`).join("|");

  useEffect(() => {
    const prev = prevRanksRef.current;
    if (prev) {
      const changed = {};
      PLAYERS.forEach(p => {
        if (prev[p] !== rankByPlayer[p]) changed[p] = true;
      });
      if (Object.keys(changed).length > 0) {
        setRankFlash(changed);
        setTimeout(() => setRankFlash({}), 1700);
      }
    }
    prevRanksRef.current = rankByPlayer;
  }, [rankSnapshot]);

  const upcomingMatches = matches.filter(m => getEffectiveStatus(m) === "upcoming");
  const liveMatches = matches.filter(m => getEffectiveStatus(m) === "live");
  espnPollSnapRef.current = { matches, manualResults };

  const liveEspnPollKey = useMemo(
    () =>
      matches
        .filter(m => getEffectiveStatus(m) === "live")
        .map(m => `${m.id}:${manualResults[fbKey(m.id)]?.espnEventId ?? ""}`)
        .sort()
        .join("|"),
    [matches, manualResults]
  );

  const completedEspnPollKey = useMemo(
    () =>
      matches
        .filter(m => getEffectiveStatus(m) === "completed" && getEffectiveWinner(m))
        .map(m => `${m.id}:${manualResults[fbKey(m.id)]?.espnEventId ?? ""}`)
        .sort()
        .join("|"),
    [matches, manualResults]
  );

  useEffect(() => {
    if (!liveEspnPollKey) {
      setLiveEspnByMatch({});
      return;
    }
    let cancelled = false;
    async function tick() {
      const { matches: ms, manualResults: mr } = espnPollSnapRef.current;
      const lm = ms.filter(m => {
        const manual = mr[fbKey(m.id)];
        return (manual?.status || m.status) === "live";
      });
      if (lm.length === 0) return;
      const lmIds = new Set(lm.map(x => x.id));
      try {
        const data = await fetchEspnIplScoreboardJson();
        if (cancelled) return;
        const events = data.events || [];
        const next = {};
        for (const m of lm) {
          const manualRow = mr[fbKey(m.id)];
          const ev = pickEspnEventForMatch(m, events, manualRow);
          if (ev && espnMatchIsLiveOrFinished(ev)) {
            const text = formatEspnEventScoreLine(ev);
            if (text) next[m.id] = { text, at: Date.now() };
          }
        }
        setLiveEspnByMatch(prev => {
          const out = {};
          for (const id of Object.keys(prev)) {
            if (lmIds.has(id)) out[id] = prev[id];
          }
          for (const [id, v] of Object.entries(next)) {
            out[id] = v;
          }
          return out;
        });
      } catch {
        if (cancelled) return;
        setLiveEspnByMatch(prev => {
          const out = {};
          for (const id of Object.keys(prev)) {
            if (lmIds.has(id)) out[id] = prev[id];
          }
          return out;
        });
      }
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [liveEspnPollKey]);

  useEffect(() => {
    if (!completedEspnPollKey) {
      setCompletedEspnByMatch({});
      return;
    }
    let cancelled = false;
    async function run() {
      const { matches: ms, manualResults: mr } = espnPollSnapRef.current;
      const done = ms.filter(m => {
        const st = mr[fbKey(m.id)]?.status || m.status;
        return st === "completed" && getEffectiveWinner(m);
      });
      if (done.length === 0) {
        if (!cancelled) setCompletedEspnByMatch({});
        return;
      }
      let events = [];
      try {
        const sb = await fetchEspnIplScoreboardJson();
        events = sb?.events || [];
      } catch {
        events = [];
      }
      const fetched = {};
      await Promise.all(
        done.map(async m => {
          const manualRow = mr[fbKey(m.id)];
          let eid = manualRow?.espnEventId && String(manualRow.espnEventId).trim();
          if (!eid) {
            const ev = pickEspnEventForMatch(m, events, manualRow);
            if (ev) eid = String(ev.id);
          }
          if (!eid) return;
          try {
            const summary = await fetchEspnMatchSummaryJson(eid);
            if (cancelled) return;
            const detail = parseEspnSummaryToCompletedDetail(summary, m);
            if (detail) fetched[m.id] = detail;
          } catch {
            /* fallback to local winner-only UI */
          }
        })
      );
      if (cancelled) return;
      setCompletedEspnByMatch(prev => {
        const next = {};
        for (const m of done) {
          const id = m.id;
          if (fetched[id]) next[id] = fetched[id];
          else if (prev[id]) next[id] = prev[id];
        }
        return next;
      });
    }
    run();
    const id = setInterval(run, 120000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [completedEspnPollKey]);

  const completedMatches = matches.filter(m => getEffectiveStatus(m) === "completed" || getEffectiveStatus(m) === "abandoned");
  const completedLeagueMatches = completedMatches.filter(isLeagueStageMatch);

  /** Last N league results for a franchise (newest→oldest, left→right): W / L / wash — playoffs excluded */
  function getIplTeamFormLastN(teamCode, n) {
    const involved = completedLeagueMatches.filter(m => m.home === teamCode || m.away === teamCode)
      .sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime())
      .slice(0, n);
    const cells = involved.map(match => {
      const status = getEffectiveStatus(match);
      if (status === "abandoned") return "wash";
      const w = getEffectiveWinner(match);
      if (!w) return "skip";
      return w === teamCode ? "W" : "L";
    });
    while (cells.length < n) cells.push("skip");
    return cells;
  }

  /** Last 5 league results (used outside IPL points table) */
  function getIplTeamFormLast5(teamCode) {
    return getIplTeamFormLastN(teamCode, 5);
  }

  /** Last 5 completed fixtures (newest→oldest, left→right): W/L on winner pick, wash, or skip if no pick */
  function getPlayerFormLast5(player) {
    const seq = [...completedMatches]
      .sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime())
      .slice(0, 5);
    return seq.map(match => {
      const status = getEffectiveStatus(match);
      if (status === "abandoned") return "wash";
      const w = getEffectiveWinner(match);
      const bet = bets[`${match.id}__${player}`];
      if (!bet || !w) return "skip";
      return bet === w ? "W" : "L";
    });
  }

  const nextFiveUpcoming = [...upcomingMatches]
    .sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime())
    .slice(0, 5);
  const reminderPlayer = devicePlayer || null;
  const missingUpcomingBets = nextFiveUpcoming
    .map(match => {
      const key = `${match.id}__${reminderPlayer}`;
      const hasWinnerPick = !!bets[key];
      const hasTossPick = !!tossGuesses[key];
      return {
        match,
        hasWinnerPick,
        hasTossPick,
        missingWinner: !hasWinnerPick,
        missingToss: !hasTossPick,
      };
    })
    .filter(x => x.missingWinner || x.missingToss);
  const shouldShowBetReminder = !!reminderPlayer && nextFiveUpcoming.length > 0 && missingUpcomingBets.length > 0;

  useEffect(() => {
    const done = matches
      .filter(m => getEffectiveStatus(m) === "completed")
      .sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
    if (done.length === 0) return;

    let seen = {};
    try { seen = JSON.parse(localStorage.getItem("betzone_seenPerfects") || "{}"); } catch {}

    const latestUnseenPerfect = done.find(match => {
      const winner = getEffectiveWinner(match);
      const tossWinner = getEffectiveTossWinner(match);
      if (!winner || !tossWinner) return false;
      const k = `${match.id}__${selectedPlayer}`;
      const perfect = bets[k] === winner && tossGuesses[k] === tossWinner;
      return perfect && !seen[`${selectedPlayer}__${match.id}`];
    });

    if (latestUnseenPerfect) {
      const key = `${selectedPlayer}__${latestUnseenPerfect.id}`;
      seen[key] = true;
      try { localStorage.setItem("betzone_seenPerfects", JSON.stringify(seen)); } catch {}
      launchConfetti();
      notify(`🎉 Perfect pick! ${selectedPlayer} nailed winner + toss.`, "success");
    }
  }, [selectedPlayer, matches, bets, tossGuesses, manualResults]);

  async function sendBetReminderToChat() {
    if (!reminderPlayer) return;
    const info = getPlatformInfo();
    const ts = Date.now();
    const preview = missingUpcomingBets
      .slice(0, 3)
      .map(x => `${x.match.home} vs ${x.match.away}`)
      .join(", ");
    const moreCount = Math.max(0, missingUpcomingBets.length - 3);
    const moreText = moreCount > 0 ? ` +${moreCount} more` : "";

    const msg = {
      id: ts,
      sender: reminderPlayer,
      text: `⏰ ${reminderPlayer}: I still need to finish bets for ${missingUpcomingBets.length}/${nextFiveUpcoming.length} upcoming games (${preview}${moreText}).`,
      timestamp: ts,
      deviceType: info.deviceType,
      timezone: info.timezone,
      likelyUser: info.likelyUser || reminderPlayer,
    };
    await set(ref(db, `chat/${ts}`), msg);
    notify("⏰ Reminder posted in chat.", "info");
    setTab("chat");
  }

  // ── Admin tap ─────────────────────────────────────────────────
  function handleSecretTap() {
    const n = adminTaps + 1;
    setAdminTaps(n);
    clearTimeout(adminTimer.current);
    if (n >= 5) {
      setAdminMode(true);
      setTab("admin");
      setAdminTaps(0);
    } else {
      adminTimer.current = setTimeout(() => setAdminTaps(0), 2000);
    }
  }

  const TABS = [
    { id: "leaderboard", label: "🏆 Board" },
    { id: "bets",        label: "🎯 Bets" },
    { id: "schedule",    label: "📅 Schedule" },
    { id: "history",     label: "📜 History" },
    { id: "stats",       label: "📊 Stats" },
    { id: "spylog",      label: "🕵️ Log" },
    { id: "squad",       label: "🏏 Squad" },
    { id: "chat",        label: "💬 Chat" },
    ...(adminMode ? [{ id: "admin", label: "⚙️ Admin" }] : []),
  ];

  // ── Known device profiles ─────────────────────────────────────
  // Americas + iOS     = Mitthu
  // Americas + Android = Megs
  // Asia    + Android  = Nakel
  const DEVICE_PROFILES = [
    { match: (tz, os) => isAmericas(tz) && os === "iOS",     likely: "Mitthu", confidence: "🎯 Likely Mitthu" },
    { match: (tz, os) => isAmericas(tz) && os === "Android", likely: "Megs",   confidence: "🎯 Likely Megs" },
    { match: (tz, os) => isAsia(tz)     && os === "Android", likely: "Nakel",  confidence: "🎯 Likely Nakel" },
  ];

  function isAmericas(tz = "") {
    return /America|US\/|Canada\/|Mexico\//i.test(tz);
  }

  function isAsia(tz = "") {
    return /Asia\/|India|Kolkata|IST/i.test(tz);
  }

  function guessIdentity(timezone, os) {
    const profile = DEVICE_PROFILES.find(p => p.match(timezone, os));
    return profile ? profile : { likely: null, confidence: "❓ Unknown device" };
  }

  function getPlatformInfo() {
    const ua = navigator.userAgent;

    // Browser detection
    const isChrome = /Chrome/i.test(ua) && !/Edge|OPR/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);
    const isFirefox = /Firefox/i.test(ua);
    const isEdge = /Edge|Edg/i.test(ua);
    const browser = isEdge ? "Edge" : isChrome ? "Chrome" : isSafari ? "Safari" : isFirefox ? "Firefox" : "Browser";

    // Device type detection
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isTablet = /iPad/i.test(ua) || (isAndroid && !/Mobile/i.test(ua)) || (window.screen.width >= 768 && window.screen.width <= 1366 && "ontouchstart" in window);
    const isMobile = (isAndroid && /Mobile/i.test(ua)) || /iPhone|iPod/i.test(ua);
    const deviceType = isTablet ? "📟 Tablet" : isMobile ? "📱 Phone" : "🖥️ Desktop";

    // OS
    const os = isAndroid ? "Android" : isIOS ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Unknown OS";

    // Timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown TZ";

    // Local time on their device
    const localTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    // Guess who this device belongs to
    const guess = guessIdentity(timezone, os);

    return { browser, os, deviceType, timezone, localTime, likelyUser: guess.likely, confidence: guess.confidence };
  }

  function fmtLogTime(ts) {
    return new Date(ts).toLocaleString("en-IN", {
      day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }) + " IST";
  }

  function logAction(type, matchId, home, away, claimedAs = null) {
    const info = getPlatformInfo();
    const ts = Date.now();
    // Flag if claimed identity doesn't match device profile
    const mismatch = claimedAs && info.likelyUser && info.likelyUser !== claimedAs;
    const entry = {
      id: ts,
      type,
      player: selectedPlayer,
      claimedAs,
      matchId,
      home,
      away,
      browser: info.browser,
      os: info.os,
      deviceType: info.deviceType,
      timezone: info.timezone,
      localTime: info.localTime,
      likelyUser: info.likelyUser || "Unknown",
      confidence: info.confidence,
      mismatch: mismatch || false,
      timestamp: ts,
    };
    set(ref(db, `spyLog/${ts}`), entry);
  }

  // Convenience wrappers
  function logPeek(matchId, home, away) { logAction("peek", matchId, home, away); }

  // ── Stats & Analytics Calculations ───────────────────────────
  function calcStats() {
    const done = completedMatches;
    const total = done.length;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekCutoff = Date.now() - weekMs;
    const weeklyDone = done.filter(m => new Date(m.rawDate).getTime() >= weekCutoff);

    const playerStats = Object.fromEntries(PLAYERS.map(p => ({
      [p]: {
        winPicks: 0, tossPicks: 0, totalPicks: 0, totalToss: 0,
        teamFreq: {}, teamWins: {}, streak: 0, maxStreak: 0, lastCorrect: false,
      }
    })).map(o => Object.entries(o)[0]));

    for (const match of done) {
      const winner = getEffectiveWinner(match);
      const tossWinner = getEffectiveTossWinner(match);
      for (const p of PLAYERS) {
        const s = playerStats[p];
        const myBet = bets[`${match.id}__${p}`];
        const myToss = tossGuesses[`${match.id}__${p}`];
        if (myBet) {
          s.totalPicks++;
          s.teamFreq[myBet] = (s.teamFreq[myBet] || 0) + 1;
          if (myBet === winner) {
            s.winPicks++;
            s.teamWins[myBet] = (s.teamWins[myBet] || 0) + 1;
            s.streak++;
            s.maxStreak = Math.max(s.maxStreak, s.streak);
            s.lastCorrect = true;
          } else {
            s.streak = 0;
            s.lastCorrect = false;
          }
        }
        if (myToss) { s.totalToss++; if (myToss === tossWinner) s.tossPicks++; }
      }
    }

    // Last 7 days (rolling) insights: top scorer, biggest climber, toss rate — not the Mon–Sun mini league
    const weekPts = Object.fromEntries(PLAYERS.map(p => [p, 0]));
    const weekToss = Object.fromEntries(PLAYERS.map(p => [p, { correct: 0, total: 0 }]));
    const beforeWeekPts = Object.fromEntries(PLAYERS.map(p => [p, 0]));

    const applyPointsForMatch = (targetPts, match) => {
      const status = getEffectiveStatus(match);
      const winner = getEffectiveWinner(match);
      const tossWinner = getEffectiveTossWinner(match);
      const manual = manualResults[fbKey(match.id)];
      const isAbandoned = status === "abandoned";
      const tossHappened = manual?.abandonedWithToss === true;

      PLAYERS.forEach(p => {
        const betKey = `${match.id}__${p}`;
        const myBet = bets[betKey];
        const myToss = tossGuesses[betKey];
        if (isAbandoned) {
          targetPts[p] += 1;
          if (tossHappened && tossWinner && myToss === tossWinner) targetPts[p] += 1;
        } else {
          if (winner && myBet === winner) targetPts[p] += 2;
          if (tossWinner && myToss === tossWinner) targetPts[p] += 1;
        }
      });
    };

    done
      .filter(m => new Date(m.rawDate).getTime() < weekCutoff)
      .forEach(m => applyPointsForMatch(beforeWeekPts, m));
    weeklyDone.forEach(m => {
      applyPointsForMatch(weekPts, m);
      const tossWinner = getEffectiveTossWinner(m);
      PLAYERS.forEach(p => {
        const t = tossGuesses[`${m.id}__${p}`];
        if (!t) return;
        weekToss[p].total += 1;
        if (tossWinner && t === tossWinner) weekToss[p].correct += 1;
      });
    });

    const rankFromPts = (ptsByPlayer, player) => PLAYERS.filter(p => ptsByPlayer[p] > ptsByPlayer[player]).length + 1;
    const currentRanks = Object.fromEntries(PLAYERS.map(p => [p, rankFromPts(pts, p)]));
    const startWeekRanks = Object.fromEntries(PLAYERS.map(p => [p, rankFromPts(beforeWeekPts, p)]));
    const climbByPlayer = Object.fromEntries(PLAYERS.map(p => [p, startWeekRanks[p] - currentRanks[p]]));

    const playerOfWeek = [...PLAYERS].sort((a, b) => weekPts[b] - weekPts[a])[0] || PLAYERS[0];
    const biggestClimber = [...PLAYERS].sort((a, b) => climbByPlayer[b] - climbByPlayer[a] || weekPts[b] - weekPts[a])[0] || PLAYERS[0];
    const tossMaster = [...PLAYERS].sort((a, b) => {
      const aPct = weekToss[a].total > 0 ? weekToss[a].correct / weekToss[a].total : -1;
      const bPct = weekToss[b].total > 0 ? weekToss[b].correct / weekToss[b].total : -1;
      return bPct - aPct || weekToss[b].correct - weekToss[a].correct;
    })[0] || PLAYERS[0];

    const weeklyInsights = {
      matchesCount: weeklyDone.length,
      playerOfWeek: {
        player: playerOfWeek,
        points: weekPts[playerOfWeek] || 0,
      },
      biggestClimber: {
        player: biggestClimber,
        climbed: Math.max(0, climbByPlayer[biggestClimber] || 0),
        from: startWeekRanks[biggestClimber],
        to: currentRanks[biggestClimber],
      },
      tossMaster: {
        player: tossMaster,
        correct: weekToss[tossMaster]?.correct || 0,
        total: weekToss[tossMaster]?.total || 0,
      },
    };

    const { startMs: wkStart, endMs: wkEnd, label: weekMiniLabel } = istMondaySundayBoundsUtc();
    const weekMiniMatches = done.filter(m => {
      const t = new Date(m.rawDate).getTime();
      return t >= wkStart && t <= wkEnd;
    });
    const weekMiniPts = Object.fromEntries(PLAYERS.map(p => [p, 0]));
    weekMiniMatches.forEach(m => applyPointsForMatch(weekMiniPts, m));
    const weeklyMiniRanked = [...PLAYERS].sort((a, b) => weekMiniPts[b] - weekMiniPts[a] || a.localeCompare(b));

    const weeklyMiniLeague = {
      label: weekMiniLabel,
      matchesCount: weekMiniMatches.length,
      pts: weekMiniPts,
      ranked: weeklyMiniRanked,
    };

    /** Completed IST weeks before this Mon–Sun window — same points rules as mini league */
    const pastWeekStarts = new Map();
    for (const m of done) {
      const b = istMondaySundayBoundsUtc(new Date(m.rawDate));
      pastWeekStarts.set(b.startMs, b);
    }
    const weeklyMiniHistory = [...pastWeekStarts.values()]
      .filter(w => w.startMs < wkStart)
      .sort((a, b) => b.startMs - a.startMs)
      .map(w => {
        const wm = done.filter(x => {
          const t = new Date(x.rawDate).getTime();
          return t >= w.startMs && t <= w.endMs;
        });
        const pts = Object.fromEntries(PLAYERS.map(p => [p, 0]));
        wm.forEach(x => applyPointsForMatch(pts, x));
        const ranked = [...PLAYERS].sort((a, b) => pts[b] - pts[a] || a.localeCompare(b));
        return {
          label: w.label,
          startMs: w.startMs,
          matchesCount: wm.length,
          podium: ranked.slice(0, 3).map((p, i) => ({
            rank: i + 1,
            player: p,
            pts: pts[p],
          })),
        };
      });

    const weeklyTrophyCabinet = Object.fromEntries(
      PLAYERS.map(p => [p, { gold: 0, silver: 0, bronze: 0, podium: 0, totalTrophies: 0 }])
    );
    weeklyMiniHistory.forEach(w => {
      w.podium.forEach(slot => {
        const t = weeklyTrophyCabinet[slot.player];
        if (!t) return;
        if (slot.rank === 1) t.gold += 1;
        else if (slot.rank === 2) t.silver += 1;
        else if (slot.rank === 3) t.bronze += 1;
        t.podium += 1;
      });
    });
    PLAYERS.forEach(p => {
      weeklyTrophyCabinet[p].totalTrophies =
        weeklyTrophyCabinet[p].gold * 3 +
        weeklyTrophyCabinet[p].silver * 2 +
        weeklyTrophyCabinet[p].bronze;
    });

    // Favourite team = most bet on
    // Lucky team = most points earned from
    const enriched = {};
    for (const p of PLAYERS) {
      const s = playerStats[p];
      const favTeam = Object.entries(s.teamFreq).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
      const luckyTeam = Object.entries(s.teamWins).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
      enriched[p] = {
        ...s,
        winPct: s.totalPicks > 0 ? Math.round((s.winPicks/s.totalPicks)*100) : 0,
        tossPct: s.totalToss > 0 ? Math.round((s.tossPicks/s.totalToss)*100) : 0,
        favTeam,
        luckyTeam,
      };
    }

    // Head to head — for each match, track who won the bet
    const h2h = {};
    for (const p1 of PLAYERS) {
      for (const p2 of PLAYERS) {
        if (p1 !== p2) h2h[`${p1}v${p2}`] = { p1wins: 0, p2wins: 0, draws: 0 };
      }
    }
    for (const match of done) {
      const winner = getEffectiveWinner(match);
      for (let i = 0; i < PLAYERS.length; i++) {
        for (let j = i+1; j < PLAYERS.length; j++) {
          const p1 = PLAYERS[i], p2 = PLAYERS[j];
          const b1 = bets[`${match.id}__${p1}`] === winner;
          const b2 = bets[`${match.id}__${p2}`] === winner;
          const key = `${p1}v${p2}`;
          if (b1 && !b2) h2h[key].p1wins++;
          else if (b2 && !b1) h2h[key].p2wins++;
          else if (b1 && b2) h2h[key].draws++;
        }
      }
    }

    // Season awards (live season-so-far)
    const seasonRanked = [...PLAYERS].sort((a, b) => pts[b] - pts[a] || a.localeCompare(b));
    const seasonChampion = seasonRanked[0];
    const consistencyKing = [...PLAYERS].sort((a, b) =>
      (enriched[b].winPct - enriched[a].winPct) ||
      (enriched[b].winPicks - enriched[a].winPicks) ||
      a.localeCompare(b)
    )[0];
    const tossSultan = [...PLAYERS].sort((a, b) =>
      (enriched[b].tossPct - enriched[a].tossPct) ||
      (enriched[b].tossPicks - enriched[a].tossPicks) ||
      a.localeCompare(b)
    )[0];
    const streakMachine = [...PLAYERS].sort((a, b) =>
      (enriched[b].maxStreak - enriched[a].maxStreak) ||
      (enriched[b].winPicks - enriched[a].winPicks) ||
      a.localeCompare(b)
    )[0];
    const trophyBoss = [...PLAYERS].sort((a, b) =>
      (weeklyTrophyCabinet[b].totalTrophies - weeklyTrophyCabinet[a].totalTrophies) ||
      (weeklyTrophyCabinet[b].gold - weeklyTrophyCabinet[a].gold) ||
      a.localeCompare(b)
    )[0];

    const seasonAwards = [
      { id: "champion", emoji: "👑", title: "Season Leader", player: seasonChampion, detail: `${pts[seasonChampion]} pts` },
      { id: "consistency", emoji: "🎯", title: "Consistency King", player: consistencyKing, detail: `${enriched[consistencyKing].winPct}% winner accuracy` },
      { id: "toss", emoji: "🪙", title: "Toss Sultan", player: tossSultan, detail: `${enriched[tossSultan].tossPct}% toss accuracy` },
      { id: "streak", emoji: "🔥", title: "Streak Machine", player: streakMachine, detail: `Best streak: ${enriched[streakMachine].maxStreak}` },
      { id: "weekly", emoji: "🏅", title: "Weekly Trophy Boss", player: trophyBoss, detail: `${weeklyTrophyCabinet[trophyBoss].gold}G · ${weeklyTrophyCabinet[trophyBoss].silver}S · ${weeklyTrophyCabinet[trophyBoss].bronze}B` },
    ];

    return {
      enriched,
      h2h,
      total,
      weeklyInsights,
      weeklyMiniLeague,
      weeklyMiniHistory,
      weeklyTrophyCabinet,
      seasonAwards,
    };
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      ...S.app,
      "--bg-app": activeTheme.appBg,
      "--text-main": activeTheme.text,
      "--bg-header": activeTheme.headerBg,
      "--bg-tabbar": activeTheme.tabBarBg,
      "--bg-card": activeTheme.cardBg,
      "--border-main": activeTheme.border,
      "--accent-main": activeTheme.accent,
      "--text-muted": activeTheme.muted,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button:hover { opacity: 0.88; }
        @keyframes slideDown { from { transform: translateX(-50%) translateY(-10px); opacity:0; } to { transform: translateX(-50%) translateY(0); opacity:1; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes rankPulse { 0% { transform: scale(1); } 35% { transform: scale(1.05); } 100% { transform: scale(1); } }
        @keyframes correctPulse { 0% { box-shadow: 0 0 0 rgba(34,197,94,0); } 50% { box-shadow: 0 0 14px rgba(34,197,94,.28); } 100% { box-shadow: 0 0 0 rgba(34,197,94,0); } }
        @keyframes confettiDrop {
          0% { transform: translate3d(0, -12vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift, 0px), 105vh, 0) rotate(var(--rot, 180deg)); opacity: 0; }
        }
        @keyframes bzBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bzSheetUp {
          from { opacity: 0; transform: translate3d(0, 100%, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes bzSheetUpDense {
          from { opacity: 0; transform: translate3d(0, 16px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes bzPopIn {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes bzFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bzFadeInUp {
          from { opacity: 0; transform: translate3d(0, 10px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes bzToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.98); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes bzLiveStripIn {
          from { opacity: 0; transform: translate3d(0, -10px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes bzLiveDot {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
          50% { opacity: 0.75; transform: scale(1.15); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
        }
        @keyframes bzChatBubbleIn {
          from { opacity: 0; transform: translate3d(0, 8px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes bzShimmerLoader {
          0% { opacity: 0.55; transform: scale(1); filter: saturate(1); }
          50% { opacity: 1; transform: scale(1.06); filter: saturate(1.08); }
          100% { opacity: 0.55; transform: scale(1); filter: saturate(1); }
        }
        .bz-scorecard-hit { transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease; }
        .bz-scorecard-hit:active { transform: scale(0.992); }
        .bz-tab {
          transition: color 0.2s ease, border-color 0.2s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .bz-tab-active { transform: translateY(-1px); }
        button:not(:disabled):active { transform: scale(0.985); transition: transform 0.07s ease, opacity 0.07s ease; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #060D1A; } ::-webkit-scrollbar-thumb { background: #1A3050; border-radius: 4px; }
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} reduceMotion={reduceMotion} />}
      {confettiPieces.length > 0 && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9998, overflow: "hidden" }}>
            {confettiPieces.map(piece => (
            <span key={piece.id} style={{
              position: "absolute",
              left: `${piece.left}%`,
              top: "-10vh",
              fontSize: piece.size,
              opacity: 0.95,
              animation: reduceMotion ? "none" : `confettiDrop ${piece.duration}s linear ${piece.delay}s forwards`,
              "--drift": `${piece.drift}px`,
              "--rot": `${piece.rotate}deg`,
            }}>
              {piece.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ ...S.header, position: "relative", overflow: "hidden" }}>
        {themeTeam?.logo && (
          <img
            src={themeTeam.logo}
            alt={`${themeTeamCode} theme`}
            style={{
              position: "absolute",
              right: wm.right,
              top: wm.top,
              width: wm.size,
              height: wm.size,
              objectFit: "contain",
              opacity: wm.opacity,
              filter: "drop-shadow(0 6px 12px #0006)",
              pointerEvents: "none",
            }}
          />
        )}
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
              🏏 <span style={{ color: themeId === "csk" ? "#1E3A8A" : "#FF6B2B" }}>IPL</span><span style={{ color: themeId === "csk" ? "#0B1F4D" : "#FFD700" }}>BETZONE</span>
            </div>
            <div style={{ fontSize: 10, color: "#4A6080", marginTop: 2 }}>
              IPL 2026 · Results managed via Admin panel

            </div>
            <div style={{ marginTop: 3 }}>
              <select
                value={themeId}
                onChange={e => setThemeId(e.target.value)}
                style={{
                  background: "#0A1420",
                  border: "1px solid var(--border-main)",
                  color: "var(--text-main)",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  minWidth: 150,
                  cursor: "pointer",
                }}
              >
                {Object.entries(THEME_PACKS).map(([id, t]) => (
                  <option key={id} value={id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 38 }}>
            {PLAYERS.map(p => (
              <div key={p} style={{ textAlign: "center", cursor: "pointer" }}
                onClick={() => setAvatarPicker(p)}>
                <div style={{ position: "relative" }}>
                  <PlayerAvatarBubble meta={PLAYER_META[p]} size={34} border={2} />
                  <div style={{ position: "absolute", bottom: -2, right: -2, fontSize: 8, background: "#060D1A", borderRadius: "50%", width: 12, height: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</div>
                </div>
                <div style={{ fontSize: 8, color: PLAYER_META[p].color, fontWeight: 700, marginTop: 2 }}>
                  {p.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Match Banner */}
      {liveMatches.length > 0 && (
        <div style={{
          background: "#7F1D1D22",
          borderBottom: "1px solid #EF444433",
          padding: "8px 18px",
          animation: uxMotion(uxMotionOn, "bzLiveStripIn 0.42s cubic-bezier(.22,1,.36,1) both"),
        }}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", animation: uxMotion(uxMotionOn, "bzLiveDot 1.55s ease-in-out infinite"), marginTop: 4, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 700 }}>LIVE</span>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                {liveMatches.map(m => {
                  const row = liveEspnByMatch[m.id];
                  return (
                    <div key={m.id} style={{ fontSize: 11, color: "#FCA5A5", lineHeight: 1.35 }}>
                      <span style={{ fontWeight: 800 }}>{m.home} vs {m.away}</span>
                      {row?.text && (
                        <div style={{ marginTop: 3, color: "#FECDD3", fontSize: 10, fontWeight: 600, wordBreak: "break-word" }}>
                          {row.text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {liveMatches.some(m => liveEspnByMatch[m.id]?.text) && (
                <div style={{ marginTop: 6, fontSize: 8, color: "#6B7280" }}>Scores from ESPN · refreshes every 30s</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ ...S.tabBar, maxWidth: "none" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flex: 1 }}>
          {TABS.map(t => {
            const unread = t.id === "chat" && tab !== "chat"
              ? chatMessages.filter(m => m.timestamp > lastSeenChat && m.sender !== chatSender).length
              : 0;
            return (
              <button
                key={t.id}
                type="button"
                className={`bz-tab${tab === t.id ? " bz-tab-active" : ""}`}
                onClick={() => setTab(t.id)}
                style={{ ...S.tab(tab === t.id), position: "relative" }}
              >
                <span style={{ animation: unread > 0 && !reduceMotion ? "blink 1.2s ease-in-out infinite" : "none" }}>
                  {t.label}
                </span>
                {unread > 0 && (
                  <span style={{
                    position: "absolute", top: 4, right: 2,
                    background: "#EF4444", color: "#fff",
                    fontSize: 8, fontWeight: 800,
                    width: 14, height: 14, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    animation: reduceMotion ? "none" : "blink 1.2s ease-in-out infinite",
                    border: "1px solid #060D1A",
                  }}>
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "16px 14px 90px",
        animation: contentBootAnim ? uxMotion(uxMotionOn, "bzFadeIn 0.42s cubic-bezier(.22,1,.36,1) both") : "none",
      }}>
        {!loading && shouldShowBetReminder && (
          <div style={{ ...S.card("#EF444433"), borderLeft: "3px solid #EF4444", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 800, color: "#FCA5A5", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>⚠️ Bet Reminder for</span>
                  {reminderPlayer && <PlayerAvatarMark meta={PLAYER_META[reminderPlayer]} size={16} />}
                  <span>{reminderPlayer}</span>
                </div>
                <div style={{ fontSize: 11, color: "#7A90B0", marginTop: 2 }}>
                  Missing bets in {missingUpcomingBets.length} of next {nextFiveUpcoming.length} upcoming matches.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {missingUpcomingBets.map(({ match, missingWinner, missingToss }) => (
                <span key={match.id} style={{ fontSize: 10, padding: "4px 8px", borderRadius: 20, background: "#0A1420", color: "#E2E8F8", border: "1px solid #1A3050" }}>
                  {match.home} vs {match.away} · {missingWinner ? "🏆" : ""}{missingToss ? "🪙" : ""}
                </span>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setTab("bets")}
                style={{ ...S.btn("#FF6B2B22", "#FF6B2B"), border: "1px solid #FF6B2B55", flex: 1, fontSize: 11 }}
              >
                🎯 Go Place Bets
              </button>
              <button
                onClick={sendBetReminderToChat}
                style={{ ...S.btn("#1E3A5F", "#93C5FD"), border: "1px solid #60A5FA55", flex: 1, fontSize: 11 }}
              >
                💬 Post Reminder in Chat
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "#4A6080" }}>
            <div style={{ fontSize: 36, marginBottom: 12, animation: uxMotion(!reduceMotion, "bzShimmerLoader 1.35s ease-in-out infinite") }}>🏏</div>
            <div style={{ fontWeight: 700 }}>Loading IPL 2026 schedule…</div>
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {!loading && tab === "leaderboard" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: "#4A6080", letterSpacing: 1 }}>SEASON STANDINGS</div>
              <div style={{ fontSize: 11, color: "#2A4060", marginTop: 3 }}>
                {completedMatches.length} completed · {upcomingMatches.length} upcoming
              </div>
            </div>

            {/* Podium — heights based on actual rank, ties share same height */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 10, marginBottom: 24 }}>
              {[1, 0, 2].map((idx, slotIdx) => {
                const player = ranked[idx];
                const rank = getRank(player);
                const podiumHeights = { 1: 170, 2: 140, 3: 110 };
                const podiumH = podiumHeights[rank] || 110;
                const meta = PLAYER_META[player];
                const isTop = rank === 1;
                const emojiSize = isTop ? 32 : 22;
                const nameSize = isTop ? 15 : 12;
                const ptsSize  = isTop ? 30 : 22;
                const enterStagger = uxMotion(uxMotionOn && !rankFlash[player], `bzFadeInUp 0.45s cubic-bezier(.22,1,.36,1) ${slotIdx * 0.08}s both`);
                return (
                  <div key={player} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, animation: rankFlash[player] ? "rankPulse .8s ease-in-out 2" : enterStagger }}>
                    <PlayerAvatarBubble meta={meta} size={emojiSize} border={2} />
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: nameSize, color: meta.color }}>{player}</div>
                    <div style={{ fontSize: ptsSize, fontWeight: 900, color: "#FFD700", lineHeight: 1 }}>{pts[player]}</div>
                    <div style={{ fontSize: 9, color: "#4A6080" }}>pts</div>
                    <div style={{
                      width: "100%", height: podiumH, borderRadius: "8px 8px 0 0",
                      background: `linear-gradient(180deg, ${meta.light} 0%, ${meta.color}11 100%)`,
                      border: `1px solid ${meta.color}44`,
                      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10, fontSize: 22,
                    }}>{getRankCrown(rank)}</div>
                  </div>
                );
              })}
            </div>

            {/* Player cards */}
            {ranked.map((player, i) => {
              const meta = PLAYER_META[player];
              const maxPts = Math.max(...Object.values(pts), 1);
              const pct = Math.round((pts[player] / maxPts) * 100);
              const rowEnter = uxMotion(uxMotionOn && !rankFlash[player], `bzFadeInUp 0.38s cubic-bezier(.22,1,.36,1) ${Math.min(i, 5) * 0.045}s both`);
              return (
                <div key={player} style={{ ...S.card(meta.color + "44"), position: "relative", overflow: "hidden", animation: rankFlash[player] ? "rankPulse .8s ease-in-out 2" : rowEnter }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: `${pct}%`, height: 3, background: `linear-gradient(90deg, ${meta.color}, transparent)` }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 26, width: 36 }}>{getRankLabel(getRank(player))}</div>
                    <PlayerAvatarBubble meta={meta} size={44} border={2} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: meta.color }}>{player}</div>
                      <div style={{ fontSize: 11, color: "#2A4060", marginTop: 2 }}>
                        {breakdown[player].filter(b => b.gained > 0).length} correct · {completedMatches.length} played
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                        <span style={{ fontSize: 9, color: "#4A6080", fontWeight: 700, flexShrink: 0 }}>Form</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          {getPlayerFormLast5(player).map((cell, i) => (
                            <span
                              key={i}
                              title={cell === "W" ? "Winner pick correct" : cell === "L" ? "Winner pick wrong" : cell === "wash" ? "Washout" : "No pick"}
                              style={{
                                fontSize: 9,
                                fontWeight: 800,
                                width: 18,
                                height: 18,
                                borderRadius: 4,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background:
                                  cell === "W" ? "#14532D55" : cell === "L" ? "#7F1D1D55" : cell === "wash" ? "#1E3A5F55" : "#0A1420",
                                color: cell === "W" ? "#22C55E" : cell === "L" ? "#FCA5A5" : cell === "wash" ? "#93C5FD" : "#4A6080",
                                border: `1px solid ${cell === "W" ? "#22C55E44" : cell === "L" ? "#EF444444" : cell === "wash" ? "#60A5FA44" : "#1A3050"}`,
                              }}
                            >
                              {cell === "W" ? "W" : cell === "L" ? "L" : cell === "wash" ? "◎" : "—"}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 800, color: "#FFD700", lineHeight: 1 }}>{pts[player]}</div>
                      <div style={{ fontSize: 10, color: "#4A6080" }}>points</div>
                    </div>
                  </div>
                  {breakdown[player].length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {breakdown[player].slice(-4).map((b, bi) => (
                        <span key={bi} style={{ fontSize: 10, background: "#0A1420", color: b.gained > 0 ? "#22C55E" : "#4A6080", padding: "3px 8px", borderRadius: 20, border: `1px solid ${b.gained > 0 ? "#22C55E33" : "#1A3050"}` }}>
                          {b.home}v{b.away}: {b.abandoned ? b.parts.join(" ") : b.gained > 0 ? b.parts.join(" ") : "❌"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Points rules */}
            <div style={{ ...S.card(), marginTop: 8 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, color: "#FFD700", marginBottom: 10, fontWeight: 800 }}>🏆 POINTS SYSTEM</div>
              {[["✅ Correct match winner", "2 pts"], ["🪙 Correct toss winner", "1 pt"], ["❌ Wrong prediction", "0 pts"]].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#7A90B0", padding: "4px 0", borderBottom: "1px solid #0D1828" }}>
                  <span>{label}</span><span style={{ color: "#FFD700", fontWeight: 700 }}>{val}</span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: "#2A4060", marginTop: 8 }}>Max 3 pts per match · Bets lock when match goes live</div>
            </div>

            <button onClick={handleSecretTap} style={{ background: "none", border: "none", color: "#0A1420", fontSize: 10, cursor: "pointer", display: "block", margin: "20px auto 0", padding: "8px 16px" }}>···</button>
          </div>
        )}

        {/* ── PLACE BETS ── */}
        {!loading && tab === "bets" && (
          <div>
            {/* Player selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 8, fontWeight: 700, letterSpacing: 0.5 }}>BETTING AS:</div>
              <div style={{ display: "flex", gap: 8 }}>
                {PLAYERS.map(p => (
                  <button key={p} type="button" onClick={() => setSelectedPlayer(p)} style={{ ...S.pill(selectedPlayer === p, PLAYER_META[p].color), display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <PlayerAvatarMark meta={PLAYER_META[p]} size={16} />
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Live matches — no betting */}
            {liveMatches.map(match => (
              <div key={match.id} style={{ ...S.card("#EF444433"), borderLeft: "3px solid #EF4444" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 700 }}>
                    {manualResults[fbKey(match.id)]?.autoLocked ? "⚡ AUTO-LOCKED" : "🔴 BETS LOCKED"}
                  </span>
                  <span style={{ fontSize: 10, color: "#4A6080" }}>{match.venue?.split(",")[0]}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TeamBadge short={match.home} />
                  <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#FCA5A5" }}>{match.home} vs {match.away} — Bets locked</div>
                  <TeamBadge short={match.away} />
                </div>
                {liveEspnByMatch[match.id]?.text && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#FECDD3", textAlign: "center", fontWeight: 600, lineHeight: 1.35 }}>
                    {liveEspnByMatch[match.id].text}
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 11, color: "#4A6080", textAlign: "center" }}>Betting closed — match is live!</div>
              </div>
            ))}

            {/* Upcoming matches */}
            {upcomingMatches.length === 0 && liveMatches.length === 0 && (
              <div style={{ textAlign: "center", padding: 50, color: "#4A6080" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>All done for now!</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Check the leaderboard to see the standings.</div>
              </div>
            )}

            {upcomingMatches.map(match => {
              const betKey = `${match.id}__${selectedPlayer}`;
              const myBet = bets[betKey];
              const myToss = tossGuesses[betKey];
              const meta = PLAYER_META[selectedPlayer];
              const isExpanded = expandedMatch === match.id;
              const hasBet = !!myBet;
              const hasToss = !!myToss;
              return (
                <div key={match.id} style={{ ...S.card(isExpanded ? meta.color + "44" : "#1A3050"), cursor: "pointer" }}>

                  {/* Collapsed header — always visible, tap to expand */}
                  <div onClick={() => { if (isExpanded) { setExpandedMatch(null); } else { setMatchConfirm(match.id); } }}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TeamBadge short={match.home} size={32} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {match.stage === "playoff" && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#FFD700", padding: "1px 6px", borderRadius: 8, background: "#FFD70015", border: "1px solid #FFD70033" }}>🏆 {match.playoffRound || "PO"}</span>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F8" }}>{match.home}</span>
                        <span style={{ fontSize: 10, color: "#FF6B2B", fontWeight: 700 }}>VS</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F8" }}>{match.away}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#4A6080", marginTop: 2 }}>📅 {fmtMatchDate(match.rawDate)} · {fmtMatchTime(match.rawDate)}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      {/* Show only whether bet exists — never reveal the team name */}
                      <div style={{ display: "flex", gap: 4 }}>
                        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, background: hasBet ? meta.color + "33" : "#1A3050", color: hasBet ? meta.color : "#2A4060", fontWeight: 700 }}>
                          🏆 {hasBet ? "✓" : "—"}
                        </span>
                        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, background: hasToss ? "#FFD70022" : "#1A3050", color: hasToss ? "#FFD700" : "#2A4060", fontWeight: 700 }}>
                          🪙 {hasToss ? "✓" : "—"}
                        </span>
                      </div>
                      <span style={{ fontSize: 14, color: "#4A6080" }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>
                    <TeamBadge short={match.away} size={32} />
                  </div>

                  {/* Expanded betting section */}
                  {isExpanded && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #1A3050" }}>
                      {/* Teams large */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <TeamBadge short={match.home} size={48} />
                          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 6, color: IPL_TEAMS[match.home]?.color || "#fff" }}>{match.home}</div>
                          <div style={{ fontSize: 9, color: "#4A6080", textAlign: "center" }}>{IPL_TEAMS[match.home]?.name || match.home}</div>
                        </div>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#FF6B2B" }}>VS</div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <TeamBadge short={match.away} size={48} />
                          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 6, color: IPL_TEAMS[match.away]?.color || "#fff" }}>{match.away}</div>
                          <div style={{ fontSize: 9, color: "#4A6080", textAlign: "center" }}>{IPL_TEAMS[match.away]?.name || match.away}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: "#2A4060", textAlign: "center", marginBottom: 14 }}>
                        🏟 {match.venue.split(",")[0]} · {fmtMatchTime(match.rawDate)}
                      </div>

                  {match.stage === "playoff" && !match.playoffBettingOpen ? (
                    <div style={{ textAlign: "center", padding: 18, color: "#94A3B8", fontSize: 12, lineHeight: 1.55, background: "#0A1420", borderRadius: 10, border: "1px solid #1A3050" }}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>🔒</div>
                      <div style={{ fontWeight: 800, color: "#F59E0B" }}>Betting locked</div>
                      <div style={{ marginTop: 6 }}>A playoff must be <b>reviewed and confirmed</b> in <b>Admin → Playoffs</b> before picks are allowed.</div>
                    </div>
                  ) : (
                    <>
                  {/* Winner pick */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 6, fontWeight: 700, letterSpacing: 0.3 }}>
                      🏆 PICK WINNER <span style={{ color: "#FFD700" }}>+2 pts</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[match.home, match.away].map(team => (
                        <button key={team} onClick={() => placeBet(match.id, selectedPlayer, team)} style={S.pill(myBet === team, meta.color)}>
                          {myBet === team ? "✅ " : ""}{team}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toss pick */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 6, fontWeight: 700, letterSpacing: 0.3 }}>
                      🪙 TOSS WINNER <span style={{ color: "#FFD700" }}>+1 pt</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[match.home, match.away].map(team => (
                        <button key={team} onClick={() => placeToss(match.id, selectedPlayer, team)} style={S.pill(myToss === team, "#FFD700")}>
                          {myToss === team ? "✅ " : ""}{team}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Others' picks — hidden until revealed */}
                  <div style={{ paddingTop: 10, borderTop: "1px solid #1A3050" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#2A4060", fontWeight: 700 }}>OTHERS' PICKS:</div>
                      {!revealedPicks[match.id] ? (
                        <button
                          onClick={() => {
                            setRevealedPicks(prev => ({ ...prev, [match.id]: true }));
                            logPeek(match.id, match.home, match.away);
                          }}
                          style={{ fontSize: 10, fontWeight: 700, color: "#FF6B2B", background: "#FF6B2B18", border: "1px solid #FF6B2B44", borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}>
                          👁️ Reveal Picks
                        </button>
                      ) : (
                        <button
                          onClick={() => setRevealedPicks(prev => ({ ...prev, [match.id]: false }))}
                          style={{ fontSize: 10, fontWeight: 700, color: "#4A6080", background: "#1A305044", border: "1px solid #1A3050", borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}>
                          🙈 Hide Picks
                        </button>
                      )}
                    </div>
                    {revealedPicks[match.id] ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Match picks revealed */}
                        <div style={{ fontSize: 9, color: "#4A6080", fontWeight: 700, letterSpacing: 0.3 }}>🏆 WINNER PICKS:</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {PLAYERS.filter(p => p !== selectedPlayer).map(p => {
                            const pb = bets[`${match.id}__${p}`];
                            return (
                              <div key={p} style={{ fontSize: 11, color: "#7A90B0", background: "#0A1420", padding: "4px 10px", borderRadius: 20, border: `1px solid ${pb ? PLAYER_META[p].color + "44" : "#1A3050"}`, display: "flex", alignItems: "center", gap: 4 }}>
                                <PlayerAvatarMark meta={PLAYER_META[p]} size={14} />
                                {pb ? <span style={{ color: PLAYER_META[p].color, fontWeight: 700 }}>{pb}</span> : <span style={{ color: "#2A4060" }}>—</span>}
                              </div>
                            );
                          })}
                        </div>
                        {/* Toss picks revealed */}
                        <div style={{ fontSize: 9, color: "#4A6080", fontWeight: 700, letterSpacing: 0.3 }}>🪙 TOSS PICKS:</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {PLAYERS.filter(p => p !== selectedPlayer).map(p => {
                            const pt = tossGuesses[`${match.id}__${p}`];
                            return (
                              <div key={p} style={{ fontSize: 11, color: "#7A90B0", background: "#0A1420", padding: "4px 10px", borderRadius: 20, border: `1px solid ${pt ? "#FFD70044" : "#1A3050"}`, display: "flex", alignItems: "center", gap: 4 }}>
                                <PlayerAvatarMark meta={PLAYER_META[p]} size={14} />
                                {pt ? <span style={{ color: "#FFD700", fontWeight: 700 }}>{pt}</span> : <span style={{ color: "#2A4060" }}>—</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Match picks hidden */}
                        <div style={{ fontSize: 9, color: "#4A6080", fontWeight: 700, letterSpacing: 0.3 }}>🏆 WINNER PICKS:</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {PLAYERS.filter(p => p !== selectedPlayer).map(p => (
                            <div key={p} style={{ fontSize: 11, color: "#4A6080", background: "#0A1420", padding: "4px 10px", borderRadius: 20, border: "1px solid #1A3050", letterSpacing: 2, display: "flex", alignItems: "center", gap: 4 }}>
                              <PlayerAvatarMark meta={PLAYER_META[p]} size={14} /> •••
                            </div>
                          ))}
                        </div>
                        {/* Toss picks hidden */}
                        <div style={{ fontSize: 9, color: "#4A6080", fontWeight: 700, letterSpacing: 0.3 }}>🪙 TOSS PICKS:</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {PLAYERS.filter(p => p !== selectedPlayer).map(p => (
                            <div key={p} style={{ fontSize: 11, color: "#4A6080", background: "#0A1420", padding: "4px 10px", borderRadius: 20, border: "1px solid #1A3050", letterSpacing: 2, display: "flex", alignItems: "center", gap: 4 }}>
                              <PlayerAvatarMark meta={PLAYER_META[p]} size={14} /> •••
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                    </>
                  )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {!loading && tab === "schedule" && (() => {
          const now = Date.now();
          const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
          const recentCutoff = now - threeDaysMs;
          const upcomingCutoff = now + threeDaysMs;

          const fixtureNoById = Object.fromEntries(matches.map((m, i) => [m.id, i + 1]));
          const byDateAsc = (a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime();
          const byDateDesc = (a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime();
          const isPlayoff = m => m.stage === "playoff";

          const inProgressMatches = matches
            .filter(m => !isPlayoff(m) && getEffectiveStatus(m) === "live")
            .sort(byDateAsc);

          const latestResults = matches
            .filter(m => {
              if (isPlayoff(m)) return false;
              const status = getEffectiveStatus(m);
              const ts = new Date(m.rawDate).getTime();
              return (status === "completed" || status === "abandoned") && ts >= recentCutoff;
            })
            .sort(byDateDesc);

          const nextThreeDays = matches
            .filter(m => {
              if (isPlayoff(m)) return false;
              const status = getEffectiveStatus(m);
              const ts = new Date(m.rawDate).getTime();
              return status === "upcoming" && ts <= upcomingCutoff;
            })
            .sort(byDateAsc);

          const futureGames = matches
            .filter(m => {
              if (isPlayoff(m)) return false;
              const status = getEffectiveStatus(m);
              const ts = new Date(m.rawDate).getTime();
              return status === "upcoming" && ts > upcomingCutoff;
            })
            .sort(byDateAsc);

          const olderResults = matches
            .filter(m => {
              if (isPlayoff(m)) return false;
              const status = getEffectiveStatus(m);
              const ts = new Date(m.rawDate).getTime();
              return (status === "completed" || status === "abandoned") && ts < recentCutoff;
            })
            .sort(byDateDesc);

          const playoffMatches = matches.filter(isPlayoff).sort(byDateAsc);
          const hasLivePlayoff = matches.some(m => isPlayoff(m) && getEffectiveStatus(m) === "live");

          function renderScheduleCard(match) {
            const status = getEffectiveStatus(match);
            const winner = getEffectiveWinner(match);
            const espnLiveLine = liveEspnByMatch[match.id]?.text;
            const espnCompleted = completedEspnByMatch[match.id];
            const statusStyle = {
              live: { bg: "#EF444422", color: "#EF4444", label: "🔴 LIVE" },
              completed: { bg: "#14532D22", color: "#22C55E", label: "✅ Done" },
              abandoned: { bg: "#60A5FA22", color: "#60A5FA", label: "🌧️ Abandoned" },
              upcoming: { bg: "#FF6B2B22", color: "#FF6B2B", label: "🕐 Soon" },
            }[status] || { bg: "#1A3050", color: "#7A90B0", label: status };

            return (
              <div key={match.id} style={{ ...S.card(status === "live" ? "#EF444433" : "#1A3050"), opacity: (status === "completed" || status === "abandoned") ? 0.75 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 10, color: "#4A6080", lineHeight: 1.35 }}>
                    {match.stage === "playoff" && (
                      <span style={{ display: "inline-block", marginRight: 4, fontWeight: 800, color: "#FFD700" }}>🏆</span>
                    )}
                    Match {fixtureNoById[match.id]}
                    {match.playoffRound ? ` · ${match.playoffRound}` : match.stage === "playoff" ? " · Playoff" : ""}
                    {" · "}{fmtMatchDate(match.rawDate)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: statusStyle.bg, color: statusStyle.color, flexShrink: 0 }}>
                    {statusStyle.label}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <TeamBadge short={match.home} size={36} />
                    <div style={{ fontSize: 9, fontWeight: 700, color: IPL_TEAMS[match.home]?.color || "#fff" }}>{match.home}</div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: winner ? "#FFD700" : "#E2E8F8" }}>
                      {status === "completed"
                        ? `${winner} won`
                        : status === "abandoned"
                          ? "🌧️ Abandoned"
                          : status === "live"
                            ? (espnLiveLine || "In Progress 🔴")
                            : fmtMatchTime(match.rawDate)}
                    </div>
                    <div style={{ fontSize: 9, color: "#2A4060", marginTop: 2 }}>🏟 {match.venue.split(",")[0]}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <TeamBadge short={match.away} size={36} />
                    <div style={{ fontSize: 9, fontWeight: 700, color: IPL_TEAMS[match.away]?.color || "#fff" }}>{match.away}</div>
                  </div>
                </div>
                {status === "completed" && winner && espnCompleted && (
                  <div
                    className="bz-scorecard-hit"
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setScorecardModalMatchId(match.id); } }}
                    onClick={() => setScorecardModalMatchId(match.id)}
                    style={{ marginTop: 12, padding: "12px 10px", background: "#F8FAFC08", borderRadius: 10, border: "1px solid #243047", cursor: "pointer" }}
                  >
                    {espnCompleted.metaLine?.trim() ? (
                      <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 10, lineHeight: 1.45 }}>{espnCompleted.metaLine}</div>
                    ) : null}
                    {espnCompleted.rows.map(row => (
                      <div key={`${match.id}-${row.abbr}-${row.main}`} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                          <TeamBadge short={row.abbr} size={26} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: row.winner ? 800 : 500, color: row.winner ? "#E2E8F8" : "#64748B" }}>{row.name}</div>
                            {row.extra ? (
                              <div style={{ fontSize: 9, fontWeight: row.winner ? 600 : 400, color: row.winner ? "#94A3B8" : "#64748B", marginTop: 2 }}>{row.extra}</div>
                            ) : null}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: row.winner ? 800 : 500, color: row.winner ? "#E2E8F8" : "#64748B", flexShrink: 0, textAlign: "right" }}>{row.main}</div>
                      </div>
                    ))}
                    {espnCompleted.resultLine ? (
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#E2E8F8", marginTop: 6, paddingTop: 8, borderTop: "1px solid #1E293B" }}>{espnCompleted.resultLine}</div>
                    ) : null}
                    <div style={{ fontSize: 9, color: "#60A5FA", marginTop: 6, fontWeight: 700 }}>Tap to open expanded scorecard ⤴</div>
                  </div>
                )}
                {(status === "live" || status === "completed") && (
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {PLAYERS.map(p => {
                      const pb = bets[`${match.id}__${p}`];
                      const correct = winner && pb === winner;
                      return (
                          <span key={p} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: correct ? "#14532D33" : "#0A1420", color: correct ? "#22C55E" : "#4A6080", border: `1px solid ${correct ? "#22C55E33" : "#1A3050"}`, animation: correct && !reduceMotion ? "correctPulse 1.7s ease-in-out infinite" : "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <PlayerAvatarMark meta={PLAYER_META[p]} size={12} />
                          {pb || "—"}{correct ? " ✅" : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                {status === "upcoming" && (
                  <div style={{ marginTop: 10, fontSize: 10, color: "#2A4060", fontStyle: "italic" }}>
                    🔒 Picks hidden until match is live
                  </div>
                )}
              </div>
            );
          }

          function renderSection(title, list, openByDefault = false, emptyHint = null) {
            return (
              <details open={openByDefault} style={{ marginBottom: 12 }}>
                <summary style={{ cursor: "pointer", listStyle: "none", background: "#0A1420", border: "1px solid #1A3050", borderRadius: 12, padding: "10px 12px", fontFamily: "'Syne',sans-serif", fontSize: 12, color: "#E2E8F8", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{title}</span>
                  <span style={{ fontSize: 10, color: "#4A6080" }}>{list.length}</span>
                </summary>
                <div style={{ marginTop: 10 }}>
                  {list.length === 0 ? (
                    <div style={{ ...S.card(), marginTop: 0, textAlign: "center", color: "#4A6080", fontSize: 11, lineHeight: 1.55 }}>
                      {emptyHint || "No matches in this section."}
                    </div>
                  ) : (
                    list.map(renderScheduleCard)
                  )}
                </div>
              </details>
            );
          }

          return (
            <div>
              <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>IPL 2026 — ALL FIXTURES (GROUPED)</div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, color: "#EF4444", fontWeight: 800, marginBottom: 8 }}>
                  🔴 In Progress
                </div>
                {inProgressMatches.length === 0 ? (
                  <div style={{ ...S.card(), marginTop: 0, textAlign: "center", color: "#4A6080", fontSize: 11 }}>
                    No live matches right now.
                  </div>
                ) : (
                  inProgressMatches.map(renderScheduleCard)
                )}
              </div>

              {renderSection(
                "🏆 Playoffs (knockouts)",
                playoffMatches,
                hasLivePlayoff,
                "Playoffs are created automatically once all 70 league matches have a result and the points table has a clear top 4 (Qualifier 1 = 1st vs 2nd, Eliminator = 3rd vs 4th). Qualifier 2 and the Final appear after you enter winners for the earlier knockouts in Admin."
              )}
              {renderSection("📅 Next 3 Days", nextThreeDays, true)}
              {renderSection("🔮 Future Games", futureGames, false)}
              {renderSection("📊 Latest Results", latestResults, false)}
              {renderSection("✅ Older Results", olderResults, false)}
            </div>
          );
        })()}

        {/* ── HISTORY ── */}
        {!loading && tab === "history" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#4A6080", fontWeight: 700, letterSpacing: 0.5 }}>COMPLETED MATCHES</div>
              <div style={{ fontSize: 10, color: "#2A4060", marginTop: 4 }}>Newest first</div>
            </div>
            {completedMatches.length === 0 && (
              <div style={{ textAlign: "center", padding: 50, color: "#4A6080" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📜</div>
                <div style={{ fontWeight: 700 }}>No results yet!</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Results appear here automatically once matches finish.</div>
              </div>
            )}
            {[...completedMatches]
              .sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime())
              .map(match => {
              const winner = getEffectiveWinner(match);
              const tossWinner = getEffectiveTossWinner(match);
              const status = getEffectiveStatus(match);
              const isAbandoned = status === "abandoned";
              const manual = manualResults[fbKey(match.id)];
              const tossHappened = manual?.abandonedWithToss === true;
              return (
                <div key={match.id} style={{ ...S.card(), borderLeft: isAbandoned ? "3px solid #60A5FA" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: "#4A6080" }}>{fmtMatchDate(match.rawDate)}</span>
                    {isAbandoned ? (
                      <span style={{ fontSize: 11, color: "#60A5FA", fontWeight: 700 }}>
                        🌧️ Abandoned{tossHappened && tossWinner ? ` · 🪙 ${tossWinner} toss` : ""}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#FFD700", fontWeight: 700 }}>🏆 {winner} won{tossWinner ? ` · 🪙 ${tossWinner} toss` : ""}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <TeamBadge short={match.home} size={32} />
                    <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: isAbandoned ? "#60A5FA" : "#4A6080" }}>
                      {match.home} vs {match.away}
                      {isAbandoned && <div style={{ fontSize: 10, marginTop: 2 }}>{tossHappened ? "Toss happened before washout" : "Washed out before toss"}</div>}
                    </div>
                    <TeamBadge short={match.away} size={32} />
                  </div>
                  {!isAbandoned && winner && completedEspnByMatch[match.id] && (
                    <div
                      className="bz-scorecard-hit"
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setScorecardModalMatchId(match.id); } }}
                      onClick={() => setScorecardModalMatchId(match.id)}
                      style={{ marginBottom: 12, padding: "12px 10px", background: "#F8FAFC08", borderRadius: 10, border: "1px solid #243047", cursor: "pointer" }}
                    >
                      {completedEspnByMatch[match.id].metaLine?.trim() ? (
                        <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 10, lineHeight: 1.45 }}>{completedEspnByMatch[match.id].metaLine}</div>
                      ) : null}
                      {completedEspnByMatch[match.id].rows.map(row => (
                        <div key={`${match.id}-h-${row.abbr}-${row.main}`} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                            <TeamBadge short={row.abbr} size={26} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: row.winner ? 800 : 500, color: row.winner ? "#E2E8F8" : "#64748B" }}>{row.name}</div>
                              {row.extra ? (
                                <div style={{ fontSize: 9, fontWeight: row.winner ? 600 : 400, color: row.winner ? "#94A3B8" : "#64748B", marginTop: 2 }}>{row.extra}</div>
                              ) : null}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: row.winner ? 800 : 500, color: row.winner ? "#E2E8F8" : "#64748B", flexShrink: 0, textAlign: "right" }}>{row.main}</div>
                        </div>
                      ))}
                      {completedEspnByMatch[match.id].resultLine ? (
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#E2E8F8", marginTop: 6, paddingTop: 8, borderTop: "1px solid #1E293B" }}>{completedEspnByMatch[match.id].resultLine}</div>
                      ) : null}
                      <div style={{ fontSize: 9, color: "#60A5FA", marginTop: 6, fontWeight: 700 }}>Tap to open expanded scorecard ⤴</div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    {PLAYERS.map(p => {
                      const pb = bets[`${match.id}__${p}`];
                      const pt = tossGuesses[`${match.id}__${p}`];
                      let earned = 0;
                      let winOk = false;
                      let tossOk = false;
                      if (isAbandoned) {
                        // Abandoned: everyone gets +1, toss correct also gets +1 extra
                        earned = 1; // abandon point
                        if (tossHappened && tossWinner && pt === tossWinner) {
                          earned += 1; // toss point on top
                          tossOk = true;
                        }
                      } else {
                        winOk = pb === winner;
                        tossOk = tossWinner && pt === tossWinner;
                        earned = (winOk ? 2 : 0) + (tossOk ? 1 : 0);
                      }
                      const meta = PLAYER_META[p];
                      return (
                        <div key={p} style={{ flex: 1, background: "#060D1A", borderRadius: 10, padding: "10px 8px", border: `1px solid ${earned > 0 ? (isAbandoned ? "#60A5FA55" : meta.color + "55") : "#1A3050"}` }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><PlayerAvatarMark meta={meta} size={14} />{p}</div>
                          {!isAbandoned && (
                            <div style={{ fontSize: 10, color: "#4A6080" }}>Pick: <span style={{ color: winOk ? "#22C55E" : "#EF4444", fontWeight: 700, animation: winOk && !reduceMotion ? "correctPulse 1.7s ease-in-out infinite" : "none", display: "inline-block", padding: "0 2px", borderRadius: 4 }}>{pb || "—"}</span></div>
                          )}
                          {(tossWinner || isAbandoned) && tossHappened !== false && (
                            <div style={{ fontSize: 10, color: "#4A6080" }}>
                              Toss: <span style={{ color: tossOk ? "#22C55E" : isAbandoned ? "#4A6080" : "#EF4444", fontWeight: 700, animation: tossOk && !reduceMotion ? "correctPulse 1.7s ease-in-out infinite" : "none", display: "inline-block", padding: "0 2px", borderRadius: 4 }}>{pt || "—"}</span>
                            </div>
                          )}
                          {isAbandoned && <div style={{ fontSize: 9, color: "#60A5FA", marginTop: 2 }}>🌧️ +1 abandon{tossOk ? " +1 toss" : ""}</div>}
                          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: earned > 0 ? "#FFD700" : "#2A4060", marginTop: 4 }}>+{earned}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── STATS ── */}
        {!loading && tab === "stats" && (() => {
          const { enriched, h2h, total, weeklyInsights, weeklyMiniLeague, weeklyMiniHistory, weeklyTrophyCabinet, seasonAwards } = calcStats();

          // Build points progression data from completed matches
          const progressionData = (() => {
            const cum = { Nakel: 0, Mitthu: 0, Megs: 0 };
            const data = [{ label: "Start", Nakel: 0, Mitthu: 0, Megs: 0 }];
            completedMatches.forEach((match, i) => {
              const winner = getEffectiveWinner(match);
              const tossW  = getEffectiveTossWinner(match);
              const matchStatus = getEffectiveStatus(match);
              const isAband = matchStatus === "abandoned";
              const tossHappened = manualResults[fbKey(match.id)]?.abandonedWithToss === true;
              PLAYERS.forEach(p => {
                if (isAband) {
                  cum[p] += 1; // everyone gets +1 abandon
                  if (tossHappened && tossW && tossGuesses[`${match.id}__${p}`] === tossW) cum[p] += 1; // +1 toss on top
                } else {
                  if (bets[`${match.id}__${p}`] === winner) cum[p] += 2;
                  if (tossW && tossGuesses[`${match.id}__${p}`] === tossW) cum[p] += 1;
                }
              });
              data.push({
                label: `M${i + 1}`,
                matchInfo: `${match.home} vs ${match.away}`,
                date: fmtMatchDate(match.rawDate),
                Nakel:  cum.Nakel,
                Mitthu: cum.Mitthu,
                Megs:   cum.Megs,
              });
            });
            return data;
          })();

          const maxPts = Math.max(...progressionData.map(d => Math.max(d.Nakel, d.Mitthu, d.Megs)), 6);

          const GraphTooltip = ({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            return (
              <div style={{ background: "#0D1828", border: "1px solid #1A3050", borderRadius: 10, padding: "8px 12px", fontSize: 11 }}>
                {d?.matchInfo && <div style={{ color: "#4A6080", marginBottom: 5, fontWeight: 700 }}>{d.date} · {d.matchInfo}</div>}
                {payload.sort((a,b) => b.value - a.value).map(p => (
                  <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                    <span style={{ color: "#E2E8F8", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <PlayerAvatarMark meta={PLAYER_META[p.dataKey]} size={14} />
                      {p.dataKey}
                    </span>
                    <span style={{ color: p.color, fontWeight: 800, marginLeft: "auto", paddingLeft: 12 }}>{p.value} pts</span>
                  </div>
                ))}
              </div>
            );
          };

          return (
            <div>
              {/* Points Progression Graph */}
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:13, color:"#FFD700", fontWeight:800, marginBottom:4, letterSpacing:0.5 }}>📈 POINTS PROGRESSION</div>
              <div style={{ fontSize:11, color:"#4A6080", marginBottom:12 }}>
                {completedMatches.length === 0 ? "Graph will appear once matches are completed" : `After ${completedMatches.length} match${completedMatches.length > 1 ? "es" : ""}`}
              </div>

              {completedMatches.length === 0 ? (
                <div style={{ ...S.card(), textAlign:"center", padding:32, color:"#2A4060", marginBottom:16 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📈</div>
                  <div style={{ fontSize:12, fontWeight:700 }}>No data yet</div>
                  <div style={{ fontSize:10, marginTop:4 }}>Complete your first match to see the graph</div>
                </div>
              ) : (
                <div style={{ ...S.card(), padding:"16px 4px 10px", marginBottom:16 }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={progressionData} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A3050" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize:9, fill:"#4A6080" }} tickLine={false} axisLine={{ stroke:"#1A3050" }} />
                      <YAxis domain={[0, maxPts + 2]} tick={{ fontSize:9, fill:"#4A6080" }} tickLine={false} axisLine={false} tickCount={5} />
                      <Tooltip content={<GraphTooltip />} />
                      {PLAYERS.map(p => (
                        <Line
                          key={p}
                          type="monotone"
                          dataKey={p}
                          stroke={PLAYER_META[p].color}
                          strokeWidth={2.5}
                          isAnimationActive={uxMotionOn}
                          animationDuration={uxMotionOn ? 980 : 0}
                          animationEasing="ease-out"
                          dot={{ r:4, fill:PLAYER_META[p].color, stroke:"#060D1A", strokeWidth:2 }}
                          activeDot={{ r:6, fill:PLAYER_META[p].color, stroke:"#060D1A", strokeWidth:2 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  {/* Legend */}
                  <div style={{ display:"flex", justifyContent:"center", gap:16, marginTop:8 }}>
                    {PLAYERS.map(p => (
                      <div key={p} style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <div style={{ width:16, height:3, borderRadius:2, background:PLAYER_META[p].color }} />
                        <span style={{ fontSize:10, color:PLAYER_META[p].color, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><PlayerAvatarMark meta={PLAYER_META[p]} size={12} />{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Last 7 days (rolling window — distinct from Mon–Sun weekly mini league) */}
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,color:"#FFD700",fontWeight:800,marginBottom:4,letterSpacing:0.5}}>🗓 LAST 7 DAYS INSIGHTS</div>
              <div style={{ fontSize:11, color:"#4A6080", marginBottom:10 }}>
                Rolling 7-day window · {weeklyInsights.matchesCount} completed match{weeklyInsights.matchesCount === 1 ? "" : "es"}
              </div>
              {weeklyInsights.matchesCount === 0 ? (
                <div style={{ ...S.card(), textAlign:"center", color:"#4A6080", padding:24, marginBottom:16 }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>🗓</div>
                  <div style={{ fontSize:12, fontWeight:700 }}>No last 7 days insights yet</div>
                  <div style={{ fontSize:10, marginTop:4 }}>These appear once there are completed matches in the last 7 days.</div>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:10, marginBottom:16 }}>
                  <div style={{ ...S.card(PLAYER_META[weeklyInsights.playerOfWeek.player]?.color + "55"), marginBottom:0, padding:12 }}>
                    <div style={{ fontSize:10, color:"#4A6080", fontWeight:700, marginBottom:6 }}>🔥 MOST POINTS (7 DAYS)</div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:PLAYER_META[weeklyInsights.playerOfWeek.player]?.color }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><PlayerAvatarMark meta={PLAYER_META[weeklyInsights.playerOfWeek.player]} size={16} />{weeklyInsights.playerOfWeek.player}</span>
                      </div>
                      <div style={{ fontSize:14, color:"#FFD700", fontWeight:800 }}>+{weeklyInsights.playerOfWeek.points} pts</div>
                    </div>
                  </div>

                  <div style={{ ...S.card("#60A5FA55"), marginBottom:0, padding:12 }}>
                    <div style={{ fontSize:10, color:"#4A6080", fontWeight:700, marginBottom:6 }}>📈 BIGGEST CLIMBER (7 DAYS)</div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:PLAYER_META[weeklyInsights.biggestClimber.player]?.color }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><PlayerAvatarMark meta={PLAYER_META[weeklyInsights.biggestClimber.player]} size={16} />{weeklyInsights.biggestClimber.player}</span>
                      </div>
                      <div style={{ fontSize:12, color:"#93C5FD", fontWeight:800 }}>
                        {weeklyInsights.biggestClimber.climbed > 0
                          ? `#${weeklyInsights.biggestClimber.from} → #${weeklyInsights.biggestClimber.to}`
                          : "No rank jump in last 7 days"}
                      </div>
                    </div>
                  </div>

                  <div style={{ ...S.card("#FFD70055"), marginBottom:0, padding:12 }}>
                    <div style={{ fontSize:10, color:"#4A6080", fontWeight:700, marginBottom:6 }}>🪙 TOSS MASTER (7 DAYS)</div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:PLAYER_META[weeklyInsights.tossMaster.player]?.color }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><PlayerAvatarMark meta={PLAYER_META[weeklyInsights.tossMaster.player]} size={16} />{weeklyInsights.tossMaster.player}</span>
                      </div>
                      <div style={{ fontSize:12, color:"#FFD700", fontWeight:800 }}>
                        {weeklyInsights.tossMaster.correct}/{weeklyInsights.tossMaster.total || 0} correct
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Weekly mini league (Mon–Sun IST) */}
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, color: "#FFD700", fontWeight: 800, marginBottom: 4, letterSpacing: 0.5 }}>🏅 WEEKLY MINI LEAGUE</div>
              <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 10 }}>
                {weeklyMiniLeague.label} · Points match season rules · 🏆 Board still shows full season
              </div>
              {weeklyMiniLeague.matchesCount === 0 ? (
                <div style={{ ...S.card(), textAlign: "center", color: "#4A6080", padding: 22, marginBottom: 16 }}>
                  <div style={{ fontSize: 26, marginBottom: 6 }}>🏅</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>No completed fixtures this week yet</div>
                  <div style={{ fontSize: 10, marginTop: 4 }}>Mini league resets every Monday (IST).</div>
                </div>
              ) : (
                <div style={{ ...S.card("#FFD70022"), marginBottom: 16, padding: "12px 8px 14px", border: "1px solid #FFD70033" }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 8, marginBottom: 4 }}>
                    {[1, 0, 2].map(idx => {
                      const player = weeklyMiniLeague.ranked[idx];
                      const meta = PLAYER_META[player];
                      const miniRank = PLAYERS.filter(p => weeklyMiniLeague.pts[p] > weeklyMiniLeague.pts[player]).length + 1;
                      const podiumHeights = { 1: 76, 2: 60, 3: 46 };
                      const podiumH = podiumHeights[miniRank] || 46;
                      const isTop = miniRank === 1;
                      return (
                        <div key={`mini-${player}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <PlayerAvatarBubble meta={meta} size={isTop ? 26 : 20} border={2} />
                          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: isTop ? 12 : 10, color: meta.color, textAlign: "center", lineHeight: 1.2 }}>{player}</div>
                          <div style={{ fontSize: isTop ? 20 : 16, fontWeight: 900, color: "#FFD700", lineHeight: 1 }}>{weeklyMiniLeague.pts[player]}</div>
                          <div style={{ fontSize: 8, color: "#4A6080" }}>pts</div>
                          <div style={{
                            width: "100%",
                            height: podiumH,
                            borderRadius: "6px 6px 0 0",
                            background: `linear-gradient(180deg, ${meta.light} 0%, ${meta.color}11 100%)`,
                            border: `1px solid ${meta.color}44`,
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "center",
                            paddingTop: 6,
                            fontSize: 16,
                          }}>{getRankCrown(miniRank)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 9, color: "#2A4060", textAlign: "center", marginTop: 6 }}>
                    {weeklyMiniLeague.matchesCount} match{weeklyMiniLeague.matchesCount === 1 ? "" : "es"} counted · Fixture date in this IST week
                  </div>
                </div>
              )}

              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, color: "#FFD700", fontWeight: 800, marginBottom: 4, letterSpacing: 0.5, marginTop: weeklyMiniLeague.matchesCount === 0 ? 0 : 4 }}>📜 PAST WEEKLY WINNERS</div>
              <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 10 }}>
                Finished IST weeks (Mon–Sun) · Same scoring as mini league · Current week is above only
              </div>
              {weeklyMiniHistory.length === 0 ? (
                <div style={{ ...S.card(), textAlign: "center", color: "#4A6080", padding: 18, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>No completed weeks yet</div>
                  <div style={{ fontSize: 10, marginTop: 4 }}>Once the calendar moves past this IST Monday, last week&apos;s podium will show here.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {weeklyMiniHistory.map(w => (
                    <div key={w.startMs} style={{ ...S.card("#1A3050"), padding: "12px 14px", border: "1px solid #FFD70022" }}>
                      <div style={{ fontSize: 10, color: "#4A6080", fontWeight: 700, marginBottom: 8 }}>{w.label}</div>
                      <div style={{ fontSize: 9, color: "#2A4060", marginBottom: 8 }}>
                        {w.matchesCount} match{w.matchesCount === 1 ? "" : "es"}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {w.podium.map(slot => {
                          const meta = PLAYER_META[slot.player];
                          const medal = slot.rank === 1 ? "🥇" : slot.rank === 2 ? "🥈" : "🥉";
                          return (
                            <div key={slot.rank} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <span style={{ fontSize: 14 }}>{medal}</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: meta?.color || "#E2E8F8", display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <PlayerAvatarMark meta={meta} size={14} />
                                  {slot.player}
                                </span>
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 900, color: "#FFD700", flexShrink: 0 }}>{slot.pts} pts</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, color: "#FFD700", fontWeight: 800, marginBottom: 4, letterSpacing: 0.5 }}>🏆 WEEKLY TROPHY CABINET</div>
              <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 10 }}>
                Lifetime weekly medals (completed IST weeks only)
              </div>
              <div style={{ ...S.card("#FFD70022"), padding: "10px 8px", marginBottom: 16, border: "1px solid #FFD70033" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 48px 48px 48px 52px", gap: 6, padding: "0 6px 6px", fontSize: 9, color: "#4A6080", fontWeight: 700, letterSpacing: 0.4 }}>
                  <div>PLAYER</div><div style={{ textAlign: "center" }}>🥇</div><div style={{ textAlign: "center" }}>🥈</div><div style={{ textAlign: "center" }}>🥉</div><div style={{ textAlign: "center" }}>SCORE</div>
                </div>
                {[...PLAYERS]
                  .sort((a, b) =>
                    (weeklyTrophyCabinet[b].totalTrophies - weeklyTrophyCabinet[a].totalTrophies) ||
                    (weeklyTrophyCabinet[b].gold - weeklyTrophyCabinet[a].gold) ||
                    a.localeCompare(b)
                  )
                  .map(p => {
                    const meta = PLAYER_META[p];
                    const t = weeklyTrophyCabinet[p];
                    return (
                      <div key={`cabinet_${p}`} style={{ display: "grid", gridTemplateColumns: "1fr 48px 48px 48px 52px", gap: 6, alignItems: "center", padding: "7px 6px", borderTop: "1px solid #1A3050" }}>
                        <div style={{ fontSize: 12, color: meta.color, fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}><PlayerAvatarMark meta={meta} size={14} />{p}</div>
                        <div style={{ textAlign: "center", fontSize: 12, color: "#FCD34D", fontWeight: 800 }}>{t.gold}</div>
                        <div style={{ textAlign: "center", fontSize: 12, color: "#CBD5E1", fontWeight: 800 }}>{t.silver}</div>
                        <div style={{ textAlign: "center", fontSize: 12, color: "#FDBA74", fontWeight: 800 }}>{t.bronze}</div>
                        <div style={{ textAlign: "center", fontSize: 12, color: "#FFD700", fontWeight: 900 }}>{t.totalTrophies}</div>
                      </div>
                    );
                  })}
              </div>

              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, color: "#FFD700", fontWeight: 800, marginBottom: 4, letterSpacing: 0.5 }}>🎖 END-OF-SEASON AWARDS</div>
              <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 10 }}>
                Season-so-far leaderboard awards (auto updates after each result)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 16 }}>
                {seasonAwards.map(a => {
                  const meta = PLAYER_META[a.player];
                  return (
                    <div key={a.id} style={{ ...S.card(meta.color + "44"), marginBottom: 0, padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#4A6080", fontWeight: 700, marginBottom: 3 }}>{a.emoji} {a.title}</div>
                          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, color: meta.color, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}><PlayerAvatarMark meta={meta} size={16} />{a.player}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#FFD700", fontWeight: 800, textAlign: "right" }}>{a.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* IPL Points Table */}
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,color:"#FFD700",fontWeight:800,marginBottom:10,letterSpacing:0.5}}>🏏 IPL 2026 POINTS TABLE</div>
              <div style={{...S.card(),padding:0,overflow:"hidden",marginBottom:16}}>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  {/* Fixed px columns only — avoid fit-content/minmax(fit) here; some mobile engines invalidate the whole grid → one column stack */}
                  <div style={{ minWidth: 458 }}>
                    <div style={{background:"#0A1420",padding:"8px 10px",display:"grid",gridTemplateColumns:"16px 72px 22px 22px 22px 20px 46px 28px 168px",gap:2,fontSize:9,fontWeight:700,color:"#4A6080",letterSpacing:0.5,alignItems:"center"}}>
                      <div>#</div><div>TEAM</div><div style={{textAlign:"center"}}>P</div><div style={{textAlign:"center"}}>W</div><div style={{textAlign:"center"}}>L</div><div style={{textAlign:"center",color:"#60A5FA"}}>NR</div><div style={{textAlign:"center"}}>NRR</div><div style={{textAlign:"center"}}>PTS</div><div style={{textAlign:"center"}}>FORM</div>
                    </div>
                    {[...iplTable].sort((a,b)=>b.pts-a.pts||parseFloat(b.nrr)-parseFloat(a.nrr)).map((row,i)=>{
                      const t = IPL_TEAMS[row.team];
                      const isTop4 = i < 4;
                      const formCells = getIplTeamFormLastN(row.team, 10);
                      return (
                        <div key={row.team} style={{padding:"8px 10px",display:"grid",gridTemplateColumns:"16px 72px 22px 22px 22px 20px 46px 28px 168px",gap:2,alignItems:"center",borderTop:"1px solid #0A1420",background:isTop4?"#FFD70008":"transparent"}}>
                          <div style={{fontSize:11,fontWeight:800,color:isTop4?"#FFD700":"#4A6080",textAlign:"right",paddingRight:1}}>{i+1}</div>
                          <div style={{display:"flex",alignItems:"center",gap:4,minWidth:0,overflow:"hidden"}}>
                            <div style={{width:20,height:20,borderRadius:"50%",background:t?.color||"#1A3050",border:`1px solid ${t?.accent||"#2A4060"}`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {t?.logo ? <img src={t.logo} style={{width:"85%",height:"85%",objectFit:"contain"}} alt={row.team}/> : <span style={{fontSize:7,fontWeight:800,color:t?.accent}}>{row.team}</span>}
                            </div>
                            <span style={{fontSize:10,fontWeight:700,color:"#E2E8F8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{row.team}</span>
                          </div>
                          <div style={{fontSize:11,color:"#7A90B0",textAlign:"center"}}>{row.played}</div>
                          <div style={{fontSize:11,color:"#22C55E",textAlign:"center",fontWeight:700}}>{row.won}</div>
                          <div style={{fontSize:11,color:"#EF4444",textAlign:"center"}}>{row.lost}</div>
                          <div style={{fontSize:11,fontWeight:800,color:"#60A5FA",textAlign:"center"}}>{row.nr||0}</div>
                          <div style={{fontSize:10,color:"#7A90B0",textAlign:"center"}}>{row.nrr}</div>
                          <div style={{fontSize:12,fontWeight:800,color:"#FFD700",textAlign:"center"}}>{(row.won*2)+(row.nr||0)}</div>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:2, flexWrap:"nowrap", paddingLeft: 2, minWidth: 0 }}>
                            {formCells.map((cell, fi) => (
                              <span
                                key={fi}
                                title={cell === "W" ? "Win" : cell === "L" ? "Loss" : cell === "wash" ? "No result" : "—"}
                                style={{
                                  fontSize: 7,
                                  fontWeight: 800,
                                  width: 14,
                                  height: 14,
                                  borderRadius: 3,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  background:
                                    cell === "W" ? "#14532D55" : cell === "L" ? "#7F1D1D55" : cell === "wash" ? "#1E3A5F55" : "#0A1420",
                                  color: cell === "W" ? "#22C55E" : cell === "L" ? "#FCA5A5" : cell === "wash" ? "#93C5FD" : "#4A6080",
                                  border: `1px solid ${cell === "W" ? "#22C55E44" : cell === "L" ? "#EF444444" : cell === "wash" ? "#60A5FA44" : "#1A3050"}`,
                                }}
                              >
                                {cell === "W" ? "W" : cell === "L" ? "L" : cell === "wash" ? "◎" : "—"}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{padding:"6px 12px",fontSize:9,color:"#2A4060",borderTop:"1px solid #0A1420",textAlign:"center",lineHeight:1.5}}>
                  🟡 Top 4 qualify · Form = last 10 league games (newest first) · Playoffs auto-fill from table after {IPL_LEAGUE_MATCH_COUNT} league results · Swipe for FORM
                </div>
              </div>



              {/* Betting Analytics */}
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,color:"#FFD700",fontWeight:800,marginBottom:10,letterSpacing:0.5}}>🎯 BETTING ANALYTICS</div>
              {total === 0 ? (
                <div style={{...S.card(),textAlign:"center",color:"#4A6080",padding:30}}>
                  <div style={{fontSize:30,marginBottom:8}}>📊</div>
                  <div>Stats appear after the first completed match!</div>
                </div>
              ) : PLAYERS.map(p => {
                const s = enriched[p];
                const meta = PLAYER_META[p];
                return (
                  <div key={p} style={{...S.card(meta.color+"44"),marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <PlayerAvatarBubble meta={meta} size={40} border={2} />
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:meta.color}}>{p}</div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#4A6080",marginBottom:4}}>
                        <span>🏆 Match accuracy</span>
                        <span style={{color:meta.color,fontWeight:700}}>{s.winPct}% ({s.winPicks}/{s.totalPicks})</span>
                      </div>
                      <div style={{height:6,background:"#0A1420",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${s.winPct}%`,background:`linear-gradient(90deg,${meta.color},${meta.color}88)`,borderRadius:3}}/>
                      </div>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#4A6080",marginBottom:4}}>
                        <span>🪙 Toss accuracy</span>
                        <span style={{color:"#FFD700",fontWeight:700}}>{s.tossPct}% ({s.tossPicks}/{s.totalToss})</span>
                      </div>
                      <div style={{height:6,background:"#0A1420",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${s.tossPct}%`,background:"linear-gradient(90deg,#FFD700,#FFD70088)",borderRadius:3}}/>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <div style={{background:"#0A1420",borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:9,color:"#4A6080",marginBottom:2}}>🔥 BEST STREAK</div>
                        <div style={{fontSize:18,fontWeight:800,color:meta.color}}>{s.maxStreak}</div>
                      </div>
                      <div style={{background:"#0A1420",borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:9,color:"#4A6080",marginBottom:2}}>⚡ CURRENT STREAK</div>
                        <div style={{fontSize:18,fontWeight:800,color:s.streak>0?"#22C55E":"#EF4444"}}>{s.streak}</div>
                      </div>
                      <div style={{background:"#0A1420",borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:9,color:"#4A6080",marginBottom:2}}>❤️ FAV TEAM</div>
                        <div style={{fontSize:13,fontWeight:800,color:IPL_TEAMS[s.favTeam]?.color||"#E2E8F8"}}>{s.favTeam||"—"}</div>
                      </div>
                      <div style={{background:"#0A1420",borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:9,color:"#4A6080",marginBottom:2}}>🍀 LUCKY TEAM</div>
                        <div style={{fontSize:13,fontWeight:800,color:IPL_TEAMS[s.luckyTeam]?.color||"#E2E8F8"}}>{s.luckyTeam||"—"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Head to Head */}
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,color:"#FFD700",fontWeight:800,marginBottom:10,marginTop:4,letterSpacing:0.5}}>⚔️ HEAD TO HEAD</div>
              {total === 0 ? (
                <div style={{...S.card(),textAlign:"center",color:"#4A6080",padding:30}}>H2H stats appear after first match!</div>
              ) : [[PLAYERS[0],PLAYERS[1]],[PLAYERS[0],PLAYERS[2]],[PLAYERS[1],PLAYERS[2]]].map(([p1,p2])=>{
                const key=`${p1}v${p2}`;
                const d=h2h[key];
                const tot=d.p1wins+d.p2wins+d.draws;
                const p1pct=tot>0?Math.round((d.p1wins/tot)*100):50;
                const p2pct=tot>0?Math.round((d.p2wins/tot)*100):50;
                const m1=PLAYER_META[p1],m2=PLAYER_META[p2];
                return(
                  <div key={key} style={{...S.card(),marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <PlayerAvatarMark meta={m1} size={22} />
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,color:m1.color}}>{p1}</div>
                      </div>
                      <div style={{fontSize:11,color:"#4A6080",fontWeight:700}}>VS</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,color:m2.color}}>{p2}</div>
                        <PlayerAvatarMark meta={m2} size={22} />
                      </div>
                    </div>
                    <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",marginBottom:8}}>
                      <div style={{width:`${p1pct}%`,background:m1.color}}/>
                      <div style={{width:`${p2pct}%`,background:m2.color}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700}}>
                      <span style={{color:m1.color}}>{d.p1wins}W</span>
                      <span style={{color:"#4A6080",fontSize:10}}>{d.draws} draws</span>
                      <span style={{color:m2.color}}>{d.p2wins}W</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── SPY LOG ── */}
        {!loading && tab === "spylog" && (
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:13, color:"#FFD700", fontWeight:800, marginBottom:4, letterSpacing:0.5 }}>🕵️ PEEK LOG</div>
            <div style={{ fontSize:11, color:"#4A6080", marginBottom:16 }}>Who's been snooping on others' picks? 👀</div>

            {spyLog.length === 0 ? (
              <div style={{ ...S.card(), textAlign:"center", padding:40, color:"#4A6080" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🕵️</div>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>All clean so far! 🎉</div>
                <div style={{ fontSize:11, lineHeight:1.6 }}>Log only records:<br/>👁️ Peeking at others picks<br/>⚠️ Device mismatches</div>
              </div>
            ) : (
              <div>
                {/* Summary pills */}
                <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                  {PLAYERS.map(p => {
                    const peeks     = spyLog.filter(e => e.player === p && e.type === "peek").length;
                    const mismatches = spyLog.filter(e => e.player === p && e.type === "identity_confirm").length;
                    const meta = PLAYER_META[p];
                    return (
                      <div key={p} style={{ flex:1, background: meta.light, border:`1px solid ${meta.color}44`, borderRadius:12, padding:"10px 8px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center" }}>
                        <PlayerAvatarBubble meta={meta} size={36} border={2} />
                        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:12, color:meta.color, marginTop:4 }}>{p}</div>
                        <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:2 }}>
                          <div style={{ fontSize:9, color:"#FF6B2B" }}>👁️ {peeks} peeks</div>
                          <div style={{ fontSize:9, color:"#EF4444" }}>⚠️ {mismatches} mismatches</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Log entries */}
                {spyLog.map((entry, i) => {
                  const meta = PLAYER_META[entry.player] || { emoji:"❓", color:"#7A90B0", light:"#7A90B018" };
                  const typeConfig = {
                    peek:             { icon:"👁️", label:"peeked at others' picks for", color:"#FF6B2B", bg:"#FF6B2B18" },
                    identity_confirm: { icon:"⚠️", label:"claimed to be",               color:"#EF4444", bg:"#EF444418" },
                  };
                  const tc = typeConfig[entry.type] || typeConfig.peek;
                  return (
                    <div key={entry.id || i} style={{ ...S.card(meta.color+"33"), marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:10, background:tc.bg, color:tc.color, border:`1px solid ${tc.color}44` }}>
                          {tc.icon} {entry.type === "identity_confirm" ? "⚠️ IDENTITY MISMATCH" : "👁️ PEEKED AT PICKS"}
                        </span>
                        <span style={{ fontSize:10, color:"#4A6080" }}>🕐 {fmtLogTime(entry.timestamp)}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <PlayerAvatarBubble meta={meta} size={38} border={2} />
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:13, color:meta.color }}>{entry.player}</span>
                            <span style={{ fontSize:11, color:"#4A6080" }}>{tc.label}</span>
                            {entry.type === "identity_confirm" ? (
                              <span style={{ fontSize:12, fontWeight:700, color:"#22C55E" }}>{entry.claimedAs}</span>
                            ) : (
                              <span style={{ fontSize:12, fontWeight:700, color:"#E2E8F8" }}>{entry.home} vs {entry.away}</span>
                            )}
                          </div>
                          {entry.type === "identity_confirm" && (
                            <div style={{ fontSize:10, color:"#4A6080", marginTop:2 }}>for match: {entry.home} vs {entry.away}</div>
                          )}
                          {entry.mismatch && (
                            <div style={{ marginTop:6, padding:"6px 10px", borderRadius:8, background:"#7F1D1D33", border:"1px solid #EF444466", fontSize:10, color:"#EF4444", fontWeight:700 }}>
                              ⚠️ MISMATCH! Claimed <b>{entry.claimedAs}</b> but device = <b>{entry.likelyUser}</b>!
                            </div>
                          )}
                          {entry.likelyUser && !entry.mismatch && (
                            <div style={{ marginTop:5, fontSize:9, color:"#22C55E", fontWeight:700 }}>
                              🎯 Device matches {entry.likelyUser}'s profile ✓
                            </div>
                          )}
                          {!entry.likelyUser && (
                            <div style={{ marginTop:5, fontSize:9, color:"#4A6080", fontStyle:"italic" }}>❓ Unknown device profile</div>
                          )}
                          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:6 }}>
                            <span style={{ fontSize:9, background:"#0A1420", color:"#4A6080", padding:"2px 7px", borderRadius:10, border:"1px solid #1A3050" }}>
                              {entry.deviceType || "📱 Phone"}
                            </span>
                            <span style={{ fontSize:9, background:"#0A1420", color:"#4A6080", padding:"2px 7px", borderRadius:10, border:"1px solid #1A3050" }}>
                              {entry.browser || "Chrome"} · {entry.os || "Android"}
                            </span>
                            <span style={{ fontSize:9, background:"#0A1420", color:"#4A6080", padding:"2px 7px", borderRadius:10, border:"1px solid #1A3050" }}>
                              🌍 {entry.timezone || "Asia/Kolkata"}
                            </span>
                            <span style={{ fontSize:9, background:"#0A1420", color:"#4A6080", padding:"2px 7px", borderRadius:10, border:"1px solid #1A3050" }}>
                              ⏰ {entry.localTime || "—"} local
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize:24 }}>{tc.icon}</div>
                      </div>
                    </div>
                  );
                })}

                                {/* Clear log button — admin only */}
                {adminMode && (
                  <button onClick={() => set(ref(db,"spyLog"), null)}
                    style={{ width:"100%", padding:"10px", borderRadius:10, border:"1px solid #7F1D1D55", background:"transparent", color:"#EF444488", fontSize:11, cursor:"pointer", marginTop:8 }}>
                    🗑️ Clear spy log (Admin only)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SQUAD ── */}
        {!loading && tab === "squad" && (() => {
          const squad = IPL_SQUADS[selectedTeam];
          const teamMeta = IPL_TEAMS[selectedTeam];
          const roleOrder = ["WK-Batter","Batter","All-Rounder","Bowler"];
          const roleColors = {
            "WK-Batter":  { bg:"#F59E0B18", color:"#F59E0B", icon:"🧤" },
            "Batter":     { bg:"#22C55E18", color:"#22C55E", icon:"🏏" },
            "All-Rounder":{ bg:"#00C2FF18", color:"#00C2FF", icon:"⭐" },
            "Bowler":     { bg:"#EF444418", color:"#EF4444", icon:"🎯" },
          };
          const grouped = roleOrder.reduce((acc, role) => {
            const players = squad.players.filter(p => p.role === role);
            if (players.length) acc[role] = players;
            return acc;
          }, {});
          return (
            <div>
              {/* Team selector */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#4A6080", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>SELECT TEAM</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Object.keys(IPL_SQUADS).map(t => (
                    <button key={t} onClick={() => setSelectedTeam(t)}
                      style={{ padding: "7px 12px", borderRadius: 20, border: `2px solid ${selectedTeam === t ? IPL_TEAMS[t]?.color || "#FF6B2B" : "#1A3050"}`, background: selectedTeam === t ? (IPL_TEAMS[t]?.color || "#FF6B2B") + "22" : "#0A1420", color: selectedTeam === t ? IPL_TEAMS[t]?.color || "#FF6B2B" : "#4A6080", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      <TeamBadge short={t} size={20} />
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Team header */}
              <div style={{ ...S.card(teamMeta?.color + "33"), marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
                <TeamBadge short={selectedTeam} size={56} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: teamMeta?.color || "#fff" }}>{teamMeta?.name || selectedTeam}</div>
                  <div style={{ fontSize: 11, color: "#7A90B0", marginTop: 3 }}>👑 Captain: <span style={{ color: "#FFD700", fontWeight: 700 }}>{squad.captain}</span></div>
                  <div style={{ fontSize: 11, color: "#7A90B0", marginTop: 2 }}>🎓 Coach: <span style={{ color: "#E2E8F8" }}>{squad.coach}</span></div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "#0A1420", color: "#4A6080", border: "1px solid #1A3050" }}>
                      🌏 Overseas: {squad.players.filter(p => p.isOverseas).length}
                    </span>
                    <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "#0A1420", color: "#4A6080", border: "1px solid #1A3050" }}>
                      🏏 Total: {squad.players.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Role legend */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {Object.entries(roleColors).map(([role, rc]) => (
                  <span key={role} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: rc.bg, color: rc.color, border: `1px solid ${rc.color}44`, fontWeight: 700 }}>
                    {rc.icon} {role}
                  </span>
                ))}
              </div>

              {/* Players grouped by role */}
              {Object.entries(grouped).map(([role, players]) => {
                const rc = roleColors[role];
                return (
                  <div key={role} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: rc.color, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{rc.icon}</span> {role.toUpperCase()} ({players.length})
                    </div>
                    {players.map(p => (
                      <div key={p.name} style={{ background: "#0D1828", border: `1px solid ${p.isCap ? teamMeta?.color + "66" : "#1A3050"}`, borderRadius: 12, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Avatar circle */}
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: rc.bg, border: `2px solid ${rc.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                          {rc.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: p.isCap ? teamMeta?.color : "#E2E8F8" }}>{p.name}</span>
                            {p.isCap && <span style={{ fontSize: 9, background: teamMeta?.color + "33", color: teamMeta?.color, padding: "1px 6px", borderRadius: 8, fontWeight: 700, border: `1px solid ${teamMeta?.color}55` }}>C</span>}
                            {p.isOverseas && <span style={{ fontSize: 9, background: "#A855F718", color: "#A855F7", padding: "1px 6px", borderRadius: 8, fontWeight: 700, border: "1px solid #A855F744" }}>🌏</span>}
                          </div>
                          <div style={{ fontSize: 10, color: "#4A6080", marginTop: 2 }}>{p.country}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#FFD700" }}>{p.cap}</div>
                          <div style={{ fontSize: 9, color: "#4A6080", marginTop: 1 }}>price</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── CHAT ── */}
        {!loading && tab === "chat" && (() => {
          const meta = chatSender ? PLAYER_META[chatSender] : null;

          function sendMessage() {
            if (!chatInput.trim()) return;
            const info = getPlatformInfo();
            const sender = chatSender || info.likelyUser || "Unknown";
            const ts = Date.now();
            const msg = {
              id: ts,
              sender,
              text: chatInput.trim(),
              timestamp: ts,
              deviceType: info.deviceType,
              timezone: info.timezone,
              likelyUser: info.likelyUser || "Unknown",
            };
            // Attach reply context if replying
            if (replyTo) {
              msg.replyToId = replyTo.id;
              msg.replyToSender = replyTo.sender;
              msg.replyToText = replyTo.text.length > 60 ? replyTo.text.slice(0, 60) + "…" : replyTo.text;
            }
            set(ref(db, `chat/${ts}`), msg);
            setChatInput("");
            setReplyTo(null);
            const now2 = Date.now();
            setLastSeenChat(now2);
            try { localStorage.setItem("betzone_lastSeenChat", now2.toString()); } catch {}
            requestAnimationFrame(() => {
              const el = chatScrollRef.current;
              if (!el) return;
              el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
              try { localStorage.setItem(CHAT_SCROLL_TOP_KEY, String(el.scrollTop)); } catch {}
            });
          }

          function deleteMessage(msgId) {
            set(ref(db, `chat/${msgId}`), null);
          }

          function addReaction(msgId, emoji) {
            const sender = chatSender || "Unknown";
            const key = `chat/${msgId}/reactions/${emoji}/${sender}`;
            // Toggle: if already reacted remove it, else add it
            const existing = chatMessages.find(m => m.id === msgId);
            const alreadyReacted = existing?.reactions?.[emoji]?.[sender];
            if (alreadyReacted) {
              set(ref(db, key), null);
            } else {
              set(ref(db, key), true);
            }
            setReactionPicker(null);
          }

          function fmtChatTime(ts) {
            const d = new Date(ts);
            const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
            const isIndia = localTZ.includes("Kolkata") || localTZ.includes("India");
            const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
            const ist = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
            if (isIndia) return `${date} · ${time} IST`;
            return `${date} · ${time} (${ist} IST)`;
          }

          // Group messages by date
          const groupedMsgs = chatMessages.reduce((acc, msg) => {
            const day = new Date(msg.timestamp).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
            if (!acc[day]) acc[day] = [];
            acc[day].push(msg);
            return acc;
          }, {});

          return (
            <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
              {/* Header */}
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:13, color:"#FFD700", fontWeight:800, marginBottom:4, letterSpacing:0.5 }}>💬 BETZONE CHAT</div>
              <div style={{ fontSize:11, color:"#4A6080", marginBottom:12 }}>Trash talk, banter and predictions 🔥</div>

              {/* Sender identity */}
              <div style={{ background:"#0D1828", border:`1px solid ${meta ? meta.color + "44" : "#1A3050"}`, borderRadius:12, padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
                {meta ? (
                  <>
                    <PlayerAvatarBubble meta={meta} size={36} border={2} />
                    <div>
                      <div style={{ fontSize:12, fontWeight:800, color:meta.color }}>Chatting as {chatSender}</div>
                      <div style={{ fontSize:10, color:"#4A6080" }}>Auto-detected from your device 🎯</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:"#1A3050", border:"2px solid #2A4060", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>❓</div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:800, color:"#7A90B0" }}>Unknown device</div>
                      <div style={{ fontSize:10, color:"#4A6080" }}>Select your name below to chat</div>
                    </div>
                  </>
                )}
                {/* Override sender */}
                <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                  {PLAYERS.map(p => (
                    <button key={p} type="button" onClick={() => setChatSender(p)}
                      style={{ width:28, height:28, borderRadius:"50%", border:`2px solid ${chatSender === p ? PLAYER_META[p].color : "#1A3050"}`, background:chatSender === p ? PLAYER_META[p].light : "#0A1420", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding: 0, overflow:"hidden" }}>
                      <PlayerAvatarBubble meta={PLAYER_META[p]} size={26} border={0} bgLight={false} style={{ border: "none", width: 26, height: 26 }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Messages — scroll position persisted per device (betzone_chatScrollTop) */}
              <div ref={chatScrollRef} style={{ flex:1, overflowY:"auto", marginBottom:12 }} onScroll={schedulePersistChatScroll} onClick={() => setLongPressMsg(null)}>
                {chatMessages.length === 0 ? (
                  <div style={{ textAlign:"center", padding:40, color:"#2A4060" }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>💬</div>
                    <div style={{ fontWeight:700, fontSize:14, color:"#4A6080" }}>No messages yet!</div>
                    <div style={{ fontSize:11, marginTop:6 }}>Start the trash talk 🔥</div>
                  </div>
                ) : (
                  Object.entries(groupedMsgs).map(([day, msgs]) => (
                    <div key={day}>
                      {/* Date divider */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, margin:"12px 0 8px" }}>
                        <div style={{ flex:1, height:1, background:"#1A3050" }} />
                        <div style={{ fontSize:9, color:"#2A4060", fontWeight:700, letterSpacing:0.5 }}>{day}</div>
                        <div style={{ flex:1, height:1, background:"#1A3050" }} />
                      </div>
                      {msgs.map(msg => {
                        const senderMeta = PLAYER_META[msg.sender] || { emoji:"❓", color:"#7A90B0", light:"#7A90B018" };
                        const isMe = msg.sender === chatSender;
                        const mismatch = msg.likelyUser && msg.likelyUser !== "Unknown" && msg.likelyUser !== msg.sender;
                        const reactions = msg.reactions || {};
                        const showMenu = longPressMsg === msg.id;

                        const startLongPress = () => {
                          longPressTimer.current = setTimeout(() => setLongPressMsg(msg.id), 450);
                        };
                        const cancelLongPress = () => {
                          clearTimeout(longPressTimer.current);
                        };

                        const rowPulse = chatPulseById[msg.id] ? uxMotion(uxMotionOn, "bzChatPulse 1s ease-out 1 forwards") : "none";
                        return (
                          <div key={msg.id} style={{ marginBottom:14, position:"relative", animation: rowPulse }}>

                            {/* Context menu — shown on long press */}
                            {showMenu && (
                              <div style={{ position:"absolute", [isMe ? "right" : "left"]:0, top:-56, zIndex:200, background:"#0D1828", border:"1px solid #1A3050", borderRadius:16, padding:"8px 6px", boxShadow:"0 8px 30px #000c", display:"flex", flexDirection:"column", gap:2, minWidth:140 }}
                                onClick={e => e.stopPropagation()}>
                                {/* Emoji reactions row */}
                                <div style={{ display:"flex", gap:4, padding:"4px 6px", borderBottom:"1px solid #1A3050", marginBottom:2 }}>
                                  {["👍","❤️","😂","😮","😢","🔥"].map(emoji => (
                                    <button key={emoji} onClick={() => { addReaction(msg.id, emoji); setLongPressMsg(null); }}
                                      style={{ background: reactions[emoji]?.[chatSender] ? senderMeta.color + "33" : "transparent", border:"none", fontSize:20, cursor:"pointer", borderRadius:8, padding:"3px", transform: reactions[emoji]?.[chatSender] ? "scale(1.2)" : "scale(1)" }}>
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                                {/* Reply option */}
                                <button onClick={() => { setReplyTo({ id: msg.id, sender: msg.sender, text: msg.text }); setLongPressMsg(null); }}
                                  style={{ background:"transparent", border:"none", color:"#E2E8F8", fontSize:13, cursor:"pointer", padding:"8px 12px", textAlign:"left", display:"flex", alignItems:"center", gap:8, borderRadius:8 }}>
                                  <span style={{ fontSize:16 }}>↩</span> Reply
                                </button>
                                {/* Delete option — own messages or admin */}
                                {(isMe || adminMode) && (
                                  <button onClick={() => { deleteMessage(msg.id); setLongPressMsg(null); }}
                                    style={{ background:"transparent", border:"none", color:"#EF4444", fontSize:13, cursor:"pointer", padding:"8px 12px", textAlign:"left", display:"flex", alignItems:"center", gap:8, borderRadius:8 }}>
                                    <span style={{ fontSize:16 }}>🗑</span> Delete
                                  </button>
                                )}
                              </div>
                            )}

                            <div style={{ display:"flex", flexDirection:isMe ? "row-reverse" : "row", alignItems:"flex-end", gap:8 }}>
                              {/* Avatar */}
                              <PlayerAvatarBubble meta={senderMeta} size={30} border={2} />

                              {/* Bubble column */}
                              <div style={{ maxWidth:"75%", display:"flex", flexDirection:"column", alignItems:isMe ? "flex-end" : "flex-start" }}>
                                {/* Sender + time */}
                                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                                  {!isMe && <span style={{ fontSize:10, fontWeight:700, color:senderMeta.color }}>{msg.sender}</span>}
                                  <span style={{ fontSize:9, color:"#2A4060" }}>{fmtChatTime(msg.timestamp)}</span>
                                  {mismatch && <span style={{ fontSize:9, color:"#EF4444" }}>⚠️</span>}
                                </div>

                                {/* Reply quote block */}
                                {msg.replyToId && (
                                  <div style={{ background:"#0A1420", border:"1px solid #1A3050", borderLeft:`3px solid ${PLAYER_META[msg.replyToSender]?.color || "#4A6080"}`, borderRadius:8, padding:"5px 10px", marginBottom:4, maxWidth:"100%", opacity:0.8 }}>
                                    <div style={{ fontSize:9, fontWeight:700, color:PLAYER_META[msg.replyToSender]?.color || "#4A6080", marginBottom:2 }}>
                                      ↩ {msg.replyToSender}
                                    </div>
                                    <div style={{ fontSize:10, color:"#7A90B0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                                      {msg.replyToText}
                                    </div>
                                  </div>
                                )}

                                {/* Message bubble — long press triggers menu */}
                                <div
                                  onTouchStart={startLongPress}
                                  onTouchEnd={cancelLongPress}
                                  onTouchMove={cancelLongPress}
                                  onMouseDown={startLongPress}
                                  onMouseUp={cancelLongPress}
                                  onMouseLeave={cancelLongPress}
                                  onContextMenu={e => e.preventDefault()}
                                  style={{ background:isMe ? senderMeta.color + "22" : "#0D1828", border:`1px solid ${showMenu ? senderMeta.color : isMe ? senderMeta.color + "55" : "#1A3050"}`, borderRadius:isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding:"9px 13px", fontSize:13, color:"#E2E8F8", lineHeight:1.5, wordBreak:"break-word", userSelect:"none", WebkitUserSelect:"none", WebkitTouchCallout:"none", cursor:"pointer", transition:"border .15s", boxShadow: showMenu ? `0 0 0 2px ${senderMeta.color}44` : "none" }}>
                                  {msg.text}
                                </div>

                                {/* Reaction pills */}
                                {Object.keys(reactions).length > 0 && (
                                  <div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                                    {Object.entries(reactions).map(([emoji, reactors]) => {
                                      const count = Object.keys(reactors).length;
                                      const iReacted = reactors[chatSender];
                                      return (
                                        <button key={emoji} onClick={() => addReaction(msg.id, emoji)}
                                          style={{ background:iReacted ? senderMeta.color + "22" : "#0A1420", border:`1px solid ${iReacted ? senderMeta.color + "66" : "#1A3050"}`, borderRadius:20, padding:"2px 8px", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:3 }}>
                                          {emoji}
                                          {count > 1 && <span style={{ fontSize:9, color:"#7A90B0", fontWeight:700 }}>{count}</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                <div style={{ fontSize:9, color:"#2A4060", marginTop:3 }}>{msg.deviceType}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Reply preview bar */}
              {replyTo && (
                <div style={{
                  background:"#0A1420",
                  border:"1px solid #1A3050",
                  borderLeft:`3px solid ${PLAYER_META[replyTo.sender]?.color || "#4A6080"}`,
                  borderRadius:"8px 8px 0 0",
                  padding:"8px 12px",
                  display:"flex",
                  alignItems:"center",
                  gap:8,
                  marginBottom:-1,
                  animation: uxMotion(uxMotionOn, "bzFadeInUp .26s cubic-bezier(.22,1,.36,1) both"),
                }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:PLAYER_META[replyTo.sender]?.color || "#4A6080", marginBottom:2 }}>
                      ↩ Replying to {replyTo.sender}
                    </div>
                    <div style={{ fontSize:11, color:"#7A90B0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {replyTo.text}
                    </div>
                  </div>
                  <button onClick={() => setReplyTo(null)}
                    style={{ background:"transparent", border:"none", color:"#4A6080", fontSize:16, cursor:"pointer", flexShrink:0, lineHeight:1 }}>✕</button>
                </div>
              )}

              {/* Input bar */}
              <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}
                onClick={() => setLongPressMsg(null)}>
                <div style={{ flex:1, background:"#0D1828", border:`1px solid ${meta ? meta.color + "44" : "#1A3050"}`, borderRadius: replyTo ? "0 0 14px 14px" : 14, padding:"10px 14px", display:"flex", alignItems:"center" }}>
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
                    placeholder={chatSender ? (replyTo ? `Reply to ${replyTo.sender}...` : `Say something, ${chatSender}... 🔥`) : "Select your name above first"}
                    disabled={!chatSender}
                    rows={1}
                    style={{ flex:1, background:"transparent", border:"none", outline:"none", color:"#E2E8F8", fontSize:13, resize:"none", fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}
                  />
                </div>
                <button onClick={sendMessage} disabled={!chatInput.trim() || !chatSender}
                  style={{ width:44, height:44, borderRadius:"50%", border:"none", background:meta ? meta.color : "#1A3050", color:"#fff", fontSize:18, cursor:chatInput.trim() && chatSender ? "pointer" : "default", opacity:chatInput.trim() && chatSender ? 1 : 0.4, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  ➤
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── ADMIN ── */}
        {!loading && tab === "admin" && adminMode && (
          <div>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#FF6B2B" }}>⚙️ Admin Panel</div>
              <div style={{ fontSize: 10, color: "#2A4060" }}>secret mode 🤫</div>
            </div>

            {/* Quick guide */}
            <div style={{ background: "#0A1420", border: "1px solid #1A3050", borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 11, color: "#4A6080", lineHeight: 1.8 }}>
              <div style={{ color: "#FFD700", fontWeight: 700, marginBottom: 4 }}>HOW TO USE</div>
              <div>1️⃣ When match starts → tap <b style={{color:"#EF4444"}}>🔒 Lock Bets</b> to stop new bets</div>
              <div>2️⃣ Set toss winner after the coin toss</div>
              <div>3️⃣ After match ends → tap the winning team to award points</div>
              <div>4️⃣ Points update instantly on all 3 phones ✅</div>
            </div>

            {/* Playoffs — IPL bracket is derived automatically from the league table */}
            <div style={{ background: "#0A1420", border: "1px solid #FFD70033", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, color: "#FFD700", fontWeight: 800, marginBottom: 8 }}>🏆 Playoffs (knockouts)</div>
              <div style={{ fontSize: 11, color: "#7A90B0", lineHeight: 1.65, marginBottom: 10 }}>
                After <b>all {IPL_LEAGUE_MATCH_COUNT} league games</b> are resulted, <b>Qualifier 1</b> (1st vs 2nd) and the <b>Eliminator</b> (3rd vs 4th) are built from the points table (pts, then NRR).
                <b>Qualifier 2</b> (loser Q1 vs winner Elim) and the <b>Final</b> (winner Q1 vs winner Q2) appear once you set winners on those earlier playoff rows below — same Admin flow as league games.
                Default knockout slots live in <span style={{ color: "#93C5FD", fontWeight: 700 }}>IPL_2026_PLAYOFF_SCHEDULE</span> at the top of App.jsx (edit when BCCI confirms).
                <b> League P/W/L auto-sync and Stats form ignore playoffs.</b>
              </div>
              <div style={{ fontSize: 11, color: matches.some(m => m.stage === "playoff") ? "#22C55E" : "#4A6080", fontWeight: 700, marginBottom: 4 }}>
                {matches.filter(m => m.stage === "playoff").length === 0
                  ? `0 playoff rows yet — complete all ${IPL_LEAGUE_MATCH_COUNT} league matches first (and sync the table so top 4 is correct).`
                  : `${matches.filter(m => m.stage === "playoff").length} playoff fixture(s) — review here, then confirm each one so betting unlocks.`}
              </div>

              {matches.filter(m => m.stage === "playoff").length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #FFD70022" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#F59E0B", marginBottom: 8 }}>✏️ Playoff fixture review</div>
                  <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 12, lineHeight: 1.55 }}>
                    Override teams, venue, or start time if auto-detection is wrong. <b style={{ color: "#E2E8F8" }}>Bets stay locked until you confirm</b> below. Tab out of fields so changes save before you confirm. Use <b>Revoke</b> to lock again while you fix details.
                  </div>
                  {matches.filter(m => m.stage === "playoff").map(match => {
                    const rowKey = fbKey(match.id);
                    const o = playoffAdmin[rowKey] || {};
                    const autoH = match.playoffAutoHome ?? match.home;
                    const autoA = match.playoffAutoAway ?? match.away;
                    const defVenue = match.playoffDefaultVenue ?? match.venue ?? "";
                    const defRaw = match.playoffDefaultRawDate || match.rawDate;
                    const defLocal = isoToDatetimeLocal(defRaw);
                    const confirmed = o.confirmed === true;
                    const teamOpts = Object.keys(IPL_TEAMS).sort();
                    const homeSel = o.home != null && String(o.home).trim() !== "" ? String(o.home).trim() : "__AUTO__";
                    const awaySel = o.away != null && String(o.away).trim() !== "" ? String(o.away).trim() : "__AUTO__";

                    return (
                      <div key={match.id} style={{ background: "#060D14", border: "1px solid #1A3050", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F8" }}>{match.playoffRound || "Playoff"}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 20, background: confirmed ? "#14532D33" : "#42200633", color: confirmed ? "#4ADE80" : "#FBBF24", border: `1px solid ${confirmed ? "#22C55E44" : "#F59E0B44"}` }}>
                            {confirmed ? "✅ Betting open" : "🔒 Awaiting confirmation"}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "#93C5FD", marginBottom: 10, fontWeight: 700 }}>
                          Table seed: {autoH} vs {autoA} → shown as <b style={{ color: "#E2E8F8" }}>{match.home}</b> vs <b style={{ color: "#E2E8F8" }}>{match.away}</b>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 4, fontWeight: 700 }}>Home</div>
                            <select
                              value={homeSel}
                              onChange={e => {
                                const v = e.target.value;
                                update(ref(db, `playoffAdmin/${rowKey}`), { home: v === "__AUTO__" ? null : v });
                              }}
                              style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #1A3050", background: "#0A1420", color: "#E2E8F8", fontSize: 12, boxSizing: "border-box" }}
                            >
                              <option value="__AUTO__">Auto ({autoH})</option>
                              {teamOpts.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 4, fontWeight: 700 }}>Away</div>
                            <select
                              value={awaySel}
                              onChange={e => {
                                const v = e.target.value;
                                update(ref(db, `playoffAdmin/${rowKey}`), { away: v === "__AUTO__" ? null : v });
                              }}
                              style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #1A3050", background: "#0A1420", color: "#E2E8F8", fontSize: 12, boxSizing: "border-box" }}
                            >
                              <option value="__AUTO__">Auto ({autoA})</option>
                              {teamOpts.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 4, fontWeight: 700 }}>Venue</div>
                          <input
                            type="text"
                            defaultValue={match.venue}
                            key={`${rowKey}-venue-${match.venue}`}
                            placeholder={defVenue}
                            onBlur={e => {
                              const v = e.target.value.trim();
                              update(ref(db, `playoffAdmin/${rowKey}`), { venue: !v || v === defVenue ? null : v });
                            }}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #1A3050", background: "#0A1420", color: "#E2E8F8", fontSize: 12, boxSizing: "border-box" }}
                          />
                          <div style={{ fontSize: 9, color: "#2A4060", marginTop: 3 }}>Schedule default: {defVenue}</div>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 4, fontWeight: 700 }}>Date &amp; time</div>
                          <input
                            type="datetime-local"
                            defaultValue={isoToDatetimeLocal(o.rawDate || defRaw)}
                            key={`${rowKey}-dt-${o.rawDate ?? defRaw}`}
                            onBlur={e => {
                              const v = e.target.value;
                              if (!v || v === defLocal) {
                                update(ref(db, `playoffAdmin/${rowKey}`), { rawDate: null });
                                return;
                              }
                              const iso = datetimeLocalToIso(v);
                              update(ref(db, `playoffAdmin/${rowKey}`), { rawDate: iso || null });
                            }}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #1A3050", background: "#0A1420", color: "#E2E8F8", fontSize: 12, boxSizing: "border-box" }}
                          />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {!confirmed ? (
                            <button
                              type="button"
                              onClick={() => update(ref(db, `playoffAdmin/${rowKey}`), { confirmed: true })}
                              style={{ ...S.btn("#15803D", "#fff"), width: "100%", fontSize: 12 }}
                            >
                              ✅ Confirm fixture — open betting
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => update(ref(db, `playoffAdmin/${rowKey}`), { confirmed: false })}
                              style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #F59E0B55", background: "#42200622", color: "#FBBF24", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                            >
                              🔒 Revoke confirmation — lock betting for edits
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => update(ref(db, `playoffAdmin/${rowKey}`), { home: null, away: null, venue: null, rawDate: null })}
                            style={{ width: "100%", padding: "7px", borderRadius: 8, border: "1px solid #1A3050", background: "transparent", color: "#4A6080", fontSize: 11, cursor: "pointer" }}
                          >
                            ↩ Clear overrides (revert to table + schedule)
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active matches first; completed folded away — expand to fix results */}
            {(() => {
              function renderAdminMatchCard(match) {
                const status = getEffectiveStatus(match);
                const manual = manualResults[fbKey(match.id)] || {};
                const winner = getEffectiveWinner(match);
                const isLocked = status === "live" || status === "completed";

                const statusConfig = {
                  upcoming:  { label: "🕐 Upcoming",  color: "#FF6B2B", bg: "#FF6B2B18" },
                  live:      { label: "🔴 Live",      color: "#EF4444", bg: "#EF444418" },
                  completed: { label: "✅ Done",       color: "#22C55E", bg: "#22C55E18" },
                  abandoned: { label: "🌧️ Abandoned", color: "#60A5FA", bg: "#60A5FA18" },
                }[status] || { label: status, color: "#7A90B0", bg: "#1A3050" };

                return (
                  <div key={match.id} style={{ ...S.card(isLocked ? "#1A3050" : "#1A3050"), marginBottom: 10, opacity: status === "completed" ? 0.85 : 1, borderLeft: match.stage === "playoff" ? "3px solid #FFD70088" : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <TeamBadge short={match.home} size={28} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#E2E8F8" }}>vs</span>
                        <TeamBadge short={match.away} size={28} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F8" }}>{match.home} v {match.away}</span>
                        {match.stage === "playoff" && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#FFD700", padding: "2px 8px", borderRadius: 10, background: "#FFD70018", border: "1px solid #FFD70044" }}>
                            🏆 {match.playoffRound || "Playoff"}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: statusConfig.bg, color: statusConfig.color }}>
                        {statusConfig.label}
                      </div>
                    </div>

                    <div style={{ fontSize: 10, color: "#2A4060", marginBottom: 10 }}>
                      📅 {fmtMatchDate(match.rawDate)} · {fmtMatchTime(match.rawDate)} · {match.venue.split(",")[0]}
                    </div>

                    {status !== "abandoned" && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 9, color: "#4A6080", marginBottom: 4, fontWeight: 700 }}>📡 ESPN game ID (optional — live scores & match-detail card when finished)</div>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="From URL …/game/1529287/…"
                          value={manual.espnEventId ?? ""}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, "");
                            update(ref(db, `manualResults/${fbKey(match.id)}`), { espnEventId: v || null });
                          }}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #1A3050",
                            background: "#0A1420",
                            color: "#E2E8F8",
                            fontSize: 12,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    )}

                    {status === "completed" && winner && (
                      <div style={{ background: "#14532D22", border: "1px solid #22C55E33", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#22C55E", fontWeight: 700 }}>
                        🏆 {winner} won · {manual.tossWinner ? `🪙 Toss: ${manual.tossWinner}` : "Toss not set"}
                      </div>
                    )}

                    {status === "completed" && (
                      <div style={{ marginBottom: 10, paddingTop: 10, borderTop: "1px solid #1A3050" }}>
                        <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 6, fontWeight: 700 }}>✏️ Correct result (updates points)</div>
                        <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 5, fontWeight: 700, letterSpacing: 0.3 }}>🪙 TOSS WINNER:</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          {[match.home, match.away].map(team => (
                            <button key={team}
                              onClick={() => setManualResult(match.id, manual.winner || winner, team, "completed")}
                              style={{ ...S.pill(manual.tossWinner === team, "#FFD700"), fontSize: 12 }}>
                              {manual.tossWinner === team ? "✅ " : "🪙 "}{team}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 5, fontWeight: 700, letterSpacing: 0.3 }}>🏆 MATCH WINNER:</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          {[match.home, match.away].map(team => (
                            <button key={team}
                              onClick={() => setManualResult(match.id, team, manual.tossWinner || null, "completed")}
                              style={{ ...S.pill(manual.winner === team, "#22C55E"), fontSize: 12 }}>
                              {manual.winner === team ? "✅ " : "🏏 "}{team}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {status !== "completed" && (
                      <div>
                        {status === "upcoming" && (
                          <button onClick={() => setManualResult(match.id, null, null, "live")}
                            style={{ ...S.btn("#7F1D1D", "#FCA5A5"), width: "100%", marginBottom: 8, fontSize: 12 }}>
                            🔒 Lock Bets — Match Has Started
                          </button>
                        )}

                        {status === "live" && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ background: "#7F1D1D18", border: "1px solid #EF444433", borderRadius: 8, padding: "8px 12px", marginBottom: 6, fontSize: 11, color: "#FCA5A5" }}>
                              {manual.autoLocked ? (
                                <span>⚡ Auto-locked 1 hour before match · Set winner below when done</span>
                              ) : (
                                <span>🔴 Manually locked · Set winner below when done</span>
                              )}
                            </div>
                            <button onClick={() => update(ref(db, `manualResults/${fbKey(match.id)}`), {
                                status: "upcoming",
                                autoLocked: false,
                              })}
                              style={{ width: "100%", padding: "7px", borderRadius: 8, border: "1px solid #FFD70055", background: "#FFD70011", color: "#FFD700", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              🔓 Unlock Bets (Admin Override)
                            </button>
                          </div>
                        )}

                        <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 5, fontWeight: 700, letterSpacing: 0.3 }}>🪙 TOSS WINNER:</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          {[match.home, match.away].map(team => (
                            <button key={team}
                              onClick={() => setManualResult(match.id, manual.winner || null, team, manual.status || status)}
                              style={{ ...S.pill(manual.tossWinner === team, "#FFD700"), fontSize: 12 }}>
                              {manual.tossWinner === team ? "✅ " : "🪙 "}{team}
                            </button>
                          ))}
                        </div>

                        <div style={{ fontSize: 10, color: "#4A6080", marginBottom: 5, fontWeight: 700, letterSpacing: 0.3 }}>🏆 MATCH WINNER:</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          {[match.home, match.away].map(team => (
                            <button key={team}
                              onClick={() => setManualResult(match.id, team, manual.tossWinner || null, "completed")}
                              style={{ ...S.pill(manual.winner === team, "#22C55E"), fontSize: 12 }}>
                              {manual.winner === team ? "✅ " : "🏏 "}{team}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {status !== "abandoned" && status !== "completed" && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: "#4A6080", marginBottom: 6, fontWeight: 700, letterSpacing: 0.3 }}>🌧️ MATCH ABANDONED / WASHOUT:</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => update(ref(db, `manualResults/${fbKey(match.id)}`), { status: "abandoned", abandonedWithToss: false })}
                            style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #60A5FA55", background: "#60A5FA11", color: "#60A5FA", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            🌧️ Wash Before Toss<br/><span style={{ fontSize: 9, fontWeight: 400, color: "#4A6080" }}>+1 everyone</span>
                          </button>
                          <button onClick={() => update(ref(db, `manualResults/${fbKey(match.id)}`), { status: "abandoned", abandonedWithToss: true, tossWinner: manual.tossWinner || null })}
                            style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #60A5FA55", background: "#60A5FA11", color: "#60A5FA", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            🌧️ Wash After Toss<br/><span style={{ fontSize: 9, fontWeight: 400, color: "#4A6080" }}>set toss winner below</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {status === "abandoned" && (
                      <div style={{ background: "#60A5FA11", border: "1px solid #60A5FA44", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 11, color: "#60A5FA", fontWeight: 700 }}>
                        🌧️ Match abandoned — {manual.abandonedWithToss ? "toss had happened (+1 toss correct, +1 all others)" : "+1 point awarded to everyone"}
                      </div>
                    )}

                    {(manual.winner || manual.status === "live" || manual.status === "abandoned") && (
                      <button onClick={() => set(ref(db, `manualResults/${fbKey(match.id)}`), null)}
                        style={{ width: "100%", padding: "7px", borderRadius: 8, border: "1px solid #7F1D1D55", background: "transparent", color: "#EF444488", fontSize: 11, cursor: "pointer" }}>
                        ↩ Reset this match
                      </button>
                    )}
                  </div>
                );
              }

              const adminActive = matches.filter(m => {
                const s = getEffectiveStatus(m);
                return s === "upcoming" || s === "live";
              });
              const adminFinished = matches.filter(m => {
                const s = getEffectiveStatus(m);
                return s === "completed" || s === "abandoned";
              });

              return (
                <>
                  {adminActive.map(renderAdminMatchCard)}
                  <details style={{ marginBottom: 16 }}>
                    <summary style={{
                      cursor: "pointer",
                      listStyle: "none",
                      background: "#0A1420",
                      border: "1px solid #1A3050",
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontFamily: "'Syne',sans-serif",
                      fontSize: 12,
                      color: "#22C55E",
                      fontWeight: 800,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}>
                      <span>✅ Finished matches (done & washouts) — tap to expand</span>
                      <span style={{ fontSize: 10, color: "#4A6080" }}>{adminFinished.length}</span>
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      {adminFinished.length === 0 ? (
                        <div style={{ ...S.card(), textAlign: "center", color: "#4A6080", fontSize: 11 }}>
                          No finished matches yet.
                        </div>
                      ) : (
                        adminFinished.map(renderAdminMatchCard)
                      )}
                    </div>
                  </details>
                </>
              );
            })()}

            {/* IPL Table Editor */}
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,color:"#FFD700",fontWeight:800,margin:"16px 0 6px",letterSpacing:0.5}}>🏏 IPL TEAM STANDINGS</div>

            {/* Auto-calculate from match results */}
            {(() => {
              // League stage only — playoff knockouts do not change league P/W/L
              const standing = {};
              const ALL_TEAMS = ["RCB","MI","CSK","KKR","SRH","DC","RR","PBKS","LSG","GT"];
              ALL_TEAMS.forEach(t => { standing[t] = { played:0, won:0, lost:0, nr:0 }; });

              completedLeagueMatches.forEach(match => {
                const status = getEffectiveStatus(match);
                const winner = getEffectiveWinner(match);
                const isAbandoned = status === "abandoned";
                const h = match.home, a = match.away;
                if (!standing[h] || !standing[a]) return;

                if (isAbandoned) {
                  standing[h].played++; standing[h].nr++;
                  standing[a].played++; standing[a].nr++;
                } else if (winner) {
                  const loser = winner === h ? a : h;
                  standing[winner].played++; standing[winner].won++;
                  standing[loser].played++;  standing[loser].lost++;
                }
              });

              // Sync computed values into iplTable (keep NRR manual)
              const syncTable = () => {
                const updated = iplTable.map(row => {
                  const s = standing[row.team];
                  if (!s) return row;
                  return {
                    ...row,
                    played: s.played,
                    won:    s.won,
                    lost:   s.lost,
                    nr:     s.nr,
                    pts:    (s.won * 2) + s.nr,
                  };
                });
                setIplTable(updated);
                set(ref(db, "iplTable"), updated);
                notify("✅ Standings auto-calculated from match results!");
              };

              async function applyNrrFromWikipedia() {
                setNrrFetchBusy(true);
                try {
                  const { year, nrrMap } = await fetchIplNrrMapFromWikipedia();
                  const updated = iplTable.map(row => {
                    const nrr = nrrMap[row.team];
                    return nrr != null ? { ...row, nrr } : row;
                  });
                  setIplTable(updated);
                  await set(ref(db, "iplTable"), updated);
                  notify(`✅ NRR updated from Wikipedia (${year} IPL points table)`, "success");
                } catch (e) {
                  notify(e?.message || "NRR fetch failed — edit manually.", "error");
                } finally {
                  setNrrFetchBusy(false);
                }
              }

              return (
                <div>
                  {/* Auto-calculate + NRR fetch */}
                  <div style={{marginBottom:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button onClick={syncTable}
                      style={{flex:1,minWidth:140,padding:"10px",borderRadius:10,border:"1px solid #22C55E55",background:"#22C55E11",color:"#22C55E",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      🔄 Auto-calculate from {completedLeagueMatches.length} league results
                    </button>
                    <button type="button" disabled={nrrFetchBusy} onClick={() => { void applyNrrFromWikipedia(); }}
                      style={{flex:1,minWidth:140,padding:"10px",borderRadius:10,border:"1px solid #60A5FA55",background:nrrFetchBusy?"#1A3050":"#60A5FA11",color:nrrFetchBusy?"#4A6080":"#93C5FD",fontSize:12,fontWeight:700,cursor:nrrFetchBusy?"default":"pointer",opacity:nrrFetchBusy?0.65:1}}>
                      {nrrFetchBusy ? "⏳ Fetching NRR…" : "🌐 Fetch NRR (Wikipedia)"}
                    </button>
                  </div>
                  <div style={{fontSize:9,color:"#4A6080",marginBottom:10,padding:"6px 10px",background:"#0A1420",borderRadius:8,lineHeight:1.6}}>
                    ✅ P / W / L / NR / PTS from your match results · 🌐 NRR tries Wikipedia for{" "}
                    <span style={{ fontWeight: 800, color: "#93C5FD" }}>this year first</span>
                    {" "}({new Date().getFullYear()}), then the two prior seasons if the page/table is missing; only NRR cells change. If fetch fails, edit the yellow fields manually.
                  </div>

                  {/* Table */}
                  <div style={{...S.card(),padding:0,overflow:"hidden",marginBottom:12}}>
                    <div style={{background:"#0A1420",padding:"8px 12px",display:"grid",gridTemplateColumns:"1fr 30px 30px 30px 30px 60px 36px",gap:6,fontSize:9,fontWeight:700,color:"#4A6080"}}>
                      <div>TEAM</div>
                      <div style={{textAlign:"center"}}>P</div>
                      <div style={{textAlign:"center"}}>W</div>
                      <div style={{textAlign:"center"}}>L</div>
                      <div style={{textAlign:"center",color:"#60A5FA"}}>NR</div>
                      <div style={{textAlign:"center"}}>NRR</div>
                      <div style={{textAlign:"center"}}>PTS</div>
                    </div>
                    {iplTable.map((row,i) => {
                      const s = standing[row.team] || {played:0,won:0,lost:0,nr:0};
                      const pts = (s.won * 2) + s.nr;
                      return (
                        <div key={row.team} style={{padding:"6px 12px",display:"grid",gridTemplateColumns:"1fr 30px 30px 30px 30px 60px 36px",gap:6,alignItems:"center",borderTop:"1px solid #0A1420"}}>
                          <div style={{fontSize:11,fontWeight:700,color:IPL_TEAMS[row.team]?.color||"#E2E8F8",display:"flex",alignItems:"center",gap:5}}>
                            <div style={{width:16,height:16,borderRadius:"50%",overflow:"hidden",flexShrink:0}}>
                              <img src={IPL_TEAMS[row.team]?.logo} style={{width:"100%",height:"100%",objectFit:"contain"}} />
                            </div>
                            {row.team}
                          </div>
                          {/* Auto-calculated read-only fields */}
                          <div style={{textAlign:"center",fontSize:11,color:"#7A90B0"}}>{s.played}</div>
                          <div style={{textAlign:"center",fontSize:11,color:"#22C55E",fontWeight:700}}>{s.won}</div>
                          <div style={{textAlign:"center",fontSize:11,color:"#EF4444"}}>{s.lost}</div>
                          <div style={{textAlign:"center",fontSize:11,color:"#60A5FA",fontWeight:700}}>{s.nr}</div>
                          {/* NRR — only manual field */}
                          <input type="text"
                            value={row.nrr}
                            onChange={e => {
                              const updated = iplTable.map((r,j) => j===i ? {...r, nrr: e.target.value} : r);
                              setIplTable(updated);
                              set(ref(db,"iplTable"), updated);
                            }}
                            placeholder="+0.000"
                            style={{width:"100%",background:"#0A1420",border:"1px solid #FFD70044",borderRadius:6,color:"#FFD700",fontSize:11,padding:"4px",textAlign:"center"}}
                          />
                          <div style={{textAlign:"center",fontSize:12,fontWeight:800,color:"#FFD700"}}>{pts}</div>
                        </div>
                      );
                    })}
                    <div style={{padding:"8px 12px",fontSize:9,color:"#2A4060",borderTop:"1px solid #0A1420",textAlign:"center"}}>
                      P/W/L/NR/PTS auto-calculated · NRR: use 🌐 Fetch or edit yellow cells manually
                    </div>
                  </div>
                </div>
              );
            })()}
            <button onClick={() => { setAdminMode(false); setTab("leaderboard"); }}
              style={{ ...S.btn("#1A3050", "#7A90B0"), width: "100%", marginTop: 8 }}>
              ← Exit Admin
            </button>
          </div>
        )}
      </div>

      {/* ── ESPN SCORECARD MODAL (PHASE 1) ── */}
      {scorecardModalMatchId && (() => {
        const m = matches.find(x => x.id === scorecardModalMatchId);
        const sc = completedEspnByMatch[scorecardModalMatchId];
        if (!m) return null;
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "#000000CC",
              zIndex: 9998,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              padding: 10,
              animation: uxMotion(uxMotionOn, "bzBackdropIn .28s ease-out forwards"),
            }}
            onClick={() => setScorecardModalMatchId(null)}
          >
            <div
              style={{
                background: "#0D1828",
                border: "1px solid #1A3050",
                borderRadius: "18px 18px 0 0",
                width: "100%",
                maxWidth: 640,
                maxHeight: "85vh",
                overflowY: "auto",
                padding: 14,
                animation: uxMotion(uxMotionOn, "bzSheetUp .42s cubic-bezier(.22,1,.36,1) forwards"),
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, color: "#93C5FD", fontWeight: 800 }}>📄 ESPN SCORECARD</div>
                  <div style={{ fontSize: 11, color: "#E2E8F8", marginTop: 2, fontWeight: 700 }}>{m.home} vs {m.away}</div>
                  <div style={{ fontSize: 9, color: "#4A6080", marginTop: 2 }}>{fmtMatchDate(m.rawDate)} · {m.venue?.split(",")[0]}</div>
                </div>
                <button
                  onClick={() => setScorecardModalMatchId(null)}
                  style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #1A3050", background: "#0A1420", color: "#94A3B8", cursor: "pointer", fontSize: 16 }}
                  aria-label="Close scorecard"
                >
                  ×
                </button>
              </div>

              {!sc ? (
                <div style={{ ...S.card(), marginBottom: 0, textAlign: "center", color: "#4A6080", padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Scorecard not available yet</div>
                  <div style={{ fontSize: 10, marginTop: 6 }}>Set ESPN game ID in Admin (or wait for auto-match) and try again.</div>
                </div>
              ) : (
                <div style={{ marginBottom: 4, padding: "12px 10px", background: "#F8FAFC08", borderRadius: 10, border: "1px solid #243047" }}>
                  {sc.metaLine?.trim() ? (
                    <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 10, lineHeight: 1.45 }}>{sc.metaLine}</div>
                  ) : null}
                  {sc.rows.map(row => (
                    <div key={`${scorecardModalMatchId}-modal-${row.abbr}-${row.main}`} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                        <TeamBadge short={row.abbr} size={26} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: row.winner ? 800 : 500, color: row.winner ? "#E2E8F8" : "#64748B" }}>{row.name}</div>
                          {row.extra ? (
                            <div style={{ fontSize: 9, fontWeight: row.winner ? 600 : 400, color: row.winner ? "#94A3B8" : "#64748B", marginTop: 2 }}>{row.extra}</div>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: row.winner ? 800 : 500, color: row.winner ? "#E2E8F8" : "#64748B", flexShrink: 0, textAlign: "right" }}>{row.main}</div>
                    </div>
                  ))}
                  {sc.resultLine ? (
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#E2E8F8", marginTop: 6, paddingTop: 8, borderTop: "1px solid #1E293B" }}>{sc.resultLine}</div>
                  ) : null}
                  {(sc.topBatters?.length > 0 || sc.topBowlers?.length > 0) && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1E293B" }}>
                      {sc.topBatters?.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: "#4A6080", fontWeight: 700, marginBottom: 5 }}>🏏 TOP BATTERS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {sc.topBatters.map((x, i) => (
                              <div key={`tb_${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                                <span style={{ color: "#E2E8F8" }}>{x.team ? `${x.team} · ` : ""}{x.name}</span>
                                <span style={{ color: "#93C5FD", fontWeight: 700 }}>{x.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {sc.topBowlers?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: "#4A6080", fontWeight: 700, marginBottom: 5 }}>🎯 TOP BOWLERS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {sc.topBowlers.map((x, i) => (
                              <div key={`tbw_${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                                <span style={{ color: "#E2E8F8" }}>{x.team ? `${x.team} · ` : ""}{x.name}</span>
                                <span style={{ color: "#FCA5A5", fontWeight: 700 }}>{x.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── AVATAR PICKER MODAL ── */}
      {avatarPicker && (() => {
        const p = avatarPicker;
        const meta = PLAYER_META[p];
        const current = customAvatars[p] || DEFAULT_AVATARS[p] || { emoji: meta.emoji, colorIdx: 0 };
        function persistAvatar(patch) {
          const next = { ...current, ...patch };
          delete next.animUrl;
          next.colorIdx = next.colorIdx ?? 0;
          next.emoji = next.emoji || meta.emoji;
          set(ref(db, `avatars/${p}`), next);
          setCustomAvatars(prev => ({ ...prev, [p]: next }));
        }
        const pickedColorIdx = current.colorIdx ?? 0;
        const previewColor = AVATAR_COLORS[pickedColorIdx] || AVATAR_COLORS[0];
        const previewMeta = { emoji: current.emoji, light: previewColor.light, color: previewColor.color };
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "#000000DD",
              zIndex: 9999,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              animation: uxMotion(uxMotionOn, "bzBackdropIn .28s ease-out forwards"),
            }}
            onClick={() => setAvatarPicker(null)}>
            <div
              style={{
                background: "#0D1828",
                border: "1px solid #1A3050",
                borderRadius: "20px 20px 0 0",
                padding: "20px 16px",
                width: "100%",
                maxWidth: 480,
                maxHeight: "85vh",
                overflowY: "auto",
                overflowX: "hidden",
                boxSizing: "border-box",
                animation: uxMotion(uxMotionOn, "bzSheetUp .42s cubic-bezier(.22,1,.36,1) forwards"),
              }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#E2E8F8" }}>
                  ✏️ Customise Avatar
                </div>
                <button onClick={() => setAvatarPicker(null)}
                  style={{ background: "#1A3050", border: "none", borderRadius: 20, padding: "4px 12px", color: "#7A90B0", cursor: "pointer", fontSize: 12 }}>
                  Done
                </button>
              </div>

              {/* Preview */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, background: "#0A1420", borderRadius: 14, padding: "14px 16px" }}>
                <PlayerAvatarBubble meta={previewMeta} size={56} border={3} borderColor={previewColor.color} />
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: previewColor.color }}>{p}</div>
                  <div style={{ fontSize: 11, color: "#4A6080", marginTop: 2 }}>Pick an emoji and a ring colour.</div>
                </div>
              </div>

              {/* Emoji picker — categorised */}
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 11, color: "#4A6080", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>CHOOSE EMOJI</div>
              {[
                { label: "😀 Smileys & Faces",  range: [0,   38] },
                { label: "🎉 Celebrations",      range: [38,  57] },
                { label: "🔥 Fire & Power",      range: [57,  67] },
                { label: "🐾 Animals",           range: [67,  87] },
                { label: "👐 Hands & People",    range: [87, 107] },
                { label: "🌈 Extra",             range: [107, 127] },
              ].map(cat => (
                <div key={cat.label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#4A6080", fontWeight: 700, marginBottom: 6 }}>{cat.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
                    {AVATAR_EMOJI_LIST.slice(cat.range[0], cat.range[1]).map(emoji => {
                      const active = current.emoji === emoji;
                      return (
                        <LottieEmojiTile key={emoji} emoji={emoji} size={28} active={active}
                          accentColor={previewColor.color}
                          onClick={() => persistAvatar({ emoji })} />
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Colour picker */}
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 11, color: "#4A6080", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>CHOOSE COLOUR THEME</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 8 }}>
                {AVATAR_COLORS.map((theme, idx) => (
                  <button key={idx} type="button" onClick={() => persistAvatar({ colorIdx: idx })}
                    style={{ padding: "10px 4px", borderRadius: 10, border: `2px solid ${pickedColorIdx === idx ? theme.color : "#1A3050"}`, background: pickedColorIdx === idx ? theme.light : "#0A1420", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: theme.color }} />
                    <div style={{ fontSize: 8, color: pickedColorIdx === idx ? theme.color : "#4A6080", fontWeight: 700 }}>{theme.name}</div>
                  </button>
                ))}
              </div>

              {/* Reset */}
              <button onClick={() => {
                set(ref(db, `avatars/${p}`), null);
                setCustomAvatars(prev => { const n = {...prev}; delete n[p]; return n; });
              }}
                style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #1A3050", background: "transparent", color: "#4A6080", fontSize: 11, cursor: "pointer", marginTop: 4 }}>
                ↩ Reset to default
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── MATCH OPEN CONFIRMATION ── */}
      {matchConfirm && (() => {
        const m = matches.find(x => x.id === matchConfirm);
        const meta = PLAYER_META[selectedPlayer];
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "#000000CC",
              zIndex: 9998,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              animation: uxMotion(uxMotionOn, "bzBackdropIn .26s ease-out forwards"),
            }}>
            <div style={{
              background: "#0D1828",
              border: `1px solid ${meta.color}44`,
              borderRadius: 20,
              padding: 24,
              maxWidth: 320,
              width: "100%",
              boxShadow: "0 20px 60px #000",
              animation: uxMotion(uxMotionOn, "bzPopIn .32s cubic-bezier(.22,1,.36,1) forwards"),
            }}>
              {/* Player avatar */}
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ margin: "0 auto", width: 64, height: 64 }}>
                  <PlayerAvatarBubble meta={meta} size={64} border={3} />
                </div>
              </div>
              {/* Title */}
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: "#E2E8F8", textAlign: "center", marginBottom: 4 }}>
                Betting as
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: meta.color, textAlign: "center", marginBottom: 16 }}>
                {selectedPlayer}
              </div>
              {/* Match info */}
              <div style={{ background: "#0A1420", borderRadius: 12, padding: "12px 16px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 8 }}>You are placing bets for</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <TeamBadge short={m?.home} size={36} />
                  <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: "#FF6B2B" }}>VS</span>
                  <TeamBadge short={m?.away} size={36} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F8", marginTop: 8 }}>{m?.home} vs {m?.away}</div>
                <div style={{ fontSize: 10, color: "#4A6080", marginTop: 4 }}>📅 {m?.date} · {m?.time}</div>
              </div>
              {/* Warning */}
              <div style={{ fontSize: 11, color: "#4A6080", textAlign: "center", marginBottom: 18, lineHeight: 1.6 }}>
                Not you? Switch your name at the top before continuing.
              </div>
              {/* Buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setMatchConfirm(null)}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #1A3050", background: "#0A1420", color: "#7A90B0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  ✗ Cancel
                </button>
                <button onClick={() => {
                  const m = matches.find(x => x.id === matchConfirm);
                  if (m) {
                    // Only log if device profile doesn't match claimed identity (mismatch)
                    const info = getPlatformInfo();
                    const isMismatch = info.likelyUser && info.likelyUser !== selectedPlayer;
                    if (isMismatch) {
                      logAction("identity_confirm", m.id, m.home, m.away, selectedPlayer);
                    }
                  }
                  setExpandedMatch(matchConfirm);
                  setMatchConfirm(null);
                }}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: meta.color, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  ✓ Yes, it's me!
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
