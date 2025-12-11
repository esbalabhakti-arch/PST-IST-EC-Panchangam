// Multi-City Panchangam – Option A logic
// 1) Detect where the user is (Portland, Boston, Chennai) using time zone
// 2) Load THAT city's Panchangam file only
// 3) Use that single file to compute all 3 columns, using each city's local time

const cities = {
  portland: {
    id: "portland",
    displayName: "Portland, OR – USA",
    timeZone: "America/Los_Angeles",
    fileName: "panchangam_Portland.txt"
  },
  boston: {
    id: "boston",
    displayName: "Boston, MA – USA",
    timeZone: "America/New_York",
    fileName: "panchangam_Boston.txt"
  },
  chennai: {
    id: "chennai",
    displayName: "Chennai, India",
    timeZone: "Asia/Kolkata",
    fileName: "panchangam_Chennai.txt"
  }
};

const monthNamesShort = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ---------- Utility helpers ----------

function detectUserCity() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";

  if (tz === "America/Los_Angeles" || tz === "US/Pacific") return "portland";
  if (tz === "America/New_York" || tz === "US/Eastern") return "boston";
  if (tz === "Asia/Kolkata") return "chennai";

  // Default to Portland if we cannot recognize
  return "portland";
}

function formatDisplayFromParts({ year, month, day, hour, minute }) {
  const mStr = monthNamesShort[month - 1] || "???";
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${mStr}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

function formatDisplayFromString(dateTimeStr) {
  // Input: "2025/12/12 01:27"
  const [d, t] = dateTimeStr.split(" ");
  const [year, month, day] = d.split("/").map(Number);
  const [hour, minute] = t.split(":").map(Number);
  return formatDisplayFromParts({ year, month, day, hour, minute });
}

function getLocalPartsForTimeZone(baseDate, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = fmt.formatToParts(baseDate);
  const lookup = {};
  for (const p of parts) {
    lookup[p.type] = p.value;
  }

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second)
  };
}

function serialFromParts({ year, month, day, hour, minute }) {
  // Arbitrary UTC-based serial; good for comparisons within the same "local" scale
  return Date.UTC(year, month - 1, day, hour, minute);
}

function serialFromString(dateTimeStr) {
  const [d, t] = dateTimeStr.split(" ");
  const [year, month, day] = d.split("/").map(Number);
  const [hour, minute] = t.split(":").map(Number);
  return serialFromParts({ year, month, day, hour, minute });
}

// ---------- Panchangam parsing ----------

function extractSection(text, header) {
  const regex = new RegExp(`${header}\\s+details:[\\s\\S]*?(?=\\n[A-Za-z ]+details:|$)`, "i");
  const match = text.match(regex);
  return match ? match[0] : "";
}

function parseItemsFromSection(sectionText) {
  const linesRegex = /^([A-Za-z\/]+):\s+(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2})\s+to\s+(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2})/gm;
  const items = [];
  let m;
  while ((m = linesRegex.exec(sectionText)) !== null) {
    const name = m[1].trim();
    const startStr = m[2].trim();
    const endStr = m[3].trim();

    items.push({
      name,
      startStr,
      endStr,
      startSerial: serialFromString(startStr),
      endSerial: serialFromString(endStr)
    });
  }

  // Add "next" info for convenience
  for (let i = 0; i < items.length; i++) {
    const next = items[i + 1] || null;
    items[i].nextName = next ? next.name : null;
    items[i].nextStartStr = next ? next.startStr : null;
    items[i].nextStartSerial = next ? next.startSerial : null;
  }

  return items;
}

function parsePanchangamText(text) {
  const thithiSection = extractSection(text, "Thithi");
  const nakshatraSection = extractSection(text, "Nakshatram");
  const yogamSection = extractSection(text, "Yogam");
  const karanamSection = extractSection(text, "Karanam");

  return {
    tithi: parseItemsFromSection(thithiSection),
    nakshatra: parseItemsFromSection(nakshatraSection),
    yogam: parseItemsFromSection(yogamSection),
    karanam: parseItemsFromSection(karanamSection)
  };
}

