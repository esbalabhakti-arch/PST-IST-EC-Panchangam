// Multi-city Chaandramaanam Panchangam
// Uses ONE Panchangam file (for the city where the user is),
// and shows Portland / Boston / Chennai in parallel.

const CITY_CONFIG = {
  portland: {
    id: "portland",
    displayName: "Portland, OR – USA",
    timeZone: "America/Los_Angeles",
    file: "panchangam_portland.txt",
    tzLabel: "Pacific Time (PST)"
  },
  boston: {
    id: "boston",
    displayName: "Boston, MA – USA",
    timeZone: "America/New_York",
    file: "panchangam_boston.txt",
    tzLabel: "Eastern Time (EST)"
  },
  chennai: {
    id: "chennai",
    displayName: "Chennai, India",
    timeZone: "Asia/Kolkata",
    file: "panchangam_chennai.txt",
    tzLabel: "Indian Standard Time (IST)"
  }
};

const CITY_IDS = ["portland", "boston", "chennai"];

const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec"
];

// Format a date in given timeZone as "YYYY-mmm-DD HH:MM"
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
  const monthN = parseInt(get("month"), 10); // 1..12
  const day = get("day").padStart(2, "0");
  const hour = get("hour").padStart(2, "0");
  const minute = get("minute").padStart(2, "0");

  return `${year}-${MONTH_ABBR[monthN - 1]}-${day} ${hour}:${minute}`;
}

// Detect which of our cities matches the browser time zone best
function detectHomeCity() {
  const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // First try exact match
  for (const id of CITY_IDS) {
    if (CITY_CONFIG[id].timeZone === browserTZ) {
      return id;
    }
  }

  // Fallback: choose city with closest UTC offset
  const now = new Date();
  const browserOffset = now.getTimezoneOffset(); // minutes

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

// Parse Panchangam text into structured intervals
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
      section = "tithi";
      continue;
    }
    if (lower.startsWith("nakshatram details")) {
      section = "nakshatra";
      continue;
    }
    if (lower.startsWith("yogam details")) {
      section = "yogam";
      continue;
    }
    if (lower.startsWith("karanam details")) {
      section = "karanam";
      continue;
    }

    // skip "Next Thithi:", "Next Nakshatram:" etc.
    if (lower.startsWith("next ")) continue;
    if (!section) continue;

    // Expect: Name: YYYY/MM/DD HH:MM to YYYY/MM/DD HH:MM
    const m = line.match(
      /^([^:]+):\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+to\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})/
    );
    if (!m) continue;

    const [, name, d1, t1, d2, t2] = m;
    const start = makeLocalDate(d1, t1);
    const end = makeLocalDate(d2, t2);

    data[section].push({
      name: name.trim(),
      start,
      end
    });
  }

  return data;
}

// Create a Date in the local (browser) time zone
// dStr = "YYYY/MM/DD", tStr = "HH:MM"
function makeLocalDate(dStr, tStr) {
  const [Y, M, D] = dStr.split("/").map(Number);
  const [h, m] = tStr.split(":").map(Number);
  return new Date(Y, M - 1, D, h, m, 0, 0);
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
    // If we are not inside any interval, pick the next one in the future
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

// Update DOM for one city and one category
function fillCategory(cityId, category, data, now) {
  const cfg = CITY_CONFIG[cityId];
  const intervals = data[category];
  const { current, next, remainingMs } = findCurrentAndNext(intervals, now);

  const prefix = `${cityId}-${category.slice(0, 3)}`; // tithi->tih, nakshatra->nak, etc.
  const currentEl = document.getElementById(`${cityId}-${shortKey(category)}-current`);
  const remEl = document.getElementById(`${cityId}-${shortKey(category)}-remaining`);
  const nextEl = document.getElementById(`${cityId}-${shortKey(category)}-next`);

  if (!intervals || intervals.length === 0) {
    if (currentEl) currentEl.textContent = "No data";
    if (remEl) remEl.textContent = "—";
    if (nextEl) nextEl.textContent = "—";
    return;
  }

  if (current) {
    currentEl.textContent = current.name;
    remEl.textContent = formatRemaining(remainingMs);
  } else {
    currentEl.textContent = "Not in range";
    remEl.textContent = "—";
  }

  if (next) {
    const startStr = formatInTZ(next.start, cfg.timeZone);
    nextEl.textContent = `${next.name} (starts: ${startStr})`;
  } else {
    nextEl.textContent = "—";
  }
}

// Map full category name to short key part used in IDs
// tithi -> "tithi", nakshatra -> "nak", yogam -> "yog", karanam -> "kar"
function shortKey(category) {
  switch (category) {
    case "tithi":
      return "tithi";
    case "nakshatra":
      return "nak";
    case "yogam":
      return "yog";
    case "karanam":
      return "kar";
    default:
      return category;
  }
}

function setStatusAll(msg) {
  CITY_IDS.forEach(id => {
    const el = document.getElementById(`status-${id}`);
    if (el) el.textContent = msg;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const homeCityId = detectHomeCity();
  const homeCfg = CITY_CONFIG[homeCityId];

  // Show browser time at top
  const browserTimeEl = document.getElementById("browser-time");
  browserTimeEl.textContent =
    "Current time (your browser): " + formatInTZ(now, browserTZ);

  // Mark "You are here!"
  CITY_IDS.forEach(id => {
    const hereEl = document.getElementById(`here-${id}`);
    if (!hereEl) return;
    if (id === homeCityId) {
      hereEl.textContent = "You are here!";
    } else {
      hereEl.textContent = "";
    }
  });

  // Local time per city
  CITY_IDS.forEach(id => {
    const cfg = CITY_CONFIG[id];
    const el = document.getElementById(`localtime-${id}`);
    if (el) {
      el.textContent = "Local time here: " + formatInTZ(now, cfg.timeZone);
    }
  });

  // Info about which Panchangam file is used
  const originEl = document.getElementById("data-origin");
  if (originEl) {
    originEl.textContent =
      `All three columns are computed for this instant using ` +
      `Panchangam data for ${homeCfg.displayName}. (File: ${homeCfg.file})`;
  }

  // Load only the home city's Panchangam file
  fetch(homeCfg.file)
    .then(resp => {
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} for ${homeCfg.file}`);
      }
      return resp.text();
    })
    .then(text => {
      const data = parsePanchangam(text);

      // Clear any previous error
      setStatusAll("");

      // For each city, fill Tithi / Nakshatra / Yogam / Karanam
      CITY_IDS.forEach(id => {
        ["tithi", "nakshatra", "yogam", "karanam"].forEach(cat => {
          fillCategory(id, cat, data, now);
        });
      });
    })
    .catch(err => {
      console.error("Error loading Panchangam:", err);
      setStatusAll("Error loading Panchangam file.");
    });
});
