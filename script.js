// Multi-city Panchangam viewer using a single canonical file:
// panchangam_Portland.txt.  All event timestamps are taken exactly from the
// file and shown identically for each city.  Only "time remaining" depends
// on each city's local time.

const CITY_CONFIG = {
  portland: {
    id: "portland",
    timeZone: "America/Los_Angeles"
  },
  boston: {
    id: "boston",
    timeZone: "America/New_York"
  },
  chennai: {
    id: "chennai",
    timeZone: "Asia/Kolkata"
  }
};

const CITY_IDS = ["portland", "boston", "chennai"];
const BASE_FILE = "panchangam_Portland.txt";

const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec"
];

// ---------- helpers ----------

// format a real Date in a given time zone (for showing current time)
function formatInTZ(date, timeZone) {
  const opts = {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  };
  const parts = new Intl.DateTimeFormat("en-CA", opts).formatToParts(date);
  const get = t => parts.find(p => p.type === t).value;
  const year = get("year");
  const monthN = parseInt(get("month"), 10);
  const day = get("day").padStart(2, "0");
  const hour = get("hour").padStart(2, "0");
  const minute = get("minute").padStart(2, "0");
  return `${year}-${MONTH_ABBR[monthN - 1]}-${day} ${hour}:${minute}`;
}

// extract local calendar fields for a given timeZone at the given instant
function getLocalParts(date, timeZone) {
  const opts = {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  };
  const parts = new Intl.DateTimeFormat("en-CA", opts).formatToParts(date);
  const get = t => parts.find(p => p.type === t).value;
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10)
  };
}

// simple monotonic "minutes since big bang" function (no time zones)
function toNaiveMinutes(y, m, d, h, min) {
  // Pack year/month/day/hour/minute into a big integer.  Exact epoch is
  // irrelevant; only differences & ordering matter.
  return ((((y * 12 + (m - 1)) * 32 + d) * 24 + h) * 60) + min;
}

// detect which city matches browser TZ
function detectHomeCity() {
  const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const id of CITY_IDS) {
    if (CITY_CONFIG[id].timeZone === browserTZ) return id;
  }
  return "portland";
}

// parse panchangam file into intervals with naive minutes
function parsePanchangam(text) {
  const lines = text.split(/\r?\n/);
  const data = {
    tithi: [],
    nakshatra: [],
    yogam: [],
    karanam: []
  };
  let section = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();

    if (lower.startsWith("thithi details")) { section = "tithi"; continue; }
    if (lower.startsWith("nakshatram details")) { section = "nakshatra"; continue; }
    if (lower.startsWith("yogam details")) { section = "yogam"; continue; }
    if (lower.startsWith("karanam details")) { section = "karanam"; continue; }

    if (!section) continue;
    if (lower.startsWith("next ")) continue;

    const m = line.match(
      /^([^:]+):\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s+to\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/
    );
    if (!m) continue;

    const [
      , name,
      ys, ms, ds, hs, mins,
      ye, me, de, he, mine
    ] = m;

    const sy = parseInt(ys, 10);
    const sm = parseInt(ms, 10);
    const sd = parseInt(ds, 10);
    const sh = parseInt(hs, 10);
    const smin = parseInt(mins, 10);

    const ey = parseInt(ye, 10);
    const em = parseInt(me, 10);
    const ed = parseInt(de, 10);
    const eh = parseInt(he, 10);
    const emin = parseInt(mine, 10);

    const start = { y: sy, m: sm, d: sd, h: sh, min: smin };
    const end   = { y: ey, m: em, d: ed, h: eh, min: emin };

    data[section].push({
      name: name.trim(),
      start,
      end,
      startMin: toNaiveMinutes(sy, sm, sd, sh, smin),
      endMin:   toNaiveMinutes(ey, em, ed, eh, emin)
    });
  }

  return data;
}

