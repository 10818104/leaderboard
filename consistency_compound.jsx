import { useState, useEffect } from "react";

const ADMIN_PIN   = "1234";
const STORAGE_KEY = "cc_leaderboard_v1";
const WORK_DAYS   = 25;

// SUPABASE CONNECTION DETAILS
const SUPABASE_URL = "https://jtjucjooaqqahnctqmhy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0anVjam9vYXFxYWhuY3RxbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTEzNzQsImV4cCI6MjA5NTM4NzM3NH0.SOB1yViHjGPx_-l4SAfPsqA2XmpoGE-j7YaalJZypZ8";

const METRICS = [
  { key: "friends",      label: "Friends",      icon: "👥", resultWeight: 1,  monthlyOnly: false, def: "Number of new names added to your list." },
  { key: "contacts",     label: "Contacts",     icon: "📞", resultWeight: 2,  monthlyOnly: false, def: "Number of people contacted. Call, text, DM, etc." },
  { key: "appts_booked", label: "Appts Booked", icon: "📆", resultWeight: 3,  monthlyOnly: false, def: "Number of appts scheduled onto your calendar. Step 1-3 or coffee appt." },
  { key: "appts_done",   label: "Appts Done",   icon: "📅", resultWeight: 5,  monthlyOnly: false, def: "Number of appts completed. Step 1-3 or coffee appt." },
  { key: "points",       label: "Points",       icon: "💎", resultWeight: 7,  monthlyOnly: true,  def: "Number of points submitted that will show up in Computer this month." },
  { key: "recruits",     label: "Recruits",     icon: "🎯", resultWeight: 9,  monthlyOnly: true,  def: "Number of people who signed their AMA." },
  { key: "licenses",     label: "Licenses",     icon: "📋", resultWeight: 11, monthlyOnly: true,  def: "Number of licenses in the system (submitted agent agreement)." },
  { key: "event_reg",    label: "Event Reg",    icon: "🎪", resultWeight: 13, monthlyOnly: true,  def: "Number of people who have their Big Event ticket." },
];

const HABITS      = ["business_plan", "preplan", "read_learn", "workout"];
const HABIT_LABELS = { business_plan:"Business Plan", preplan:"Preplan", read_learn:"Read/Learn", workout:"Workout" };
const HABIT_ICONS  = { business_plan:"📊", preplan:"🗓️", read_learn:"📚", workout:"💪" };

const DEFAULT_DAILY = { friends:2, contacts:12, appts_booked:2, appts_done:2 };
const DEFAULT_MONTHLY = { recruits:15, points:50000, event_reg:20, licenses:8 };

const getMonthly = (m, key) => {
  const metric = METRICS.find(x => x.key === key);
  if (metric?.monthlyOnly) return m.monthly?.[key] ?? DEFAULT_MONTHLY[key] ?? 0;
  return Math.round((m.daily?.[key] ?? 0) * WORK_DAYS);
};

const GOLD      = "#FFD700";
const GOLD_DEEP = "#B8860B";
const RANK_GOLD   = "#FFD700";
const RANK_SILVER = "#C0C0C0";
const RANK_BRONZE = "#CD7F32";

function nextColor() { return GOLD; }

const DEFAULT_MEMBERS = [
  { id:1,  name:"Darryl Johnson", color:GOLD },
  { id:2,  name:"Ashley Rutton",  color:GOLD },
  { id:3,  name:"Member 3",       color:GOLD },
  { id:4,  name:"Member 4",       color:GOLD },
  { id:5,  name:"Member 5",       color:GOLD },
  { id:6,  name:"Member 6",       color:GOLD },
  { id:7,  name:"Member 7",       color:GOLD },
  { id:8,  name:"Member 8",       color:GOLD },
  { id:9,  name:"Member 9",       color:GOLD },
  { id:10, name:"Member 10",      color:GOLD },
];

const EMPTY_ACTUALS = () => ({
  friends:0, contacts:0, appts_booked:0, appts_done:0, recruits:0, points:0, event_reg:0, licenses:0
});

const EMPTY_LOG = () => ({
  friends:"", contacts:"", appts_booked:"", appts_done:"", recruits:"", points:"", event_reg:"", licenses:"",
  business_plan:false, preplan:false, read_learn:false, workout:false
});

function initMembers() {
  return DEFAULT_MEMBERS.map(m => ({
    ...m,
    daily:   { ...DEFAULT_DAILY },
    monthly: { ...DEFAULT_MONTHLY },
    actuals: EMPTY_ACTUALS(),
    habits:  { business_plan:0, preplan:0, read_learn:0, workout:0 },
    streak:  0,
    postStreak: 0,
    daysPosted: 0,
    submissions: {},
  }));
}

function calcScore(m) {
  let s = 0;
  METRICS.forEach(({ key, resultWeight }) => {
    const target = getMonthly(m, key);
    const pct = target > 0 ? m.actuals[key] / target : 0;
    s += Math.min(pct, 1.5) * resultWeight * 100;
  });
  s += Object.values(m.habits).reduce((a,b) => a+b, 0) * 3;
  s += (m.streak || 0)     * 8;
  s += (m.postStreak || 0) * 4;
  return Math.round(s);
}

const STREAK_CUTOFF_HOUR_ET = 15;
const STREAK_CUTOFF_TZ      = "America/New_York";

function easternCutoffMs(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m-1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STREAK_CUTOFF_TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", hour12:false
  }).formatToParts(probe);
  const etHour = parseInt(parts.find(p => p.type === "hour").value, 10);
  const offsetHours = 12 - etHour;
  return Date.UTC(y, m-1, d, STREAK_CUTOFF_HOUR_ET + offsetHours, 0, 0);
}

function currentEasternHour() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: STREAK_CUTOFF_TZ, hour:"2-digit", hour12:false }).formatToParts(new Date());
  return parseInt(parts.find(p => p.type === "hour").value, 10);
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: STREAK_CUTOFF_TZ, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year").value}-${parts.find(p => p.type === "month").value}-${parts.find(p => p.type === "day").value}`;
}

function monthKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: STREAK_CUTOFF_TZ, year:"numeric", month:"2-digit" }).formatToParts(d);
  return `${parts.find(p => p.type === "year").value}-${parts.find(p => p.type === "month").value}`;
}

function formatMonthKey(key) {
  const [y,m] = key.split("-").map(Number);
  return new Date(y, m-1, 1).toLocaleString("default", { month:"long", year:"numeric" }).toUpperCase();
}

function streakReferenceKey() {
  if (currentEasternHour() < STREAK_CUTOFF_HOUR_ET) return prevDayKey(todayKey());
  return todayKey();
}

function isInGraceWindow() { return currentEasternHour() < STREAK_CUTOFF_HOUR_ET; }

function streakDeadlineMs(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const nextDay = new Date(y, m-1, d+1);
  const nextKey = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,"0")}-${String(nextDay.getDate()).padStart(2,"0")}`;
  return easternCutoffMs(nextKey);
}

function submittedOnTime(dateKey, submission) {
  if (!submission || !submission.submittedAt) return false;
  return submission.submittedAt <= streakDeadlineMs(dateKey);
}

function timeUntilCutoff() {
  const now = Date.now();
  const today = todayKey();
  const todayCutoff = easternCutoffMs(today);
  let cutoff = todayCutoff > now ? todayCutoff : easternCutoffMs(dateKey(new Date(Date.now() + 86400000)));
  const ms = cutoff - now;
  return { hours: Math.floor(ms / 3600000), mins: Math.floor((ms % 3600000) / 60000) };
}

function isDateLocked(dateKey) { return Date.now() > streakDeadlineMs(dateKey); }
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function prevDayKey(key) {
  const [y,m,d] = key.split("-").map(Number);
  return dateKey(new Date(y, m-1, d - 1));
}
function formatDateKey(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
}

function getMonthDays() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const days = [];
  for (let i = 1; i <= lastDay; i++) days.push(dateKey(new Date(now.getFullYear(), now.getMonth(), i)));
  return days;
}

function computePostStreak(submissions) {
  const ref = streakReferenceKey();
  const today = todayKey();
  let cursor = submittedOnTime(today, submissions[today]) ? today : ref;
  if (!submittedOnTime(cursor, submissions[cursor])) return 0;
  let streak = 0;
  while (submittedOnTime(cursor, submissions[cursor])) { streak++; cursor = prevDayKey(cursor); }
  return streak;
}

function computeHabitStreak(submissions) {
  const ref = streakReferenceKey();
  const today = todayKey();
  const validHabitDay = (key, sub) => sub && HABITS.every(h => sub.habits?.[h]) && submittedOnTime(key, sub);
  let cursor = validHabitDay(today, submissions[today]) ? today : ref;
  if (!validHabitDay(cursor, submissions[cursor])) return 0;
  let streak = 0;
  while (validHabitDay(cursor, submissions[cursor])) { streak++; cursor = prevDayKey(cursor); }
  return streak;
}

function getPct(actual, target) { return (!target) ? 0 : Math.min(Math.round((actual/target)*100), 999); }
function getColor(pct) { return pct>=100 ? "#FFD700" : pct>=75 ? "#D4A017" : pct>=50 ? "#94a3b8" : "#475569"; }

const TABS = ["LEADERBOARD", "CHECK-IN", "ARCHIVE", "SETUP"];

// ─── UPGRADED SYSTEM STORAGE LAYER (SUPABASE) ──────────────────────────────
async function fetchFromSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?select=key,value`, {
      method: "GET",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }
    });
    if (!res.ok) return null;
    const items = await res.json();
    const data = {};
    items.forEach(item => { try { data[item.key] = JSON.parse(item.value); } catch(e) { data[item.key] = item.value; } });
    return Object.keys(data).length ? data : null;
  } catch (e) { console.error("Supabase load connection error:", e); return null; }
}

