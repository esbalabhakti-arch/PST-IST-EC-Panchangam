// Configuration
const CITIES = {
    Portland: { timeZone: 'America/Los_Angeles', file: 'panchangam_Portland.txt', offset: -8 },
    Boston: { timeZone: 'America/New_York', file: 'panchangam_Boston.txt', offset: -5 },
    Chennai: { timeZone: 'Asia/Kolkata', file: 'panchangam_Chennai.txt', offset: 5.5 }
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Global state
let baseCity = null;
let panchangamDataByCity = {};

// Utility: Format date to YYYY-mmm-DD HH:MM
function formatDateTime(date, timeZone) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: timeZone
        });
        
        const parts = formatter.formatToParts(date);
        const year = parts.find(function(p) { return p.type === 'year'; }).value;
        const monthNum = parseInt(parts.find(function(p) { return p.type === 'month'; }).value);
        const month = MONTHS[monthNum - 1];
        const day = parts.find(function(p) { return p.type === 'day'; }).value;
        const hour = parts.find(function(p) { return p.type === 'hour'; }).value;
        const minute = parts.find(function(p) { return p.type === 'minute'; }).value;
        
        return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
    } catch (e) {
        console.error('Error formatting date:', e);
        return 'Error formatting date';
    }
}

// Utility: Get date only in YYYY-MM-DD format for matching
function getDateOnly(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: timeZone
    });
    
    const parts = formatter.formatToParts(date);
    const year = parts.find(function(p) { return p.type === 'year'; }).value;
    const month = parts.find(function(p) { return p.type === 'month'; }).value;
    const day = parts.find(function(p) { return p.type === 'day'; }).value;
    
    return year + '-' + month + '-' + day;
}

// Utility: Parse timestamp from file (YYYY/MM/DD HH:MM)
function parseTimestamp(str) {
    const cleaned = str.trim().replace(/\s+/g, ' ');
    const match = cleaned.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
    
    if (!match) return null;
    
    const year = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const day = parseInt(match[3]);
    const hour = parseInt(match[4]);
    const minute = parseInt(match[5]);
    
    return new Date(year, month, day, hour, minute);
}

// Utility: Calculate remaining time
function calculateRemaining(endDate, currentDate) {
    const diff = endDate - currentDate;
    if (diff <= 0) return '0 hours 0 minutes';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return hours + ' hours ' + minutes + ' minutes';
}

// Detect base city from browser timezone
function detectBaseCity() {
    const browserOffset = -new Date().getTimezoneOffset() / 60;
    
    let closest = 'Portland';
    let minDiff = Math.abs(browserOffset - CITIES.Portland.offset);
    
    for (const cityName in CITIES) {
        const config = CITIES[cityName];
        const diff = Math.abs(browserOffset - config.offset);
        if (diff < minDiff) {
            minDiff = diff;
            closest = cityName;
        }
    }
    
    return closest;
}

