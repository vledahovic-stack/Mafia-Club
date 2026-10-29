// Centralized Client Timezone Utility for Mafia Club
// Synchronizes with server `/api/settings/timezone` and provides deterministic IANA calendar helpers.

let clientProjectTimezone: string = 'Europe/Moscow';
const listeners = new Set<(tz: string) => void>();

export interface ClientTimezoneOption {
  id: string;
  label: string;
  offsetLabel: string;
  offsetMinutes: number;
  currentLocalTime: string;
}

export function isValidClientIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string') return false;
  const trimmed = tz.trim();
  if (!trimmed || trimmed.length > 100 || /^[+-]\d/.test(trimmed)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function getClientProjectTimezone(): string {
  return clientProjectTimezone;
}

export function setClientProjectTimezone(tz: string): void {
  const trimmed = String(tz || '').trim();
  if (isValidClientIanaTimezone(trimmed) && trimmed !== clientProjectTimezone) {
    clientProjectTimezone = trimmed;
    listeners.forEach((fn) => {
      try {
        fn(clientProjectTimezone);
      } catch {}
    });
  } else if (isValidClientIanaTimezone(trimmed)) {
    clientProjectTimezone = trimmed;
  }
}

export function subscribeClientProjectTimezone(cb: (tz: string) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export async function fetchClientProjectTimezone(): Promise<string> {
  try {
    const res = await fetch('/api/settings/timezone');
    if (res.ok) {
      const data = await res.json();
      if (data?.timezone && isValidClientIanaTimezone(data.timezone)) {
        setClientProjectTimezone(data.timezone);
        return data.timezone;
      }
    }
  } catch {}
  return clientProjectTimezone;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const safeTz = isValidClientIanaTimezone(timeZone) ? timeZone : 'UTC';
  let fmt = formatterCache.get(safeTz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(safeTz, fmt);
  }
  return fmt;
}

export function getDatePartsInTimezone(
  date: Date = new Date(),
  timeZone: string = clientProjectTimezone
) {
  const fmt = getFormatter(timeZone);
  const parts = fmt.formatToParts(date);

  let year = 1970;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const p of parts) {
    switch (p.type) {
      case 'year':
        year = parseInt(p.value, 10);
        break;
      case 'month':
        month = parseInt(p.value, 10);
        break;
      case 'day':
        day = parseInt(p.value, 10);
        break;
      case 'hour':
        hour = parseInt(p.value, 10);
        if (hour === 24) hour = 0;
        break;
      case 'minute':
        minute = parseInt(p.value, 10);
        break;
      case 'second':
        second = parseInt(p.value, 10);
        break;
    }
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  const yyyy = String(year).padStart(4, '0');

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    mmdd: `${mm}-${dd}`,
    dateStr: `${yyyy}-${mm}-${dd}`,
    dateTimeLocal: `${yyyy}-${mm}-${dd}T${hh}:${min}`,
  };
}

export function getTimezoneOffsetMinutes(
  timeZone: string = clientProjectTimezone,
  date: Date = new Date()
): number {
  const parts = getDatePartsInTimezone(date, timeZone);
  const asUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const unixSecMs = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtcMs - unixSecMs) / 60000);
}

export function getTimezoneOffsetLabel(
  timeZone: string = clientProjectTimezone,
  date: Date = new Date()
): string {
  const offsetMin = getTimezoneOffsetMinutes(timeZone, date);
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
  const mm = String(absMin % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

export function localPartsToUtcMs(
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    ms?: number;
  },
  timeZone: string = clientProjectTimezone
): number {
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const ms = parts.ms ?? 0;

  const targetWallUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    second,
    ms
  );

  const offset0Ms = getTimezoneOffsetMinutes(timeZone, new Date(targetWallUtcMs)) * 60_000;
  const guess1 = targetWallUtcMs - offset0Ms;

  const offset1Ms = getTimezoneOffsetMinutes(timeZone, new Date(guess1)) * 60_000;
  const guess2 = targetWallUtcMs - offset1Ms;

  if (guess1 === guess2) return guess1;

  const check1 = getDatePartsInTimezone(new Date(guess1), timeZone);
  if (
    check1.year === parts.year &&
    check1.month === parts.month &&
    check1.day === parts.day &&
    check1.hour === hour &&
    check1.minute === minute
  ) {
    return guess1;
  }

  const check2 = getDatePartsInTimezone(new Date(guess2), timeZone);
  if (
    check2.year === parts.year &&
    check2.month === parts.month &&
    check2.day === parts.day &&
    check2.hour === hour &&
    check2.minute === minute
  ) {
    return guess2;
  }

  return Math.max(guess1, guess2);
}

/**
 * Formats a UTC ISO timestamp as `YYYY-MM-DDTHH:mm` in the specified IANA timezone
 * for `<input type="datetime-local" />`.
 */
export function toDatetimeLocalInTimezone(
  iso: string | null | undefined,
  timeZone: string = clientProjectTimezone
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return getDatePartsInTimezone(d, timeZone).dateTimeLocal;
}

/**
 * Converts a `<input type="datetime-local" />` value (`YYYY-MM-DDTHH:mm`) interpreted in `timeZone`
 * into a UTC ISO string (`...Z`).
 */
export function fromDatetimeLocalInTimezone(
  val: string,
  timeZone: string = clientProjectTimezone
): string | null {
  if (!val || !val.trim()) return null;
  const trimmed = val.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const utcMs = localPartsToUtcMs(
      {
        year: parseInt(m[1], 10),
        month: parseInt(m[2], 10),
        day: parseInt(m[3], 10),
        hour: parseInt(m[4], 10),
        minute: parseInt(m[5], 10),
        second: m[6] ? parseInt(m[6], 10) : 0,
        ms: 0,
      },
      timeZone
    );
    return new Date(utcMs).toISOString();
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Checks whether an ISO timestamp falls on the same calendar day as `now` in the project timezone.
 */
export function isSameCalendarDayInTimezone(
  isoA: string | Date | null | undefined,
  isoB: string | Date = new Date(),
  timeZone: string = clientProjectTimezone
): boolean {
  if (!isoA) return false;
  const dA = typeof isoA === 'string' ? new Date(isoA) : isoA;
  const dB = typeof isoB === 'string' ? new Date(isoB) : isoB;
  if (Number.isNaN(dA.getTime()) || Number.isNaN(dB.getTime())) return false;
  return (
    getDatePartsInTimezone(dA, timeZone).dateStr === getDatePartsInTimezone(dB, timeZone).dateStr
  );
}

/**
 * Returns whole calendar days difference (dateA - dateB) in `timeZone`.
 */
export function getCalendarDaysDiffInTimezone(
  dateA: Date,
  dateB: Date,
  timeZone: string = clientProjectTimezone
): number {
  const partsA = getDatePartsInTimezone(dateA, timeZone);
  const partsB = getDatePartsInTimezone(dateB, timeZone);
  const utcMidnightA = Date.UTC(partsA.year, partsA.month - 1, partsA.day);
  const utcMidnightB = Date.UTC(partsB.year, partsB.month - 1, partsB.day);
  return Math.round((utcMidnightA - utcMidnightB) / 86_400_000);
}

/**
 * Formats an ISO timestamp into a human-readable string (`DD.MM.YYYY, HH:mm`) in the project timezone.
 */
export function formatDateTimeInTimezone(
  iso: string | Date | null | undefined,
  timeZone: string = clientProjectTimezone
): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const parts = getDatePartsInTimezone(d, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(parts.day)}.${pad(parts.month)}.${parts.year}, ${pad(parts.hour)}:${pad(parts.minute)}`;
}