async function saveToSupabase(key, value) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/app_state?key=eq.${key}`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ key, value: JSON.stringify(value) })
    });
  } catch (e) { console.error("Supabase push write error:", e); }
}

export default function App() {
  const [members, setMembers]             = useState(initMembers);
  const [loaded, setLoaded]               = useState(false);
  const [tab, setTab]                     = useState("LEADERBOARD");
  const [expandedId, setExpandedId]       = useState(null);
  const [guideOpen, setGuideOpen]         = useState(false);
  const [archives, setArchives]           = useState({});
  const [activeMonth, setActiveMonth]     = useState(monthKey());
  const [viewingArchive, setViewingArchive] = useState(null);

  const [ciScreen, setCiScreen]           = useState("SELECT");
  const [ciIdx, setCiIdx]                 = useState(null);
  const [logData, setLogData]             = useState(EMPTY_LOG());
  const [confirmed, setConfirmed]         = useState(null);
  const [saving, setSaving]               = useState(false);
  const [submissionDate, setSubmissionDate] = useState(todayKey());

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinInput, setPinInput]           = useState("");
  const [pinError, setPinError]           = useState(false);
  const [editTargets, setEditTargets]     = useState(null);
  const [flash, setFlash]                 = useState(null);
  const [modal, setModal]                 = useState(null);
  const [modalInput, setModalInput]       = useState("");

  function showAlert(title, message) { setModal({ type:"alert", title, message }); }
  function showConfirm(title, message, onOk, danger=false) { setModal({ type:"confirm", title, message, onOk, danger }); }
  function showPrompt(title, message, placeholder, onOk) { setModalInput(""); setModal({ type:"prompt", title, message, placeholder, onOk }); }
  function closeModal() { setModal(null); setModalInput(""); }

  // ── Load & Central Data Extraction ──
  useEffect(() => {
    async function load() {
      let state = await fetchFromSupabase();
      
      // Auto-Migration Check: Pull legacy backup if first-load cloud initialization runs clean
      if (!state && typeof window !== "undefined" && window.localStorage) {
        try {
          const legacy = window.localStorage.getItem(STORAGE_KEY);
          if (legacy) state = JSON.parse(legacy);
        } catch(e) {}
      }

      if (state) {
        if (state.members) {
          const migrated = state.members.map(m => {
            let result = { ...m };
            if (!result.daily) result.daily = result.targets ? Object.fromEntries(Object.keys(DEFAULT_DAILY).map(k => [k, Math.round((result.targets[k]||0)/WORK_DAYS)])) : { ...DEFAULT_DAILY };
            if (!result.monthly) result.monthly = result.targets ? Object.fromEntries(Object.keys(DEFAULT_MONTHLY).map(k => [k, result.targets[k] ?? DEFAULT_MONTHLY[k]])) : { ...DEFAULT_MONTHLY };
            if (!result.submissions) {
              result.submissions = {};
              if (result.lastSubmission?.date) result.submissions[result.lastSubmission.date] = { actuals: result.lastSubmission.actuals || {}, habits:  result.lastSubmission.habits  || {} };
              delete result.lastSubmission;
            }
            Object.keys(result.submissions).forEach(dk => {
              const sub = result.submissions[dk];
              if (!sub.submittedAt) sub.submittedAt = streakDeadlineMs(dk);
            });
            result.postStreak = computePostStreak(result.submissions);
            result.streak     = computeHabitStreak(result.submissions);
            return result;
          });
          setMembers(migrated);
        }
        if (state.archives) setArchives(state.archives);
        if (state.activeMonth) setActiveMonth(state.activeMonth);
      }
      setLoaded(true);
    }
    load();
  }, []);

  // ── Unified Master Database Sync ──
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveToSupabase("members", members);
      saveToSupabase("archives", archives);
      saveToSupabase("activeMonth", activeMonth);
    }, 200);
    return () => clearTimeout(t);
  }, [members, archives, activeMonth, loaded]);

  const sorted = [...members].map(m => ({ ...m, score: calcScore(m) })).sort((a,b) => b.score - a.score);
  const month  = formatMonthKey(activeMonth);

  async function handleSubmit() {
    if (ciIdx === null) return;
    const member = members[ciIdx];
    const isExistingSubmission = !!member?.submissions?.[submissionDate];
    if (!isExistingSubmission && isDateLocked(submissionDate)) {
      showAlert("Day locked", `The deadline for ${formatDateKey(submissionDate)} has passed (3pm EST the next day). This day is permanently locked.`);
      return;
    }
    const hasNumbers = METRICS.some(({ key }) => logData[key] !== "" && Number.isFinite(Number(logData[key])) && Number(logData[key]) > 0);
    const hasHabits = HABITS.some(h => logData[h]);
    if (!hasNumbers && !hasHabits) {
      showAlert("Nothing to submit", "Please enter at least one number or tick at least one habit before submitting.");
      return;
    }
    for (const { key, label } of METRICS) {
      if (logData[key] !== "" && (!Number.isFinite(Number(logData[key])) || Number(logData[key]) < 0)) {
        showAlert("Invalid number", `"${label}" must be a positive number.`);
        return;
      }
    }
    const currentStreak = members[ciIdx].streak;
    if (submissionDate === todayKey() && currentStreak >= 3 && !HABITS.every(h => logData[h])) {
      showConfirm(`Break your ${currentStreak} day habit streak?`, `Missing any habit will reset your habit streak to 0. Submit anyway?`, () => { closeModal(); doSubmit(); }, true);
      return;
    }
    doSubmit();
  }

  async function doSubmit() {
    setSaving(true);
    try {
      let cur = members;
      const cloudState = await fetchFromSupabase();
      if (cloudState?.members) cur = cloudState.members;

      const targetDate = submissionDate;
      const memberPrev = cur[ciIdx]?.submissions?.[targetDate] || null;
      const preservedSubmittedAt = (memberPrev?.submittedAt && memberPrev.submittedAt <= streakDeadlineMs(targetDate)) ? memberPrev.submittedAt : Date.now();
      
      const newSubmission = {
        actuals:     Object.fromEntries(METRICS.map(({key}) => [key, logData[key]!=="" ? Number(logData[key]) : 0])),
        habits:      Object.fromEntries(HABITS.map(h => [h, !!logData[h]])),
        submittedAt: preservedSubmittedAt,
      };

      const updated = cur.map((m,i) => {
        if (i !== ciIdx) return m;
        const prev = m.submissions?.[targetDate] || null;
        const na = { ...m.actuals };
        METRICS.forEach(({ key }) => { na[key] = Math.max(0, (na[key] || 0) - (prev?.actuals?.[key] || 0) + (newSubmission.actuals[key] || 0)); });
        const nh = { ...m.habits };
        HABITS.forEach(h => { nh[h] = Math.max(0, (nh[h] || 0) - (prev?.habits?.[h] ? 1 : 0) + (newSubmission.habits[h] ? 1 : 0)); });

        const newSubs = { ...m.submissions, [targetDate]: newSubmission };
        return {
          ...m, actuals: na, habits: nh,
          streak: computeHabitStreak(newSubs), postStreak: computePostStreak(newSubs),
          daysPosted: Object.keys(newSubs).length, submissions: newSubs,
        };
      });

      setMembers(updated);
      const fresh = updated[ciIdx];
      setConfirmed({
        name: fresh.name, color: fresh.color, actuals: { ...newSubmission.actuals }, daily: { ...fresh.daily },
        monthly: { ...(fresh.monthly||DEFAULT_MONTHLY) }, habits: { ...newSubmission.habits },
        streak: fresh.streak, postStreak: fresh.postStreak, date: formatDateKey(targetDate),
        targetDate, isToday: targetDate === todayKey(), wasEdit: !!cur[ciIdx].submissions?.[targetDate],
      });
      setCiScreen("CONFIRM");
    } catch(e) { showAlert("Save failed", "Something went wrong saving. Please try again."); }
    setSaving(false);
  }

  function handleCiReset() { setCiScreen("SELECT"); setCiIdx(null); setLogData(EMPTY_LOG()); setConfirmed(null); }
  function openEdit(id) { const m = members.find(x => x.id===id); setEditTargets({ id, name:m.name, daily:{ ...m.daily }, monthly:{ ...(m.monthly||DEFAULT_MONTHLY) } }); }
  function saveTargets() { setMembers(prev => prev.map(m => m.id===editTargets.id ? {...m, name:editTargets.name, daily:editTargets.daily, monthly:editTargets.monthly} : m)); setEditTargets(null); }
  
  function handlePinDigit(d) {
    if (d==="⌫") { setPinInput(p=>p.slice(0,-1)); setPinError(false); return; }
    if (pinInput.length >= 4) return;
    const next = pinInput + d; setPinInput(next);
    if (next.length === 4) {
      setTimeout(() => { if (next === ADMIN_PIN) { setAdminUnlocked(true); setPinError(false); setPinInput(""); } else { setPinError(true); setPinInput(""); } }, 200);
    }
  }

  function handleResetMonth() {
    showConfirm("Archive this month and start fresh?", `This saves standings for ${formatMonthKey(activeMonth)} into the Archive tab and resets progress.`, () => {
      const snapshot = members.map(m => ({ id: m.id, name: m.name, color: m.color, score: calcScore(m), actuals: { ...m.actuals }, habits: { ...m.habits }, streak: m.streak || 0, postStreak: m.postStreak || 0, daysPosted: m.daysPosted || 0, daily: { ...m.daily }, monthly: { ...m.monthly } })).sort((a,b) => b.score - a.score);
      setArchives(prev => ({ ...prev, [activeMonth]: { members: snapshot, archivedAt: Date.now() } }));
      setMembers(prev => prev.map(m => ({ ...m, actuals:EMPTY_ACTUALS(), habits:{business_plan:0,preplan:0,read_learn:0,workout:0}, streak:0, postStreak:0, daysPosted:0, submissions:{} })));
      setActiveMonth(monthKey()); closeModal(); showFlash(`${formatMonthKey(activeMonth)} archived!`);
    }, true);
  }

  function resetMember(id) {
    const m = members.find(x => x.id===id);
    showConfirm(`Reset ${m?.name}?`, "Numbers, habits, and streaks reset to zero. Name and targets remain.", () => {
      setMembers(prev => prev.map(x => x.id===id ? { ...x, actuals:EMPTY_ACTUALS(), habits:{business_plan:0,preplan:0,read_learn:0,workout:0}, streak:0, postStreak:0, daysPosted:0, submissions:{} } : x));
      closeModal(); showFlash(`${m.name} reset!`);
    }, true);
  }

  function addMember() {
    showPrompt("Add team member", "Enter full name:", "e.g. Jane Smith", (rawName) => {
      const name = (rawName || "").trim(); if (!name) return;
      setMembers(prev => [...prev, { id: (prev.reduce((max,m) => Math.max(max, m.id), 0)) + 1, name, color: nextColor(), daily: { ...DEFAULT_DAILY }, monthly: { ...DEFAULT_MONTHLY }, actuals: EMPTY_ACTUALS(), habits: { business_plan:0, preplan:0, read_learn:0, workout:0 }, streak: 0, postStreak: 0, daysPosted: 0, submissions: {} }]);
      closeModal(); showFlash(`${name} added!`);
    });
  }

  function removeMember(id) {
    const m = members.find(x => x.id===id);
    showConfirm(`Remove ${m?.name}?`, "Deletes all metrics, history, and records. This cannot be undone.", () => {
      setMembers(prev => prev.filter(x => x.id!==id)); closeModal(); showFlash(`${m.name} removed`);
    }, true);
  }

  function showFlash(msg) { setFlash(msg); setTimeout(() => setFlash(null), 2500); }

  if (!loaded) return <div style={{ minHeight:"100vh", background:"#0a0a0f", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Barlow Condensed',sans-serif", color:"#FFD700", fontSize:18, letterSpacing:4 }}>LOADING DATABASE...</div>;

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0f", fontFamily:"'Barlow Condensed','Arial Narrow',sans-serif", color:"#e2e8f0", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"fixed", inset:0, zIndex:0, backgroundImage:`linear-gradient(rgba(255,215,0,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,215,0,0.04) 1px,transparent 1px)`, backgroundSize:"40px 40px", pointerEvents:"none" }} />
      <div style={{ position:"fixed", top:"-20%", right:"-10%", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,rgba(255,215,0,0.10) 0%,transparent 70%)", pointerEvents:"none" }} />
      <div style={{ position:"fixed", bottom:"-20%", left:"-10%", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(184,134,11,0.08) 0%,transparent 70%)", pointerEvents:"none" }} />

      <div style={{ position:"relative", zIndex:1, maxWidth:900, margin:"0 auto", padding:"0 16px 60px" }}>
        <div style={{ textAlign:"center", padding:"32px 0 20px" }}>
          <div style={{ fontSize:11, letterSpacing:6, color:"#FFD700", textTransform:"uppercase", marginBottom:6, fontWeight:700 }}>CONSISTENCY COMPOUND</div>
          <div style={{ fontSize:42, fontWeight:900, letterSpacing:2, lineHeight:1, background:"linear-gradient(135deg,#fff 0%,#FFD700 60%,#B8860B 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", textTransform:"uppercase" }}>LEADER BOARD</div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:6, letterSpacing:2 }}>{month} · {members.length} {members.length===1?"LEADER":"LEADERS"}</div>
        </div>

        <div style={{ display:"flex", gap:4, background:"#0f0f0f", borderRadius:10, padding:4, marginBottom:24, border:"1px solid #1c1c1c" }}>
          {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none", cursor:"pointer", background: tab===t ? (t==="CHECK-IN" ? "linear-gradient(135deg,#FFD700,#B8860B)" : "#FFD700") : "transparent", color: tab===t ? "#fff" : "#64748b", fontFamily:"inherit", fontSize:12, fontWeight:700, letterSpacing:2 }}>{t}</button>)}
        </div>

        {flash && <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg,#FFD700,#B8860B)", color:"#fff", padding:"12px 28px", borderRadius:30, fontWeight:700, letterSpacing:2, fontSize:13, zIndex:999, boxShadow:"0 8px 32px rgba(255,215,0,0.4)" }}>✅ {flash.toUpperCase()}</div>}

        {tab === "LEADERBOARD" && members.length === 0 && (
          <div style={{ background:"#0f0f0f", border:"1px dashed #2a2a2a", borderRadius:14, padding:"60px 20px", textAlign:"center" }}>
            <div style={{ fontSize:42, marginBottom:14 }}>🏆</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#f1f5f9", letterSpacing:2, marginBottom:8 }}>NO LEADERS YET</div>
          </div>
        )}

        {tab === "LEADERBOARD" && members.length > 0 && (
          <div>
            {activeMonth !== monthKey() && <div style={{ background:`${GOLD}1A`, border:`1px solid ${GOLD}55`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:11, color:"#cbd5e1", textAlign:"center" }}>📅 <strong style={{ color:GOLD }}>New month started.</strong> Open Setup → Reset Month to archive and clean standings.</div>}
            <div style={{ display:"flex", gap:12, marginBottom:20, alignItems:"flex-end" }}>
              {[1,0,2].map((ri,i) => {
                const m = sorted[ri]; if (!m) return null;
                const heights = [160, 200, 130], labels = ["🥈 2ND", "🥇 1ST", "🥉 3RD"], rankColors = [RANK_SILVER, RANK_GOLD, RANK_BRONZE], glows = ["rgba(192,192,192,0.25)", "rgba(255,215,0,0.4)", "rgba(205,127,50,0.25)"];
                const rc = rankColors[i];
                return (
                  <div key={m.id} onClick={() => setExpandedId(expandedId===m.id?null:m.id)} style={{ flex:1, height:heights[i], background:`linear-gradient(180deg,${rc}1A 0%,#0f0f0f 100%)`, border:`1px solid ${rc}44`, borderRadius:12, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", boxShadow:`0 0 24px ${glows[i]}`, cursor:"pointer", padding:"12px 8px" }}>
                    <div style={{ fontSize:9, letterSpacing:3, color:"#64748b", marginBottom:4 }}>{labels[i]}</div>
                    <div style={{ width:44, height:44, borderRadius:"50%", background:`linear-gradient(135deg,${rc},${rc}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:900, color:"#0a0a0f", marginBottom:8 }}>{m.name.charAt(0)}</div>
                    <div style={{ fontSize:13, fontWeight:800, letterSpacing:1, textAlign:"center", color:"#f1f5f9" }}>{m.name.split(" ")[0].toUpperCase()}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:rc, marginTop:4 }}>{m.score.toLocaleString()}</div>
                    <div style={{ fontSize:9, color:"#64748b", letterSpacing:2 }}>SCORE</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {sorted.map((m, rank) => {
                const isEx = expandedId === m.id;
                const rankColors = [RANK_GOLD, RANK_SILVER, RANK_BRONZE];
                const rc = rank < 3 ? rankColors[rank] : null;
                return (
                  <div key={m.id}>
                    <div onClick={() => setExpandedId(isEx?null:m.id)} style={{ background:"#0f0f0f", border:`1px solid ${isEx ? GOLD+"55" : "#1c1c1c"}`, borderRadius:isEx?"12px 12px 0 0":12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
                      <div style={{ width:28, height:28, borderRadius:"50%", background: rc ? `linear-gradient(135deg,${rc},${rc}88)` : "#1c1c1c", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900, color: rc ? "#0a0a0f" : "#64748b" }}>{rank+1}</div>
                      <div style={{ width:36, height:36, borderRadius:"50%", background:"#0a0a0a", border:`1px solid ${GOLD}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, color:"#94a3b8" }}>{m.name.charAt(0)}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:800, letterSpacing:1, color:"#f1f5f9", marginBottom:4 }}>
                          {m.name.toUpperCase()}
                          {(m.postStreak>1 || m.streak>1) && (
                            <span style={{ marginLeft:8, display:"inline-flex", gap:6 }}>
                              {m.postStreak>1 && <span style={{ fontSize:10, background:"#1c1c1c", color:"#94a3b8", padding:"2px 8px", borderRadius:20 }}>📅 {m.postStreak}</span>}
                              {m.streak>1 && <span style={{ fontSize:10, background:`${GOLD}1A`, color:GOLD, padding:"2px 8px", borderRadius:20 }}>🔥 {m.streak}</span>}
                            </span>
                          )}
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {METRICS.map(({ key, icon }) => { const p=getPct(m.actuals[key],getMonthly(m,key)); return <div key={key} style={{ display:"flex", alignItems:"center", gap:3, fontSize:10, color:getColor(p) }}><span>{icon}</span><span style={{ fontWeight:700 }}>{p}%</span></div>; })}
                        </div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:22, fontWeight:900, color: rc || GOLD }}>{m.score.toLocaleString()}</div>
                        <div style={{ fontSize:9, color:"#64748b", letterSpacing:2 }}>SCORE</div>
                      </div>
                    </div>
                    {isEx && (
                      <div style={{ background:"#0a0a0a", border:`1px solid ${GOLD}33`, borderTop:"none", borderRadius:"0 0 12px 12px", padding:16 }}>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:12 }}>
                          {METRICS.map(({ key, label, icon }) => {
                            const p=getPct(m.actuals[key],getMonthly(m,key)), c=getColor(p);
                            return (
                              <div key={key} style={{ background:"#0f0f0f", borderRadius:10, padding:"10px 12px", border:"1px solid #1c1c1c" }}>
                                <div style={{ fontSize:10, color:"#64748b", letterSpacing:2, marginBottom:4 }}>{icon} {label.toUpperCase()}</div>
                                <div style={{ fontSize:20, fontWeight:900, color:c }}>{m.actuals[key].toLocaleString()}</div>
                                <div style={{ fontSize:10, color:"#64748b" }}>of {getMonthly(m,key).toLocaleString()}</div>
                                <div style={{ height:3, background:"#1c1c1c", borderRadius:3, marginTop:8, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.min(p,100)}%`, background:c }} /></div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {HABITS.map(h => <div key={h} style={{ padding:"5px 12px", borderRadius:20, fontSize:10, fontWeight:700, background: m.habits[h]>0 ? `${GOLD}1A` : "#1c1c1c", color: m.habits[h]>0 ? GOLD : "#475569", border:`1px solid ${m.habits[h]>0 ? GOLD+"44" : "#2a2a2a"}` }}>{m.habits[h]>0?"✓":"·"} {HABIT_LABELS[h].toUpperCase()} ({m.habits[h]}d)</div>)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop:28, marginBottom:8 }}>
              <button onClick={() => setGuideOpen(!guideOpen)} style={{ width:"100%", padding:"14px 18px", borderRadius:12, border:`1px solid ${guideOpen ? GOLD+"55" : "#2a2a2a"}`, background: guideOpen ? `${GOLD}0D` : "#0f0f0f", color: guideOpen ? GOLD : "#94a3b8", fontFamily:"inherit", fontSize:12, fontWeight:700, letterSpacing:2, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span>📖 HOW THE LEADERBOARD WORKS</span><span>{guideOpen ? "▲" : "▼"}</span>
              </button>
              {guideOpen && (
                <div style={{ marginTop:10, background:"#0f0f0f", border:`1px solid ${GOLD}33`, borderRadius:12, padding:22 }}>
                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontSize:13, letterSpacing:3, color:GOLD, fontWeight:800, marginBottom:8 }}>THE MISSION</div>
                    <div style={{ fontSize:13, color:"#cbd5e1" }}>Show up daily. Hit your numbers. Stack your habits. Consistency compounds.</div>
                  </div>
                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontSize:13, letterSpacing:3, color:GOLD, fontWeight:800, marginBottom:8 }}>DAILY CHECK-IN DEADLINE</div>
                    <div style={{ fontSize:13, color:"#cbd5e1", marginBottom:10 }}>Log metrics before <strong style={{ color:GOLD }}>3pm EST the next day</strong> or the window permanently locks. Missed days break streaks.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "CHECK-IN" && (
          <div style={{ maxWidth:480, margin:"0 auto" }}>
            {ciScreen === "SELECT" && members.length === 0 && <div style={{ textCast:"center", color:"#64748b" }}>No team members found.</div>}
            {ciScreen === "SELECT" && members.length > 0 && (
              <div>
                <div style={{ background:"#0f0f0f", border:`1px solid ${isInGraceWindow() ? GOLD+"33" : "#1c1c1c"}`, borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:11, color:"#94a3b8", textAlign:"center" }}>
                  {(() => { const { hours, mins } = timeUntilCutoff(); return isInGraceWindow() ? <>⏰ <strong style={{ color:GOLD }}>Cutoff closes in {hours}h {mins}m</strong> (3pm EST)</> : <>⏰ <strong>Today's window open:</strong> {hours}h {mins}m left</>; })()}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {members.map((m,i) => {
                    const submittedToday = !!m.submissions?.[todayKey()];
                    return (
                      <button key={m.id} onClick={() => {
                        setCiIdx(i); setSubmissionDate(todayKey());
                        if (submittedToday) {
                          const sub = m.submissions[todayKey()], ld = EMPTY_LOG();
                          METRICS.forEach(({key}) => { if (sub.actuals[key]) ld[key] = String(sub.actuals[key]); });
                          HABITS.forEach(h => { ld[h] = !!sub.habits[h]; }); setLogData(ld);
                        } else { setLogData(EMPTY_LOG()); } setCiScreen("FORM");
                      }} style={{ display:"flex", alignItems:"center", gap:14, background:"#0f0f0f", border:`1px solid ${submittedToday ? GOLD+"44" : "#1c1c1c"}`, borderRadius:14, padding:"16px 20px", cursor:"pointer", width:"100%" }}>
                        <div style={{ width:44, height:44, borderRadius:"50%", background:"#0a0a0f", border:`1px solid ${GOLD}33`, display:"flex", alignItems:"center", justifyContent:"center", color:GOLD, fontWeight:900 }}>{m.name.charAt(0)}</div>
                        <div style={{ flex:1, textAlign:"left" }}>
                          <div style={{ fontSize:16, fontWeight:800, color:"#f1f5f9" }}>{m.name} {submittedToday && <span style={{ fontSize:9, color:GOLD }}>✓ LOCKED IN</span>}</div>
                        </div>
                        <div>{submittedToday ? "EDIT" : "›"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {ciScreen === "FORM" && ciIdx !== null && members[ciIdx] && (() => {
              const m = members[ciIdx], isEditing = !!m.submissions?.[submissionDate], isToday = submissionDate === todayKey(), monthDays = getMonthDays();
              return (
                <div>
                  <div style={{ background:"#0f0f0f", border:"1px solid #1c1c1c", borderRadius:12, padding:14, marginBottom:18 }}>
                    <select value={submissionDate} onChange={e => {
                      const dk = e.target.value; setSubmissionDate(dk); const sub = m.submissions?.[dk];
                      if (sub) { const ld = EMPTY_LOG(); METRICS.forEach(({key}) => { if (sub.actuals[key]) ld[key] = String(sub.actuals[key]); }); HABITS.forEach(h => { ld[h] = !!sub.habits[h]; }); setLogData(ld); } else { setLogData(EMPTY_LOG()); }
                    }} style={{ width:"100%", background:"#0a0a0f", color:"#fff", border:"1px solid #2a2a2a", padding:10, borderRadius:8, fontFamily:"inherit" }}>
                      {monthDays.map(dk => <option key={dk} value={dk} disabled={dk > todayKey() || (!m.submissions?.[dk] && isDateLocked(dk))}>{formatDateKey(dk)} {dk===todayKey()?"(TODAY)":""} {m.submissions?.[dk]?"[EDIT]":""}</option>)}
                    </select>
                  </div>

                  <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
                    {METRICS.map(({ key, label, icon, monthlyOnly }) => (
                      <div key={key} style={{ background:"#0f0f0f", border:"1px solid #1c1c1c", padding:12, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <div><span style={{ fontSize:18, marginRight:8 }}>{icon}</span><span style={{ fontSize:13, fontWeight:800 }}>{label.toUpperCase()}</span></div>
                        <input type="number" min="0" value={logData[key]} onChange={e => setLogData(p=>({...p,[key]:e.target.value}))} placeholder="0" style={{ width:75, background:"#0a0a0f", border:"1px solid #2a2a2a", color:GOLD, textAlign:"center", padding:8, borderRadius:6, fontSize:16, fontWeight:900 }} />
                      </div>
                    ))}
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:24 }}>
                    {HABITS.map(h => (
                      <div key={h} onClick={() => setLogData(p=>({...p,[h]:!p[h]}))} style={{ background:logData[h]?`${m.color}15`:"#0f0f0f", border:`2px solid ${logData[h]?m.color:"#1c1c1c"}`, borderRadius:12, padding:14, cursor:"pointer", textAlign:"center" }}>
                        <div style={{ fontSize:22 }}>{HABIT_ICONS[h]}</div><div style={{ fontSize:11, marginTop:4 }}>{HABIT_LABELS[h]}</div>
                      </div>
                    ))}
                  </div>

                  <button onClick={handleSubmit} disabled={saving} style={{ width:"100%", padding:16, borderRadius:12, background:`linear-gradient(135deg,${GOLD},${GOLD_DEEP})`, border:"none", fontWeight:900, cursor:"pointer" }}>{saving ? "SAVING..." : "COMMIT SUBMISSION"}</button>
                </div>
              );
            })()}

            {ciScreen === "CONFIRM" && confirmed && (
              <div style={{ textAlign:"center", padding:"20px 0" }}>
                <div style={{ fontSize:40, marginBottom:10 }}>⚡</div><div style={{ fontSize:20, fontWeight:900, color:GOLD }}>CLOUD SYNC SECURED</div>
                <div style={{ fontSize:12, color:"#64748b", margin:"6px 0 20px" }}>{confirmed.name.toUpperCase()} · {confirmed.date}</div>
                <button onClick={handleCiReset} style={{ background:"#14141a", border:"1px solid #222", color:"#cbd5e1", padding:"10px 24px", borderRadius:8, fontFamily:"inherit", cursor:"pointer" }}>✕ CLOSE RECEIPT</button>
              </div>
            )}
          </div>
        )}

        {tab === "ARCHIVE" && (
          <div>
            {Object.keys(archives).length === 0 ? <div style={{ textAlign:"center", color:"#64748b", padding:40 }}>No archived months.</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {!viewingArchive ? Object.keys(archives).map(ak => (
                  <div key={ak} style={{ background:"#0f0f0f", border:"1px solid #1c1c1c", padding:16, borderRadius:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:15, fontWeight:800 }}>{formatMonthKey(ak)}</div></div>
                    <button onClick={() => setViewingArchive(ak)} style={{ background:"#14141a", border:`1px solid ${GOLD}`, color:GOLD, padding:"6px 12px", borderRadius:6, fontFamily:"inherit", cursor:"pointer" }}>VIEW</button>
                  </div>
                )) : (
                  <div>
                    <button onClick={() => setViewingArchive(null)} style={{ background:"transparent", border:"none", color:"#64748b", cursor:"pointer", marginBottom:14 }}>← BACK</button>
                    {archives[viewingArchive].members.map((m, idx) => (
                      <div key={m.id} style={{ background:"#0f0f0f", padding:12, borderRadius:8, marginBottom:6, display:"flex", justifyContent:"space-between" }}>
                        <div>{idx+1}. {m.name.toUpperCase()}</div><div style={{ color:GOLD, fontWeight:900 }}>{m.score.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "SETUP" && (
          <div style={{ background:"#0f0f0f", border:"1px solid #1c1c1c", borderRadius:14, padding:20 }}>
            {!adminUnlocked ? (
              <div style={{ maxWidth:260, margin:"20px auto", textAlign:"center" }}>
                <div style={{ fontSize:12, fontWeight:800, color:"#f1f5f9", marginBottom:12 }}>ADMIN PIN REQUIRED</div>
                <div style={{ display:"flex", justifyContent:"center", gap:12, marginBottom:20 }}>{[0,1,2,3].map(i => <div key={i} style={{ width:12, height:12, borderRadius:"50%", border:`2px solid ${pinError?"#f87171":GOLD}`, background: pinInput.length > i ? (pinError?"#f87171":GOLD) : "transparent" }} />)}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
                  {["1","2","3","4","5","6","7","8","9","⌫","0"].map((d, i) => <button key={i} onClick={() => handlePinDigit(d)} style={{ background:"#14141a", border:"1px solid #222", padding:"12px 0", color:"#fff", fontFamily:"inherit", borderRadius:8, cursor:"pointer", gridColumn: d==="⌫"?1:undefined, gridColumnStart: d==="0"?2:undefined }}>{d}</button>)}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", borderBottom:"1px solid #1c1c1c", paddingBottom:12, marginBottom:16 }}>
                  <div><div style={{ fontSize:15, fontWeight:800 }}>ADMIN CONTROL PANEL</div></div>
                  <button onClick={() => setAdminUnlocked(false)} style={{ background:"#14141a", padding:"4px 10px", color:"#64748b", borderRadius:6, fontFamily:"inherit" }}>LOCK</button>
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                  <button onClick={addMember} style={{ flex:1, background:"#14141a", border:`1px solid ${GOLD}`, color:GOLD, padding:10, borderRadius:8, fontFamily:"inherit", cursor:"pointer" }}>+ ADD MEMBER</button>
                  <button onClick={handleResetMonth} style={{ flex:1, background:"#14141a", border:"1px solid #f87171", color:"#f87171", padding:10, borderRadius:8, fontFamily:"inherit", cursor:"pointer" }}>🔄 RESET MONTH</button>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {members.map(m => (
                    <div key={m.id} style={{ background:"#14141a", border:"1px solid #222", padding:10, borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span>{m.name.toUpperCase()}</span>
                      <button onClick={() => openEdit(m.id)} style={{ background:"#1e1e24", color:GOLD, padding:"4px 12px", borderRadius:4, border:"none", fontFamily:"inherit", cursor:"pointer" }}>EDIT</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {editTargets && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 }}>
          <div style={{ background:"#0f0f0f", border:"1px solid #222", borderRadius:14, padding:20, maxWidth:420, width:"100%" }}>
            <div style={{ borderBottom:"1px solid #1c1c1c", paddingBottom:10, marginBottom:16 }}>
              <input type="text" value={editTargets.name} onChange={e => setEditTargets({ ...editTargets, name: e.target.value })} style={{ background:"transparent", border:"none", borderBottom:`1px solid ${GOLD}`, fontSize:20, fontWeight:900, color:GOLD, width:"100%", fontFamily:"inherit" }} />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, maxHeight:300, overflowY:"auto" }}>
              {METRICS.filter(m => !m.monthlyOnly).map(m => (
                <div key={m.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12 }}>{m.icon} {m.label} (Daily)</span>
                  <input type="number" value={editTargets.daily[m.key] ?? ""} onChange={e => setEditTargets({ ...editTargets, daily: { ...editTargets.daily, [m.key]: Number(e.target.value) } })} style={{ width:60, background:"#14141a", color:"#fff", border:"1px solid #222", textAlign:"center", padding:4 }} />
                </div>
              ))}
              {METRICS.filter(m => m.monthlyOnly).map(m => (
                <div key={m.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12 }}>{m.icon} {m.label} (Monthly)</span>
                  <input type="number" value={editTargets.monthly?.[m.key] ?? DEFAULT_MONTHLY[m.key]} onChange={e => setEditTargets({ ...editTargets, monthly: { ...editTargets.monthly, [m.key]: Number(e.target.value) } })} style={{ width:80, background:"#14141a", color:"#fff", border:"1px solid #222", textAlign:"center", padding:4 }} />
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:20, paddingTop:14, borderTop:"1px solid #1c1c1c" }}>
              <button onClick={() => setEditTargets(null)} style={{ flex:1, background:"#14141a", border:"1px solid #222", color:"#64748b", padding:10, borderRadius:8, fontFamily:"inherit" }}>CANCEL</button>
              <button onClick={saveTargets} style={{ flex:1, background:`linear-gradient(135deg,${GOLD},${GOLD_DEEP})`, color:"#0a0a0f", border:"none", padding:10, borderRadius:8, fontFamily:"inherit", fontWeight:700 }}>SAVE</button>
            </div>
            <div style={{ marginTop:14, display:"flex", gap:4 }}>
              <button onClick={() => { resetMember(editTargets.id); setEditTargets(null); }} style={{ flex:1, background:"#ef444415", border:"1px solid #ef4444", color:"#ef4444", fontSize:11, padding:6 }}>RESET ALL</button>
              <button onClick={() => { removeMember(editTargets.id); setEditTargets(null); }} style={{ flex:1, background:"#ef4444", color:"#fff", border:"none", fontSize:11, padding:6 }}>REMOVE MEMBER</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}>
          <div style={{ background:"#0f0f0f", border:"1px solid #222", borderRadius:14, padding:20, maxWidth:380, width:"100%" }}>
            <div style={{ fontSize:16, fontWeight:900, color:"#fff", marginBottom:6 }}>{modal.title.toUpperCase()}</div>
            <div style={{ fontSize:12, color:"#cbd5e1", lineHeight:1.5 }}>{modal.message}</div>
            {modal.type === "prompt" && <input type="text" placeholder={modal.placeholder} value={modalInput} onChange={e => setModalInput(e.target.value)} style={{ width:"100%", background:"#14141a", border:"1px solid #222", padding:10, color:"#fff", borderRadius:8, marginTop:12, fontFamily:"inherit" }} />}
            <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
              {modal.type !== "alert" && <button onClick={closeModal} style={{ background:"#14141a", border:"1px solid #222", color:"#64748b", padding:"8px 16px", borderRadius:6, fontFamily:"inherit" }}>CANCEL</button>}
              <button onClick={() => { if (modal.type === "prompt") { if (modalInput.trim()) modal.onOk(modalInput); } else if (modal.onOk) { modal.onOk(); } else { closeModal(); } }} style={{ background:"linear-gradient(135deg,#FFD700,#B8860B)", color:"#0a0a0f", border:"none", padding:"8px 18px", borderRadius:6, fontFamily:"inherit", fontWeight:700 }}>CONFIRM</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&display=swap'); * { box-sizing: border-box; } input[type=number]::-webkit-inner-spin-button { opacity: 0.3; } button:hover { filter: brightness(1.1); }`}</style>
    </div>
  );
}
