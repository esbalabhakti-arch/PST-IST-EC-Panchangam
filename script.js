// Configuration
const CITIES = {
    Portland: { timeZone: 'America/Los_Angeles', file: 'panchangam_Portland.txt', offset: -8 },
    Boston: { timeZone: 'America/New_York', file: 'panchangam_Boston.txt', offset: -5 },
    Chennai: { timeZone: 'Asia/Kolkata', file: 'panchangam_Chennai.txt', offset: 5.5 }
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Global state
let baseCity = null;
let panchangamData = null;

// Utility: Format date to YYYY-mmm-DD HH:MM
function formatDateTime(date, timeZone) {
    const year = date.toLocaleString('en-US', { year: 'numeric', timeZone });
    const month = MONTHS[parseInt(date.toLocaleString('en-US', { month: '2-digit', timeZone })) - 1];
    const day = date.toLocaleString('en-US', { day: '2-digit', timeZone });
    const hour = date.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone });
    const minute = date.toLocaleString('en-US', { minute: '2-digit', timeZone });
    return `${year}-${month}-${day} ${hour}:${minute}`;
}

// Utility: Parse timestamp from file (YYYY/MM/DD HH:MM)
function parseTimestamp(str) {
    const parts = str.trim().split(/[\s\/:]/).filter(p => p);
    if (parts.length < 5) return null;
    return new Date(
        parseInt(parts[0]),
        parseInt(parts[1]) - 1,
        parseInt(parts[2]),
        parseInt(parts[3]),
        parseInt(parts[4])
    );
}

