// ---------- CONFIG ----------

const MONTH_ABBR = [
  "jan","feb","mar","apr","may","jun",
  "jul","aug","sep","oct","nov","dec"
];

const CITY_CONFIG = [
  { id: "portland", timeZone: "America/Los_Angeles", primaryFile: "panchangam_portland.txt" },
  { id: "boston",   timeZone: "America/New_York",    primaryFile: "panchangam_boston.txt"   },
  { id: "chennai",  timeZone: "Asia/Kolkata",        primaryFile: "panchangam_chennai.txt"  },
];

// we will always fall back to this if a per-city file is missing
const FALLBACK_FILE = "panchangam.txt";

// ---------- TIME HELPERS ----------

function makeZonedDate(y, m, d, hh, mm) {
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0));
}

function formatDateTime(dt) {
  const y = dt.getUTCFullYear();
  const mIdx = dt.getUTCMonth();
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  const mmm = MONTH_ABBR[mIdx] || "???";
  return `${y}-${mmm}-${d} ${hh}:${mm}`;
}

function formatDateTimeWithSeconds(dt) {
  const y = dt.getUTCFullYear();
  const mIdx = dt.getUTCMonth();
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  const ss = String(dt.getUTCSeconds()).padStart(2, "0");
  const mmm = MONTH_ABBR[mIdx] || "???";
  return `${y}-${mmm}-${d} ${hh}:${mm}:${ss}`;
}

function formatLocalDateTimeWithSeconds(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const y  = Number(parts.year);
  const m  = Number(parts.month);
  const d  = Number(parts.day);
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  const ss = Number(parts.second);

  const mmm = MONTH_ABBR[m - 1] || "???";
  const dd  = String(d).padStart(2, "0");
  const hhs = String(hh).padStart(2, "0");
  const mms = String(mm).padStart(2, "0");
  const sss = String(ss).padStart(2, "0");
  return `${y}-${mmm}-${dd} ${hhs}:${mms}:${sss}`;
}

// "now" in a given time zone; UTC fields store local clock time
function getNowInZone(timeZone) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const y  = Number(parts.year);
  const m  = Number(parts.month);
  const d  = Number(parts.day);
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  const ss = Number(parts.second);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, 0));
}

// ---------- INTERVAL HELPERS ----------

// Example: "Prathama: 2025/12/04 15:14 to 2025/12/05 11:26"
function parseIntervalLine(line) {
  const re = /^(.+?):\s*(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) to (\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/;
  const m = line.trim().match(re);
  if (!m) return null;
  const name  = m[1].trim();
  const start = makeZonedDate(m[2], m[3], m[4], m[5], m[6]);
  const end   = makeZonedDate(m[7], m[8], m[9], m[10], m[11]);
  return { name, start, end };
}

function findCurrentAndNext(intervals, nowZoned) {
  let current = null;
  let next = null;
  for (let i = 0; i < intervals.length; i++) {
    const iv = intervals[i];
    if (nowZoned >= iv.start && nowZoned < iv.end) {
      current = iv;
      next = intervals[i + 1] || null;
      break;
    }
  }
  return { current, next };
}

function formatTimeRemaining(end, nowZoned) {
  const ms = end - nowZoned;
  if (ms <= 0) return "Ended just now";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0 && minutes <= 0) return "Ending now";
  if (hours === 0)  return `${minutes} minutes remaining`;
  if (minutes === 0) return `${hours} hours remaining`;
  return `${hours} hours ${minutes} minutes remaining`;
}

// ---------- SECTION PARSING ----------

function extractSection(lines, startLabel) {
  const startIdx = lines.findIndex(l => l.trim().startsWith(startLabel));
  if (startIdx === -1) return [];
  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/details\s*:$/i.test(trimmed) && !trimmed.startsWith(startLabel)) {
      break;
    }
    out.push(line);
  }
  return out;
}

function getIntervalsFromSection(sectionLines) {
  const intervals = [];
  for (const raw of sectionLines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.toLowerCase().startsWith("next ")) continue;
    const iv = parseIntervalLine(line);
    if (iv) intervals.push(iv);
  }
  return intervals;
}

// ---------- FETCH WITH FALLBACK ----------

