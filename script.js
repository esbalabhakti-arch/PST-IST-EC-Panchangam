// Multi-city Panchangam viewer using a single Portland Panchangam file
// Works with panchangam_Portland.txt as you uploaded.

const CITY_CONFIG = [
  {
    id: "portland",
    label: "Portland, OR – USA",
    utcOffsetMinutes: -8 * 60,   // PST
  },
  {
    id: "boston",
    label: "Boston, MA – USA",
    utcOffsetMinutes: -5 * 60,   // EST
  },
  {
    id: "chennai",
    label: "Chennai, India",
    utcOffsetMinutes: 5.5 * 60,  // IST
  },
];

// Section titles as they appear in the text file
const SECTION_TITLES = [
  "Thithi details:",
  "Nakshatram details:",
  "Yogam details:",
  "Karanam details:",
  "Rahukala details:",
  "Yamaganda details:",
  "Durmuhurtha details:",
  "Varjyam details:",
];

// -------------------- Utility functions --------------------

function formatDateTime(dt) {
  const months = [
    "jan","feb","mar","apr","may","jun",
    "jul","aug","sep","oct","nov","dec"
  ];
  const y = dt.getUTCFullYear();
  const m = months[dt.getUTCMonth()];
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function formatLocalDateTime(dt, utcOffsetMinutes) {
  // show in that city's local clock
  const ms = dt.getTime() + utcOffsetMinutes * 60 * 1000;
  const local = new Date(ms);
  const months = [
    "jan","feb","mar","apr","may","jun",
    "jul","aug","sep","oct","nov","dec"
  ];
  const y = local.getUTCFullYear();
  const m = months[local.getUTCMonth()];
  const d = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function formatRemaining(msDiff) {
  if (!Number.isFinite(msDiff)) return "";
  if (msDiff < 0) return "Already ended";
  const totalMinutes = Math.floor(msDiff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hours ${minutes} minutes remaining`;
}

// Convert a Portland-local timestamp "YYYY/MM/DD HH:MM" to a UTC Date
function parsePortlandTimeToUTC(str) {
  const [datePart, timePart] = str.split(" ");
  const [yy, mm, dd] = datePart.split("/").map(Number);
  const [hh, min] = timePart.split(":").map(Number);

  // Portland in December is PST (UTC-8).
  const portlandOffset = -8 * 60; // minutes from UTC
  // We create a UTC timestamp equal to that local wall-clock time.
  const utcMs = Date.UTC(yy, mm - 1, dd, hh - portlandOffset / 60, min);
  return new Date(utcMs);
}

// Extract the text block for a section
function getSectionText(fileText, sectionTitle) {
  const start = fileText.indexOf(sectionTitle);
  if (start === -1) return "";

  let end = fileText.length;
  for (const title of SECTION_TITLES) {
    if (title === sectionTitle) continue;
    const pos = fileText.indexOf(title, start + sectionTitle.length);
    if (pos !== -1 && pos < end) end = pos;
  }
  return fileText.slice(start + sectionTitle.length, end);
}

// Parse intervals from a section: "Name: YYYY/MM/DD HH:MM to YYYY/MM/DD HH:MM"
function parseIntervals(sectionText) {
  const lines = sectionText.split("\n");
  const pattern =
    /^(.+?):\s+(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}) to (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2})$/;

  const intervals = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(pattern);
    if (!m) continue;
    const name = m[1].trim();
    const startUTC = parsePortlandTimeToUTC(m[2]);
    const endUTC = parsePortlandTimeToUTC(m[3]);
    intervals.push({ name, startUTC, endUTC });
  }
  return intervals;
}

// For a given UTC "now", find current & next interval
function findCurrentAndNext(intervals, nowUTC) {
  let current = null;
  let next = null;

  for (const iv of intervals) {
    if (iv.startUTC <= nowUTC && nowUTC < iv.endUTC) {
      current = iv;
    }
    if (iv.startUTC > nowUTC) {
      if (!next || iv.startUTC < next.startUTC) next = iv;
    }
  }
  return { current, next };
}

// -------------------- Rendering logic --------------------

async function main() {
  const browserNow = new Date();
  const utcNow = new Date(
    browserNow.getTime() + browserNow.getTimezoneOffset() * 60000
  );

  // Browser time display
  const browserTimeEl = document.getElementById("browserTime");
  if (browserTimeEl) {
    browserTimeEl.textContent = formatDateTime(utcNow);
  }

  // "You are here!" detection
  const viewerUtcOffset = -browserNow.getTimezoneOffset(); // in minutes

  CITY_CONFIG.forEach((city) => {
    const localStr = formatLocalDateTime(utcNow, city.utcOffsetMinutes);
    const localEl = document.getElementById(`${city.id}LocalTime`);
    if (localEl) localEl.textContent = `Local time here: ${localStr}`;

    const hereEl = document.getElementById(`${city.id}Here`);
    if (hereEl) {
      const diff = Math.abs(viewerUtcOffset - city.utcOffsetMinutes);
      if (diff <= 30) {
        hereEl.textContent = "You are here!";
      } else {
        hereEl.textContent = "";
      }
    }
  });

  // Load Panchangam file (Portland)
  let txt;
  try {
    const resp = await fetch("panchangam_Portland.txt");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    txt = await resp.text();
  } catch (err) {
    console.error("Error loading Panchangam file:", err);
    CITY_CONFIG.forEach((city) => {
      const errEl = document.getElementById(`${city.id}-error`);
      if (errEl) errEl.textContent = "Error loading Panchangam file.";
    });
    return;
  }

  // Parse all four sections once
  const tithiIntervals = parseIntervals(
    getSectionText(txt, "Thithi details:")
  );
  const nakshatraIntervals = parseIntervals(
    getSectionText(txt, "Nakshatram details:")
  );
  const yogamIntervals = parseIntervals(
    getSectionText(txt, "Yogam details:")
  );
  const karanamIntervals = parseIntervals(
    getSectionText(txt, "Karanam details:")
  );

  // Sanity-log to console for debugging if needed
  console.log("Tithi intervals:", tithiIntervals.length);
  console.log("Nakshatra intervals:", nakshatraIntervals.length);
  console.log("Yogam intervals:", yogamIntervals.length);
  console.log("Karanam intervals:", karanamIntervals.length);

  // For each city, we use the same UTC "now" to decide current / next,
  // but we show the start/end timestamps in that city's local time.
  CITY_CONFIG.forEach((city) => {
    const baseUtcOffset = city.utcOffsetMinutes;

    function renderBlock(kind, intervals) {
      const { current, next } = findCurrentAndNext(intervals, utcNow);

      const curSpan = document.getElementById(`${city.id}-${kind}-current`);
      const remSpan = document.getElementById(`${city.id}-${kind}-remaining`);
      const nextSpan = document.getElementById(`${city.id}-${kind}-next`);

      if (!curSpan || !remSpan || !nextSpan) return;

      if (!current) {
        curSpan.textContent = "Not in range";
        remSpan.textContent = "";
      } else {
        curSpan.textContent = current.name;
        const remainingMs = current.endUTC.getTime() - utcNow.getTime();
        remSpan.textContent = formatRemaining(remainingMs);
      }

      if (!next) {
        nextSpan.textContent = "–";
      } else {
        const localStartStr = formatLocalDateTime(
          next.startUTC,
          baseUtcOffset
        );
        nextSpan.textContent = `${next.name} (starts: ${localStartStr})`;
      }
    }

    renderBlock("tithi", tithiIntervals);
    renderBlock("nakshatra", nakshatraIntervals);
    renderBlock("yogam", yogamIntervals);
    renderBlock("karanam", karanamIntervals);
  });
}

document.addEventListener("DOMContentLoaded", main);
