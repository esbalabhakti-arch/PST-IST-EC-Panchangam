// script.js

// ---- Utilities ----

// Create a Date in local time from numeric components
function makeLocalDate(y, m, d, hh, mm) {
  // JS months are 0-based
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0);
}

// Format a Date like the panchangam text: "YYYY/MM/DD HH:MM"
function formatDateTime(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

// Parse a single interval line
// Example: "Prathama: 2025/12/04 15:14 to 2025/12/05 11:26"
function parseIntervalLine(line) {
  const re = /^(.+?):\s*(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) to (\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/;
  const m = line.trim().match(re);
  if (!m) return null;

  const name = m[1].trim();
  const start = makeLocalDate(m[2], m[3], m[4], m[5], m[6]);
  const end = makeLocalDate(m[7], m[8], m[9], m[10], m[11]);

  return { name, start, end };
}

// Find current and next interval for a given "now"
function findCurrentAndNext(intervals, now) {
  let current = null;
  let next = null;

  for (let i = 0; i < intervals.length; i++) {
    const iv = intervals[i];
    if (now >= iv.start && now < iv.end) {
      current = iv;
      next = intervals[i + 1] || null;
      break;
    }
  }

  return { current, next };
}

// Nicely format remaining time
function formatTimeRemaining(end, now) {
  const ms = end - now;
  if (ms <= 0) return "Ended just now";

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0 && minutes <= 0) return "Ending now";
  if (hours === 0) return `${minutes} minutes remaining`;
  if (minutes === 0) return `${hours} hours remaining`;

  return `${hours} hours ${minutes} minutes remaining`;
}

// ---- Parsing helpers ----

// Extract the lines belonging to a section starting with a label like "Thithi details"
function extractSection(lines, startLabel) {
  const startIdx = lines.findIndex(l => l.trim().startsWith(startLabel));
  if (startIdx === -1) return [];

  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop when we hit another "details:" header (for a different section)
    if (/details\s*:$/i.test(trimmed) && !trimmed.startsWith(startLabel)) break;

    out.push(line);
  }
  return out;
}

// From the section lines, build interval objects for each valid line
function getIntervalsFromSection(sectionLines) {
  const intervals = [];
  for (const raw of sectionLines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.toLowerCase().startsWith("next ")) continue; // skip "Next Tithi" etc.

    const iv = parseIntervalLine(line);
    if (iv) intervals.push(iv);
  }
  return intervals;
}

// Get a simple "Label : Value" header line (e.g. "Samvatsaram : Vishwaavasu")
function getHeaderValue(lines, label) {
  const lowerLabel = label.toLowerCase();
  const line = lines.find(l => l.trim().toLowerCase().startsWith(lowerLabel));
  if (!line) return null;
  const parts = line.split(":");
  if (parts.length < 2) return null;
  return parts[1].trim();
}

// Get backend timestamp line: "Date and time created: 2025/12/01 15:15:42"
function getBackendTimestamp(lines) {
  const line = lines.find(l =>
    l.trim().toLowerCase().startsWith("date and time created")
  );
  if (!line) return null;
  const parts = line.split(":");
  if (parts.length < 2) return null;
  // Join everything after the first ":" in case there are extra colons
  return parts.slice(1).join(":").trim();
}

// ---- Main ----

