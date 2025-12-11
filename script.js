// script.js for 3-city multi-panchang widget
// Uses each city's local time (via time zone) to find current Tithi/Nakshatra/Yogam/Karanam
// and compute "time remaining". Also detects the user's city via browser time zone.

// --------------- CONFIG -----------------

const MONTH_ABBR = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const CITY_CONFIG = [
  {
    id: "portland",
    timeZone: "America/Los_Angeles",
    file: "panchangam_portland.txt",
  },
  {
    id: "boston",
    timeZone: "America/New_York",
    file: "panchangam_boston.txt",
  },
  {
    id: "chennai",
    timeZone: "Asia/Kolkata",
    file: "panchangam_chennai.txt",
  },
];

// --------------- TIME HELPERS -----------------

// Create a Date whose UTC fields equal the city's local date-time
function makeZonedDate(y, m, d, hh, mm) {
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0));
}

// Format a "zoned" Date (created with makeZonedDate or getNowInZone) as YYYY-mmm-DD HH:MM
function formatDateTime(dt) {
  const y = dt.getUTCFullYear();
  const mIndex = dt.getUTCMonth();
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  const mmm = MONTH_ABBR[mIndex] || "???";
  return `${y}-${mmm}-${d} ${hh}:${mm}`;
}

function formatDateTimeWithSeconds(dt) {
  const y = dt.getUTCFullYear();
  const mIndex = dt.getUTCMonth();
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  const ss = String(dt.getUTCSeconds()).padStart(2, "0");
  const mmm = MONTH_ABBR[mIndex] || "???";
  return `${y}-${mmm}-${d} ${hh}:${mm}:${ss}`;
}

// Format the browser's own local time as YYYY-mmm-DD HH:MM:SS
function formatLocalDateTimeWithSeconds(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});

  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  const ss = Number(parts.second);

  const mmm = MONTH_ABBR[m - 1] || "???";
  const dd = String(d).padStart(2, "0");
  const hhs = String(hh).padStart(2, "0");
  const mms = String(mm).padStart(2, "0");
  const sss = String(ss).padStart(2, "0");
  return `${y}-${mmm}-${dd} ${hhs}:${mms}:${sss}`;
}

// Get "now" in a specific time zone; the returned Date's UTC fields encode local clock time in that zone.
function getNowInZone(timeZone) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(now).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});

  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  const ss = Number(parts.second);

  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, 0));
}

// ------------- INTERVAL HELPERS -----------------