// Utility: Calculate remaining time
function calculateRemaining(endDate, currentDate) {
    const diff = endDate - currentDate;
    if (diff <= 0) return '0 hours 0 minutes';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours} hours ${minutes} minutes`;
}

// Detect base city from browser timezone
function detectBaseCity() {
    const browserOffset = -new Date().getTimezoneOffset() / 60;
    
    let closest = 'Portland';
    let minDiff = Math.abs(browserOffset - CITIES.Portland.offset);
    
    for (const [city, config] of Object.entries(CITIES)) {
        const diff = Math.abs(browserOffset - config.offset);
        if (diff < minDiff) {
            minDiff = diff;
            closest = city;
        }
    }
    
    return closest;
}

// Parse a section from panchangam text
function parseSection(text, sectionName) {
    const variations = [sectionName, sectionName.replace('Nakshatram', 'Nakshatra')];
    let sectionText = '';
    
    for (const variant of variations) {
        const regex = new RegExp(`${variant}\\s*details?:\\s*([\\s\\S]*?)(?=\\n\\n[A-Z]|$)`, 'i');
        const match = text.match(regex);
        if (match) {
            sectionText = match[1];
            break;
        }
    }
    
    if (!sectionText) return [];
    
    const lines = sectionText.split('\n').filter(line => line.trim());
    const intervals = [];
    
    for (const line of lines) {
        const match = line.match(/^(.+?):\s*(.+?)\s+to\s+(.+?)$/);
        if (match) {
            const label = match[1].trim();
            const start = parseTimestamp(match[2]);
            const end = parseTimestamp(match[3]);
            
            if (start && end) {
                intervals.push({ label, start, end });
            }
        }
    }
    
    return intervals;
}

// Find current and next items
function findCurrentAndNext(intervals, now) {
    for (let i = 0; i < intervals.length; i++) {
        if (now >= intervals[i].start && now < intervals[i].end) {
            return {
                current: intervals[i],
                next: intervals[i + 1] || null
            };
        }
    }
    
    // If not found, return first or last
    if (intervals.length > 0) {
        if (now < intervals[0].start) {
            return { current: null, next: intervals[0] };
        } else {
            return { current: intervals[intervals.length - 1], next: null };
        }
    }
    
    return { current: null, next: null };
}

// Load and parse panchangam file
async function loadPanchangam(city) {
    try {
        const response = await fetch(CITIES[city].file);
        if (!response.ok) throw new Error(`Failed to load ${CITIES[city].file}`);
        
        const text = await response.text();
        
        return {
            tithi: parseSection(text, 'Thithi'),
            nakshatram: parseSection(text, 'Nakshatram'),
            yogam: parseSection(text, 'Yogam'),
            karanam: parseSection(text, 'Karanam'),
            rahukala: parseSection(text, 'Rahukala'),
            yamaganda: parseSection(text, 'Yamaganda'),
            durmuhurtha: parseSection(text, 'Durmuhurtha'),
            varjyam: parseSection(text, 'Varjyam')
        };
    } catch (error) {
        console.error('Error loading panchangam:', error);
        throw error;
    }
}

// Render a section (Tithi, Nakshatra, etc.)
function renderSection(title, intervals, nowBase, cityTimeZone, isInauspicious = false) {
    const { current, next } = findCurrentAndNext(intervals, nowBase);
    
    const cityNow = new Date(nowBase.toLocaleString('en-US', { timeZone: cityTimeZone }));
    
    let html = `<div class="section ${isInauspicious ? 'inauspicious-section' : ''}">`;
    html += `<div class="section-title">${title}</div>`;
    html += `<div class="section-content">`;
    
    if (current) {
        html += `<div class="current-item">Current: ${current.label}</div>`;
        html += `<div class="remaining-time">${calculateRemaining(current.end, cityNow)} remaining</div>`;
    } else {
        html += `<div class="current-item">Current: N/A</div>`;
    }
    
    if (next) {
        const nextStartFormatted = formatDateTime(next.start, cityTimeZone);
        html += `<div class="next-item">Next: ${next.label} (starts: ${nextStartFormatted})</div>`;
    }
    
    html += `</div></div>`;
    return html;
}

// Render city column
function renderCity(cityName, isBase) {
    const config = CITIES[cityName];
    const nowBase = new Date();
    const cityLocalTime = formatDateTime(nowBase, config.timeZone);
    
    let html = `<div class="city-column">`;
    html += `<div class="city-header">`;
    html += `<div class="city-name">${cityName}</div>`;
    html += `<div class="city-timezone">${config.timeZone}</div>`;
    if (isBase) {
        html += `<div class="you-are-here">You are here!</div>`;
    }
    html += `</div>`;
    
    html += `<div class="local-time">Local time here: ${cityLocalTime}</div>`;
    
    // Main sections
    html += renderSection('TITHI', panchangamData.tithi, nowBase, config.timeZone);
    html += renderSection('NAKSHATRAM', panchangamData.nakshatram, nowBase, config.timeZone);
    html += renderSection('YOGAM', panchangamData.yogam, nowBase, config.timeZone);
    html += renderSection('KARANAM', panchangamData.karanam, nowBase, config.timeZone);
    
    // Inauspicious times (for Chennai or all cities)
    if (cityName === 'Chennai' || true) {
        if (panchangamData.rahukala && panchangamData.rahukala.length > 0) {
            html += renderSection('RAHUKALA', panchangamData.rahukala, nowBase, config.timeZone, true);
        }
        if (panchangamData.yamaganda && panchangamData.yamaganda.length > 0) {
            html += renderSection('YAMAGANDA', panchangamData.yamaganda, nowBase, config.timeZone, true);
        }
        if (panchangamData.durmuhurtha && panchangamData.durmuhurtha.length > 0) {
            html += renderSection('DURMUHURTHA', panchangamData.durmuhurtha, nowBase, config.timeZone, true);
        }
        if (panchangamData.varjyam && panchangamData.varjyam.length > 0) {
            html += renderSection('VARJYAM', panchangamData.varjyam, nowBase, config.timeZone, true);
        }
    }
    
    html += `</div>`;
    return html;
}

// Main initialization
async function init() {
    try {
        // Detect base city
        baseCity = detectBaseCity();
        console.log('Detected base city:', baseCity);
        
        // Update browser time
        const browserNow = new Date();
        const browserTimeStr = formatDateTime(browserNow, Intl.DateTimeFormat().resolvedOptions().timeZone);
        document.getElementById('browserTime').textContent = `Current time (your browser): ${browserTimeStr}`;
        
        // Load panchangam data
        panchangamData = await loadPanchangam(baseCity);
        
        // Render all cities
        let gridHtml = '';
        for (const cityName of Object.keys(CITIES)) {
            gridHtml += renderCity(cityName, cityName === baseCity);
        }
        document.getElementById('citiesGrid').innerHTML = gridHtml;
        
        // Update footer
        document.getElementById('footer').innerHTML = `
            All three columns use Panchangam data from <strong>${baseCity}</strong>.<br>
            Date format: YYYY-mmm-DD HH:MM
        `;
        
        // Auto-refresh every minute
        setInterval(() => {
            const browserNow = new Date();
            const browserTimeStr = formatDateTime(browserNow, Intl.DateTimeFormat().resolvedOptions().timeZone);
            document.getElementById('browserTime').textContent = `Current time (your browser): ${browserTimeStr}`;
            
            let gridHtml = '';
            for (const cityName of Object.keys(CITIES)) {
                gridHtml += renderCity(cityName, cityName === baseCity);
            }
            document.getElementById('citiesGrid').innerHTML = gridHtml;
        }, 60000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('citiesGrid').innerHTML = `
            <div class="error">
                <strong>Error loading Panchangam data:</strong><br>
                ${error.message}<br><br>
                Please ensure the panchangam text files are in the same directory as this HTML file.
            </div>
        `;
    }
}

// Start the app
init();
