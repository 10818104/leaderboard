import { useState, useEffect } from "react";
 
const ADMIN_PIN   = "1234";
const STORAGE_KEY = "cc_leaderboard_v1";
const WORK_DAYS   = 25;
 
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
 
// DAILY targets (friends, contacts, appts_booked, appts_done)
const DEFAULT_DAILY = {
  friends:2, contacts:12, appts_booked:2, appts_done:2,
};
 
// MONTHLY targets for results metrics (recruits, points, event_reg, licenses)
const DEFAULT_MONTHLY = {
  recruits:15, points:50000, event_reg:20, licenses:8,
};
 
// Helper: get effective monthly target for any metric
const getMonthly = (m, key) => {
  const metric = METRICS.find(x => x.key === key);
  if (metric?.monthlyOnly) return m.monthly?.[key] ?? DEFAULT_MONTHLY[key] ?? 0;
  return Math.round((m.daily?.[key] ?? 0) * WORK_DAYS);
};
 
// Single gold accent for the whole tool
const GOLD      = "#FFD700";  // primary brand colour
const GOLD_DEEP = "#B8860B";  // darker gold for gradients
 
// Rank colours — only used on the leaderboard podium
const RANK_GOLD   = "#FFD700"; // 1st
const RANK_SILVER = "#C0C0C0"; // 2nd
const RANK_BRONZE = "#CD7F32"; // 3rd
 
// All members share the same accent — keeps the leaderboard clean
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
  friends:0, contacts:0, appts_booked:0, appts_done:0,
  recruits:0, points:0, event_reg:0, licenses:0,
});
 
const EMPTY_LOG = () => ({
  friends:"", contacts:"", appts_booked:"", appts_done:"",
  recruits:"", points:"", event_reg:"", licenses:"",
  business_plan:false, preplan:false, read_learn:false, workout:false,
});
 
function initMembers() {
  return DEFAULT_MEMBERS.map(m => ({
    ...m,
    daily:   { ...DEFAULT_DAILY },
    monthly: { ...DEFAULT_MONTHLY },
    actuals: EMPTY_ACTUALS(),
    habits:  { business_plan:0, preplan:0, read_learn:0, workout:0 },
    streak:  0,        // habit streak — consecutive days with ALL 4 habits ticked
    postStreak: 0,     // posting streak — consecutive days with ANY submission
    daysPosted: 0,
    submissions: {},   // { "YYYY-MM-DD": { actuals: {}, habits: {} } } — full history
  }));
}
 
function calcScore(m) {
  let s = 0;
  // Metric performance vs target (capped at 150% for over-performance)
  METRICS.forEach(({ key, resultWeight }) => {
    const target = getMonthly(m, key);
    const pct = target > 0 ? m.actuals[key] / target : 0;
    s += Math.min(pct, 1.5) * resultWeight * 100;
  });
  // Consistency bonuses
  // Each habit day ticked   → +3
  // Habit streak (all 4)    → +8 per consecutive day
  // Post streak (showed up) → +4 per consecutive day
  s += Object.values(m.habits).reduce((a,b) => a+b, 0) * 3;
  s += (m.streak || 0)     * 8;
  s += (m.postStreak || 0) * 4;
  return Math.round(s);
}
 
// Streak grace cutoff — leaders have until this time the next day to post yesterday's numbers.
// Always 3pm in America/New_York, which auto-handles EST/EDT transitions across the year.
const STREAK_CUTOFF_HOUR_ET = 15;       // 3pm Eastern (works in both EST and EDT)
const STREAK_CUTOFF_TZ      = "America/New_York";
 
// Returns the UTC milliseconds of 3pm Eastern on a given date (YYYY-MM-DD).
// Uses the Intl API to correctly resolve EST vs EDT for any date.
function easternCutoffMs(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Probe what the UTC offset is for noon ET on that date.
  // We construct a candidate UTC time at the cutoff hour, then ask Intl what time it represents in ET.
  // If the offset is wrong, we correct it.
  // Simpler approach: use Intl.DateTimeFormat with timeZone to get the offset.
  const probe = new Date(Date.UTC(y, m-1, d, 12, 0, 0)); // noon UTC
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STREAK_CUTOFF_TZ,
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", hour12:false,
  }).formatToParts(probe);
  const etHour = parseInt(parts.find(p => p.type === "hour").value, 10);
  // Offset = 12 (UTC hour) - etHour
  // EST: ET = UTC-5, so etHour at 12 UTC = 7 → offset = 5
  // EDT: ET = UTC-4, so etHour at 12 UTC = 8 → offset = 4
  const offsetHours = 12 - etHour;
  // 3pm ET in UTC = 15 + offsetHours
  return Date.UTC(y, m-1, d, STREAK_CUTOFF_HOUR_ET + offsetHours, 0, 0);
}
 
// Returns the current Eastern Time hour as a number (0-23).
function currentEasternHour() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STREAK_CUTOFF_TZ,
    hour:"2-digit", hour12:false,
  }).formatToParts(new Date());
  return parseInt(parts.find(p => p.type === "hour").value, 10);
}
 
// Today's calendar date in Eastern Time (so day boundaries match the cutoff zone).
function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STREAK_CUTOFF_TZ,
    year:"numeric", month:"2-digit", day:"2-digit",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${d}`;
}
 
// Current month key (e.g. "2026-05") used for archive storage and rollover detection.
function monthKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STREAK_CUTOFF_TZ,
    year:"numeric", month:"2-digit",
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  return `${y}-${m}`;
}

// The month immediately before a given month key (e.g. "2026-06" → "2026-05")
function prevMonthKey(mk) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m-2, 1); // m-2 because JS months are 0-indexed
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
 
// Pretty-format a month key for display (e.g. "2026-05" → "MAY 2026")
function formatMonthKey(key) {
  const [y,m] = key.split("-").map(Number);
  return new Date(y, m-1, 1).toLocaleString("default", { month:"long", year:"numeric" }).toUpperCase();
}
 
// Streak reference date — the latest day that streak math expects a submission for.
// Streak reference date — the latest day that streak math expects a submission for.
// Before 3pm ET: reference = yesterday (today is still optional, posting yesterday's numbers still counts)
// After 3pm ET:  reference = today (must have posted today or yesterday's window is closed)
function streakReferenceKey() {
  if (currentEasternHour() < STREAK_CUTOFF_HOUR_ET) {
    return prevDayKey(todayKey());
  }
  return todayKey();
}
 
// Returns true if it's currently within the grace window (before 3pm ET)
// — i.e. yesterday's submission is still open without breaking the streak
function isInGraceWindow() {
  return currentEasternHour() < STREAK_CUTOFF_HOUR_ET;
}
 
// The latest UTC ms a submission for a given date can be made and still count toward the streak.
// That is: 3pm Eastern Time on the day AFTER the date in question. DST-aware.
function streakDeadlineMs(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const nextDay = new Date(y, m-1, d+1);
  const nextKey = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,"0")}-${String(nextDay.getDate()).padStart(2,"0")}`;
  return easternCutoffMs(nextKey);
}
 
// Did this submission get logged in time to count toward the streak?
function submittedOnTime(dateKey, submission) {
  if (!submission) return false;
  // All submissions must carry a submittedAt timestamp.
  // Legacy data is backfilled at load time, so this is a hard requirement going forward.
  if (!submission.submittedAt) return false;
  return submission.submittedAt <= streakDeadlineMs(dateKey);
}
 
// Hours/mins remaining until the next 3pm ET cutoff. DST-aware.
function timeUntilCutoff() {
  const now = Date.now();
  // Next cutoff is either today's 3pm ET (if still ahead) or tomorrow's 3pm ET
  const today = todayKey();
  const todayCutoff = easternCutoffMs(today);
  let cutoff;
  if (todayCutoff > now) {
    cutoff = todayCutoff;
  } else {
    const [y, m, d] = today.split("-").map(Number);
    const tom = new Date(y, m-1, d+1);
    const tomKey = `${tom.getFullYear()}-${String(tom.getMonth()+1).padStart(2,"0")}-${String(tom.getDate()).padStart(2,"0")}`;
    cutoff = easternCutoffMs(tomKey);
  }
  const ms = cutoff - now;
  const hours = Math.floor(ms / 3600000);
  const mins  = Math.floor((ms % 3600000) / 60000);
  return { hours, mins };
}
 
// Is this date locked for new submissions? A day becomes locked once its 3pm-next-day deadline passes.
// Note: existing submissions for the day can still be edited; this only blocks NEW entries.
function isDateLocked(dateKey) {
  return Date.now() > streakDeadlineMs(dateKey);
}
 
// Has this day OPENED for submission yet? A day only opens at 3pm EST ON that day,
// so reps can't log a day they haven't finished. Before 3pm EST on D, D is not yet open.
// (The day then stays open until isDateLocked() turns true at 3pm EST the next day.)
function isDateOpen(dateKey) {
  return Date.now() >= easternCutoffMs(dateKey);
}
 
// The single day that is currently "live" — open for submission right now.
// Before 3pm ET this is yesterday; at/after 3pm ET it flips to today.
// Matches streakReferenceKey() exactly, exposed under a name the UI reads naturally.
function currentOpenDayKey() {
  return streakReferenceKey();
}
 
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
 
// Yesterday relative to a given date key
function prevDayKey(key) {
  const [y,m,d] = key.split("-").map(Number);
  const date = new Date(y, m-1, d);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}
 
// Format a date key for display (e.g. "Friday, May 1")
function formatDateKey(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
}
 
// Generate calendar grid for a given month key (defaults to current ET month).
// Accepts an optional "YYYY-MM" string so the check-in calendar can show a prior month.
function getMonthDays(mk) {
  const key = mk || monthKey();
  const [y, m] = key.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const days = [];
  for (let i = 1; i <= lastDay; i++) {
    days.push(dateKey(new Date(y, m-1, i)));
  }
  return days;
}
 
// Compute posting streak — consecutive days ending at the streak reference date.
// A submission only counts toward the streak if it was made BEFORE that day's deadline (3pm EST the next day).
// Backdated submissions made after the window has closed are still recorded for the monthly total but don't extend the streak.
function computePostStreak(submissions) {
  const ref = streakReferenceKey();
  const today = todayKey();
  let cursor;
  // If today posted on time (always true if posted today, since today's deadline is 3pm tomorrow)
  if (submittedOnTime(today, submissions[today])) cursor = today;
  // Otherwise count from the reference (yesterday before cutoff, today after)
  else cursor = ref;
  // If even the reference day wasn't posted on time, streak is 0
  if (!submittedOnTime(cursor, submissions[cursor])) return 0;
  let streak = 0;
  while (submittedOnTime(cursor, submissions[cursor])) {
    streak++;
    cursor = prevDayKey(cursor);
  }
  return streak;
}
 
// Compute habit streak — consecutive days with ALL 4 habits, submitted on time.
function computeHabitStreak(submissions) {
  const ref = streakReferenceKey();
  const today = todayKey();
  const validHabitDay = (key, sub) =>
    sub && HABITS.every(h => sub.habits?.[h]) && submittedOnTime(key, sub);
  let cursor;
  if (validHabitDay(today, submissions[today])) cursor = today;
  else cursor = ref;
  if (!validHabitDay(cursor, submissions[cursor])) return 0;
  let streak = 0;
  while (validHabitDay(cursor, submissions[cursor])) {
    streak++;
    cursor = prevDayKey(cursor);
  }
  return streak;
}
 
function getPct(actual, target) { return (!target) ? 0 : Math.min(Math.round((actual/target)*100), 999); }
// Simplified colour ramp: gold when hitting target, muted grey otherwise
function getColor(pct) { return pct>=100 ? "#FFD700" : pct>=75 ? "#D4A017" : pct>=50 ? "#94a3b8" : "#475569"; }
 
const TABS = ["LEADERBOARD", "CHECK-IN", "ARCHIVE", "SETUP"];
 
