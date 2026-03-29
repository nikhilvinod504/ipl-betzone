import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";

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

// ─── CricketData API ───────────────────────────────────────────────
// CricketData API removed — all results managed manually via Admin panel

// ─── Constants ─────────────────────────────────────────────────────
const PLAYERS = ["Nakel", "Mitthu", "Megs"];
const PLAYER_META = {
  Nakel:  { emoji: "🦁", color: "#FF6B2B", light: "#FF6B2B18" },
  Mitthu: { emoji: "🐯", color: "#00C2FF", light: "#00C2FF18" },
  Megs:   { emoji: "🦅", color: "#A855F7", light: "#A855F718" },
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
const S = {
  app: {
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    background: "#060D1A",
    minHeight: "100vh",
    color: "#E2E8F8",
  },
  header: {
    background: "linear-gradient(135deg, #0A1628 0%, #0F2040 50%, #0A1628 100%)",
    borderBottom: "1px solid #1A3050",
    padding: "14px 18px",
  },
  tabBar: {
    background: "#080F1E",
    borderBottom: "1px solid #1A3050",
    display: "flex",
    padding: "0 18px",
  },
  tab: (active) => ({
    flex: 1,
    padding: "11px 4px",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid #FF6B2B" : "2px solid transparent",
    color: active ? "#FF6B2B" : "#4A6080",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 0.3,
    transition: "all .18s",
  }),
  card: (border = "#1A3050") => ({
    background: "#0D1828",
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
    transition: "opacity .15s",
  }),
  pill: (active, accentColor) => ({
    flex: 1,
    padding: "9px 6px",
    borderRadius: 10,
    border: `2px solid ${active ? accentColor : "#1A3050"}`,
    background: active ? accentColor + "22" : "#060D1A",
    color: active ? accentColor : "#4A6080",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "all .18s",
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
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return dateStr; }
}

function fmtTime(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
    }) + " IST";
  } catch { return ""; }
}

