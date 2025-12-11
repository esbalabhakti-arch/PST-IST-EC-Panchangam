// Multi-city Panchangam viewer for Portland, Boston, Chennai
// Assumes text files panchangam_Portland.txt, panchangam_Boston.txt,
// and panchangam_Chennai.txt are in the same folder as this script.

const cities = [
  {
    id: "portland",
    file: "panchangam_Portland.txt",
    utcOffsetMinutes: -8 * 60, // PST (Dec)
  },
  {
    id: "boston",
    file: "panchangam_Boston.txt",
    utcOffsetMinutes: -5 * 60, // EST (Dec)
  },
  {
    id: "chennai",
    file: "panchangam_Chennai.txt",
    utcOffsetMinutes: 5 * 60 + 30, // IST
  },
];

// --- Helpers ----------------------------------------------------------

function pad2(n) {
  return n.toString().padStart(2, "0");
}

// Convert city-local Y/M/D H:M to UTC milliseconds
function cityLocalToUtcMs(year, month, day, hour, minute, offsetMinutes) {
  const msAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  return msAsUtc - offsetMinutes * 60 * 1000;
}

// Format UTC ms into city-local "YYYY/MM/DD HH:MM"
function formatCityDateTime(utcMs, offsetMinutes) {
  const cityMs = utcMs + offsetMinutes * 60 * 1000;
  const d = new Date(cityMs);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  return `${y}/${m}/${day} ${h}:${min}`;
}

// Get today's date string in city-local time: "YYYY/MM/DD"
function getCityTodayString(nowUtcMs, offsetMinutes) {
  const cityMs = nowUtcMs + offsetMinutes * 60 * 1000;
  const d = new Date(cityMs);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}/${m}/${day}`;
}

// Human-readable remaining time
function formatRemaining(ms) {
  if (ms <= 0) return "0 minutes remaining";
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ${minutes} minute${
      minutes !== 1 ? "s" : ""
    } remaining`;
  }
  return `${minutes} minute${minutes !== 1 ? "s" : ""} remaining`;
}

// Extract one named section (e.g. "Thithi" or "Rahukala")
function extractSection(text, header) {
  // header like "Thithi", "Nakshatram", etc.
  const regex = new RegExp(
    `${header}\\s+details:\\s*=+([\\s\\S]*?)(?=\\n\\w+\\s+details:|$)`,
    "i"
  );
  const m = text.match(regex);
  if (!m) return "";
  return m[1].trim();
}

// Parse Panchangam intervals for Tithi/Nakshatra/Yogam/Karanam
function parseIntervals(sectionText, offsetMinutes) {
  const lines = sectionText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  const entries = [];

  for (const line of lines) {
    const match = line.match(
      /^([^:]+):\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?\s+to\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?/
    );
    if (!match) continue;

    const name = match[1].trim();
    const startDate = match[2];
    const startHour = parseInt(match[3], 10);
    const startMin = parseInt(match[4], 10);
    const endDate = match[5];
    const endHour = parseInt(match[6], 10);
    const endMin = parseInt(match[7], 10);

    const [sy, sm, sd] = startDate.split("/").map((x) => parseInt(x, 10));
    const [ey, em, ed] = endDate.split("/").map((x) => parseInt(x, 10));

    const startUtc = cityLocalToUtcMs(sy, sm, sd, startHour, startMin, offsetMinutes);
    const endUtc = cityLocalToUtcMs(ey, em, ed, endHour, endMin, offsetMinutes);

    entries.push({ name, startUtc, endUtc });
  }

  return entries;
}

// Find current & next entry for now (in UTC ms)
function findCurrentAndNext(entries, nowUtcMs) {
  let current = null;
  let next = null;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (nowUtcMs >= e.startUtc && nowUtcMs < e.endUtc) {
      current = e;
      if (i + 1 < entries.length) next = entries[i + 1];
      break;
    }
    if (nowUtcMs < e.startUtc) {
      next = e;
      break;
    }
  }

  return { current, next };
}

// Parse kalas (Rahukala, Yamaganda, Durmuhurtha, Varjyam) for the current day
function parseKalasForToday(sectionText, offsetMinutes, nowUtcMs) {
  const todayStr = getCityTodayString(nowUtcMs, offsetMinutes);
  const lines = sectionText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  const intervals = [];

  for (const line of lines) {
    const match = line.match(
      /^([^:]+):\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?\s+to\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?/
    );
    if (!match) continue;

    const startDate = match[2];
    const startHour = pad2(parseInt(match[3], 10));
    const startMin = pad2(parseInt(match[4], 10));
    const endHour = pad2(parseInt(match[6], 10));
    const endMin = pad2(parseInt(match[7], 10));

    if (startDate === todayStr) {
      intervals.push(`${startHour}:${startMin} – ${endHour}:${endMin}`);
    }
  }

  return intervals;
}

