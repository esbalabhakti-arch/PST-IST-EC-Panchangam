// Multi-city Panchangam viewer using a single canonical file:
// panchangam_Portland.txt (timestamps in Portland local time = PST).

// City configuration (just time zones & labels)
const CITY_CONFIG = {
  portland: {
    id: "portland",
    displayName: "Portland, OR – USA",
    timeZone: "America/Los_Angeles"
  },
  boston: {
    id: "boston",
    displayName: "Boston, MA – USA",
    timeZone: "America/New_York"
  },
  chennai: {
    id: "chennai",
    displayName: "Chennai, India",
    timeZone: "Asia/Kolkata"
  }
};

const CITY_IDS = ["portland", "boston", "chennai"];
const BASE_FILE = "panchangam_Portland.txt";

// Month abbreviations for YYYY-mmm-DD formatting
const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec"
];

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

// Detect which city matches the browser's time zone
function detectHomeCity() {
  const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const id of CITY_IDS) {
    if (CITY_CONFIG[id].timeZone === browserTZ) return id;
  }
  return "portland"; // fallback
}

// Parse dates from panchangam text (assumes they are in *local* Portland time,
// which should match the browser time zone when the Portland file is used).
function makeDateLocal(dateStr, timeStr) {
  const [Y, M, D] = dateStr.split("/").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  // This creates a Date in the browser's local time zone; since the file is
  // written in Portland local time and you are in Portland, this is OK.
  return new Date(Y, M - 1, D, h, m, 0, 0);
}

function parsePanchangam(text) {
  const lines = text.split(/\r?\n/);
  const data = {
    tithi: [],
    nakshatra: [],
    yogam: [],
    karanam: []
  };
  let section = null;

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();

    if (lower.startsWith("thithi details")) {
      section = "tithi"; continue;
    }
    if (lower.startsWith("nakshatram details")) {
      section = "nakshatra"; continue;
    }
    if (lower.startsWith("yogam details")) {
      section = "yogam"; continue;
    }
    if (lower.startsWith("karanam details")) {
      section = "karanam"; continue;
    }

    if (!section) continue;
    if (lower.startsWith("next ")) continue;

    const m = line.match(
      /^([^:]+):\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+to\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})/
    );
    if (!m) continue;

    const [, name, d1, t1, d2, t2] = m;
    data[section].push({
      name: name.trim(),
      start: makeDateLocal(d1, t1),
      end: makeDateLocal(d2, t2)
    });
  }

  return data;
}

function findCurrentAndNext(intervals, nowUtc) {
  let currentIdx = -1;
  for (let i = 0; i < intervals.length; i++) {
    const it = intervals[i];
    if (nowUtc >= it.start && nowUtc < it.end) {
      currentIdx = i;
      break;
    }
  }

  let current = null;
  let next = null;
  let remainingMs = null;

  if (currentIdx >= 0) {
    current = intervals[currentIdx];
    remainingMs = current.end - nowUtc;
    if (currentIdx + 1 < intervals.length) {
      next = intervals[currentIdx + 1];
    }
  } else {
    // If we are before all listed intervals, the next is the first one after nowUtc
    for (let i = 0; i < intervals.length; i++) {
      if (nowUtc < intervals[i].start) {
        next = intervals[i];
        break;
      }
    }
  }

  return { current, next, remainingMs };
}

function formatRemaining(remainingMs) {
  if (remainingMs == null || remainingMs <= 0) return "—";
  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hours ${minutes} minutes remaining`;
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

function fillCategory(cityId, category, data, nowUtc, timeZone) {
  const intervals = data[category];
  const currentEl = document.getElementById(
    `${cityId}-${shortKey(category)}-current`
  );
  const remEl = document.getElementById(
    `${cityId}-${shortKey(category)}-remaining`
  );
  const nextEl = document.getElementById(
    `${cityId}-${shortKey(category)}-next`
  );

  if (!intervals || intervals.length === 0) {
    if (currentEl) currentEl.textContent = "No data";
    if (remEl) remEl.textContent = "—";
    if (nextEl) nextEl.textContent = "—";
    return;
  }

  const { current, next, remainingMs } = findCurrentAndNext(intervals, nowUtc);

  if (current) {
    currentEl.textContent = current.name;
    remEl.textContent = formatRemaining(remainingMs);
  } else {
    currentEl.textContent = "Not in range";
    remEl.textContent = "—";
  }

  if (next) {
    const startStr = formatInTZ(next.start, timeZone);
    nextEl.textContent = `${next.name} (starts: ${startStr})`;
  } else {
    nextEl.textContent = "—";
  }
}

function setStatus(cityId, msg) {
  const el = document.getElementById(`status-${cityId}`);
  if (el) el.textContent = msg || "";
}

document.addEventListener("DOMContentLoaded", () => {
  const nowUtc = new Date(); // one global instant for all calculations

  // Show browser time
  const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const browserTime = formatInTZ(nowUtc, browserTZ);
  document.getElementById("browser-time").textContent =
    `Current time (your browser): ${browserTime}`;

  const homeCity = detectHomeCity();
  CITY_IDS.forEach(id => {
    const hereEl = document.getElementById(`here-${id}`);
    if (!hereEl) return;
    hereEl.textContent = id === homeCity ? "You are here!" : "";
  });

  // Local time labels for each city
  CITY_IDS.forEach(id => {
    const cfg = CITY_CONFIG[id];
    const el = document.getElementById(`localtime-${id}`);
    if (el) {
      el.textContent = `Local time here: ${formatInTZ(nowUtc, cfg.timeZone)}`;
    }
  });

  // Load the single canonical Panchangam file (Portland)
  fetch(BASE_FILE)
    .then(resp => {
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} for ${BASE_FILE}`);
      }
      return resp.text();
    })
    .then(text => {
      const data = parsePanchangam(text);

      // Clear status
      CITY_IDS.forEach(id => setStatus(id, ""));

      // For each city, fill categories using the same data & same instant,
      // but formatting in the city's own time zone.
      CITY_IDS.forEach(id => {
        const tz = CITY_CONFIG[id].timeZone;
        ["tithi", "nakshatra", "yogam", "karanam"].forEach(cat => {
          fillCategory(id, cat, data, nowUtc, tz);
        });
      });
    })
    .catch(err => {
      console.error("Error loading Panchangam", err);
      CITY_IDS.forEach(id => {
        setStatus(id, `Error loading Panchangam file: ${err.message}`);
      });
    });
});
