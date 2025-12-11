// Multi-city Chaandramaanam Panchangam
// Each city uses its OWN Panchangam file and LOCAL time.

const CITY_CONFIG = {
  portland: {
    id: "portland",
    displayName: "Portland, OR – USA",
    timeZone: "America/Los_Angeles",
    file: "panchangam_Portland.txt"
  },
  boston: {
    id: "boston",
    displayName: "Boston, MA – USA",
    timeZone: "America/New_York",
    file: "panchangam_Boston.txt"
  },
  chennai: {
    id: "chennai",
    displayName: "Chennai, India",
    timeZone: "Asia/Kolkata",
    file: "panchangam_Chennai.txt"
  }
};

const CITY_IDS = ["portland", "boston", "chennai"];
const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec"
];

// ---------- Utilities ----------

// Format a Date for a given time zone as "YYYY-mmm-DD HH:MM"
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

// Detect which city matches browser time zone best
function detectHomeCity() {
  const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

  for (const id of CITY_IDS) {
    if (CITY_CONFIG[id].timeZone === browserTZ) return id;
  }

  // Fallback: nearest offset
  const now = new Date();
  const browserOffset = now.getTimezoneOffset();
  let bestId = "portland";
  let bestDiff = Infinity;

  for (const id of CITY_IDS) {
    const tz = CITY_CONFIG[id].timeZone;
    const tzDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const tzOffset = tzDate.getTimezoneOffset();
    const diff = Math.abs(tzOffset - browserOffset);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestId = id;
    }
  }
  return bestId;
}

// Build a Date object whose calendar fields match the given
// "YYYY/MM/DD" and "HH:MM" in the *same* (browser) local zone.
// (We use this consistently for both boundaries and "now" per city,
// so comparisons are internally consistent.)
function makeLocalDate(dStr, tStr) {
  const [Y, M, D] = dStr.split("/").map(Number);
  const [h, m] = tStr.split(":").map(Number);
  return new Date(Y, M - 1, D, h, m, 0, 0);
}

// Parse Panchangam text into intervals for tithi/nakshatra/yogam/karanam
function parsePanchangam(text) {
  const lines = text.split(/\r?\n/);
  const data = { tithi: [], nakshatra: [], yogam: [], karanam: [] };
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

    // Ignore "Next Thithi:", etc.
    if (lower.startsWith("next ")) continue;
    if (!section) continue;

    const m = line.match(
      /^([^:]+):\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+to\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})/
    );
    if (!m) continue;

    const [, name, d1, t1, d2, t2] = m;
    data[section].push({
      name: name.trim(),
      start: makeLocalDate(d1, t1),
      end: makeLocalDate(d2, t2)
    });
  }
  return data;
}

// Find current & next interval for given "now"
function findCurrentAndNext(intervals, now) {
  let currentIdx = -1;
  for (let i = 0; i < intervals.length; i++) {
    const it = intervals[i];
    if (now >= it.start && now < it.end) {
      currentIdx = i;
      break;
    }
  }

  let current = null;
  let next = null;
  let remainingMs = null;

  if (currentIdx >= 0) {
    current = intervals[currentIdx];
    remainingMs = current.end - now;
    if (currentIdx + 1 < intervals.length) {
      next = intervals[currentIdx + 1];
    }
  } else {
    // Not inside any interval – pick next one in future, if any
    for (let i = 0; i < intervals.length; i++) {
      if (now < intervals[i].start) {
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

function fillCategory(cityId, cat, data, nowForCity, timeZone) {
  const intervals = data[cat];
  const currentEl = document.getElementById(
    `${cityId}-${shortKey(cat)}-current`
  );
  const remEl = document.getElementById(
    `${cityId}-${shortKey(cat)}-remaining`
  );
  const nextEl = document.getElementById(
    `${cityId}-${shortKey(cat)}-next`
  );

  if (!intervals || intervals.length === 0) {
    if (currentEl) currentEl.textContent = "No data";
    if (remEl) remEl.textContent = "—";
    if (nextEl) nextEl.textContent = "—";
    return;
  }

  const { current, next, remainingMs } = findCurrentAndNext(intervals, nowForCity);

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

// ---------- Main ----------

document.addEventListener("DOMContentLoaded", () => {
  const browserNow = new Date();
  const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Show browser time
  const browserTimeEl = document.getElementById("browser-time");
  browserTimeEl.textContent =
    "Current time (your browser): " + formatInTZ(browserNow, browserTZ);

  // Detect "you are here"
  const homeCityId = detectHomeCity();
  CITY_IDS.forEach(id => {
    const hereEl = document.getElementById(`here-${id}`);
    if (!hereEl) return;
    hereEl.textContent = id === homeCityId ? "You are here!" : "";
  });

  // For each city, compute its local "now" and local time display,
  // then load its Panchangam file and fill all four categories.
  CITY_IDS.forEach(cityId => {
    const cfg = CITY_CONFIG[cityId];

    // City local "now"
    const nowCityStr = browserNow.toLocaleString("en-US", {
      timeZone: cfg.timeZone
    });
    const nowCity = new Date(nowCityStr); // local Date with same calendar fields

    const localTimeEl = document.getElementById(`localtime-${cityId}`);
    if (localTimeEl) {
      localTimeEl.textContent =
        "Local time here: " + formatInTZ(nowCity, cfg.timeZone);
    }

    // Load this city's Panchangam file
    fetch(cfg.file)
      .then(resp => {
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} for ${cfg.file}`);
        }
        return resp.text();
      })
      .then(text => {
        const data = parsePanchangam(text);
        setStatus(cityId, "");

        ["tithi", "nakshatra", "yogam", "karanam"].forEach(cat => {
          fillCategory(cityId, cat, data, nowCity, cfg.timeZone);
        });
      })
      .catch(err => {
        console.error("Error loading Panchangam for", cityId, err);
        setStatus(cityId, "Error loading Panchangam file.");
      });
  });
});