// ─── Team Badge ────────────────────────────────────────────────────
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
function Toast({ msg, type }) {
  return (
    <div style={{
      position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999,
      background: type === "error" ? "#7F1D1D" : type === "info" ? "#1E3A5F" : "#14532D",
      color: "#fff", padding: "11px 22px", borderRadius: 14,
      fontSize: 13, fontWeight: 600,
      boxShadow: "0 6px 30px #000c", maxWidth: 340, textAlign: "center",
      animation: "slideDown .25s ease",
    }}>
      {msg}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("leaderboard");
  const [selectedPlayer, setSelectedPlayer] = useState(PLAYERS[0]);
  const [revealedPicks, setRevealedPicks] = useState({}); // tracks which match picks are revealed
  const [spyLog, setSpyLog] = useState([]); // local session log of peek events
  const [expandedMatch, setExpandedMatch] = useState(null); // tracks which match is expanded for betting
  const [matchConfirm, setMatchConfirm] = useState(null); // matchId pending confirmation before opening
  const [toast, setToast] = useState(null);

  // Firebase state
  const [bets, setBets] = useState({});
  const [tossGuesses, setTossGuesses] = useState({});
  const [manualResults, setManualResults] = useState({});

  // Cricket API state
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null); // kept for compatibility
  const [lastFetched, setLastFetched] = useState(null); // kept for compatibility

  // Admin
  const [adminMode, setAdminMode] = useState(false);
  const [adminTaps, setAdminTaps] = useState(0);
  const adminTimer = useRef(null);

  // ── Firebase listeners ────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      onValue(ref(db, "bets"), snap => setBets(snap.val() || {})),
      onValue(ref(db, "tossGuesses"), snap => setTossGuesses(snap.val() || {})),
      onValue(ref(db, "manualResults"), snap => setManualResults(snap.val() || {})),
      onValue(ref(db, "iplTable"), snap => { if (snap.val()) setIplTable(snap.val()); }),
      onValue(ref(db, "spyLog"), snap => {
        const data = snap.val() || {};
        const entries = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        setSpyLog(entries);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // ── Load schedule immediately, enrich with live API in background ──
  useEffect(() => {
    const schedule = getPlaceholderMatches();
    setMatches(schedule);
    setLoading(false);
  }, []);

  // Collapse expanded match and clear revealed picks when player or tab changes
  useEffect(() => {
    setExpandedMatch(null);
    setMatchConfirm(null);
    setRevealedPicks({});
  }, [selectedPlayer, tab]);


  function getPlaceholderMatches() {
    // Official IPL 2026 full schedule (70 league matches) — source: BCCI / Wisden
    const m = (id, home, away, rawDate, date, time, venue) => ({
      id, home, away, rawDate, date, time, venue, status: "upcoming", apiWinner: null,
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

  // ── Notifications ─────────────────────────────────────────────
  function notify(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Bets ──────────────────────────────────────────────────────
  function fbKey(id) { return id.replace(/[^a-zA-Z0-9_]/g, "_"); }

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
    const key = `${matchId}__${player}`;
    await set(ref(db, `bets/${key}`), team);
    notify(`${PLAYER_META[player].emoji} ${player} bets on ${team}!`);
  }

  async function placeToss(matchId, player, team) {
    const match = matches.find(m => m.id === matchId);
    if (!match || getEffectiveStatus(match) !== "upcoming") {
      return notify("Betting is closed for this match!", "error");
    }
    const key = `${matchId}__${player}`;
    await set(ref(db, `tossGuesses/${key}`), team);
    notify(`${PLAYER_META[player].emoji} ${player} picks ${team} for the toss!`);
  }

  async function setManualResult(matchId, winner, tossWinner, status = "completed") {
    const key = fbKey(matchId);
    const payload = { status };
    if (winner) payload.winner = winner;
    if (tossWinner) payload.tossWinner = tossWinner;
    await set(ref(db, `manualResults/${key}`), payload);
    if (status === "live") notify("🔒 Bets locked! Match is live.");
    else if (status === "completed" && winner) notify(`🏆 ${winner} set as winner! Points updated.`);
    else notify("✅ Saved!");
  }

  // ── Points Calculation ────────────────────────────────────────
  function calcPoints() {
    const pts = Object.fromEntries(PLAYERS.map(p => [p, 0]));
    const breakdown = Object.fromEntries(PLAYERS.map(p => [p, []]));

    for (const match of matches) {
      const status = getEffectiveStatus(match);
      if (status !== "completed" && status !== "live") continue;
      const winner = getEffectiveWinner(match);
      const tossWinner = getEffectiveTossWinner(match);
      // Need at least toss winner or match winner to calculate anything
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

  const upcomingMatches = matches.filter(m => getEffectiveStatus(m) === "upcoming");
  const liveMatches = matches.filter(m => getEffectiveStatus(m) === "live");
  const completedMatches = matches.filter(m => getEffectiveStatus(m) === "completed");

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
  function logIdentityConfirm(matchId, home, away) { logAction("identity_confirm", matchId, home, away, selectedPlayer); }
  function logMatchExpand(matchId, home, away) { logAction("match_expand", matchId, home, away); }

  // ── Stats & Analytics Calculations ───────────────────────────
  function calcStats() {
    const done = completedMatches;
    const total = done.length;

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

    return { enriched, h2h, total };
  }

  // IPL Points Table state
  const [iplTable, setIplTable] = useState([
    { team:"RCB",  played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"MI",   played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"CSK",  played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"KKR",  played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"SRH",  played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"DC",   played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"RR",   played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"PBKS", played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"LSG",  played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
    { team:"GT",   played:0, won:0, lost:0, nrr:"+0.000", pts:0 },
  ]);

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button:hover { opacity: 0.88; }
        @keyframes slideDown { from { transform: translateX(-50%) translateY(-10px); opacity:0; } to { transform: translateX(-50%) translateY(0); opacity:1; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #060D1A; } ::-webkit-scrollbar-thumb { background: #1A3050; border-radius: 4px; }
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={S.header}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
              🏏 <span style={{ color: "#FF6B2B" }}>IPL</span><span style={{ color: "#FFD700" }}>BETZONE</span>
            </div>
            <div style={{ fontSize: 10, color: "#4A6080", marginTop: 2 }}>
              IPL 2026 · Results managed via Admin panel

            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {PLAYERS.map(p => (
              <div key={p} style={{ textAlign: "center" }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: PLAYER_META[p].light,
                  border: `2px solid ${PLAYER_META[p].color}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                }}>
                  {PLAYER_META[p].emoji}
                </div>
                <div style={{ fontSize: 8, color: PLAYER_META[p].color, fontWeight: 700, marginTop: 2 }}>
                  {p.slice(0,5).toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Match Banner */}
      {liveMatches.length > 0 && (
        <div style={{ background: "#7F1D1D22", borderBottom: "1px solid #EF444433", padding: "8px 18px" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", animation: "pulse 1.2s infinite" }} />
            <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 700 }}>LIVE:</span>
            {liveMatches.map(m => (
              <span key={m.id} style={{ fontSize: 12, color: "#FCA5A5" }}>
              <span key={m.id} style={{fontSize:12,color:"#FCA5A5"}}>{m.home} vs {m.away}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ ...S.tabBar, maxWidth: "none" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flex: 1 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={S.tab(tab === t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 14px 90px" }}>

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "#4A6080" }}>
            <div style={{ fontSize: 36, marginBottom: 12, animation: "pulse 1s infinite" }}>🏏</div>
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

            {/* Podium */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 10, marginBottom: 24 }}>
              {[1, 0, 2].map(idx => {
                const player = ranked[idx];
                const pos = idx + 1;
                const podiumH = [140, 170, 110][idx === 0 ? 1 : idx === 1 ? 0 : 2];
                const crown = ["🥇", "🥈", "🥉"][idx];
                const meta = PLAYER_META[player];
                return (
                  <div key={player} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: idx === 1 ? 32 : 22 }}>{meta.emoji}</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: idx === 1 ? 15 : 12, color: meta.color }}>{player}</div>
                    <div style={{ fontSize: idx === 1 ? 30 : 22, fontWeight: 900, color: "#FFD700", lineHeight: 1 }}>{pts[player]}</div>
                    <div style={{ fontSize: 9, color: "#4A6080" }}>pts</div>
                    <div style={{
                      width: "100%", height: podiumH, borderRadius: "8px 8px 0 0",
                      background: `linear-gradient(180deg, ${meta.light} 0%, ${meta.color}11 100%)`,
                      border: `1px solid ${meta.color}44`,
                      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10, fontSize: 22,
                    }}>{crown}</div>
                  </div>
                );
              })}
            </div>

            {/* Player cards */}
            {ranked.map((player, i) => {
              const meta = PLAYER_META[player];
              const maxPts = Math.max(...Object.values(pts), 1);
              const pct = Math.round((pts[player] / maxPts) * 100);
              return (
                <div key={player} style={{ ...S.card(meta.color + "44"), position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: `${pct}%`, height: 3, background: `linear-gradient(90deg, ${meta.color}, transparent)` }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 26, width: 36 }}>{["👑","🥈","🥉"][i]}</div>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: meta.light, border: `2px solid ${meta.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                      {meta.emoji}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: meta.color }}>{player}</div>
                      <div style={{ fontSize: 11, color: "#2A4060", marginTop: 2 }}>
                        {breakdown[player].filter(b => b.gained > 0).length} correct · {completedMatches.length} played
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
                          {b.home}v{b.away}: {b.gained > 0 ? b.parts.join(" ") : "❌"}
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
                  <button key={p} onClick={() => setSelectedPlayer(p)} style={S.pill(selectedPlayer === p, PLAYER_META[p].color)}>
                    {PLAYER_META[p].emoji} {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Live matches — no betting */}
            {liveMatches.map(match => (
              <div key={match.id} style={{ ...S.card("#EF444433"), borderLeft: "3px solid #EF4444" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 700 }}>🔴 LIVE NOW</span>
                  <span style={{ fontSize: 10, color: "#4A6080" }}>{match.venue}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TeamBadge short={match.home} />
                  <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#FCA5A5" }}>{m.home} vs {m.away} — Bets locked</div>
                  <TeamBadge short={match.away} />
                </div>
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
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F8" }}>{match.home}</span>
                        <span style={{ fontSize: 10, color: "#FF6B2B", fontWeight: 700 }}>VS</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F8" }}>{match.away}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#4A6080", marginTop: 2 }}>📅 {match.date} · {match.time}</div>
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
                      <div style={{ fontSize: 10, color: "#2A4060", textAlign: "center", marginBottom: 14 }}>🏟 {match.venue.split(",")[0]}</div>

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
                              <div key={p} style={{ fontSize: 11, color: "#7A90B0", background: "#0A1420", padding: "4px 10px", borderRadius: 20, border: `1px solid ${pb ? PLAYER_META[p].color + "44" : "#1A3050"}` }}>
                                {PLAYER_META[p].emoji} {pb ? <span style={{ color: PLAYER_META[p].color, fontWeight: 700 }}>{pb}</span> : <span style={{ color: "#2A4060" }}>—</span>}
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
                              <div key={p} style={{ fontSize: 11, color: "#7A90B0", background: "#0A1420", padding: "4px 10px", borderRadius: 20, border: `1px solid ${pt ? "#FFD70044" : "#1A3050"}` }}>
                                {PLAYER_META[p].emoji} {pt ? <span style={{ color: "#FFD700", fontWeight: 700 }}>{pt}</span> : <span style={{ color: "#2A4060" }}>—</span>}
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
                            <div key={p} style={{ fontSize: 11, color: "#4A6080", background: "#0A1420", padding: "4px 10px", borderRadius: 20, border: "1px solid #1A3050", letterSpacing: 2 }}>
                              {PLAYER_META[p].emoji} •••
                            </div>
                          ))}
                        </div>
                        {/* Toss picks hidden */}
                        <div style={{ fontSize: 9, color: "#4A6080", fontWeight: 700, letterSpacing: 0.3 }}>🪙 TOSS PICKS:</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {PLAYERS.filter(p => p !== selectedPlayer).map(p => (
                            <div key={p} style={{ fontSize: 11, color: "#4A6080", background: "#0A1420", padding: "4px 10px", borderRadius: 20, border: "1px solid #1A3050", letterSpacing: 2 }}>
                              {PLAYER_META[p].emoji} •••
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {!loading && tab === "schedule" && (
          <div>
            <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>IPL 2026 — ALL FIXTURES</div>
            {matches.map((match, idx) => {
              const status = getEffectiveStatus(match);
              const winner = getEffectiveWinner(match);
              return (
                <div key={match.id} style={{ ...S.card(status === "live" ? "#EF444433" : "#1A3050"), opacity: status === "completed" ? 0.75 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: "#4A6080" }}>Match {idx + 1} · {match.date}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: status === "live" ? "#EF444422" : status === "completed" ? "#14532D22" : "#FF6B2B22", color: status === "live" ? "#EF4444" : status === "completed" ? "#22C55E" : "#FF6B2B" }}>
                      {status === "live" ? "🔴 LIVE" : status === "completed" ? "✅ Done" : "🕐 Soon"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <TeamBadge short={match.home} size={36} />
                      <div style={{ fontSize: 9, fontWeight: 700, color: IPL_TEAMS[match.home]?.color || "#fff" }}>{match.home}</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: winner ? "#FFD700" : "#E2E8F8" }}>
                        {status === "completed" ? `${winner} won` : status === "live" ? "In Progress 🔴" : `${match.time}`}
                      </div>
                      <div style={{ fontSize: 9, color: "#2A4060", marginTop: 2 }}>🏟 {match.venue.split(",")[0]}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <TeamBadge short={match.away} size={36} />
                      <div style={{ fontSize: 9, fontWeight: 700, color: IPL_TEAMS[match.away]?.color || "#fff" }}>{match.away}</div>
                    </div>
                  </div>
                  {/* picks — only show when live or completed */}
                  {(status === "live" || status === "completed") && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {PLAYERS.map(p => {
                        const pb = bets[`${match.id}__${p}`];
                        const correct = winner && pb === winner;
                        return (
                          <span key={p} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: correct ? "#14532D33" : "#0A1420", color: correct ? "#22C55E" : "#4A6080", border: `1px solid ${correct ? "#22C55E33" : "#1A3050"}` }}>
                            {PLAYER_META[p].emoji} {pb || "—"}{correct ? " ✅" : ""}
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
            })}
          </div>
        )}

        {/* ── HISTORY ── */}
        {!loading && tab === "history" && (
          <div>
            <div style={{ fontSize: 11, color: "#4A6080", marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>COMPLETED MATCHES</div>
            {completedMatches.length === 0 && (
              <div style={{ textAlign: "center", padding: 50, color: "#4A6080" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📜</div>
                <div style={{ fontWeight: 700 }}>No results yet!</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Results appear here automatically once matches finish.</div>
              </div>
            )}
            {completedMatches.map(match => {
              const winner = getEffectiveWinner(match);
              const tossWinner = getEffectiveTossWinner(match);
              return (
                <div key={match.id} style={S.card()}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: "#4A6080" }}>{match.date}</span>
                    <span style={{ fontSize: 11, color: "#FFD700", fontWeight: 700 }}>🏆 {winner} won{tossWinner ? ` · 🪙 ${tossWinner} toss` : ""}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <TeamBadge short={match.home} size={32} />
                    <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#4A6080" }}>{match.home} vs {match.away}</div>
                    <TeamBadge short={match.away} size={32} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {PLAYERS.map(p => {
                      const pb = bets[`${match.id}__${p}`];
                      const pt = tossGuesses[`${match.id}__${p}`];
                      const winOk = pb === winner;
                      const tossOk = tossWinner && pt === tossWinner;
                      const earned = (winOk ? 2 : 0) + (tossOk ? 1 : 0);
                      const meta = PLAYER_META[p];
                      return (
                        <div key={p} style={{ flex: 1, background: "#060D1A", borderRadius: 10, padding: "10px 8px", border: `1px solid ${earned > 0 ? meta.color + "55" : "#1A3050"}` }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 4 }}>{meta.emoji} {p}</div>
                          <div style={{ fontSize: 10, color: "#4A6080" }}>Pick: <span style={{ color: winOk ? "#22C55E" : "#EF4444", fontWeight: 700 }}>{pb || "—"}</span></div>
                          {tossWinner && <div style={{ fontSize: 10, color: "#4A6080" }}>Toss: <span style={{ color: tossOk ? "#22C55E" : "#EF4444", fontWeight: 700 }}>{pt || "—"}</span></div>}
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
          const { enriched, h2h, total } = calcStats();
          return (
            <div>
              {/* IPL Points Table */}
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,color:"#FFD700",fontWeight:800,marginBottom:10,letterSpacing:0.5}}>🏏 IPL 2026 POINTS TABLE</div>
              <div style={{...S.card(),padding:0,overflow:"hidden",marginBottom:16}}>
                <div style={{background:"#0A1420",padding:"8px 12px",display:"grid",gridTemplateColumns:"28px 1fr 32px 32px 32px 50px 32px",gap:4,fontSize:9,fontWeight:700,color:"#4A6080",letterSpacing:0.5}}>
                  <div>#</div><div>TEAM</div><div style={{textAlign:"center"}}>P</div><div style={{textAlign:"center"}}>W</div><div style={{textAlign:"center"}}>L</div><div style={{textAlign:"center"}}>NRR</div><div style={{textAlign:"center"}}>PTS</div>
                </div>
                {[...iplTable].sort((a,b)=>b.pts-a.pts||parseFloat(b.nrr)-parseFloat(a.nrr)).map((row,i)=>{
                  const t = IPL_TEAMS[row.team];
                  const isTop4 = i < 4;
                  return (
                    <div key={row.team} style={{padding:"8px 12px",display:"grid",gridTemplateColumns:"28px 1fr 32px 32px 32px 50px 32px",gap:4,alignItems:"center",borderTop:"1px solid #0A1420",background:isTop4?"#FFD70008":"transparent"}}>
                      <div style={{fontSize:11,fontWeight:800,color:isTop4?"#FFD700":"#4A6080"}}>{i+1}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:t?.color||"#1A3050",border:`1px solid ${t?.accent||"#2A4060"}`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {t?.logo ? <img src={t.logo} style={{width:"85%",height:"85%",objectFit:"contain"}} alt={row.team}/> : <span style={{fontSize:7,fontWeight:800,color:t?.accent}}>{row.team}</span>}
                        </div>
                        <span style={{fontSize:11,fontWeight:700,color:"#E2E8F8"}}>{row.team}</span>
                      </div>
                      <div style={{fontSize:11,color:"#7A90B0",textAlign:"center"}}>{row.played}</div>
                      <div style={{fontSize:11,color:"#22C55E",textAlign:"center",fontWeight:700}}>{row.won}</div>
                      <div style={{fontSize:11,color:"#EF4444",textAlign:"center"}}>{row.lost}</div>
                      <div style={{fontSize:10,color:"#7A90B0",textAlign:"center"}}>{row.nrr}</div>
                      <div style={{fontSize:12,fontWeight:800,color:"#FFD700",textAlign:"center"}}>{row.pts}</div>
                    </div>
                  );
                })}
                <div style={{padding:"6px 12px",fontSize:9,color:"#2A4060",borderTop:"1px solid #0A1420",textAlign:"center"}}>🟡 Top 4 qualify · Update via Admin panel</div>
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
                      <div style={{width:40,height:40,borderRadius:"50%",background:meta.light,border:`2px solid ${meta.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{meta.emoji}</div>
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
                        <div style={{fontSize:20}}>{m1.emoji}</div>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,color:m1.color}}>{p1}</div>
                      </div>
                      <div style={{fontSize:11,color:"#4A6080",fontWeight:700}}>VS</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,color:m2.color}}>{p2}</div>
                        <div style={{fontSize:20}}>{m2.emoji}</div>
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
                <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>No snooping yet!</div>
                <div style={{ fontSize:11 }}>This log will show whenever someone taps "Reveal Picks" before a match goes live.</div>
              </div>
            ) : (
              <div>
                {/* Summary pills */}
                <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                  {PLAYERS.map(p => {
                    const peeks    = spyLog.filter(e => e.player === p && e.type === "peek").length;
                    const confirms = spyLog.filter(e => e.player === p && e.type === "identity_confirm").length;
                    const opens    = spyLog.filter(e => e.player === p && e.type === "match_expand").length;
                    const meta = PLAYER_META[p];
                    return (
                      <div key={p} style={{ flex:1, background: meta.light, border:`1px solid ${meta.color}44`, borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
                        <div style={{ fontSize:20 }}>{meta.emoji}</div>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:12, color:meta.color, marginTop:4 }}>{p}</div>
                        <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:2 }}>
                          <div style={{ fontSize:9, color:"#FF6B2B" }}>👁️ {peeks} peeks</div>
                          <div style={{ fontSize:9, color:"#22C55E" }}>✅ {confirms} confirms</div>
                          <div style={{ fontSize:9, color:"#00C2FF" }}>🔓 {opens} opens</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Log entries */}
                {spyLog.map((entry, i) => {
                  const meta = PLAYER_META[entry.player] || { emoji:"❓", color:"#7A90B0", light:"#7A90B018" };
                  const typeConfig = {
                    peek:             { icon:"👁️", label:"peeked at picks for",    color:"#FF6B2B", bg:"#FF6B2B18" },
                    identity_confirm: { icon:"✅",  label:"confirmed as",            color:"#22C55E", bg:"#22C55E18" },
                    match_expand:     { icon:"🔓", label:"opened betting view for", color:"#00C2FF", bg:"#00C2FF18" },
                  };
                  const tc = typeConfig[entry.type] || typeConfig.peek;
                  return (
                    <div key={entry.id || i} style={{ ...S.card(meta.color+"33"), marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:10, background:tc.bg, color:tc.color, border:`1px solid ${tc.color}44` }}>
                          {tc.icon} {entry.type === "identity_confirm" ? "IDENTITY CONFIRMED" : entry.type === "match_expand" ? "MATCH OPENED" : "PEEKED AT PICKS"}
                        </span>
                        <span style={{ fontSize:10, color:"#4A6080" }}>🕐 {fmtLogTime(entry.timestamp)}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:38, height:38, borderRadius:"50%", background:meta.light, border:`2px solid ${meta.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                          {meta.emoji}
                        </div>
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

            {/* Only show upcoming + live + recently completed */}
            {matches.map((match, idx) => {
              const status = getEffectiveStatus(match);
              const manual = manualResults[fbKey(match.id)] || {};
              const winner = getEffectiveWinner(match);
              const isLocked = status === "live" || status === "completed";

              // Status pill config
              const statusConfig = {
                upcoming: { label: "🕐 Upcoming", color: "#FF6B2B", bg: "#FF6B2B18" },
                live:     { label: "🔴 Live",     color: "#EF4444", bg: "#EF444418" },
                completed:{ label: "✅ Done",      color: "#22C55E", bg: "#22C55E18" },
              }[status] || { label: status, color: "#7A90B0", bg: "#1A3050" };

              return (
                <div key={match.id} style={{ ...S.card(isLocked ? "#1A3050" : "#1A3050"), marginBottom: 10, opacity: status === "completed" ? 0.85 : 1 }}>

                  {/* Match header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <TeamBadge short={match.home} size={28} />
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#E2E8F8" }}>vs</span>
                      <TeamBadge short={match.away} size={28} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F8" }}>{match.home} v {match.away}</span>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: statusConfig.bg, color: statusConfig.color }}>
                      {statusConfig.label}
                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: "#2A4060", marginBottom: 10 }}>
                    📅 {match.date} · {match.time} · {match.venue.split(",")[0]}
                  </div>

                  {/* Winner display if done */}
                  {status === "completed" && winner && (
                    <div style={{ background: "#14532D22", border: "1px solid #22C55E33", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#22C55E", fontWeight: 700 }}>
                      🏆 {winner} won · {manual.tossWinner ? `🪙 Toss: ${manual.tossWinner}` : "Toss not set"}
                    </div>
                  )}

                  {/* Actions */}
                  {status !== "completed" && (
                    <div>
                      {/* Lock bets button */}
                      {status === "upcoming" && (
                        <button onClick={() => setManualResult(match.id, null, null, "live")}
                          style={{ ...S.btn("#7F1D1D", "#FCA5A5"), width: "100%", marginBottom: 8, fontSize: 12 }}>
                          🔒 Lock Bets — Match Has Started
                        </button>
                      )}

                      {/* Unlock button if locked but no winner yet */}
                      {status === "live" && (
                        <div style={{ background: "#7F1D1D18", border: "1px solid #EF444433", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 11, color: "#FCA5A5" }}>
                          🔴 Bets locked! Set the winner after the match ends.
                        </div>
                      )}

                      {/* Toss winner */}
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

                      {/* Match winner */}
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

                  {/* Reset button */}
                  {(manual.winner || manual.status === "live") && (
                    <button onClick={() => set(ref(db, `manualResults/${fbKey(match.id)}`), null)}
                      style={{ width: "100%", padding: "7px", borderRadius: 8, border: "1px solid #7F1D1D55", background: "transparent", color: "#EF444488", fontSize: 11, cursor: "pointer" }}>
                      ↩ Reset this match
                    </button>
                  )}
                </div>
              );
            })}

            {/* IPL Table Editor */}
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,color:"#FFD700",fontWeight:800,margin:"16px 0 10px",letterSpacing:0.5}}>🏏 UPDATE IPL POINTS TABLE</div>
            <div style={{...S.card(),padding:0,overflow:"hidden",marginBottom:12}}>
              <div style={{background:"#0A1420",padding:"8px 12px",display:"grid",gridTemplateColumns:"1fr 40px 40px 40px 64px 40px",gap:6,fontSize:9,fontWeight:700,color:"#4A6080"}}>
                <div>TEAM</div><div style={{textAlign:"center"}}>P</div><div style={{textAlign:"center"}}>W</div><div style={{textAlign:"center"}}>L</div><div style={{textAlign:"center"}}>NRR</div><div style={{textAlign:"center"}}>PTS</div>
              </div>
              {iplTable.map((row,i) => (
                <div key={row.team} style={{padding:"6px 12px",display:"grid",gridTemplateColumns:"1fr 40px 40px 40px 64px 40px",gap:6,alignItems:"center",borderTop:"1px solid #0A1420"}}>
                  <div style={{fontSize:11,fontWeight:700,color:IPL_TEAMS[row.team]?.color||"#E2E8F8"}}>{row.team}</div>
                  {["played","won","lost"].map(field => (
                    <input key={field} type="number" value={row[field]}
                      onChange={e => {
                        const val = parseInt(e.target.value)||0;
                        const updated = iplTable.map((r,j) => {
                          if (j !== i) return r;
                          const newRow = {...r, [field]: val};
                          newRow.pts = newRow.won * 2;
                          return newRow;
                        });
                        setIplTable(updated);
                        set(ref(db,"iplTable"), updated);
                      }}
                      style={{width:"100%",background:"#0A1420",border:"1px solid #1A3050",borderRadius:6,color:"#E2E8F8",fontSize:11,padding:"4px",textAlign:"center"}}
                    />
                  ))}
                  <input type="text" value={row.nrr}
                    onChange={e => {
                      const updated = iplTable.map((r,j) => j===i ? {...r, nrr: e.target.value} : r);
                      setIplTable(updated);
                      set(ref(db,"iplTable"), updated);
                    }}
                    style={{width:"100%",background:"#0A1420",border:"1px solid #1A3050",borderRadius:6,color:"#E2E8F8",fontSize:11,padding:"4px",textAlign:"center"}}
                  />
                  <div style={{fontSize:12,fontWeight:800,color:"#FFD700",textAlign:"center"}}>{row.won*2}</div>
                </div>
              ))}
              <div style={{padding:"8px 12px",fontSize:9,color:"#2A4060",borderTop:"1px solid #0A1420",textAlign:"center"}}>Points = W×2 · Changes sync instantly to all phones</div>
            </div>

            <button onClick={() => { setAdminMode(false); setTab("leaderboard"); }}
              style={{ ...S.btn("#1A3050", "#7A90B0"), width: "100%", marginTop: 8 }}>
              ← Exit Admin
            </button>
          </div>
        )}
      </div>
      {/* ── MATCH OPEN CONFIRMATION ── */}
      {matchConfirm && (() => {
        const m = matches.find(x => x.id === matchConfirm);
        const meta = PLAYER_META[selectedPlayer];
        return (
          <div style={{ position: "fixed", inset: 0, background: "#000000CC", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: "#0D1828", border: `1px solid ${meta.color}44`, borderRadius: 20, padding: 24, maxWidth: 320, width: "100%", boxShadow: "0 20px 60px #000" }}>
              {/* Player avatar */}
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: meta.light, border: `3px solid ${meta.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto" }}>
                  {meta.emoji}
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
                    logIdentityConfirm(m.id, m.home, m.away);
                    logMatchExpand(m.id, m.home, m.away);
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