// Example: "Prathama: 2025/12/04 15:14 to 2025/12/05 11:26"
function parseIntervalLine(line) {
  const re =
    /^(.+?):\s*(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) to (\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/;
  const m = line.trim().match(re);
  if (!m) return null;

  const name = m[1].trim();
  const start = makeZonedDate(m[2], m[3], m[4], m[5], m[6]);
  const end = makeZonedDate(m[7], m[8], m[9], m[10], m[11]);
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
  if (hours === 0) return `${minutes} minutes remaining`;
  if (minutes === 0) return `${hours} hours remaining`;
  return `${hours} hours ${minutes} minutes remaining`;
}

// ------------- SECTION EXTRACTION -----------------

// Return all lines after "X details:" until the next "details:" header
function extractSection(lines, startLabel) {
  const startIdx = lines.findIndex((l) => l.trim().startsWith(startLabel));
  if (startIdx === -1) return [];

  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/details\s*:$/i.test(trimmed) && !trimmed.startsWith(startLabel)) break;
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

// ------------- CITY PROCESSING -----------------

async function processCity(city) {
  const statusEl = document.getElementById(`status-${city.id}`);
  const timeEl = document.getElementById(`time-${city.id}`);

  // Local time in this city's zone at the same physical instant
  const nowZoned = getNowInZone(city.timeZone);

  if (timeEl) {
    timeEl.textContent = "Local time here: " + formatDateTimeWithSeconds(nowZoned);
  }

  try {
    const res = await fetch(city.file);
    if (!res.ok) {
      throw new Error(`Could not load ${city.file}`);
    }
    const text = await res.text();
    const lines = text.split(/\r?\n/);

    const tithiSection = extractSection(lines, "Thithi details");
    const nakSection = extractSection(lines, "Nakshatram details");
    const yogaSection = extractSection(lines, "Yogam details");
    const karSection = extractSection(lines, "Karanam details");

    const tithiIntervals = getIntervalsFromSection(tithiSection);
    const nakIntervals = getIntervalsFromSection(nakSection);
    const yogaIntervals = getIntervalsFromSection(yogaSection);
    const karIntervals = getIntervalsFromSection(karSection);

    // Tithi
    const { current: tCur, next: tNext } = findCurrentAndNext(
      tithiIntervals,
      nowZoned
    );
    document.getElementById(`tithi-current-${city.id}`).textContent = tCur
      ? tCur.name
      : "Not in range";
    document.getElementById(`tithi-remaining-${city.id}`).textContent = tCur
      ? formatTimeRemaining(tCur.end, nowZoned)
      : "";
    document.getElementById(`tithi-next-${city.id}`).textContent = tNext
      ? `${tNext.name} (starts: ${formatDateTime(tNext.start)})`
      : "–";

    // Nakshatra
    const { current: nCur, next: nNext } = findCurrentAndNext(
      nakIntervals,
      nowZoned
    );
    document.getElementById(`nak-current-${city.id}`).textContent = nCur
      ? nCur.name
      : "Not in range";
    document.getElementById(`nak-remaining-${city.id}`).textContent = nCur
      ? formatTimeRemaining(nCur.end, nowZoned)
      : "";
    document.getElementById(`nak-next-${city.id}`).textContent = nNext
      ? `${nNext.name} (starts: ${formatDateTime(nNext.start)})`
      : "–";

    // Yogam
    const { current: yCur, next: yNext } = findCurrentAndNext(
      yogaIntervals,
      nowZoned
    );
    document.getElementById(`yoga-current-${city.id}`).textContent = yCur
      ? yCur.name
      : "Not in range";
    document.getElementById(`yoga-remaining-${city.id}`).textContent = yCur
      ? formatTimeRemaining(yCur.end, nowZoned)
      : "";
    document.getElementById(`yoga-next-${city.id}`).textContent = yNext
      ? `${yNext.name} (starts: ${formatDateTime(yNext.start)})`
      : "–";

    // Karanam
    const { current: kCur, next: kNext } = findCurrentAndNext(
      karIntervals,
      nowZoned
    );
    document.getElementById(`karana-current-${city.id}`).textContent = kCur
      ? kCur.name
      : "Not in range";
    document.getElementById(`karana-remaining-${city.id}`).textContent = kCur
      ? formatTimeRemaining(kCur.end, nowZoned)
      : "";
    document.getElementById(`karana-next-${city.id}`).textContent = kNext
      ? `${kNext.name} (starts: ${formatDateTime(kNext.start)})`
      : "–";

    if (statusEl) {
      statusEl.textContent = `Panchangam loaded from ${city.file}`;
    }
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent = `Error loading ${city.file}. Check console.`;
    }
  }
}

// ------------- USER CITY DETECTION -----------------

function highlightUserCity() {
  const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  CITY_CONFIG.forEach((city) => {
    const el = document.getElementById(`you-here-${city.id}`);
    if (!el) return;

    if (city.timeZone === userTZ) {
      el.textContent = "You are here!";
    } else {
      el.textContent = "";
    }
  });
}

// ------------- BROWSER TIME DISPLAY -----------------

function updateBrowserTime() {
  const el = document.getElementById("browser-time");
  if (!el) return;
  const now = new Date();
  el.textContent =
    "Current time (your browser): " + formatLocalDateTimeWithSeconds(now);
}

// ------------- MAIN -----------------

function main() {
  updateBrowserTime();
  setInterval(updateBrowserTime, 1000); // optional: live ticking clock

  CITY_CONFIG.forEach((city) => {
    processCity(city);
  });

  highlightUserCity();
}

main();