// ─── SUPABASE STORAGE LAYER ────────────────────────────────────────────────
const SUPABASE_URL  = "https://jtjucjooaqqahnctqmhy.supabase.co";
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0anVjam9vYXFxYWhuY3RxbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTEzNzQsImV4cCI6MjA5NTM4NzM3NH0.SOB1yViHjGPx_-l4SAfPsqA2XmpoGE-j7YaalJZypZ8";
 
const sbHeaders = {
  "Content-Type":  "application/json",
  "apikey":        SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer":        "return=representation",
};
 
async function sbGet(table, key) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(key)}&select=*`, { headers: sbHeaders });
    const rows = await r.json();
    return rows?.[0] ?? null;
  } catch(e) { console.warn("sbGet failed", e); return null; }
}
 
async function sbUpsert(table, id, data) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
    });
  } catch(e) { console.warn("sbUpsert failed", e); }
}
 
async function sbGetArchive(monthKey) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/archives?month_key=eq.${encodeURIComponent(monthKey)}&select=*`, { headers: sbHeaders });
    const rows = await r.json();
    return rows?.[0] ?? null;
  } catch(e) { console.warn("sbGetArchive failed", e); return null; }
}
 
async function sbUpsertArchive(monthKey, data) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/archives`, {
      method: "POST",
      headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ month_key: monthKey, data, archived_at: new Date().toISOString() }),
    });
  } catch(e) { console.warn("sbUpsertArchive failed", e); }
}
 
async function sbGetAllMembers() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/members?select=*`, { headers: sbHeaders });
    return await r.json();
  } catch(e) { console.warn("sbGetAllMembers failed", e); return []; }
}
 
async function sbGetAllArchives() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/archives?select=*`, { headers: sbHeaders });
    return await r.json();
  } catch(e) { console.warn("sbGetAllArchives failed", e); return []; }
}
 
async function sbDeleteMember(id) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/members?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: sbHeaders,
    });
  } catch(e) { console.warn("sbDeleteMember failed", e); }
}
 
async function sbGetAppState(key) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_state?key=eq.${encodeURIComponent(key)}&select=*`, { headers: sbHeaders });
    const rows = await r.json();
    return rows?.[0]?.value ?? null;
  } catch(e) { console.warn("sbGetAppState failed", e); return null; }
}
 