async function main() {
  const statusEl = document.getElementById("status");
  const nowDisplay = document.getElementById("now-display");
  const backendDisplay = document.getElementById("backend-time");

  try {
    const res = await fetch("panchangam.txt");
    if (!res.ok) throw new Error("Could not load panchangam.txt");
    const text = await res.text();

    const lines = text.split(/\r?\n/);

    // --- Header info (Samvatsaram, Ayanam, etc.) ---
    const samvatsaramVal = getHeaderValue(lines, "Samvatsaram");
    const ayanamVal      = getHeaderValue(lines, "Ayanam");
    const ruthuVal       = getHeaderValue(lines, "Ruthu");
    const masamVal       = getHeaderValue(lines, "Masam");
    const pakshamVal     = getHeaderValue(lines, "Paksham");

    const samEl = document.getElementById("samvatsaram");
    const ayaEl = document.getElementById("ayanam");
    const rutEl = document.getElementById("ruthu");
    const masEl = document.getElementById("masam");
    const pakEl = document.getElementById("paksham");

    if (samEl) samEl.textContent = samvatsaramVal || "–";
    if (ayaEl) ayaEl.textContent = ayanamVal || "–";
    if (rutEl) rutEl.textContent = ruthuVal || "–";
    if (masEl) masEl.textContent = masamVal || "–";
    if (pakEl) pakEl.textContent = pakshamVal || "–";

    // --- Backend time stamp ---
    const backendTs = getBackendTimestamp(lines);
    if (backendDisplay) {
      backendDisplay.textContent = backendTs
        ? `(Panchangam back-end time stamp: ${backendTs})`
        : "";
    }

    // --- Interval sections ---
    const tithiSection  = extractSection(lines, "Thithi details");
    const nakSection    = extractSection(lines, "Nakshatram details");
    const yogaSection   = extractSection(lines, "Yogam details");
    const karanaSection = extractSection(lines, "Karanam details");

    const tithiIntervals  = getIntervalsFromSection(tithiSection);
    const nakIntervals    = getIntervalsFromSection(nakSection);
    const yogaIntervals   = getIntervalsFromSection(yogaSection);
    const karanaIntervals = getIntervalsFromSection(karanaSection);

    const now = new Date(); // local time (PST/PDT for you in Portland)
    if (nowDisplay) {
      nowDisplay.textContent = `Current time (your browser): ${now.toLocaleString()}`;
    }

    // ----- Tithi -----
    const { current: tithiCur, next: tithiNext } = findCurrentAndNext(tithiIntervals, now);
    document.getElementById("tithi-current").textContent =
      tithiCur ? tithiCur.name : "Not in range";
    document.getElementById("tithi-remaining").textContent =
      tithiCur ? formatTimeRemaining(tithiCur.end, now) : "";

    if (tithiNext) {
      document.getElementById("tithi-next").textContent =
        `${tithiNext.name} (starts: ${formatDateTime(tithiNext.start)})`;
    } else {
      document.getElementById("tithi-next").textContent = "–";
    }

    // ----- Nakshatra -----
    const { current: nakCur, next: nakNext } = findCurrentAndNext(nakIntervals, now);
    document.getElementById("nak-current").textContent =
      nakCur ? nakCur.name : "Not in range";
    document.getElementById("nak-remaining").textContent =
      nakCur ? formatTimeRemaining(nakCur.end, now) : "";

    if (nakNext) {
      document.getElementById("nak-next").textContent =
        `${nakNext.name} (starts: ${formatDateTime(nakNext.start)})`;
    } else {
      document.getElementById("nak-next").textContent = "–";
    }

    // ----- Yogam -----
    const { current: yogaCur, next: yogaNext } = findCurrentAndNext(yogaIntervals, now);
    document.getElementById("yoga-current").textContent =
      yogaCur ? yogaCur.name : "Not in range";
    document.getElementById("yoga-remaining").textContent =
      yogaCur ? formatTimeRemaining(yogaCur.end, now) : "";

    if (yogaNext) {
      document.getElementById("yoga-next").textContent =
        `${yogaNext.name} (starts: ${formatDateTime(yogaNext.start)})`;
    } else {
      document.getElementById("yoga-next").textContent = "–";
    }

    // ----- Karanam -----
    const { current: karCur, next: karNext } = findCurrentAndNext(karanaIntervals, now);
    document.getElementById("karana-current").textContent =
      karCur ? karCur.name : "Not in range";
    document.getElementById("karana-remaining").textContent =
      karCur ? formatTimeRemaining(karCur.end, now) : "";

    if (karNext) {
      document.getElementById("karana-next").textContent =
        `${karNext.name} (starts: ${formatDateTime(karNext.start)})`;
    } else {
      document.getElementById("karana-next").textContent = "–";
    }

    if (statusEl) {
      statusEl.textContent = "Panchangam loaded from panchangam.txt";
    }

  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent = "Error loading panchangam data. Check console.";
    }
  }
}

main();