// find current & next interval for a given "now" (naive minutes)
function findCurrentAndNext(intervals, nowMin) {
  let currentIdx = -1;
  for (let i = 0; i < intervals.length; i++) {
    if (nowMin >= intervals[i].startMin && nowMin < intervals[i].endMin) {
      currentIdx = i;
      break;
    }
  }

  let current = null;
  let next = null;
  let remainingMinutes = null;

  if (currentIdx >= 0) {
    current = intervals[currentIdx];
    remainingMinutes = intervals[currentIdx].endMin - nowMin;
    if (currentIdx + 1 < intervals.length) {
      next = intervals[currentIdx + 1];
    }
  } else {
    // we're before or after all entries; just pick first future as "next"
    for (let i = 0; i < intervals.length; i++) {
      if (nowMin < intervals[i].startMin) {
        next = intervals[i];
        break;
      }
    }
  }

  return { current, next, remainingMinutes };
}

function formatRemaining(remainingMinutes) {
  if (remainingMinutes == null || remainingMinutes <= 0) return "—";
  const h = Math.floor(remainingMinutes / 60);
  const m = remainingMinutes % 60;
  return `${h} hours ${m} minutes remaining`;
}

function formatFromParts(parts) {
  const { y, m, d, h, min } = parts;
  const monthName = MONTH_ABBR[m - 1];
  const dd = String(d).padStart(2, "0");
  const hh = String(h).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  return `${y}-${monthName}-${dd} ${hh}:${mm}`;
}

function shortKey(category) {
  switch (category) {
    case "tithi": return "tithi";
    case "nakshatra": return "nak";
    case "yogam": return "yog";
    case "karanam": return "kar";
    default: return category;
  }
}

function setStatus(cityId, msg) {
  const el = document.getElementById(`status-${cityId}`);
  if (el) el.textContent = msg || "";
}

function fillCategoryForCity(cityId, category, data, nowMin) {
  const intervals = data[category];
  const curEl = document.getElementById(`${cityId}-${shortKey(category)}-current`);
  const remEl = document.getElementById(`${cityId}-${shortKey(category)}-remaining`);
  const nextEl = document.getElementById(`${cityId}-${shortKey(category)}-next`);

  if (!curEl || !remEl || !nextEl) return;

  if (!intervals || intervals.length === 0) {
    curEl.textContent = "No data";
    remEl.textContent = "—";
    nextEl.textContent = "—";
    return;
  }

  const { current, next, remainingMinutes } = findCurrentAndNext(intervals, nowMin);

  if (current) {
    curEl.textContent = current.name;
    remEl.textContent = formatRemaining(remainingMinutes);
  } else {
    curEl.textContent = "Not in range";
    remEl.textContent = "—";
  }

  if (next) {
    nextEl.textContent =
      `${next.name} (starts: ${formatFromParts(next.start)})`;
  } else {
    nextEl.textContent = "—";
  }
}

// ---------- main ----------

document.addEventListener("DOMContentLoaded", () => {
  const nowUtc = new Date();

  // browser time
  const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const browserTime = formatInTZ(nowUtc, browserTZ);
  document.getElementById("browser-time").textContent =
    `Current time (your browser): ${browserTime}`;

  // identify home city
  const homeCity = detectHomeCity();
  CITY_IDS.forEach(id => {
    const el = document.getElementById(`here-${id}`);
    if (el) el.textContent = id === homeCity ? "You are here!" : "";
  });

  // local times per city + naive "now" minutes
  const cityNowMinutes = {};
  CITY_IDS.forEach(id => {
    const tz = CITY_CONFIG[id].timeZone;
    const parts = getLocalParts(nowUtc, tz);
    const labelEl = document.getElementById(`localtime-${id}`);
    if (labelEl) {
      labelEl.textContent = `Local time here: ${formatInTZ(nowUtc, tz)}`;
    }
    cityNowMinutes[id] = toNaiveMinutes(
      parts.year, parts.month, parts.day, parts.hour, parts.minute
    );
  });

  // load *single* panchangam_Portland.txt and use for all cities
  fetch(BASE_FILE)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then(text => {
      const data = parsePanchangam(text);
      CITY_IDS.forEach(id => setStatus(id, ""));

      CITY_IDS.forEach(id => {
        const nowMin = cityNowMinutes[id];
        ["tithi", "nakshatra", "yogam", "karanam"].forEach(cat => {
          fillCategoryForCity(id, cat, data, nowMin);
        });
      });
    })
    .catch(err => {
      console.error("Error loading Panchangam", err);
      CITY_IDS.forEach(id =>
        setStatus(id, `Error loading Panchangam file: ${err.message}`)
      );
    });
});