// Parse a section from panchangam text
function parseSection(text, sectionName) {
    const variations = [
        sectionName + ' details:',
        sectionName.replace('Nakshatram', 'Nakshatra') + ' details:',
        sectionName + ' detail:',
        sectionName.replace('Nakshatram', 'Nakshatra') + ' detail:'
    ];
    
    let startIndex = -1;
    let usedVariant = '';
    
    for (let i = 0; i < variations.length; i++) {
        const idx = text.indexOf(variations[i]);
        if (idx !== -1) {
            startIndex = idx;
            usedVariant = variations[i];
            break;
        }
    }
    
    if (startIndex === -1) {
        return [];
    }
    
    const afterHeader = text.substring(startIndex + usedVariant.length);
    const nextSectionMatch = afterHeader.match(/\n\n[A-Z][a-z]+\s+details?:/);
    const endIndex = nextSectionMatch ? nextSectionMatch.index : afterHeader.length;
    
    const sectionText = afterHeader.substring(0, endIndex);
    const lines = sectionText.split('\n');
    const intervals = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (!line || line.match(/^=+$/)) continue;
        
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        
        const label = line.substring(0, colonIndex).trim();
        const rest = line.substring(colonIndex + 1).trim();
        
        const toIndex = rest.toLowerCase().indexOf(' to ');
        if (toIndex === -1) continue;
        
        const startStr = rest.substring(0, toIndex).trim();
        const endStr = rest.substring(toIndex + 4).trim();
        
        const start = parseTimestamp(startStr);
        const end = parseTimestamp(endStr);
        
        if (start && end) {
            intervals.push({ label: label, start: start, end: end });
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
    
    if (intervals.length > 0) {
        if (now < intervals[0].start) {
            return { current: null, next: intervals[0] };
        } else {
            return { current: intervals[intervals.length - 1], next: null };
        }
    }
    
    return { current: null, next: null };
}

// Find inauspicious times for a specific date
function findInauspiciousForDate(intervals, targetDate) {
    const result = [];
    
    for (let i = 0; i < intervals.length; i++) {
        const interval = intervals[i];
        const intervalDate = interval.start.getFullYear() + '-' + 
                            String(interval.start.getMonth() + 1).padStart(2, '0') + '-' + 
                            String(interval.start.getDate()).padStart(2, '0');
        
        if (intervalDate === targetDate) {
            result.push(interval);
        }
    }
    
    return result;
}

// Load and parse panchangam file
async function loadPanchangam(city) {
    try {
        const response = await fetch(CITIES[city].file);
        if (!response.ok) throw new Error('Failed to load ' + CITIES[city].file);
        
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
function renderSection(title, intervals, nowBase, cityTimeZone, isInauspicious) {
    const result = findCurrentAndNext(intervals, nowBase);
    const current = result.current;
    const next = result.next;
    
    const cityNow = new Date(nowBase.getTime());
    
    let html = '<div class="section' + (isInauspicious ? ' inauspicious-section' : '') + '">';
    html += '<div class="section-title">' + title + '</div>';
    html += '<div class="section-content">';
    
    if (current) {
        html += '<div class="current-item">Current: ' + current.label + '</div>';
        html += '<div class="remaining-time">' + calculateRemaining(current.end, cityNow) + ' remaining</div>';
    } else {
        html += '<div class="current-item">Current: N/A</div>';
    }
    
    if (next) {
        const nextStartFormatted = formatDateTime(next.start, cityTimeZone);
        html += '<div class="next-item">Next: ' + next.label + ' (starts: ' + nextStartFormatted + ')</div>';
    }
    
    html += '</div></div>';
    return html;
}

// Render inauspicious times section for specific city
function renderInauspiciousSection(title, intervals, cityTimeZone) {
    if (intervals.length === 0) return '';
    
    let html = '<div class="section inauspicious-section">';
    html += '<div class="section-title">' + title + '</div>';
    html += '<div class="section-content">';
    
    for (let i = 0; i < intervals.length; i++) {
        const interval = intervals[i];
        const startStr = formatDateTime(interval.start, cityTimeZone);
        const endStr = formatDateTime(interval.end, cityTimeZone);
        html += '<div class="current-item">' + interval.label + '</div>';
        html += '<div class="next-item">' + startStr + ' to ' + endStr + '</div>';
        if (i < intervals.length - 1) html += '<br>';
    }
    
    html += '</div></div>';
    return html;
}

// Render city column
function renderCity(cityName, isBase) {
    const config = CITIES[cityName];
    const nowBase = new Date();
    const cityLocalTime = formatDateTime(nowBase, config.timeZone);
    const cityDate = getDateOnly(nowBase, config.timeZone);
    
    const basePanchangam = panchangamDataByCity[baseCity];
    const cityPanchangam = panchangamDataByCity[cityName];
    
    let html = '<div class="city-column">';
    html += '<div class="city-header">';
    html += '<div class="city-name">' + cityName + '</div>';
    html += '<div class="city-timezone">' + config.timeZone + '</div>';
    if (isBase) {
        html += '<div class="you-are-here">You are here!</div>';
    }
    html += '</div>';
    
    html += '<div class="local-time">Local time here: ' + cityLocalTime + '</div>';
    
    // Main sections use base city data
    html += renderSection('TITHI', basePanchangam.tithi, nowBase, config.timeZone, false);
    html += renderSection('NAKSHATRAM', basePanchangam.nakshatram, nowBase, config.timeZone, false);
    html += renderSection('YOGAM', basePanchangam.yogam, nowBase, config.timeZone, false);
    html += renderSection('KARANAM', basePanchangam.karanam, nowBase, config.timeZone, false);
    
    // Inauspicious times use respective city data for current date
    const rahukalaToday = findInauspiciousForDate(cityPanchangam.rahukala, cityDate);
    const yamagandaToday = findInauspiciousForDate(cityPanchangam.yamaganda, cityDate);
    const durmuhurthaToday = findInauspiciousForDate(cityPanchangam.durmuhurtha, cityDate);
    const varjyamToday = findInauspiciousForDate(cityPanchangam.varjyam, cityDate);
    
    if (rahukalaToday.length > 0) {
        html += renderInauspiciousSection('RAHUKALA', rahukalaToday, config.timeZone);
    }
    if (yamagandaToday.length > 0) {
        html += renderInauspiciousSection('YAMAGANDA', yamagandaToday, config.timeZone);
    }
    if (durmuhurthaToday.length > 0) {
        html += renderInauspiciousSection('DURMUHURTHA', durmuhurthaToday, config.timeZone);
    }
    if (varjyamToday.length > 0) {
        html += renderInauspiciousSection('VARJYAM', varjyamToday, config.timeZone);
    }
    
    html += '</div>';
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
        const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const browserTimeStr = formatDateTime(browserNow, browserTZ);
        document.getElementById('browserTime').textContent = 'Current time (your browser): ' + browserTimeStr;
        
        // Load panchangam data for ALL cities
        const cityNames = Object.keys(CITIES);
        for (let i = 0; i < cityNames.length; i++) {
            const cityName = cityNames[i];
            panchangamDataByCity[cityName] = await loadPanchangam(cityName);
        }
        
        // Render all cities
        let gridHtml = '';
        for (let i = 0; i < cityNames.length; i++) {
            gridHtml += renderCity(cityNames[i], cityNames[i] === baseCity);
        }
        document.getElementById('citiesGrid').innerHTML = gridHtml;
        
        // Auto-refresh every minute
        setInterval(function() {
            const browserNow = new Date();
            const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const browserTimeStr = formatDateTime(browserNow, browserTZ);
            document.getElementById('browserTime').textContent = 'Current time (your browser): ' + browserTimeStr;
            
            let gridHtml = '';
            const cityNames = Object.keys(CITIES);
            for (let i = 0; i < cityNames.length; i++) {
                gridHtml += renderCity(cityNames[i], cityNames[i] === baseCity);
            }
            document.getElementById('citiesGrid').innerHTML = gridHtml;
        }, 60000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('citiesGrid').innerHTML = '<div class="error"><strong>Error loading Panchangam data:</strong><br>' + error.message + '<br><br>Please ensure the panchangam text files are in the same directory as this HTML file.</div>';
    }
}

// Start the app
init();
