/**
 * Central IST (Asia/Kolkata) Time Utility
 *
 * All date/time operations for Indian Railways should go through this module.
 * Indian Railways operates on IST (UTC+5:30). Dates, days, hours, and temporal
 * features must always be interpreted in IST regardless of server timezone.
 *
 * Zero external dependencies — uses Intl API and Date arithmetic only.
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Get a Date object whose UTC components represent IST wall-clock time.
 * Example: at 14:30 IST, returns Date where getUTCHours() === 14, getUTCMinutes() === 30.
 *
 * WARNING: This is NOT a real Date object — it is an "IST-extracted" Date where
 * the UTC methods yield IST values. Use this for extracting IST components only.
 * Do NOT use for absolute time comparisons or serialization.
 */
function nowIST() {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { timeZone: IST_TIMEZONE });
  return new Date(istString);
}

/**
 * Get current IST hour (0-23).
 */
function getISTHour(date) {
  const d = date ? toISTDate(date) : nowIST();
  return d.getHours();
}

/**
 * Get current IST minute (0-59).
 */
function getISTMinute(date) {
  const d = date ? toISTDate(date) : nowIST();
  return d.getMinutes();
}

/**
 * Get IST day-of-week where Monday=0, Tuesday=1, ..., Sunday=6.
 * This matches Indian Railways convention (Mon=0 used in ML features).
 */
function getISTDayOfWeek(date) {
  const d = date ? toISTDate(date) : nowIST();
  return (d.getDay() + 6) % 7;
}

/**
 * Get IST JavaScript day-of-week (Sunday=0, Monday=1, ..., Saturday=6).
 */
function getISTJsDayOfWeek(date) {
  const d = date ? toISTDate(date) : nowIST();
  return d.getDay();
}

/**
 * Check if a given IST date falls on weekend (Saturday=6 or Sunday=0 in JS terms).
 * Returns 1 for weekend, 0 for weekday.
 */
function isISTWeekend(date) {
  const jsDay = getISTJsDayOfWeek(date);
  return (jsDay === 0 || jsDay === 6) ? 1 : 0;
}

/**
 * Get YYYY-MM-DD string in IST.
 * Safe for use as journey date string — will NOT shift across midnight IST.
 */
function getISTDateString(date) {
  const d = date ? toISTDate(date) : nowIST();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get current IST date as "YYYY-MM-DD" (equivalent to toISOString().split('T')[0]
 * but in IST instead of UTC).
 */
function todayIST() {
  return getISTDateString();
}

/**
 * Get tomorrow's IST date as "YYYY-MM-DD".
 */
function tomorrowIST() {
  const d = nowIST();
  d.setDate(d.getDate() + 1);
  return getISTDateString(d);
}

/**
 * Get yesterday's IST date as "YYYY-MM-DD".
 */
function yesterdayIST() {
  const d = nowIST();
  d.setDate(d.getDate() - 1);
  return getISTDateString(d);
}

/**
 * Parse a "YYYY-MM-DD" date string safely without accidental UTC conversion.
 * Returns a Date object at 00:00:00 IST (represented as local-compatible Date).
 *
 * IMPORTANT: new Date("2026-09-07") may be parsed as UTC in some environments.
 * This function ensures the date is always interpreted as IST.
 */
function parseISTDate(dateStr) {
  if (!dateStr) return nowIST();
  // Handle both "YYYY-MM-DD" and full ISO strings
  const str = String(dateStr).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    // Create at IST midnight
    const istStr = `${match[1]}-${match[2]}-${match[3]}T00:00:00`;
    return new Date(istStr);
  }
  // Fallback: parse as-is but extract IST components
  return toISTDate(new Date(str));
}

/**
 * Convert any Date to an IST-extracted Date for component access.
 */
function toISTDate(date) {
  if (!date) return nowIST();
  const d = date instanceof Date ? date : new Date(date);
  const istString = d.toLocaleString('en-US', { timeZone: IST_TIMEZONE });
  return new Date(istString);
}

/**
 * Format a date for Indian passenger display: "September 7, 2026"
 * Uses en-IN locale for Indian English formatting.
 */
function formatDateForPassenger(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 'Date unavailable';
    return d.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: IST_TIMEZONE,
    });
  } catch (_) {
    return 'Date unavailable';
  }
}

/**
 * Format time for Indian passenger display: "7:45 PM" or "19:45"
 */
function formatTimeForPassenger(date, use24Hour = false) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 'Time unavailable';
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !use24Hour,
      timeZone: IST_TIMEZONE,
    });
  } catch (_) {
    return 'Time unavailable';
  }
}

/**
 * Format date for short display: "Mon, Sep 7"
 */
function formatDateShort(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 'Date unavailable';
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: IST_TIMEZONE,
    });
  } catch (_) {
    return 'Date unavailable';
  }
}

/**
 * Get the IST "today" as a JavaScript Date set to midnight (for comparisons).
 * Use this for checking if a journey date is today/tomorrow/etc.
 */
function getISTMidnight(date) {
  const d = date ? toISTDate(date) : nowIST();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Check if two IST dates are the same calendar day.
 */
function isSameISTDay(date1, date2) {
  const d1 = toISTDate(date1);
  const d2 = toISTDate(date2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Get a formatted string for the AI system prompt:
 * "Monday, September 7, 2026" and "9:47 AM IST"
 */
function getAISystemDateTime() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: IST_TIMEZONE,
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TIMEZONE,
  });
  return { date: dateStr, time: `${timeStr} IST` };
}

/**
 * Get IST-aware temporal features for ML models.
 * Returns { hour, dayOfWeek (Mon=0), isWeekend (0|1) }
 */
function getMLTemporalFeatures(date) {
  const d = date ? toISTDate(date) : nowIST();
  return {
    hour: d.getHours(),
    dayOfWeek: (d.getDay() + 6) % 7,
    isWeekend: (d.getDay() === 0 || d.getDay() === 6) ? 1 : 0,
  };
}

module.exports = {
  IST_TIMEZONE,
  nowIST,
  getISTHour,
  getISTMinute,
  getISTDayOfWeek,
  getISTJsDayOfWeek,
  isISTWeekend,
  getISTDateString,
  todayIST,
  tomorrowIST,
  yesterdayIST,
  parseISTDate,
  toISTDate,
  formatDateForPassenger,
  formatTimeForPassenger,
  formatDateShort,
  getISTMidnight,
  isSameISTDay,
  getAISystemDateTime,
  getMLTemporalFeatures,
};