// Fill a set of DOM fields for one city + section
function renderSection(cityId, sectionName, data, offsetMinutes, nowUtcMs) {
  const { current, next } = data;
  const base = `${cityId}-${sectionName}`;

  const currentEl = document.getElementById(`${base}-current`);
  const remainingEl = document.getElementById(`${base}-remaining`);
  const nextEl = document.getElementById(`${base}-next`);

  if (!currentEl || !remainingEl || !nextEl) return;

  if (!current) {
    currentEl.textContent = "Not in range";
    remainingEl.textContent = "–";
  } else {
    currentEl.textContent = current.name;
    const remainingMs = current.endUtc - nowUtcMs;
    remainingEl.textContent = formatRemaining(remainingMs);
  }

  if (!next) {
    nextEl.textContent = "–";
  } else {
    const startStr = formatCityDateTime(next.startUtc, offsetMinutes);
    nextEl.textContent = `${next.name} (starts: ${startStr})`;
  }
}

// Fill Rahu Kalam section for one city
function renderKalas(cityId, kalasByName) {
  const ids = {
    rahukala: `${cityId}-kala-rahukala`,
    yamaganda: `${cityId}-kala-yamaganda`,
    durmuhurtha: `${cityId}-kala-durmuhurtha`,
    varjyam: `${cityId}-kala-varjyam`,
  };

  for (const [key, elId] of Object.entries(ids)) {
    const el = document.getElementById(elId);
    if (!el) continue;
    const arr = kalasByName[key] || [];
    el.textContent = arr.length ? arr.join(", ") : "–";
  }
}

// --- Main loading logic -----------------------------------------------

function updateBrowserTime() {
  const el = document.getElementById("browser-time");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString();
}

async function loadCity(city) {
  try {
    const resp = await fetch(city.file);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const text = await resp.text();

    const nowUtcMs = Date.now();

    // Panchanga sections
    const thithiSec = extractSection(text, "Thithi");
    const nakshSec = extractSection(text, "Nakshatram");
    const yogSec = extractSection(text, "Yogam");
    const karSec = extractSection(text, "Karanam");

    const thithiEntries = parseIntervals(thithiSec, city.utcOffsetMinutes);
    const nakshEntries = parseIntervals(nakshSec, city.utcOffsetMinutes);
    const yogEntries = parseIntervals(yogSec, city.utcOffsetMinutes);
    const karEntries = parseIntervals(karSec, city.utcOffsetMinutes);

    renderSection(
      city.id,
      "tithi",
      findCurrentAndNext(thithiEntries, nowUtcMs),
      city.utcOffsetMinutes,
      nowUtcMs
    );
    renderSection(
      city.id,
      "nakshatra",
      findCurrentAndNext(nakshEntries, nowUtcMs),
      city.utcOffsetMinutes,
      nowUtcMs
    );
    renderSection(
      city.id,
      "yogam",
      findCurrentAndNext(yogEntries, nowUtcMs),
      city.utcOffsetMinutes,
      nowUtcMs
    );
    renderSection(
      city.id,
      "karanam",
      findCurrentAndNext(karEntries, nowUtcMs),
      city.utcOffsetMinutes,
      nowUtcMs
    );

    // Kalas
    const rahuSec = extractSection(text, "Rahukala");
    const yamaSec = extractSection(text, "Yamaganda");
    const durmSec = extractSection(text, "Durmuhurtha");
    const varjSec = extractSection(text, "Varjyam");

    const kalasByName = {
      rahukala: rahuSec
        ? parseKalasForToday(rahuSec, city.utcOffsetMinutes, nowUtcMs)
        : [],
      yamaganda: yamaSec
        ? parseKalasForToday(yamaSec, city.utcOffsetMinutes, nowUtcMs)
        : [],
      durmuhurtha: durmSec
        ? parseKalasForToday(durmSec, city.utcOffsetMinutes, nowUtcMs)
        : [],
      varjyam: varjSec
        ? parseKalasForToday(varjSec, city.utcOffsetMinutes, nowUtcMs)
        : [],
    };

    renderKalas(city.id, kalasByName);
  } catch (err) {
    console.error("Failed to load city", city.id, err);
  }
}

// Initialise
document.addEventListener("DOMContentLoaded", () => {
  updateBrowserTime();
  // Refresh browser time every minute so it stays roughly current
  setInterval(updateBrowserTime, 60 * 1000);

  cities.forEach(loadCity);
});
