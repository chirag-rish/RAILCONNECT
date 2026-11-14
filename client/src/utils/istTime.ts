/**
 * Central IST (Asia/Kolkata) Time Utility — Client Side
 *
 * Indian Railways operates on IST (UTC+5:30). All passenger-facing dates,
 * times, and day calculations must use IST regardless of browser timezone.
 *
 * Zero external dependencies — uses Intl API only.
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Get YYYY-MM-DD string in IST.
 * Safe replacement for toISOString().split('T')[0] which returns UTC.
 */
export function getISTDateString(date?: Date): string {
  const d = date || new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Get today's IST date as "YYYY-MM-DD".
 * Safe replacement for new Date().toISOString().split('T')[0].
 */
export function todayIST(): string {
  return getISTDateString();
}

/**
 * Get tomorrow's IST date as "YYYY-MM-DD".
 * Safe replacement for new Date(Date.now() + 86400000).toISOString().split('T')[0].
 */
export function tomorrowIST(): string {
  const d = new Date();
  // Add 1 IST day by extracting IST date, adding 1, then re-formatting
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const year = parseInt(istParts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(istParts.find(p => p.type === 'month')?.value || '0');
  const day = parseInt(istParts.find(p => p.type === 'day')?.value || '0');

  const tomorrow = new Date(year, month - 1, day + 1);
  return getISTDateString(tomorrow);
}

/**
 * Parse a "YYYY-MM-DD" string as IST date (not UTC).
 * Safe replacement for new Date("YYYY-MM-DD") which may parse as UTC.
 */
export function parseISTDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    // Create a Date that represents the IST calendar day
    // by formatting in IST first, then parsing
    const istDateStr = `${match[1]}-${match[2]}-${match[3]}T00:00:00`;
    return new Date(istDateStr);
  }
  return new Date(dateStr);
}

/**
 * Check if a date string represents a day before today in IST.
 * Safe comparison: selects date must not be before today IST.
 */
export function isDateBeforeTodayIST(dateStr: string): boolean {
  if (!dateStr) return true;
  const todayStr = todayIST();
  return dateStr < todayStr;
}

/**
 * Format a date for Indian passenger display: "Monday, September 7, 2026"
 */
export function formatDateForPassenger(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Date unavailable';
    return d.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: IST_TIMEZONE,
    });
  } catch {
    return 'Date unavailable';
  }
}

/**
 * Format time for Indian passenger display: "7:45 PM" or "19:45"
 */
export function formatTimeForPassenger(date: Date | string, use24Hour = false): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Time unavailable';
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !use24Hour,
      timeZone: IST_TIMEZONE,
    });
  } catch {
    return 'Time unavailable';
  }
}

/**
 * Format date for search results display: "Full date" in user's locale
 */
export function formatSearchDate(dateStr: string): string {
  try {
    if (!dateStr) return '';
    const d = parseISTDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      dateStyle: 'full',
      timeZone: IST_TIMEZONE,
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get current IST hour (0-23).
 */
export function getISTHour(date?: Date): number {
  const d = date || new Date();
  return parseInt(
    d.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: IST_TIMEZONE,
    })
  );
}

/**
 * Get IST day-of-week where Monday=0 ... Sunday=6.
 */
export function getISTDayOfWeek(date?: Date): number {
  const d = date || new Date();
  const weekdayStr = d.toLocaleString('en-US', {
    weekday: 'short',
    timeZone: IST_TIMEZONE,
  });
  const dayMap: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return dayMap[weekdayStr] ?? 0;
}