async function fetchPanchangText(primaryFile) {
  const candidates = [primaryFile, FALLBACK_FILE];
  let lastError = null;
  for (const file of candidates) {
    try {
      const res = await fetch(file);
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} for ${file}`);
        continue;
      }
      return { text: await res.text(), fileUsed: file };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Unable to fetch panchangam text");
}

// ---------- PER-CITY PROCESSING ----------

async function processCity(city) {
  const statusEl = document.getElementById(`status-${city.id}`);
  const timeEl   = document.getElementById(`time-${city.id}`);

  const nowZoned = getNowInZone(city.timeZone);

  if (timeEl) {
    timeEl.textContent = "Local time here: " + formatDateTimeWithSeconds(nowZoned);
  }

  try {
    const { text, fileUsed } = await fetchPanchangText(city.primaryFile);
    const lines = text.split(/\r?\n/);

    const tithiSection = extractSection(lines, "Thithi details");
    const nakSection   = extractSection(lines, "Nakshatram details");
    const yogaSection  = extractSection(lines, "Yogam details");
    const karSection   = extractSection(lines, "Karanam details");

    const tithiIntervals = getIntervalsFromSection(tithiSection);
    const nakIntervals   = getIntervalsFromSection(nakSection);
    const yogaIntervals  = getIntervalsFromSection(yogaSection);
    const karIntervals   = getIntervalsFromSection(karSection);

    const { current: tCur, next: tNext } = findCurrentAndNext(tithiIntervals, nowZoned);
    document.getElementById(`tithi-current-${city.id}`).textContent = tCur ? tCur.name : "Not in range";
    document.getElementById(`tithi-remaining-${city.id}`).textContent = tCur ? formatTimeRemaining(tCur.end, nowZoned) : "";
    document.getElementById(`tithi-next-${city.id}`).textContent = tNext ? `${tNext.name} (starts: ${formatDateTime(tNext.start)})` : "–";

    const { current: nCur, next: nNext } = findCurrentAndNext(nakIntervals, nowZoned);
    document.getElementById(`nak-current-${city.id}`).textContent = nCur ? nCur.name : "Not in range";
    document.getElementById(`nak-remaining-${city.id}`).textContent = nCur ? formatTimeRemaining(nCur.end, nowZoned) : "";
    document.getElementById(`nak-next-${city.id}`).textContent = nNext ? `${nNext.name} (starts: ${formatDateTime(nNext.start)})` : "–";

    const { current: yCur, next: yNext } = findCurrentAndNext(yogaIntervals, nowZoned);
    document.getElementById(`yoga-current-${city.id}`).textContent = yCur ? yCur.name : "Not in range";
    document.getElementById(`yoga-remaining-${city.id}`).textContent = yCur ? formatTimeRemaining(yCur.end, nowZoned) : "";
    document.getElementById(`yoga-next-${city.id}`).textContent = yNext ? `${yNext.name} (starts: ${formatDateTime(yNext.start)})` : "–";

    const { current: kCur, next: kNext } = findCurrentAndNext(karIntervals, nowZoned);
    document.getElementById(`karana-current-${city.id}`).textContent = kCur ? kCur.name : "Not in range";
    document.getElementById(`karana-remaining-${city.id}`).textContent = kCur ? formatTimeRemaining(kCur.end, nowZoned) : "";
    document.getElementById(`karana-next-${city.id}`).textContent = kNext ? `${kNext.name} (starts: ${formatDateTime(kNext.start)})` : "–";

    if (statusEl) statusEl.textContent = `Panchangam loaded from ${fileUsed}`;
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "Error loading Panchangam file. See console.";
  }
}

// ---------- USER CITY DETECTION ----------

function highlightUserCity() {
  const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  CITY_CONFIG.forEach(city => {
    const el = document.getElementById(`you-here-${city.id}`);
    if (!el) return;
    el.textContent = (city.timeZone === userTZ) ? "You are here!" : "";
  });
}

// ---------- BROWSER TIME ----------

function updateBrowserTime() {
  const el = document.getElementById("browser-time");
  if (!el) return;
  el.textContent = "Current time (your browser): "
    + formatLocalDateTimeWithSeconds(new Date());
}

// ---------- MAIN ----------

function main() {
  updateBrowserTime();
  setInterval(updateBrowserTime, 1000);

  CITY_CONFIG.forEach(city => processCity(city));
  highlightUserCity();
}

main();