async function sbSetAppState(key, value) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/app_state`, {
      method: "POST",
      headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value: String(value) }),
    });
  } catch(e) { console.warn("sbSetAppState failed", e); }
}
 
async function loadFromStorage() {
  try {
    const [memberRows, archiveRows, activeMonthVal] = await Promise.all([
      sbGetAllMembers(),
      sbGetAllArchives(),
      sbGetAppState("activeMonth"),
    ]);
 
    if (!memberRows || memberRows.length === 0) return null;
 
    const members = memberRows.map(row => row.data);
 
    const archives = {};
    (archiveRows || []).forEach(row => {
      archives[row.month_key] = row.data;
    });
 
    return {
      members,
      archives,
      activeMonth: activeMonthVal || monthKey(),
    };
  } catch(e) { console.warn("loadFromStorage failed", e); return null; }
}
 
async function saveToStorage(data) {
  try {
    const { members, archives, activeMonth: am } = data;
 
    // Save each member individually
    await Promise.all(members.map(m => sbUpsert("members", String(m.id), m)));
 
    // Save archives
    if (archives) {
      await Promise.all(
        Object.entries(archives).map(([mk, v]) => sbUpsertArchive(mk, v))
      );
    }
 
    // Save active month
    if (am) await sbSetAppState("activeMonth", am);
 
  } catch(e) { console.warn("saveToStorage failed", e); }
}
 
export default function App() {
  const [members, setMembers]             = useState(initMembers);
  const [loaded, setLoaded]               = useState(false);
  const [tab, setTab]                     = useState("LEADERBOARD");
  const [expandedId, setExpandedId]       = useState(null);
  const [guideOpen, setGuideOpen]         = useState(false);
 
  // Archives — past months stored as { "YYYY-MM": { members: [...frozen snapshot...], archivedAt } }
  const [archives, setArchives]           = useState({});
  const [activeMonth, setActiveMonth]     = useState(monthKey());
  const [viewingArchive, setViewingArchive] = useState(null); // archive month key when viewing history
  const [expandedArchiveId, setExpandedArchiveId] = useState(null); // expanded member in archive detail view
 
  // Check-in
  const [ciScreen, setCiScreen]           = useState("SELECT");
  const [ciIdx, setCiIdx]                 = useState(null);
  const [logData, setLogData]             = useState(EMPTY_LOG());
  const [confirmed, setConfirmed]         = useState(null);
  const [saving, setSaving]               = useState(false);
  const [submissionDate, setSubmissionDate] = useState(todayKey()); // which day the rep is logging for
  const [calendarMonth, setCalendarMonth]   = useState(monthKey()); // which month the calendar grid shows
 
  // Admin
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinInput, setPinInput]           = useState("");
  const [pinError, setPinError]           = useState(false);
  const [editTargets, setEditTargets]     = useState(null);
  const [flash, setFlash]                 = useState(null);
 
  // Modal system (replaces window.alert/confirm/prompt which are blocked in artifact sandbox)
  // modal: { type: "alert"|"confirm"|"prompt", title, message, onOk?, onCancel?, inputValue?, placeholder?, danger?: boolean }
  const [modal, setModal]                 = useState(null);
  const [modalInput, setModalInput]       = useState("");
 
  // Helper: show alert modal
  function showAlert(title, message) {
    setModal({ type:"alert", title, message });
  }
 
  // Helper: show confirm modal — onOk is called if user confirms
  function showConfirm(title, message, onOk, danger=false) {
    setModal({ type:"confirm", title, message, onOk, danger });
  }
 
  // Helper: show prompt modal — onOk receives the entered text
  function showPrompt(title, message, placeholder, onOk) {
    setModalInput("");
    setModal({ type:"prompt", title, message, placeholder, onOk });
  }
 
  function closeModal() { setModal(null); setModalInput(""); }
 
  // ── Load ──
  useEffect(() => {
    async function load() {
      try {
        const s = await loadFromStorage();
        if (s) {
          if (s.members) {
            // Migrate old data → new daily/monthly split if needed
            const migrated = s.members.map(m => {
              let result = { ...m };
              if (!result.daily) {
                if (result.targets) {
                  result.daily = Object.fromEntries(
                    Object.keys(DEFAULT_DAILY).map(k => [k, Math.round((result.targets[k]||0)/WORK_DAYS)])
                  );
                } else { result.daily = { ...DEFAULT_DAILY }; }
              }
              if (!result.monthly) {
                if (result.targets) {
                  result.monthly = Object.fromEntries(
                    Object.keys(DEFAULT_MONTHLY).map(k => [k, result.targets[k] ?? DEFAULT_MONTHLY[k]])
                  );
                } else { result.monthly = { ...DEFAULT_MONTHLY }; }
              }
              // Migrate old lastSubmission → submissions map
              if (!result.submissions) {
                result.submissions = {};
                if (result.lastSubmission?.date) {
                  result.submissions[result.lastSubmission.date] = {
                    actuals: result.lastSubmission.actuals || {},
                    habits:  result.lastSubmission.habits  || {},
                  };
                }
                delete result.lastSubmission;
              }
              // Backfill submittedAt for any submission missing it (legacy data).
              // Use the deadline of that day so legacy submissions stay on-time.
              // Going forward, new submissions always carry a real submittedAt timestamp.
              Object.keys(result.submissions).forEach(dk => {
                const sub = result.submissions[dk];
                if (!sub.submittedAt) sub.submittedAt = streakDeadlineMs(dk);
              });
              if (result.postStreak === undefined) result.postStreak = result.daysPosted || 0;
              // Recompute streaks against current time — handles overnight cutoff transitions
              result.postStreak = computePostStreak(result.submissions);
              result.streak     = computeHabitStreak(result.submissions);
              return result;
            });
            setMembers(migrated);
          }
          if (s.archives) setArchives(s.archives);
          if (s.activeMonth) setActiveMonth(s.activeMonth);
        }
      } catch(e) {}
      setLoaded(true);
    }
    load();
  }, []);
 
  // ── Save archives and activeMonth only (members saved individually on submit) ──
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      sbSetAppState("activeMonth", activeMonth).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [activeMonth, loaded]);
 
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      Object.entries(archives).forEach(([mk, v]) => sbUpsertArchive(mk, v).catch(() => {}));
    }, 150);
    return () => clearTimeout(t);
  }, [archives, loaded]);
 
  const sorted = [...members].map(m => ({ ...m, score: calcScore(m) })).sort((a,b) => b.score - a.score);
  const month  = formatMonthKey(activeMonth);
 
  // ── Check-in submit ──
  async function handleSubmit() {
    if (ciIdx === null) return;
 
    // Block submission for locked past days (deadline passed, nothing submitted yet)
    const member = members[ciIdx];
    const isExistingSubmission = !!member?.submissions?.[submissionDate];
    if (!isExistingSubmission && isDateLocked(submissionDate)) {
      showAlert(
        "Day locked",
        `The deadline for ${formatDateKey(submissionDate)} has passed (3pm EST the next day). This day is permanently locked. No numbers can be added for it. No exceptions.`
      );
      return;
    }
 
    // Block submission for days that haven't opened yet. A day only opens at 3pm EST on
    // that day, so reps can't log a shift they haven't finished. (Editing an existing
    // submission is still allowed, though that shouldn't normally be reachable here.)
    if (!isExistingSubmission && !isDateOpen(submissionDate)) {
      showAlert(
        "Not open yet",
        `${formatDateKey(submissionDate)} doesn't open for submission until 3pm EST that day. Log it once your day is done — you can submit anytime up until 3pm EST the following day.`
      );
      return;
    }
 
    // Validate: at least one number entered OR at least one habit ticked
    const hasNumbers = METRICS.some(({ key }) => {
      const v = logData[key];
      return v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;
    });
    const hasHabits = HABITS.some(h => logData[h]);
    if (!hasNumbers && !hasHabits) {
      showAlert("Nothing to submit", "Please enter at least one number or tick at least one habit before submitting.");
      return;
    }
 
    // Sanitize numeric inputs — block negative or NaN values
    for (const { key, label } of METRICS) {
      const v = logData[key];
      if (v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        showAlert("Invalid number", `"${label}" must be a positive number.`);
        return;
      }
    }
 
    // Warn when submitting for the currently-open day and breaking a habit streak of 3+.
    // (The open day is "today" after 3pm ET, or "yesterday" during the morning grace window.)
    const currentStreak = members[ciIdx].streak;
    const allHabitsTicked = HABITS.every(h => logData[h]);
    const isOpenDay = submissionDate === currentOpenDayKey();
    if (isOpenDay && currentStreak >= 3 && !allHabitsTicked) {
      showConfirm(
        `Break your ${currentStreak} day habit streak?`,
        `Missing any habit will reset your habit streak to 0. Your posting streak is unaffected. Submit anyway?`,
        () => { closeModal(); doSubmit(); },
        true
      );
      return;
    }
 
    doSubmit();
  }
 
  async function doSubmit() {
    setSaving(true);
    try {
      // Read latest state from storage to avoid clobbering concurrent writes
      let cur = members;
      try {
        const s = await loadFromStorage();
        if (s?.members) cur = s.members;
      } catch(e) {}
 
      const targetDate = submissionDate;
      const memberPrev = cur[ciIdx]?.submissions?.[targetDate] || null;
      // Preserve original submittedAt on edits so editing doesn't retroactively break the streak.
      // If the original submission was on-time, the edit is treated as on-time too.
      const preservedSubmittedAt = (memberPrev && memberPrev.submittedAt && memberPrev.submittedAt <= streakDeadlineMs(targetDate))
        ? memberPrev.submittedAt
        : Date.now();
      const newSubmission = {
        actuals:     Object.fromEntries(METRICS.map(({key}) => [key, logData[key]!=="" ? Number(logData[key]) : 0])),
        habits:      Object.fromEntries(HABITS.map(h => [h, !!logData[h]])),
        submittedAt: preservedSubmittedAt,
      };
 
      const updated = cur.map((m,i) => {
        if (i !== ciIdx) return m;
 
        const wasEdit = !!m.submissions?.[targetDate];
        const prev = m.submissions?.[targetDate] || null;
 
        // Adjust running totals: subtract previous values for this date, add new ones
        const na = { ...m.actuals };
        METRICS.forEach(({ key }) => {
          const prevVal = prev?.actuals?.[key] || 0;
          const newVal  = newSubmission.actuals[key] || 0;
          na[key] = Math.max(0, (na[key] || 0) - prevVal + newVal);
        });
 
        const nh = { ...m.habits };
        HABITS.forEach(h => {
          const prevTicked = prev?.habits?.[h] ? 1 : 0;
          const newTicked  = newSubmission.habits[h] ? 1 : 0;
          nh[h] = Math.max(0, (nh[h] || 0) - prevTicked + newTicked);
        });
 
        // Update submissions map
        const newSubs = { ...m.submissions, [targetDate]: newSubmission };
 
        // Recompute streaks from full history (handles backdated submissions correctly)
        const newPostStreak  = computePostStreak(newSubs);
        const newHabitStreak = computeHabitStreak(newSubs);
        // daysPosted reflects the CURRENT month only (submissions history is kept across
        // resets for streaks, so counting all keys would over-count after a rollover).
        const curMonth = monthKey();
        const newDaysPosted  = Object.keys(newSubs).filter(dk => dk.startsWith(curMonth + "-")).length;
 
        return {
          ...m,
          actuals:    na,
          habits:     nh,
          streak:     newHabitStreak,
          postStreak: newPostStreak,
          daysPosted: newDaysPosted,
          submissions: newSubs,
        };
      });
 
      // Save only the affected member to avoid overwriting concurrent submissions
      const affectedMember = updated[ciIdx];
      await sbUpsert("members", String(affectedMember.id), affectedMember);
      setMembers(updated);
 
      const fresh = updated[ciIdx];
      const wasEdit = !!cur[ciIdx].submissions?.[targetDate];
      setConfirmed({
        name:    fresh.name,
        color:   fresh.color,
        actuals: { ...newSubmission.actuals },
        daily:   { ...fresh.daily },
        monthly: { ...(fresh.monthly||DEFAULT_MONTHLY) },
        habits:  { ...newSubmission.habits },
        streak:  fresh.streak,
        postStreak: fresh.postStreak,
        date:    formatDateKey(targetDate),
        targetDate,
        isToday: targetDate === todayKey(),
        wasEdit,
      });
      setCiScreen("CONFIRM");
    } catch(e) {
      showAlert("Save failed", "Something went wrong saving. Please try again.");
    }
    setSaving(false);
  }
 
  function handleCiReset() { setCiScreen("SELECT"); setCiIdx(null); setLogData(EMPTY_LOG()); setConfirmed(null); setCalendarMonth(monthKey()); }
 
  // ── Admin ──
  function openEdit(id) {
    const m = members.find(x => x.id===id);
    setEditTargets({ id, name:m.name, daily:{ ...m.daily }, monthly:{ ...(m.monthly||DEFAULT_MONTHLY) } });
  }
  function saveTargets() {
    const updated = members.map(m => m.id===editTargets.id ? {...m, name:editTargets.name, daily:editTargets.daily, monthly:editTargets.monthly} : m);
    const affected = updated.find(m => m.id===editTargets.id);
    if (affected) sbUpsert("members", String(affected.id), affected).catch(() => {});
    setMembers(updated);
    setEditTargets(null);
  }
  function handlePinDigit(d) {
    if (d==="⌫") { setPinInput(p=>p.slice(0,-1)); setPinError(false); return; }
    if (pinInput.length >= 4) return;
    const next = pinInput + d;
    setPinInput(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === ADMIN_PIN) { setAdminUnlocked(true); setPinError(false); setPinInput(""); }
        else { setPinError(true); setPinInput(""); }
      }, 200);
    }
  }
  function handleResetMonth() {
    showConfirm(
      "Archive this month and start fresh?",
      `This will save the current standings for ${formatMonthKey(activeMonth)} into the Archive tab so you can revisit them later. Then it zeros out actuals, habits, streaks, and days posted for every leader. Targets and names are preserved.\n\nThis cannot be undone.`,
      () => {
        // Snapshot current standings into archive
        const archivingMonth = activeMonth;
        const snapshot = members.map(m => ({
          id: m.id,
          name: m.name,
          color: m.color,
          score: calcScore(m),
          actuals: { ...m.actuals },
          habits: { ...m.habits },
          streak: m.streak || 0,
          postStreak: m.postStreak || 0,
          // Compute daysPosted directly from submissions for this month so it's never stale
          daysPosted: Object.keys(m.submissions || {}).filter(dk => dk.startsWith(archivingMonth + "-")).length,
          daily: { ...m.daily },
          monthly: { ...m.monthly },
        })).sort((a,b) => b.score - a.score);
        setArchives(prev => ({
          ...prev,
          [activeMonth]: { members: snapshot, archivedAt: Date.now() },
        }));
        // Reset live state.
        // Zero out the month's running totals (actuals / habit-day counts) and daysPosted,
        // but PRESERVE the submissions history so post & habit streaks carry across the
        // month boundary. Streaks are then recomputed from that preserved history, so a
        // continuous chain spanning the reset stays intact.
        const resetMembers = members.map(m => ({
          ...m,
          actuals: EMPTY_ACTUALS(),
          habits: { business_plan:0, preplan:0, read_learn:0, workout:0 },
          daysPosted: 0,
          // submissions intentionally kept
          postStreak: computePostStreak(m.submissions || {}),
          streak:     computeHabitStreak(m.submissions || {}),
        }));
        setMembers(resetMembers);
        // CRITICAL: persist the zeroed actuals to Supabase immediately.
        // Without this, a page reload pulls the old month's actuals back from the DB
        // and the new month leaderboard shows last month's numbers.
        Promise.all(resetMembers.map(m => sbUpsert("members", String(m.id), m))).catch(() => {});
        // Roll the active month forward to the current real-world month
        setActiveMonth(monthKey());
        closeModal();
        showFlash(`${formatMonthKey(activeMonth)} archived. Fresh start!`);
      },
      true
    );
  }
 
  // Reset a single member's actuals/habits/streak — keeps name + targets
  function resetMember(id) {
    const m = members.find(x => x.id===id);
    if (!m) return;
    showConfirm(
      `Reset ${m.name}?`,
      "Their numbers, habits, streak, and days posted will all go back to zero. Targets and name will be kept.\n\nThis cannot be undone.",
      () => {
        const resetData = { ...m, actuals:EMPTY_ACTUALS(), habits:{business_plan:0,preplan:0,read_learn:0,workout:0}, streak:0, postStreak:0, daysPosted:0, submissions:{} };
        setMembers(prev => prev.map(x => x.id===id ? resetData : x));
        sbUpsert("members", String(id), resetData).catch(() => {});
        closeModal();
        showFlash(`${m.name} reset!`);
      },
      true
    );
  }
 
  // Add a new member to the team with sensible defaults
  function addMember() {
    showPrompt(
      "Add team member",
      "Enter the new member's full name. They'll get default targets you can customise after adding.",
      "e.g. Jane Smith",
      (rawName) => {
        const name = (rawName || "").trim();
        if (!name) return;
        setMembers(prev => {
          const nextId = (prev.reduce((max,m) => Math.max(max, m.id), 0)) + 1;
          const newMember = {
            id: nextId,
            name,
            color: nextColor(),
            daily:   { ...DEFAULT_DAILY },
            monthly: { ...DEFAULT_MONTHLY },
            actuals: EMPTY_ACTUALS(),
            habits:  { business_plan:0, preplan:0, read_learn:0, workout:0 },
            streak:  0,
            postStreak: 0,
            daysPosted: 0,
            submissions: {},
          };
          return [...prev, newMember];
        });
        closeModal();
        showFlash(`${name} added!`);
      }
    );
  }
 
  // Remove a member entirely
  function removeMember(id) {
    const m = members.find(x => x.id===id);
    if (!m) return;
    showConfirm(
      `Remove ${m.name}?`,
      "Their numbers, targets, habits, and history will all be deleted. They'll be gone from the leaderboard and check-in screens.\n\nThis cannot be undone.",
      () => {
        setMembers(prev => prev.filter(x => x.id!==id));
        sbDeleteMember(String(id));
        closeModal();
        showFlash(`${m.name} removed`);
      },
      true
    );
  }
 
  function showFlash(msg) { setFlash(msg); setTimeout(() => setFlash(null), 2500); }
 
  if (!loaded) return (
    <div style={{ minHeight:"100vh", background:"#0a0a0f", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Barlow Condensed',sans-serif", color:"#FFD700", fontSize:18, letterSpacing:4 }}>LOADING...</div>
  );
 
  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0f", fontFamily:"'Barlow Condensed','Arial Narrow',sans-serif", color:"#e2e8f0", position:"relative", overflow:"hidden" }}>
 
      {/* BG */}
      <div style={{ position:"fixed", inset:0, zIndex:0, backgroundImage:`linear-gradient(rgba(255,215,0,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,215,0,0.04) 1px,transparent 1px)`, backgroundSize:"40px 40px", pointerEvents:"none" }} />
      <div style={{ position:"fixed", top:"-20%", right:"-10%", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,rgba(255,215,0,0.10) 0%,transparent 70%)", pointerEvents:"none", zIndex:0 }} />
      <div style={{ position:"fixed", bottom:"-20%", left:"-10%", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(184,134,11,0.08) 0%,transparent 70%)", pointerEvents:"none", zIndex:0 }} />
 
      <div style={{ position:"relative", zIndex:1, maxWidth:900, margin:"0 auto", padding:"0 16px 60px" }}>
 
        {/* Header */}
        <div style={{ textAlign:"center", padding:"32px 0 20px" }}>
          <div style={{ fontSize:11, letterSpacing:6, color:"#FFD700", textTransform:"uppercase", marginBottom:6, fontWeight:700 }}>CONSISTENCY COMPOUND</div>
          <div style={{ fontSize:42, fontWeight:900, letterSpacing:2, lineHeight:1, background:"linear-gradient(135deg,#fff 0%,#FFD700 60%,#B8860B 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", textTransform:"uppercase" }}>
            LEADER BOARD
          </div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:6, letterSpacing:2 }}>{month} · {members.length} {members.length===1?"LEADER":"LEADERS"}</div>
        </div>
 
        {/* Tabs */}
        <div style={{ display:"flex", gap:4, background:"#0f0f0f", borderRadius:10, padding:4, marginBottom:24, border:"1px solid #1c1c1c" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none", cursor:"pointer", background: tab===t ? (t==="CHECK-IN" ? "linear-gradient(135deg,#FFD700,#B8860B)" : "#FFD700") : "transparent", color: tab===t ? "#fff" : "#64748b", fontFamily:"inherit", fontSize:12, fontWeight:700, letterSpacing:2, transition:"all 0.2s" }}>{t}</button>
          ))}
        </div>
 
        {/* Flash */}
        {flash && (
          <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg,#FFD700,#B8860B)", color:"#fff", padding:"12px 28px", borderRadius:30, fontWeight:700, letterSpacing:2, fontSize:13, zIndex:999, boxShadow:"0 8px 32px rgba(255,215,0,0.4)", animation:"fadeInOut 2.5s ease" }}>
            ✅ {flash.toUpperCase()}
          </div>
        )}
 
        {/* ══ LEADERBOARD ══ */}
        {tab === "LEADERBOARD" && members.length === 0 && (
          <div style={{ background:"#0f0f0f", border:"1px dashed #2a2a2a", borderRadius:14, padding:"60px 20px", textAlign:"center" }}>
            <div style={{ fontSize:42, marginBottom:14 }}>🏆</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#f1f5f9", letterSpacing:2, marginBottom:8 }}>NO LEADERS YET</div>
            <div style={{ fontSize:12, color:"#64748b", letterSpacing:1 }}>Add team members in the Setup tab to start the competition</div>
          </div>
        )}
 
        {tab === "LEADERBOARD" && members.length > 0 && (
          <div>
            {/* Month rollover nudge — shows when real-world month is past activeMonth */}
            {activeMonth !== monthKey() && (
              <div style={{ background:`${GOLD}1A`, border:`1px solid ${GOLD}55`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:11, color:"#cbd5e1", letterSpacing:1, lineHeight:1.5, textAlign:"center" }}>
                📅 <strong style={{ color:GOLD }}>New month started.</strong> {formatMonthKey(activeMonth)} is still showing. Admin: open Setup → Reset Month to archive and start fresh.
              </div>
            )}
 
            {/* Podium — rank-coloured (gold/silver/bronze) */}
            <div style={{ display:"flex", gap:12, marginBottom:20, alignItems:"flex-end" }}>
              {[1,0,2].map((ri,i) => {
                const m = sorted[ri]; if (!m) return null;
                const heights = [160, 200, 130];
                const labels  = ["🥈 2ND", "🥇 1ST", "🥉 3RD"];
                const rankColors = [RANK_SILVER, RANK_GOLD, RANK_BRONZE];
                const glows   = ["rgba(192,192,192,0.25)", "rgba(255,215,0,0.4)", "rgba(205,127,50,0.25)"];
                const rc = rankColors[i];
                return (
                  <div key={m.id} onClick={() => setExpandedId(expandedId===m.id?null:m.id)} style={{ flex:1, height:heights[i], background:`linear-gradient(180deg,${rc}1A 0%,#0f0f0f 100%)`, border:`1px solid ${rc}44`, borderRadius:12, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", boxShadow:`0 0 24px ${glows[i]}`, cursor:"pointer", padding:"12px 8px" }}>
                    <div style={{ fontSize:9, letterSpacing:3, color:"#64748b", marginBottom:4 }}>{labels[i]}</div>
                    <div style={{ width:44, height:44, borderRadius:"50%", background:`linear-gradient(135deg,${rc},${rc}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:900, color:"#0a0a0f", marginBottom:8, boxShadow:`0 0 16px ${rc}55` }}>{m.name.charAt(0)}</div>
                    <div style={{ fontSize:13, fontWeight:800, letterSpacing:1, textAlign:"center", color:"#f1f5f9" }}>{m.name.split(" ")[0].toUpperCase()}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:rc, marginTop:4 }}>{m.score.toLocaleString()}</div>
                    <div style={{ fontSize:9, color:"#64748b", letterSpacing:2 }}>SCORE</div>
                  </div>
                );
              })}
            </div>
 
            {/* List — predominantly black, gold accents only on top 3 + score */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {sorted.map((m, rank) => {
                const isEx = expandedId === m.id;
                const rankColors = [RANK_GOLD, RANK_SILVER, RANK_BRONZE];
                const rc = rank < 3 ? rankColors[rank] : null;
                return (
                  <div key={m.id}>
                    <div onClick={() => setExpandedId(isEx?null:m.id)} style={{ background:"#0f0f0f", border:`1px solid ${isEx ? GOLD+"55" : "#1c1c1c"}`, borderRadius:isEx?"12px 12px 0 0":12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", transition:"border-color 0.2s" }}>
                      {/* Rank badge — coloured only for top 3 */}
                      <div style={{ width:28, height:28, borderRadius:"50%", background: rc ? `linear-gradient(135deg,${rc},${rc}88)` : "#1c1c1c", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900, color: rc ? "#0a0a0f" : "#64748b", flexShrink:0 }}>{rank+1}</div>
                      {/* Initial avatar — uniform muted gold ring for all reps */}
                      <div style={{ width:36, height:36, borderRadius:"50%", background:"#0a0a0a", border:`1px solid ${GOLD}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, color:"#94a3b8", flexShrink:0 }}>{m.name.charAt(0)}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:800, letterSpacing:1, color:"#f1f5f9", marginBottom:4 }}>
                          {m.name.toUpperCase()}
                          {(m.postStreak>1 || m.streak>1 || m.daysPosted>0) && (
                            <span style={{ marginLeft:8, display:"inline-flex", gap:6, flexWrap:"wrap" }}>
                              {m.postStreak>1 && <span style={{ fontSize:10, background:"#1c1c1c", color:"#94a3b8", padding:"2px 8px", borderRadius:20, border:"1px solid #2a2a2a", letterSpacing:1 }}>📅 {m.postStreak}</span>}
                              {m.streak>1 && <span style={{ fontSize:10, background:`${GOLD}1A`, color:GOLD, padding:"2px 8px", borderRadius:20, border:`1px solid ${GOLD}44`, letterSpacing:1 }}>🔥 {m.streak}</span>}
                              {m.daysPosted>0 && <span style={{ fontSize:10, background:"#1c1c1c", color:"#64748b", padding:"2px 8px", borderRadius:20, border:"1px solid #2a2a2a", letterSpacing:1 }}>📆 {m.daysPosted}d</span>}
                            </span>
                          )}
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {METRICS.map(({ key, icon }) => { const p=getPct(m.actuals[key],getMonthly(m,key)); return <div key={key} style={{ display:"flex", alignItems:"center", gap:3, fontSize:10, color:getColor(p) }}><span>{icon}</span><span style={{ fontWeight:700 }}>{p}%</span></div>; })}
                        </div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
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
                                <div style={{ height:3, background:"#1c1c1c", borderRadius:3, marginTop:8, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.min(p,100)}%`, background:c, borderRadius:3, transition:"width 0.5s ease" }} /></div>
                                <div style={{ fontSize:11, fontWeight:700, color:c, marginTop:4 }}>{p}%</div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {HABITS.map(h => <div key={h} style={{ padding:"5px 12px", borderRadius:20, fontSize:10, fontWeight:700, letterSpacing:1, background: m.habits[h]>0 ? `${GOLD}1A` : "#1c1c1c", color: m.habits[h]>0 ? GOLD : "#475569", border:`1px solid ${m.habits[h]>0 ? GOLD+"44" : "#2a2a2a"}` }}>{m.habits[h]>0?"✓":"·"} {HABIT_LABELS[h].toUpperCase()} ({m.habits[h]}d)</div>)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
 
            {/* ── How It Works Guide (collapsible) ── */}
            <div style={{ marginTop:28, marginBottom:8 }}>
              <button onClick={() => setGuideOpen(!guideOpen)} style={{
                width:"100%", padding:"14px 18px", borderRadius:12,
                border:`1px solid ${guideOpen ? GOLD+"55" : "#2a2a2a"}`,
                background: guideOpen ? `${GOLD}0D` : "#0f0f0f",
                color: guideOpen ? GOLD : "#94a3b8",
                fontFamily:"inherit", fontSize:12, fontWeight:700, letterSpacing:2,
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
                transition:"all 0.2s",
              }}>
                <span>📖 HOW THE LEADERBOARD WORKS</span>
                <span style={{ fontSize:14 }}>{guideOpen ? "▲" : "▼"}</span>
              </button>
 
              {guideOpen && (
                <div style={{ marginTop:10, background:"#0f0f0f", border:`1px solid ${GOLD}33`, borderRadius:12, padding:"22px 22px 18px" }}>
 
                  {/* Mission */}
                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, letterSpacing:3, color:GOLD, fontWeight:800, marginBottom:8, textTransform:"uppercase" }}>The Mission</div>
                    <div style={{ fontSize:13, color:"#cbd5e1", lineHeight:1.6 }}>
                      Show up daily. Hit your numbers. Stack your habits. The leader who does all three consistently wins. Simple.
                    </div>
                  </div>
 
                  {/* Daily Check-In */}
                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, letterSpacing:3, color:GOLD, fontWeight:800, marginBottom:8, textTransform:"uppercase" }}>Daily Check-In</div>
                    <div style={{ fontSize:13, color:"#cbd5e1", lineHeight:1.6, marginBottom:10 }}>
                      Submit your numbers <span style={{ color:GOLD, fontWeight:600 }}>every day before 3pm EST the next day</span>. That window is the deadline.
                    </div>
                    <div style={{ background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.35)", borderRadius:8, padding:"10px 13px" }}>
                      <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:10, letterSpacing:2.5, color:"#f87171", fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Miss the deadline, lose the day</div>
                      <div style={{ fontSize:12, color:"#cbd5e1", lineHeight:1.55 }}>
                        After 3pm EST the following day, that day is <span style={{ color:"#fca5a5", fontWeight:600 }}>permanently locked</span>. You cannot add numbers for it. No exceptions. Your post streak breaks and the day counts as zero.
                      </div>
                    </div>
                  </div>
 
                  {/* Score formula */}
                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, letterSpacing:3, color:GOLD, fontWeight:800, marginBottom:10, textTransform:"uppercase" }}>How You Score</div>
                    <div style={{ background:"#0a0a0a", border:`1px solid ${GOLD}33`, borderRadius:8, padding:"12px 14px", fontFamily:"'Barlow Condensed', sans-serif", textAlign:"center", letterSpacing:1, fontSize:12, color:"#f1f5f9", fontWeight:700 }}>
                      SCORE <span style={{ color:GOLD, margin:"0 6px" }}>=</span> METRICS × WEIGHT <span style={{ color:"#64748b", margin:"0 4px" }}>+</span> CONSISTENCY BONUSES
                    </div>
                    <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.55, marginTop:10 }}>
                      Each metric scored as % of your personal target, capped at 150% so overperformance is rewarded but doesn't snowball.
                    </div>
                  </div>
 
                  {/* Metric weights */}
                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, letterSpacing:3, color:GOLD, fontWeight:800, marginBottom:10, textTransform:"uppercase" }}>Metric Weights</div>
                    <div style={{ background:"#0a0a0a", border:"1px solid #1c1c1c", borderRadius:8, overflow:"hidden" }}>
                      {[
                        { icon:"🎪", name:"Event Reg", weight:13, top:true },
                        { icon:"📋", name:"Licenses",  weight:11 },
                        { icon:"🎯", name:"Recruits",  weight:9  },
                        { icon:"💎", name:"Points",    weight:8  },
                        { icon:"📅", name:"Appts Done",   weight:5 },
                        { icon:"📆", name:"Appts Booked", weight:3 },
                        { icon:"📞", name:"Contacts",  weight:2 },
                        { icon:"👥", name:"Friends",   weight:1 },
                      ].map((m, i, arr) => (
                        <div key={m.name} style={{
                          display:"flex", alignItems:"center", padding:"7px 14px",
                          borderBottom: i < arr.length-1 ? "1px solid #1c1c1c" : "none",
                          background: m.top ? `${GOLD}0F` : "transparent",
                        }}>
                          <span style={{ width:24, fontSize:14 }}>{m.icon}</span>
                          <span style={{ flex:1, fontSize:12, color:"#f1f5f9", fontWeight:600 }}>
                            {m.name}
                            {m.top && <span style={{ marginLeft:8, fontSize:9, color:GOLD, background:`${GOLD}26`, border:`1px solid ${GOLD}55`, padding:"1px 6px", borderRadius:10, letterSpacing:1, fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700 }}>HIGHEST</span>}
                          </span>
                          <span style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:15, fontWeight:900, color:GOLD }}>{m.weight}×</span>
                        </div>
                      ))}
                    </div>
                  </div>
 
                  {/* Consistency bonuses */}
                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, letterSpacing:3, color:GOLD, fontWeight:800, marginBottom:10, textTransform:"uppercase" }}>Consistency Bonuses</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      {[
                        { tier:"Show Up",   amount:"+4", desc:"per day in your post streak"   },
                        { tier:"Each Habit",amount:"+3", desc:"per habit completed daily"     },
                        { tier:"All 4 Habits", amount:"+8", desc:"per day in your habit streak" },
                      ].map(b => (
                        <div key={b.tier} style={{ background:"#0a0a0a", border:"1px solid #1c1c1c", borderRadius:8, padding:"10px 8px", textAlign:"center" }}>
                          <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:9, letterSpacing:1.5, color:"#94a3b8", marginBottom:6, textTransform:"uppercase" }}>{b.tier}</div>
                          <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:22, fontWeight:900, color:GOLD, lineHeight:1, marginBottom:4 }}>{b.amount}</div>
                          <div style={{ fontSize:9, color:"#94a3b8", lineHeight:1.3 }}>{b.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
 
                  {/* To Be #1 */}
                  <div style={{ marginBottom:18 }}>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:13, letterSpacing:3, color:GOLD, fontWeight:800, marginBottom:10, textTransform:"uppercase" }}>To Be #1</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {[
                        { n:1, bold:"Show up every day before the 3pm cutoff.", rest:"Protects your post streak. The foundation of everything else." },
                        { n:2, bold:"Tick all 4 habits daily.", rest:"The habit streak is worth more than just posting. Mastery beats attendance." },
                        { n:3, bold:"Hit your daily targets.",  rest:"Especially Event Reg, Licenses and Recruits. They drive everything else downstream." },
                        { n:4, bold:"Don't sandbag.", rest:"Targets are set with you, not by you. 100% of a real target beats 60% of an inflated one." },
                      ].map(s => (
                        <div key={s.n} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                          <div style={{ flexShrink:0, width:20, height:20, background:GOLD, color:"#0a0a0f", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:900 }}>{s.n}</div>
                          <div style={{ fontSize:12, color:"#cbd5e1", lineHeight:1.5, paddingTop:2 }}>
                            <span style={{ color:GOLD, fontWeight:600 }}>{s.bold}</span> {s.rest}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
 
                  {/* Bottom line */}
                  <div style={{ background:`linear-gradient(135deg, ${GOLD}1A, ${GOLD_DEEP}0D)`, border:`1px solid ${GOLD}55`, borderRadius:10, padding:"14px 18px", textAlign:"center" }}>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:16, fontWeight:800, color:GOLD, letterSpacing:1.5, marginBottom:4, textTransform:"uppercase" }}>You can't out-hustle inconsistency.</div>
                    <div style={{ fontSize:11, color:"#cbd5e1", lineHeight:1.5 }}>
                      Show up daily, do the habits, execute the activity. <span style={{ color:GOLD, fontWeight:600 }}>Consistency compounds.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
 
          </div>
        )}
 
        {/* ══ CHECK-IN ══ */}
        {tab === "CHECK-IN" && (
          <div style={{ maxWidth:480, margin:"0 auto" }}>
 
            {/* SELECT */}
            {ciScreen === "SELECT" && members.length === 0 && (
              <div style={{ background:"#0f0f0f", border:"1px dashed #2a2a2a", borderRadius:14, padding:"40px 20px", textAlign:"center" }}>
                <div style={{ fontSize:36, marginBottom:12 }}>👥</div>
                <div style={{ fontSize:14, color:"#94a3b8", letterSpacing:1, marginBottom:6 }}>No team members yet</div>
                <div style={{ fontSize:11, color:"#64748b", letterSpacing:1 }}>An admin needs to add members in the Setup tab.</div>
              </div>
            )}
 
            {ciScreen === "SELECT" && members.length > 0 && (
              <div>
                {/* Cutoff status banner */}
                <div style={{ background:"#0f0f0f", border:`1px solid ${isInGraceWindow() ? GOLD+"33" : "#1c1c1c"}`, borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:11, color:"#94a3b8", letterSpacing:1, lineHeight:1.5, textAlign:"center" }}>
                  {(() => {
                    const { hours, mins } = timeUntilCutoff();
                    const inGrace = isInGraceWindow();
                    const ydayLabel = formatDateKey(prevDayKey(todayKey())).split(",")[0];
                    if (inGrace) {
                      return <>⏰ <strong style={{ color:GOLD }}>{ydayLabel}'s window closes in {hours}h {mins}m</strong> (3pm EST cutoff)</>;
                    }
                    return <>⏰ <strong style={{ color:"#f1f5f9" }}>Today's deadline:</strong> 3pm EST tomorrow ({hours}h {mins}m left)</>;
                  })()}
                </div>
                <div style={{ fontSize:11, color:"#64748b", letterSpacing:3, marginBottom:16, textAlign:"center" }}>WHO ARE YOU?</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {members.map((m,i) => {
                    // The day that's live for logging right now (yesterday before 3pm ET, today after).
                    const openDay = currentOpenDayKey();
                    const submittedOpenDay = !!m.submissions?.[openDay];
                    return (
                      <button key={m.id} onClick={() => {
                        setCiIdx(i);
                        setSubmissionDate(openDay);
                        // Pre-fill if the open day already has a submission
                        if (submittedOpenDay) {
                          const sub = m.submissions[openDay];
                          const ld = EMPTY_LOG();
                          METRICS.forEach(({key}) => { const v = sub.actuals[key]; if (v) ld[key] = String(v); });
                          HABITS.forEach(h => { ld[h] = !!sub.habits[h]; });
                          setLogData(ld);
                        } else {
                          setLogData(EMPTY_LOG());
                        }
                        setCiScreen("FORM");
                      }} style={{ display:"flex", alignItems:"center", gap:14, background:"#0f0f0f", border:`1px solid ${submittedOpenDay ? GOLD+"44" : "#1c1c1c"}`, borderRadius:14, padding:"16px 20px", cursor:"pointer", transition:"all 0.2s", textAlign:"left", width:"100%" }}>
                        <div style={{ width:44, height:44, borderRadius:"50%", background:"#0a0a0a", border:`1px solid ${submittedOpenDay ? GOLD+"66" : GOLD+"33"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:900, color: submittedOpenDay ? GOLD : "#94a3b8", flexShrink:0 }}>{m.name.charAt(0)}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:16, fontWeight:800, letterSpacing:1, color:"#f1f5f9", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                            {m.name}
                            {submittedOpenDay && <span style={{ fontSize:9, background:`${GOLD}1A`, color:GOLD, padding:"2px 7px", borderRadius:20, border:`1px solid ${GOLD}44`, letterSpacing:1 }}>✓ DONE TODAY</span>}
                          </div>
                          <div style={{ fontSize:10, color:"#64748b", letterSpacing:1, marginTop:3, display:"flex", flexWrap:"wrap", gap:8 }}>
                            <span>📅 {m.postStreak||0} day post streak</span>
                            {m.streak>0 && <span style={{ color:GOLD }}>🔥 {m.streak} habit streak</span>}
                            <span>·</span>
                            <span>{m.daysPosted}/month</span>
                          </div>
                        </div>
                        <div style={{ color: submittedOpenDay ? GOLD : "#475569", fontSize: submittedOpenDay ? 12 : 22, fontWeight: submittedOpenDay ? 700 : 400, letterSpacing: submittedOpenDay ? 1 : 0 }}>{submittedOpenDay ? "EDIT" : "›"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
 
            {/* FORM */}
            {ciScreen === "FORM" && ciIdx !== null && ciIdx < members.length && members[ciIdx] && (() => {
              const m = members[ciIdx];
              const isEditing = !!m.submissions?.[submissionDate];
              const isToday   = submissionDate === todayKey();
              const curMk     = monthKey();
              const prevMk    = prevMonthKey(curMk);
              // Calendar shows calendarMonth; allow toggling back one month only
              const showingPrevMonth = calendarMonth === prevMk;
              const monthDays = getMonthDays(calendarMonth);
              return (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:12, background:`${m.color}11`, border:`1px solid ${m.color}33`, borderRadius:12, padding:"12px 16px", marginBottom:14 }}>
                    <div style={{ width:40, height:40, borderRadius:"50%", background:`linear-gradient(135deg,${m.color}55,${m.color}22)`, border:`2px solid ${m.color}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:900, color:m.color }}>{m.name.charAt(0)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:"#f1f5f9", letterSpacing:1, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        {m.name}
                        {isEditing && <span style={{ fontSize:9, background:`${GOLD}1A`, color:GOLD, padding:"2px 7px", borderRadius:20, border:`1px solid ${GOLD}44`, letterSpacing:1 }}>EDITING</span>}
                      </div>
                      <div style={{ fontSize:10, color:"#64748b", letterSpacing:1, marginTop:2, display:"flex", gap:8, flexWrap:"wrap" }}>
                        <span>📅 {m.postStreak||0} post streak</span>
                        {m.streak>0 && <span style={{ color:GOLD }}>🔥 {m.streak} habit streak</span>}
                      </div>
                    </div>
                    <button onClick={() => { setCiScreen("SELECT"); setLogData(EMPTY_LOG()); setSubmissionDate(currentOpenDayKey()); setCalendarMonth(monthKey()); }} style={{ background:"transparent", border:"none", color:"#64748b", fontSize:12, letterSpacing:1, cursor:"pointer", fontFamily:"inherit" }}>CHANGE</button>
                  </div>
 
                  {/* Date picker — calendar grid for the month */}
                  <div style={{ background:"#0f0f0f", border:"1px solid #1c1c1c", borderRadius:12, padding:14, marginBottom:18 }}>
                    {/* Month navigation row */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ fontSize:11, color:"#64748b", letterSpacing:2 }}>SUBMITTING FOR</div>
                        {/* ← prev month button — only show if previous month exists and has submittable days */}
                        <button
                          onClick={() => { setCalendarMonth(showingPrevMonth ? curMk : prevMk); }}
                          style={{ background:"transparent", border:`1px solid ${showingPrevMonth ? GOLD+"55" : "#2a2a2a"}`, borderRadius:6, color: showingPrevMonth ? GOLD : "#64748b", fontSize:10, fontWeight:700, letterSpacing:1, padding:"2px 8px", cursor:"pointer", fontFamily:"inherit" }}
                          title={showingPrevMonth ? `Switch to ${formatMonthKey(curMk)}` : `Edit ${formatMonthKey(prevMk)} numbers`}
                        >
                          {showingPrevMonth ? `◀ ${formatMonthKey(prevMk).split(" ")[0]}` : `← ${formatMonthKey(prevMk).split(" ")[0]}`}
                        </button>
                      </div>
                      <div style={{ fontSize:13, color: isToday ? GOLD : "#f1f5f9", fontWeight:700, letterSpacing:1 }}>
                        {isToday ? "TODAY" : ""} {formatDateKey(submissionDate)}
                      </div>
                    </div>
                    {/* Month label when showing previous month */}
                    {showingPrevMonth && (
                      <div style={{ fontSize:10, color:GOLD, letterSpacing:2, marginBottom:8, textAlign:"center", fontWeight:700 }}>
                        {formatMonthKey(prevMk)} — previous month
                      </div>
                    )}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4 }}>
                      {monthDays.map(dk => {
                        const submitted  = !!m.submissions?.[dk];
                        const isSelected = dk === submissionDate;
                        const isFuture   = dk > todayKey();
                        // A day that hasn't opened yet (before 3pm EST on that day) is not
                        // selectable. Today before the 3pm cutoff falls into this bucket.
                        const notOpenYet = !submitted && !isDateOpen(dk);
                        // Lock past days where deadline has passed AND nothing was submitted
                        const isLocked   = !isFuture && !submitted && isDateLocked(dk);
                        const isDisabled = isFuture || isLocked || notOpenYet;
                        const dayNum = parseInt(dk.split("-")[2], 10);
                        return (
                          <button
                            key={dk}
                            disabled={isDisabled}
                            onClick={() => {
                              if (isDisabled) return;
                              setSubmissionDate(dk);
                              const sub = m.submissions?.[dk];
                              if (sub) {
                                const ld = EMPTY_LOG();
                                METRICS.forEach(({key}) => { const v = sub.actuals[key]; if (v) ld[key] = String(v); });
                                HABITS.forEach(h => { ld[h] = !!sub.habits[h]; });
                                setLogData(ld);
                              } else {
                                setLogData(EMPTY_LOG());
                              }
                            }}
                            style={{
                              aspectRatio:"1", borderRadius:6, fontFamily:"inherit",
                              fontSize:11, fontWeight:700,
                              cursor: isDisabled ? "not-allowed" : "pointer",
                              border: isSelected ? `2px solid ${GOLD}` : `1px solid ${submitted ? GOLD+"44" : isLocked ? "#3a1a1a" : "#1c1c1c"}`,
                              background: isSelected ? `${GOLD}33` : submitted ? `${GOLD}11` : isLocked ? "#1a0a0a" : "#0a0a0a",
                              color: isFuture || notOpenYet ? "#334155" : isLocked ? "#5a3a3a" : submitted ? GOLD : isSelected ? GOLD : "#94a3b8",
                              opacity: isFuture ? 0.4 : notOpenYet ? 0.4 : isLocked ? 0.7 : 1,
                              position:"relative",
                              transition:"all 0.15s",
                            }}
                            title={isLocked ? `${formatDateKey(dk)}. Locked: deadline passed` : notOpenYet ? `${formatDateKey(dk)}. Opens 3pm EST that day` : formatDateKey(dk)}
                          >
                            {dayNum}
                            {isLocked && <span style={{ position:"absolute", top:1, right:2, fontSize:7, lineHeight:1 }}>🔒</span>}
                            {notOpenYet && !isFuture && <span style={{ position:"absolute", top:1, right:2, fontSize:7, lineHeight:1 }}>⏳</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", gap:12, marginTop:10, fontSize:9, color:"#64748b", letterSpacing:1, justifyContent:"center", flexWrap:"wrap" }}>
                      <span><span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:GOLD, marginRight:5, verticalAlign:"middle" }} />Posted</span>
                      <span><span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:"transparent", border:`2px solid ${GOLD}`, marginRight:5, verticalAlign:"middle" }} />Selected</span>
                      <span><span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:"#1c1c1c", marginRight:5, verticalAlign:"middle" }} />Available</span>
                      <span>⏳ Opens 3pm EST</span>
                      <span>🔒 Locked</span>
                    </div>
                  </div>
 
                  {isEditing && (
                    <div style={{ background:`${GOLD}0D`, border:`1px solid ${GOLD}33`, borderRadius:10, padding:"10px 14px", marginBottom:18, fontSize:11, color:"#94a3b8", letterSpacing:1, lineHeight:1.5 }}>
                      ✏️ <strong style={{ color:GOLD }}>Editing {isToday ? "today" : formatDateKey(submissionDate)}.</strong> Changes will replace the previous submission for this day.
                    </div>
                  )}
 
                  <div style={{ fontSize:11, color:"#64748b", letterSpacing:3, marginBottom:14 }}>{isToday ? "TODAY'S NUMBERS" : "NUMBERS FOR THIS DAY"}</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 }}>
                    {METRICS.map(({ key, label, icon, monthlyOnly, def }) => (
                      <div key={key} style={{ background:"#0f0f0f", border:`1px solid ${logData[key]!==""?m.color+"44":"#1c1c1c"}`, borderRadius:12, padding:"14px 16px", transition:"border-color 0.2s" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <span style={{ fontSize:22 }}>{icon}</span>
                            <div>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <span style={{ fontSize:14, fontWeight:800, letterSpacing:1, color:logData[key]!==""?"#f1f5f9":"#94a3b8" }}>{label.toUpperCase()}</span>
                                <span
                                  title={def}
                                  onClick={(e) => { e.stopPropagation(); showAlert(label.toUpperCase(), def); }}
                                  style={{
                                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                                    width:15, height:15, borderRadius:"50%",
                                    background:"#1c1c1c", color:"#94a3b8",
                                    fontSize:10, fontWeight:700, fontFamily:"serif", fontStyle:"italic",
                                    cursor:"help", userSelect:"none",
                                    border:`1px solid ${GOLD}33`,
                                  }}
                                >i</span>
                              </div>
                              <div style={{ fontSize:10, color:"#475569", letterSpacing:1, marginTop:2 }}>
                                {monthlyOnly ? 'Monthly target:' : 'Daily target:'} <span style={{ color:"#64748b", fontWeight:700 }}>{monthlyOnly ? getMonthly(m,key).toLocaleString() : m.daily[key]}</span>
                                &nbsp;·&nbsp;Month to date: <span style={{ color:"#64748b" }}>{(m.actuals[key]||0).toLocaleString()} / {getMonthly(m,key).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          <input type="number" min="0" value={logData[key]} onChange={e => setLogData(p=>({...p,[key]:e.target.value}))} placeholder="0" style={{ width:72, background:"#0a0a0f", border:`1px solid ${logData[key]!==""?m.color+"66":"#2a2a2a"}`, borderRadius:8, padding:"10px 12px", color:logData[key]!==""?m.color:"#f1f5f9", fontFamily:"inherit", fontSize:18, fontWeight:900, outline:"none", textAlign:"center", transition:"all 0.2s", boxSizing:"border-box" }} />
                        </div>
                      </div>
                    ))}
                  </div>
 
                  <div style={{ fontSize:11, color:"#64748b", letterSpacing:3, marginBottom:14 }}>DAILY HABITS</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:32 }}>
                    {HABITS.map(h => (
                      <div key={h} onClick={() => setLogData(p=>({...p,[h]:!p[h]}))} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, background:logData[h]?`${m.color}22`:"#0f0f0f", border:`2px solid ${logData[h]?m.color+"88":"#1c1c1c"}`, borderRadius:14, padding:"18px 12px", cursor:"pointer", transition:"all 0.2s", userSelect:"none" }}>
                        <span style={{ fontSize:26 }}>{HABIT_ICONS[h]}</span>
                        <span style={{ fontSize:11, fontWeight:700, letterSpacing:1, color:logData[h]?m.color:"#475569", textAlign:"center" }}>{HABIT_LABELS[h].toUpperCase()}</span>
                        <div style={{ width:24, height:24, borderRadius:"50%", background:logData[h]?m.color:"#1c1c1c", border:`2px solid ${logData[h]?m.color:"#2a2a2a"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#0a0a0f", transition:"all 0.2s" }}>{logData[h]?"✓":""}</div>
                      </div>
                    ))}
                  </div>
 
                  <button onClick={handleSubmit} disabled={saving} style={{ width:"100%", padding:"18px", borderRadius:14, border:"none", background:saving?"#2a2a2a":`linear-gradient(135deg,${m.color},${m.color}88)`, color:saving?"#64748b":"#0a0a0f", fontFamily:"inherit", fontSize:15, fontWeight:900, letterSpacing:3, cursor:saving?"not-allowed":"pointer", textTransform:"uppercase", boxShadow:saving?"none":`0 4px 32px ${m.color}44`, transition:"all 0.3s" }}>
                    {saving ? "SAVING..." : isEditing ? (isToday ? "✓ UPDATE TODAY'S SUBMISSION" : "✓ UPDATE THIS DAY'S SUBMISSION") : (isToday ? "✓ SUBMIT TODAY'S NUMBERS" : "✓ SUBMIT FOR THIS DAY")}
                  </button>
                </div>
              );
            })()}
 
            {/* CONFIRM */}
            {ciScreen === "CONFIRM" && confirmed && (
              <div style={{ textAlign:"center" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:24 }}>
                  <div style={{ width:72, height:72, borderRadius:"50%", background:`linear-gradient(135deg,${confirmed.color},${confirmed.color}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, fontWeight:900, color:"#0a0a0f", marginBottom:16, boxShadow:`0 0 32px ${confirmed.color}66` }}>✓</div>
                  <div style={{ fontSize:26, fontWeight:900, letterSpacing:2, color:"#f1f5f9", marginBottom:4 }}>{confirmed.wasEdit ? "UPDATED! ✏️" : "NUMBERS IN! 🔥"}</div>
                  <div style={{ fontSize:12, color:"#64748b", letterSpacing:1 }}>{confirmed.date}</div>
                </div>
 
                {/* Screenshot card */}
                <div style={{ background:"#0f0f0f", border:`2px solid ${confirmed.color}55`, borderRadius:20, padding:24, marginBottom:20, textAlign:"left" }}>
                  {/* Rep header */}
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, paddingBottom:16, borderBottom:"1px solid #1c1c1c" }}>
                    <div style={{ width:46, height:46, borderRadius:"50%", background:`linear-gradient(135deg,${confirmed.color}55,${confirmed.color}22)`, border:`2px solid ${confirmed.color}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:900, color:confirmed.color }}>{confirmed.name.charAt(0)}</div>
                    <div>
                      <div style={{ fontSize:16, fontWeight:900, letterSpacing:1, color:"#f1f5f9" }}>{confirmed.name.toUpperCase()}</div>
                      <div style={{ fontSize:10, color:"#64748b", letterSpacing:1 }}>CONSISTENCY COMPOUND · {confirmed.date.toUpperCase()}</div>
                    </div>
                  </div>
 
                  {/* Numbers — every metric shown, even if 0 */}
                  <div style={{ marginBottom:16 }}>
                    {METRICS.map(({ key, label, icon, monthlyOnly }) => {
                      const val    = confirmed.actuals[key] || 0;
                      const target = monthlyOnly ? (confirmed.monthly?.[key] || 0) : (confirmed.daily?.[key] || 0);
                      const hit    = target > 0 && val >= target;
                      const pct    = target > 0 ? Math.round((val/target)*100) : null;
                      const suffix = monthlyOnly ? "mo target" : "daily";
                      const isZero = val === 0;
                      return (
                        <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #0a0a0a" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color: isZero ? "#475569" : "#94a3b8", letterSpacing:1 }}>
                            <span style={{ opacity: isZero ? 0.4 : 1 }}>{icon}</span> {label.toUpperCase()}
                          </div>
                          <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                            <div style={{ fontSize:20, fontWeight:900, color: hit ? "#FFD700" : isZero ? "#475569" : "#f1f5f9" }}>{val.toLocaleString()}</div>
                            <div style={{ fontSize:11, color:"#475569" }}>/ {target.toLocaleString()} {suffix}</div>
                            {pct !== null && <div style={{ fontSize:10, fontWeight:700, color: hit?"#FFD700":"#94a3b8", background: hit?"#FFD70022":"#1c1c1c", padding:"2px 6px", borderRadius:10, border: hit?"1px solid #FFD70055":"1px solid #2a2a2a" }}>{hit?"✓":pct+"%"}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
 
                  {/* Habits */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:confirmed.streak>1?16:0 }}>
                    {HABITS.map(h => (
                      <div key={h} style={{ padding:"5px 12px", borderRadius:20, fontSize:10, fontWeight:700, letterSpacing:1, background:confirmed.habits[h]?"#FFD70022":"#1c1c1c", color:confirmed.habits[h]?"#FFD700":"#334155", border:`1px solid ${confirmed.habits[h]?"#FFD70044":"#2a2a2a"}` }}>
                        {confirmed.habits[h]?"✓":"·"} {HABIT_LABELS[h].toUpperCase()}
                      </div>
                    ))}
                  </div>
 
                  {/* Streaks */}
                  {(confirmed.postStreak > 0 || confirmed.streak > 0) && (
                    <div style={{ paddingTop:14, borderTop:"1px solid #1c1c1c", display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
                      {confirmed.postStreak > 0 && (
                        <span style={{ fontSize:13, color:"#94a3b8", fontWeight:700, letterSpacing:1.5 }}>📅 {confirmed.postStreak} DAY POST STREAK</span>
                      )}
                      {confirmed.streak > 0 && (
                        <span style={{ fontSize:13, color:"#FFD700", fontWeight:700, letterSpacing:1.5 }}>🔥 {confirmed.streak} HABIT STREAK</span>
                      )}
                    </div>
                  )}
                </div>
 
                <div style={{ background:"#0a0a0a", border:"1px dashed #2a2a2a", borderRadius:12, padding:"14px 20px", marginBottom:20, fontSize:12, color:"#64748b", letterSpacing:1, lineHeight:1.8 }}>
                  📸 <strong style={{ color:"#94a3b8" }}>Screenshot the card above</strong> and post it to the Telegram group as your daily check-in
                </div>
 
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => {
                    // Re-enter edit mode for the same rep
                    const m = members[ciIdx];
                    if (m && m.lastSubmission && m.lastSubmission.date === todayKey()) {
                      const ld = EMPTY_LOG();
                      METRICS.forEach(({key}) => { const v = m.lastSubmission.actuals[key]; if (v) ld[key] = String(v); });
                      HABITS.forEach(h => { ld[h] = !!m.lastSubmission.habits[h]; });
                      setLogData(ld);
                    }
                    setConfirmed(null);
                    setCiScreen("FORM");
                  }} style={{ flex:1, padding:"14px", borderRadius:12, border:`1px solid ${GOLD}44`, background:`${GOLD}0D`, color:GOLD, fontFamily:"inherit", fontSize:12, fontWeight:700, letterSpacing:2, cursor:"pointer" }}>
                    ✏️ EDIT
                  </button>
                  <button onClick={handleCiReset} style={{ flex:1, padding:"14px", borderRadius:12, border:"1px solid #2a2a2a", background:"transparent", color:"#94a3b8", fontFamily:"inherit", fontSize:12, fontWeight:700, letterSpacing:2, cursor:"pointer" }}>
                    DONE
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
 
        {/* ══ ARCHIVE ══ */}
        {tab === "ARCHIVE" && (() => {
          const archiveKeys = Object.keys(archives).sort().reverse();
          // If viewing a specific archive month
          if (viewingArchive && archives[viewingArchive]) {
            const arch = archives[viewingArchive];
            const sortedArch = arch.members; // already sorted at archive time
            return (
              <div>
                <button onClick={() => { setViewingArchive(null); setExpandedArchiveId(null); }} style={{ background:"transparent", border:"none", color:"#94a3b8", fontSize:11, letterSpacing:2, cursor:"pointer", fontFamily:"inherit", marginBottom:16, padding:"4px 0" }}>← BACK TO ARCHIVES</button>
 
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:36, fontWeight:900, color:GOLD, letterSpacing:2, lineHeight:1 }}>{formatMonthKey(viewingArchive)}</div>
                  <div style={{ fontSize:11, color:"#64748b", marginTop:4, letterSpacing:1 }}>Final standings · Archived {new Date(arch.archivedAt).toLocaleDateString("default", { month:"short", day:"numeric", year:"numeric" })}</div>
                </div>
 
                {/* Frozen podium */}
                <div style={{ display:"flex", gap:12, marginBottom:20, alignItems:"flex-end" }}>
                  {[1,0,2].map((ri,i) => {
                    const m = sortedArch[ri]; if (!m) return null;
                    const heights = [140, 170, 110];
                    const labels  = ["🥈 2ND", "🥇 1ST", "🥉 3RD"];
                    const rankColors = [RANK_SILVER, RANK_GOLD, RANK_BRONZE];
                    const rc = rankColors[i];
                    return (
                      <div key={m.id} style={{ flex:1, height:heights[i], background:`linear-gradient(180deg,${rc}1A 0%,#0f0f0f 100%)`, border:`1px solid ${rc}44`, borderRadius:12, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"10px 8px" }}>
                        <div style={{ fontSize:9, letterSpacing:3, color:"#64748b", marginBottom:4 }}>{labels[i]}</div>
                        <div style={{ width:40, height:40, borderRadius:"50%", background:`linear-gradient(135deg,${rc},${rc}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:900, color:"#0a0a0f", marginBottom:6 }}>{m.name.charAt(0)}</div>
                        <div style={{ fontSize:12, fontWeight:800, letterSpacing:1, textAlign:"center", color:"#f1f5f9" }}>{m.name.split(" ")[0].toUpperCase()}</div>
                        <div style={{ fontSize:18, fontWeight:900, color:rc, marginTop:2 }}>{m.score.toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>
 
                {/* Frozen list — tappable to expand full metric breakdown */}
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {sortedArch.map((m, rank) => {
                    const rankColors = [RANK_GOLD, RANK_SILVER, RANK_BRONZE];
                    const rc = rank < 3 ? rankColors[rank] : null;
                    const isEx = expandedArchiveId === m.id;
                    return (
                      <div key={m.id}>
                        <div onClick={() => setExpandedArchiveId(isEx ? null : m.id)} style={{ background:"#0f0f0f", border:`1px solid ${isEx ? GOLD+"55" : "#1c1c1c"}`, borderRadius:isEx?"12px 12px 0 0":10, padding:"10px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", transition:"border-color 0.2s" }}>
                          <div style={{ width:24, height:24, borderRadius:"50%", background: rc ? `linear-gradient(135deg,${rc},${rc}88)` : "#1c1c1c", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:900, color: rc ? "#0a0a0f" : "#64748b", flexShrink:0 }}>{rank+1}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", letterSpacing:1, marginBottom:3 }}>{m.name.toUpperCase()}</div>
                            <div style={{ fontSize:10, color:"#64748b", display:"flex", gap:8, flexWrap:"wrap" }}>
                              {m.postStreak>0 && <span>📅 {m.postStreak}</span>}
                              {m.streak>0 && <span style={{ color:GOLD }}>🔥 {m.streak}</span>}
                              {m.daysPosted>0 && <span>📆 {m.daysPosted}d posted</span>}
                            </div>
                          </div>
                          <div style={{ fontSize:18, fontWeight:900, color: rc || GOLD, minWidth:50, textAlign:"right" }}>{m.score.toLocaleString()}</div>
                        </div>
                        {isEx && (
                          <div style={{ background:"#0a0a0a", border:`1px solid ${GOLD}33`, borderTop:"none", borderRadius:"0 0 12px 12px", padding:16 }}>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:12 }}>
                              {METRICS.map(({ key, label, icon }) => {
                                const actual = m.actuals?.[key] || 0;
                                const target = (() => {
                                  const met = METRICS.find(x => x.key === key);
                                  if (met?.monthlyOnly) return m.monthly?.[key] ?? DEFAULT_MONTHLY[key] ?? 0;
                                  return Math.round((m.daily?.[key] ?? 0) * WORK_DAYS);
                                })();
                                const p = getPct(actual, target);
                                const c = getColor(p);
                                return (
                                  <div key={key} style={{ background:"#0f0f0f", borderRadius:10, padding:"10px 12px", border:"1px solid #1c1c1c" }}>
                                    <div style={{ fontSize:10, color:"#64748b", letterSpacing:2, marginBottom:4 }}>{icon} {label.toUpperCase()}</div>
                                    <div style={{ fontSize:20, fontWeight:900, color:c }}>{actual.toLocaleString()}</div>
                                    <div style={{ fontSize:10, color:"#64748b" }}>of {target.toLocaleString()}</div>
                                    <div style={{ height:3, background:"#1c1c1c", borderRadius:3, marginTop:8, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.min(p,100)}%`, background:c, borderRadius:3 }} /></div>
                                    <div style={{ fontSize:11, fontWeight:700, color:c, marginTop:4 }}>{p}%</div>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                              {HABITS.map(h => {
                                const count = m.habits?.[h] || 0;
                                return (
                                  <div key={h} style={{ padding:"5px 12px", borderRadius:20, fontSize:10, fontWeight:700, letterSpacing:1, background: count>0 ? `${GOLD}1A` : "#1c1c1c", color: count>0 ? GOLD : "#475569", border:`1px solid ${count>0 ? GOLD+"44" : "#2a2a2a"}` }}>
                                    {count>0?"✓":"·"} {HABIT_LABELS[h].toUpperCase()} ({count}d)
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
 
          // Archive index — list of past months
          return (
            <div>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:28, fontWeight:900, color:"#f1f5f9", letterSpacing:2, lineHeight:1 }}>HISTORY</div>
                <div style={{ fontSize:11, color:"#64748b", marginTop:4, letterSpacing:1 }}>{archiveKeys.length === 0 ? "No archived months yet" : `${archiveKeys.length} archived month${archiveKeys.length===1?"":"s"}`}</div>
              </div>
 
              {archiveKeys.length === 0 ? (
                <div style={{ background:"#0f0f0f", border:"1px dashed #2a2a2a", borderRadius:14, padding:"40px 20px", textAlign:"center" }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📚</div>
                  <div style={{ fontSize:13, color:"#94a3b8", letterSpacing:1, marginBottom:6 }}>No archived months yet</div>
                  <div style={{ fontSize:11, color:"#64748b", letterSpacing:1, lineHeight:1.5 }}>When you reset the month from the Setup tab, the current standings will be saved here so you can revisit them anytime.</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {archiveKeys.map(key => {
                    const arch = archives[key];
                    const winner = arch.members[0];
                    const second = arch.members[1];
                    const third  = arch.members[2];
                    return (
                      <button key={key} onClick={() => { setViewingArchive(key); setExpandedArchiveId(null); }} style={{ background:"#0f0f0f", border:"1px solid #1c1c1c", borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:18, fontWeight:800, color:"#f1f5f9", letterSpacing:1.5 }}>{formatMonthKey(key)}</div>
                          <div style={{ fontSize:11, color:"#94a3b8", marginTop:4, display:"flex", flexWrap:"wrap", gap:8 }}>
                            {winner && <span>🥇 <span style={{ color:GOLD, fontWeight:600 }}>{winner.name.split(" ")[0]}</span> {winner.score.toLocaleString()}</span>}
                            {second && <span style={{ color:"#94a3b8" }}>🥈 {second.name.split(" ")[0]}</span>}
                            {third  && <span style={{ color:"#94a3b8" }}>🥉 {third.name.split(" ")[0]}</span>}
                          </div>
                        </div>
                        <div style={{ color:"#64748b", fontSize:18 }}>›</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
 
        {/* ══ SETUP ══ */}
        {tab === "SETUP" && (
          <div>
            {!adminUnlocked ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"40px 20px" }}>
                <div style={{ fontSize:40, marginBottom:16 }}>🔒</div>
                <div style={{ fontSize:18, fontWeight:800, letterSpacing:3, color:"#f1f5f9", marginBottom:8 }}>ADMIN ACCESS</div>
                <div style={{ fontSize:12, color:"#64748b", letterSpacing:2, marginBottom:32 }}>ENTER PIN TO MANAGE TARGETS</div>
                <div style={{ display:"flex", gap:10, marginBottom:24 }}>
                  {[0,1,2,3].map(i => <div key={i} style={{ width:16, height:16, borderRadius:"50%", background:pinInput.length>i?"#FFD700":"#1c1c1c", border:"2px solid #2a2a2a", transition:"background 0.2s" }} />)}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,64px)", gap:10, marginBottom:16 }}>
                  {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i) => (
                    <button key={i} onClick={() => d!==""&&handlePinDigit(String(d))} style={{ width:64, height:64, borderRadius:12, border:"1px solid #2a2a2a", background:d===""?"transparent":"#0f0f0f", color:"#f1f5f9", fontFamily:"inherit", fontSize:d==="⌫"?20:22, fontWeight:700, cursor:d===""?"default":"pointer", transition:"all 0.15s" }}>{d}</button>
                  ))}
                </div>
                {pinError && <div style={{ fontSize:11, color:"#f87171", letterSpacing:2 }}>INCORRECT PIN. TRY AGAIN</div>}
                <div style={{ fontSize:10, color:"#334155", marginTop:24, letterSpacing:1 }}>Default PIN: 1234 (change ADMIN_PIN in code)</div>
              </div>
            ) : (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div style={{ fontSize:10, color:"#64748b", letterSpacing:3 }}>{members.length} TEAM MEMBER{members.length===1?"":"S"}</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button onClick={addMember} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid #FFD70044", background:"#FFD70011", color:"#FFD700", fontFamily:"inherit", fontSize:10, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>+ ADD MEMBER</button>
                    <button onClick={handleResetMonth} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid #f8717144", background:"#f8717111", color:"#f87171", fontFamily:"inherit", fontSize:10, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>🔄 RESET MONTH</button>
                    <button onClick={() => setAdminUnlocked(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid #2a2a2a", background:"#0f0f0f", color:"#64748b", fontFamily:"inherit", fontSize:10, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>🔒 LOCK</button>
                  </div>
                </div>
 
                {/* Helper note */}
                <div style={{ background:"#0f0f0f", border:"1px solid #1c1c1c", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:11, color:"#64748b", letterSpacing:1, lineHeight:1.6 }}>
                  💡 Click <strong style={{ color:"#FFD700" }}>EDIT</strong> to change targets, reset, or remove a member. Daily metrics auto-multiply by {WORK_DAYS} working days for the monthly total.
                </div>
 
                {members.length === 0 && (
                  <div style={{ background:"#0f0f0f", border:"1px dashed #2a2a2a", borderRadius:12, padding:"32px 16px", textAlign:"center", marginBottom:14 }}>
                    <div style={{ fontSize:30, marginBottom:8 }}>👥</div>
                    <div style={{ fontSize:13, color:"#64748b", letterSpacing:1, marginBottom:4 }}>No team members yet</div>
                    <div style={{ fontSize:11, color:"#475569" }}>Click + ADD MEMBER above to get started</div>
                  </div>
                )}
 
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {members.map(m => {
                    const monthDays = getMonthDays();
                    return (
                      <div key={m.id} style={{ background:"#0f0f0f", border:"1px solid #1c1c1c", borderRadius:12, padding:"14px 16px" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:12 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                            <div style={{ width:36, height:36, borderRadius:"50%", background:"#0a0a0a", border:`1px solid ${GOLD}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, color:GOLD, flexShrink:0 }}>{m.name.charAt(0)}</div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:800, color:"#f1f5f9", letterSpacing:1 }}>{m.name.toUpperCase()}</div>
                              <div style={{ fontSize:10, color:"#64748b", marginTop:2, display:"flex", flexWrap:"wrap", gap:8 }}>
                                <span>📅 {m.postStreak||0} streak</span>
                                <span>·</span>
                                <span>{m.daysPosted||0}/{monthDays.length} days</span>
                              </div>
                            </div>
                          </div>
                          <button onClick={() => openEdit(m.id)} style={{ padding:"7px 16px", borderRadius:8, border:`1px solid ${GOLD}44`, background:`${GOLD}11`, color:GOLD, fontFamily:"inherit", fontSize:10, fontWeight:700, letterSpacing:2, cursor:"pointer", flexShrink:0 }}>EDIT</button>
                        </div>
                        {/* Mini calendar — shows posted days */}
                        <div style={{ display:"grid", gridTemplateColumns:`repeat(${monthDays.length}, 1fr)`, gap:2 }}>
                          {monthDays.map(dk => {
                            const sub = m.submissions?.[dk];
                            const isFuture = dk > todayKey();
                            const isToday  = dk === todayKey();
                            const allHabits = sub && HABITS.every(h => sub.habits?.[h]);
                            return (
                              <div key={dk} title={`${formatDateKey(dk)}${sub ? " ✓ posted" : isFuture ? "" : ". Missed"}`} style={{
                                aspectRatio:"1", borderRadius:2,
                                background: sub ? (allHabits ? GOLD : `${GOLD}66`) : isFuture ? "transparent" : "#1c1c1c",
                                border: isToday ? `1px solid ${GOLD}` : "none",
                                opacity: isFuture ? 0.3 : 1,
                              }} />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
 
                {/* Edit modal */}
                {editTargets && (
                  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 }}>
                    <div style={{ background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:16, padding:24, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto" }}>
                      <div style={{ fontSize:16, fontWeight:800, letterSpacing:2, marginBottom:20, color:"#f1f5f9" }}>EDIT MEMBER</div>
 
                      {/* Name */}
                      <div style={{ marginBottom:20 }}>
                        <div style={{ fontSize:10, color:"#64748b", letterSpacing:2, marginBottom:6 }}>NAME</div>
                        <input value={editTargets.name} onChange={e => setEditTargets(p=>({...p,name:e.target.value}))} style={{ width:"100%", background:"#0a0a0f", border:"1px solid #2a2a2a", borderRadius:8, padding:"10px 12px", color:"#f1f5f9", fontFamily:"inherit", fontSize:14, outline:"none", boxSizing:"border-box" }} />
                      </div>
 
                      {/* Daily targets */}
                      <div style={{ fontSize:10, color:"#FFD700", letterSpacing:2, marginBottom:6 }}>DAILY TARGETS</div>
                      <div style={{ fontSize:10, color:"#334155", letterSpacing:1, marginBottom:10 }}>Monthly auto-calculates as daily × {WORK_DAYS} working days</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                        {METRICS.filter(m => !m.monthlyOnly).map(({ key, label, icon }) => {
                          const calcedMonthly = Math.round((editTargets.daily[key]||0) * WORK_DAYS);
                          return (
                            <div key={key} style={{ display:"flex", alignItems:"center", gap:12, background:"#0a0a0a", borderRadius:10, padding:"10px 14px" }}>
                              <span style={{ fontSize:18, flexShrink:0 }}>{icon}</span>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:11, color:"#64748b", letterSpacing:1, marginBottom:2 }}>{label.toUpperCase()}</div>
                                <div style={{ fontSize:10, color:"#334155" }}>→ {calcedMonthly.toLocaleString()} / month</div>
                              </div>
                              <input type="number" min="0" value={editTargets.daily[key]} onChange={e => setEditTargets(p=>({...p,daily:{...p.daily,[key]:Number(e.target.value)}}))} style={{ width:70, background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontFamily:"inherit", fontSize:16, fontWeight:900, outline:"none", textAlign:"center", boxSizing:"border-box" }} />
                              <div style={{ fontSize:10, color:"#475569", width:28 }}>/day</div>
                            </div>
                          );
                        })}
                      </div>
 
                      {/* Monthly targets — results metrics */}
                      <div style={{ fontSize:10, color:"#B8860B", letterSpacing:2, marginBottom:6 }}>MONTHLY TARGETS</div>
                      <div style={{ fontSize:10, color:"#334155", letterSpacing:1, marginBottom:10 }}>Set directly: Recruits, Points, Event Reg, Licenses</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                        {METRICS.filter(m => m.monthlyOnly).map(({ key, label, icon }) => (
                          <div key={key} style={{ display:"flex", alignItems:"center", gap:12, background:"#0a0a0a", borderRadius:10, padding:"10px 14px" }}>
                            <span style={{ fontSize:18, flexShrink:0 }}>{icon}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:11, color:"#64748b", letterSpacing:1 }}>{label.toUpperCase()}</div>
                            </div>
                            <input type="number" min="0" value={editTargets.monthly?.[key] ?? DEFAULT_MONTHLY[key]} onChange={e => setEditTargets(p=>({...p,monthly:{...p.monthly,[key]:Number(e.target.value)}}))} style={{ width:90, background:"#0f0f0f", border:"1px solid #2a2a2a", borderRadius:8, padding:"8px 10px", color:"#f1f5f9", fontFamily:"inherit", fontSize:16, fontWeight:900, outline:"none", textAlign:"center", boxSizing:"border-box" }} />
                            <div style={{ fontSize:10, color:"#475569", width:40 }}>/month</div>
                          </div>
                        ))}
                      </div>
 
                      {/* Danger zone */}
                      <div style={{ marginBottom:16, paddingTop:16, borderTop:"1px solid #1c1c1c" }}>
                        <div style={{ fontSize:10, color:"#f87171", letterSpacing:2, marginBottom:8 }}>DANGER ZONE</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => { resetMember(editTargets.id); setEditTargets(null); }} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid #FFD70044", background:"#FFD70011", color:"#FFD700", fontFamily:"inherit", fontSize:10, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>🔄 RESET NUMBERS</button>
                          <button onClick={() => { removeMember(editTargets.id); setEditTargets(null); }} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid #f8717144", background:"#f8717111", color:"#f87171", fontFamily:"inherit", fontSize:10, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>🗑 REMOVE</button>
                        </div>
                      </div>
 
                      <div style={{ display:"flex", gap:10 }}>
                        <button onClick={() => setEditTargets(null)} style={{ flex:1, padding:"12px", borderRadius:10, border:"1px solid #2a2a2a", background:"transparent", color:"#64748b", fontFamily:"inherit", fontSize:11, fontWeight:700, letterSpacing:2, cursor:"pointer" }}>CANCEL</button>
                        <button onClick={saveTargets} style={{ flex:2, padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#FFD700,#B8860B)", color:"#0a0a0f", fontFamily:"inherit", fontSize:11, fontWeight:900, letterSpacing:2, cursor:"pointer" }}>SAVE TARGETS</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
 
      {/* ── Modal (alert / confirm / prompt) ── */}
      {modal && (
        <div onClick={() => modal.type === "alert" ? closeModal() : null} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#0f0f0f", border:`1px solid ${modal.danger ? "#f8717144" : "#2a2a2a"}`, borderRadius:16, padding:24, width:"100%", maxWidth:380, boxShadow: modal.danger ? "0 8px 40px rgba(248,113,113,0.2)" : "0 8px 40px rgba(255,215,0,0.15)" }}>
 
            {/* Title */}
            <div style={{ fontSize:16, fontWeight:900, letterSpacing:1.5, color: modal.danger ? "#f87171" : "#f1f5f9", marginBottom:10, textTransform:"uppercase" }}>
              {modal.danger && "⚠ "}{modal.title}
            </div>
 
            {/* Message */}
            <div style={{ fontSize:13, color:"#94a3b8", lineHeight:1.6, marginBottom: modal.type === "prompt" ? 14 : 22, whiteSpace:"pre-wrap" }}>
              {modal.message}
            </div>
 
            {/* Prompt input */}
            {modal.type === "prompt" && (
              <input
                autoFocus
                value={modalInput}
                onChange={e => setModalInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && modalInput.trim()) { modal.onOk(modalInput); } }}
                placeholder={modal.placeholder || ""}
                style={{ width:"100%", background:"#0a0a0a", border:"1px solid #2a2a2a", borderRadius:8, padding:"12px 14px", color:"#f1f5f9", fontFamily:"inherit", fontSize:14, outline:"none", boxSizing:"border-box", marginBottom:22 }}
              />
            )}
 
            {/* Buttons */}
            <div style={{ display:"flex", gap:10 }}>
              {modal.type === "alert" && (
                <button onClick={closeModal} style={{ flex:1, padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#FFD700,#B8860B)", color:"#0a0a0f", fontFamily:"inherit", fontSize:11, fontWeight:900, letterSpacing:2, cursor:"pointer" }}>OK</button>
              )}
              {modal.type === "confirm" && (
                <>
                  <button onClick={closeModal} style={{ flex:1, padding:"12px", borderRadius:10, border:"1px solid #2a2a2a", background:"transparent", color:"#94a3b8", fontFamily:"inherit", fontSize:11, fontWeight:700, letterSpacing:2, cursor:"pointer" }}>CANCEL</button>
                  <button onClick={() => modal.onOk && modal.onOk()} style={{ flex:1, padding:"12px", borderRadius:10, border:"none", background: modal.danger ? "linear-gradient(135deg,#f87171,#dc2626)" : "linear-gradient(135deg,#FFD700,#B8860B)", color: modal.danger ? "#fff" : "#0a0a0f", fontFamily:"inherit", fontSize:11, fontWeight:900, letterSpacing:2, cursor:"pointer" }}>{modal.danger ? "CONFIRM" : "OK"}</button>
                </>
              )}
              {modal.type === "prompt" && (
                <>
                  <button onClick={closeModal} style={{ flex:1, padding:"12px", borderRadius:10, border:"1px solid #2a2a2a", background:"transparent", color:"#94a3b8", fontFamily:"inherit", fontSize:11, fontWeight:700, letterSpacing:2, cursor:"pointer" }}>CANCEL</button>
                  <button disabled={!modalInput.trim()} onClick={() => modal.onOk && modal.onOk(modalInput)} style={{ flex:1, padding:"12px", borderRadius:10, border:"none", background: modalInput.trim() ? "linear-gradient(135deg,#FFD700,#B8860B)" : "#2a2a2a", color: modalInput.trim() ? "#0a0a0f" : "#64748b", fontFamily:"inherit", fontSize:11, fontWeight:900, letterSpacing:2, cursor: modalInput.trim() ? "pointer" : "not-allowed" }}>ADD</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
 
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&display=swap');
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
        @keyframes fadeInOut { 0%{opacity:0;transform:translateX(-50%) translateY(-10px)} 15%{opacity:1;transform:translateX(-50%) translateY(0)} 80%{opacity:1} 100%{opacity:0} }
        button:hover:not(:disabled) { filter: brightness(1.1); }
      `}</style>
    </div>
  );
}