// ---------- Rendering logic ----------

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function describeRemainingMinutes(totalMinutes) {
  if (!isFinite(totalMinutes) || totalMinutes < 0) return "–";

  const minutes = Math.round(totalMinutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  const hStr = h === 1 ? "1 hour" : `${h} hours`;
  const mStr = m === 1 ? "1 minute" : `${m} minutes`;

  if (h === 0) return `${mStr} remaining`;
  if (m === 0) return `${hStr} remaining`;
  return `${hStr} ${mStr} remaining`;
}

function updateCategoryForCity(cityId, categoryName, items, nowSerial) {
  const curId = `${categoryName}-current-${cityId}`;
  const remId = `${categoryName}-remaining-${cityId}`;
  const nextId = `${categoryName}-next-${cityId}`;

  if (!items || items.length === 0) {
    setText(curId, "–");
    setText(remId, "–");
    setText(nextId, "–");
    return;
  }

  let current = null;
  for (const item of items) {
    if (nowSerial >= item.startSerial && nowSerial < item.endSerial) {
      current = item;
      break;
    }
  }

  if (!current) {
    setText(curId, "Not in range");
    setText(remId, "–");
    setText(nextId, "–");
    return;
  }

  setText(curId, current.name);

  const remainingMinutes = (current.endSerial - nowSerial) / 60000;
  setText(remId, describeRemainingMinutes(remainingMinutes));

  if (current.nextName && current.nextStartStr) {
    setText(nextId, `${current.nextName} (starts: ${formatDisplayFromString(current.nextStartStr)})`);
  } else {
    setText(nextId, "–");
  }
}

function updateAllCities(panchangData, baseDate) {
  // 1. Browser time display
  const browserParts = getLocalPartsForTimeZone(baseDate, Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  setText("browser-time", formatDisplayFromParts(browserParts));

  // 2. For each city, compute local time and fill
  Object.values(cities).forEach((city) => {
    const parts = getLocalPartsForTimeZone(baseDate, city.timeZone);
    const serial = serialFromParts(parts);

    setText(`localtime-${city.id}`, `Local time here: ${formatDisplayFromParts(parts)}`);

    updateCategoryForCity(city.id, "tithi", panchangData.tithi, serial);
    updateCategoryForCity(city.id, "nakshatra", panchangData.nakshatra, serial);
    updateCategoryForCity(city.id, "yogam", panchangData.yogam, serial);
    updateCategoryForCity(city.id, "karanam", panchangData.karanam, serial);
  });
}

function highlightUserCity(userCityId) {
  ["portland", "boston", "chennai"].forEach((id) => {
    setText(`here-${id}`, id === userCityId ? "You are here!" : "");
  });
}

function setDataSourceLabel(userCityId) {
  const city = cities[userCityId] || cities.portland;
  const label = `All three columns use Panchangam data from ${city.displayName} (file: ${city.fileName}) and display it in each city's local time.`;
  setText("data-source-label", label);
}

// ---------- Main ----------

(function init() {
  const baseDate = new Date(); // one fixed "now" for all cities
  const userCityId = detectUserCity();
  const city = cities[userCityId] || cities.portland;

  highlightUserCity(userCityId);
  setDataSourceLabel(userCityId);

  fetch(city.fileName)
    .then((resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.text();
    })
    .then((text) => {
      const panchangData = parsePanchangamText(text);
      updateAllCities(panchangData, baseDate);
    })
    .catch((err) => {
      console.error("Error loading Panchangam file:", err);
      ["portland", "boston", "chennai"].forEach((id) => {
        setText(`tithi-current-${id}`, "–");
        setText(`tithi-remaining-${id}`, "Error loading Panchangam file.");
        setText(`tithi-next-${id}`, "–");

        setText(`nakshatra-current-${id}`, "–");
        setText(`nakshatra-remaining-${id}`, "Error loading Panchangam file.");
        setText(`nakshatra-next-${id}`, "–");

        setText(`yogam-current-${id}`, "–");
        setText(`yogam-remaining-${id}`, "Error loading Panchangam file.");
        setText(`yogam-next-${id}`, "–");

        setText(`karanam-current-${id}`, "–");
        setText(`karanam-remaining-${id}`, "Error loading Panchangam file.");
        setText(`karanam-next-${id}`, "–");
      });
    });
})();
