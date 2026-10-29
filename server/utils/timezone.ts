import { getDatabase } from '../db/database';

export const DEFAULT_NEW_INSTALL_TIMEZONE = 'UTC';
export const LEGACY_MIGRATION_TIMEZONE = 'Europe/Moscow';

// In-memory cached project timezone (loaded from DB at startup and updated on admin change)
let cachedProjectTimezone: string = LEGACY_MIGRATION_TIMEZONE;
let isTimezoneLoadedFromDb = false;

export interface TimezoneDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
  mmdd: string; // MM-DD
  dateStr: string; // YYYY-MM-DD
  dateTimeLocal: string; // YYYY-MM-DDTHH:mm
}

export interface TimezoneOptionInfo {
  id: string;
  label: string;
  offsetLabel: string;
  offsetMinutes: number;
  currentLocalTime: string;
}

const CURATED_TIMEZONE_LABELS: Record<string, string> = {
  UTC: 'Всемирное координированное время (UTC)',
  'Europe/Kyiv': 'Киев (Europe/Kyiv)',
  'Europe/Warsaw': 'Варшава (Europe/Warsaw)',
  'Europe/Berlin': 'Берлин / Центральная Европа (Europe/Berlin)',
  'Europe/London': 'Лондон (Europe/London)',
  'Europe/Paris': 'Париж (Europe/Paris)',
  'Europe/Madrid': 'Мадрид (Europe/Madrid)',
  'Europe/Rome': 'Рим (Europe/Rome)',
  'Europe/Prague': 'Прага (Europe/Prague)',
  'Europe/Vienna': 'Вена (Europe/Vienna)',
  'Europe/Stockholm': 'Стокгольм (Europe/Stockholm)',
  'Europe/Athens': 'Афины (Europe/Athens)',
  'Europe/Bucharest': 'Бухарест (Europe/Bucharest)',
  'Europe/Helsinki': 'Хельсинки (Europe/Helsinki)',
  'Europe/Riga': 'Рига (Europe/Riga)',
  'Europe/Tallinn': 'Таллин (Europe/Tallinn)',
  'Europe/Vilnius': 'Вильнюс (Europe/Vilnius)',
  'Europe/Chisinau': 'Кишинёв (Europe/Chisinau)',
  'Europe/Minsk': 'Минск (Europe/Minsk)',
  'Europe/Istanbul': 'Стамбул (Europe/Istanbul)',
  'Europe/Moscow': 'Москва (Europe/Moscow)',
  'Europe/Kaliningrad': 'Калининград (Europe/Kaliningrad)',
  'Europe/Samara': 'Самара (Europe/Samara)',
  'Asia/Yekaterinburg': 'Екатеринбург (Asia/Yekaterinburg)',
  'Asia/Omsk': 'Омск (Asia/Omsk)',
  'Asia/Novosibirsk': 'Новосибирск (Asia/Novosibirsk)',
  'Asia/Krasnoyarsk': 'Красноярск (Asia/Krasnoyarsk)',
  'Asia/Irkutsk': 'Иркутск (Asia/Irkutsk)',
  'Asia/Yakutsk': 'Якутск (Asia/Yakutsk)',
  'Asia/Vladivostok': 'Владивосток (Asia/Vladivostok)',
  'Asia/Kamchatka': 'Камчатка (Asia/Kamchatka)',
  'Asia/Tbilisi': 'Тбилиси (Asia/Tbilisi)',
  'Asia/Yerevan': 'Ереван (Asia/Yerevan)',
  'Asia/Baku': 'Баку (Asia/Baku)',
  'Asia/Almaty': 'Алматы / Астана (Asia/Almaty)',
  'Asia/Tashkent': 'Ташкент (Asia/Tashkent)',
  'Asia/Bishkek': 'Бишкек (Asia/Bishkek)',
  'Asia/Dushanbe': 'Душанбе (Asia/Dushanbe)',
  'Asia/Dubai': 'Дубай (Asia/Dubai)',
  'Asia/Jerusalem': 'Иерусалим / Тель-Авив (Asia/Jerusalem)',
  'Asia/Bangkok': 'Бангкок (Asia/Bangkok)',
  'Asia/Singapore': 'Сингапур (Asia/Singapore)',
  'Asia/Shanghai': 'Шанхай / Пекин (Asia/Shanghai)',
  'Asia/Seoul': 'Сеул (Asia/Seoul)',
  'Asia/Tokyo': 'Токио (Asia/Tokyo)',
  'Asia/Kolkata': 'Дели / Мумбаи (Asia/Kolkata)',
  'America/New_York': 'Нью-Йорк / Восточное время США (America/New_York)',
  'America/Chicago': 'Чикаго / Центральное время США (America/Chicago)',
  'America/Denver': 'Денвер / Горное время США (America/Denver)',
  'America/Los_Angeles': 'Лос-Анджелес / Тихоокеанское время США (America/Los_Angeles)',
  'America/Toronto': 'Торонто (America/Toronto)',
  'America/Vancouver': 'Ванкувер (America/Vancouver)',
  'America/Sao_Paulo': 'Сан-Паулу (America/Sao_Paulo)',
  'America/Buenos_Aires': 'Буэнос-Айрес (America/Buenos_Aires)',
  'America/Mexico_City': 'Мехико (America/Mexico_City)',
  'Australia/Sydney': 'Сидней (Australia/Sydney)',
  'Pacific/Auckland': 'Окленд (Pacific/Auckland)',
};

/**
 * Validates whether a string is a valid IANA timezone identifier supported by Intl.
 */
export function isValidIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string') return false;
  const trimmed = tz.trim();
  if (!trimmed || trimmed.length > 100) return false;
  // Disallow raw numeric offsets like "+03:00" or "GMT+3" if not standard IANA, allow "UTC" or Area/Location
  if (/^[+-]\d/.test(trimmed)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes an IANA timezone identifier (keeping standard IANA names intact).
 */
export function normalizeIanaTimezone(tz: string): string {
  const trimmed = String(tz || '').trim();
  if (trimmed.toUpperCase() === 'UTC' || trimmed === 'Etc/UTC' || trimmed === 'GMT') {
    return 'UTC';
  }
  if (trimmed === 'Europe/Kiev') {
    return isValidIanaTimezone('Europe/Kyiv') ? 'Europe/Kyiv' : 'Europe/Kiev';
  }
  return trimmed;
}

// Cache of Intl.DateTimeFormat instances per timezone for high performance
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const safeTz = isValidIanaTimezone(timeZone) ? timeZone : 'UTC';
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

/**
 * Extracts calendar date and wall-clock time components of a Date in the specified IANA timezone.
 * Automatically accounts for historical and current DST rules.
 */
export function getDatePartsInTimezone(
  dateInput: Date | number | string = new Date(),
  timeZone: string = cachedProjectTimezone
): TimezoneDateParts {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
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

/**
 * Computes the UTC offset in minutes for the given IANA timezone at a specific instant.
 * E.g., Europe/Moscow -> +180, America/New_York -> -240 (EDT) or -300 (EST).
 */
export function getTimezoneOffsetMinutes(
  timeZone: string = cachedProjectTimezone,
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
  // Truncate milliseconds of `date` for exact second-level comparison
  const unixSecMs = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtcMs - unixSecMs) / 60000);
}

/**
 * Formats a timezone's current offset as "UTC+03:00", "UTC-04:00", "UTC+00:00", etc.
 */
export function getTimezoneOffsetLabel(
  timeZone: string = cachedProjectTimezone,
  date: Date = new Date()
): string {
  const offsetMin = getTimezoneOffsetMinutes(timeZone, date);
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
  const mm = String(absMin % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/**
 * Deterministically converts wall-clock local date/time components in `timeZone` to a UTC timestamp (ms).
 * Safely handles DST transitions:
 * - Spring-forward non-existent local times resolve forward to the valid post-transition instant.
 * - Fall-back ambiguous local times resolve deterministically to the first occurrence.
 */
export function localPartsToUtcMs(
  parts: {
    year: number;
    month: number; // 1..12
    day: number; // 1..31
    hour?: number;
    minute?: number;
    second?: number;
    ms?: number;
  },
  timeZone: string = cachedProjectTimezone
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

  // First approximation using offset at targetWallUtcMs
  const offset0Ms = getTimezoneOffsetMinutes(timeZone, new Date(targetWallUtcMs)) * 60_000;
  const guess1 = targetWallUtcMs - offset0Ms;

  // Second approximation using offset at guess1
  const offset1Ms = getTimezoneOffsetMinutes(timeZone, new Date(guess1)) * 60_000;
  const guess2 = targetWallUtcMs - offset1Ms;

  if (guess1 === guess2) {
    return guess1;
  }

  // Check if guess1 actually produces the requested wall-clock time (fall-back overlap case)
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

  // Check if guess2 produces the requested wall-clock time
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

  // Spring-forward gap (non-existent local time): advance to the post-transition valid time
  return Math.max(guess1, guess2);
}

/**
 * Parses a local date-time string ("YYYY-MM-DDTHH:mm" or "YYYY-MM-DD") in `timeZone`
 * and returns a UTC ISO string. If the input already has an explicit Z or +/-HH:mm offset,
 * preserves the exact UTC instant.
 */
export function parseDateTimeInTimezoneToUtcIso(
  input: string | null | undefined,
  timeZone: string = cachedProjectTimezone
): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // If already an explicit ISO string with Z or timezone offset (+HH:MM / -HH:MM), parse directly
  if (/Z$/i.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed) || /[+-]\d{4}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Match "YYYY-MM-DDTHH:mm(:ss(.sss))" or "YYYY-MM-DD HH:mm(:ss)"
  const dtMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
  );
  if (dtMatch) {
    const year = parseInt(dtMatch[1], 10);
    const month = parseInt(dtMatch[2], 10);
    const day = parseInt(dtMatch[3], 10);
    const hour = parseInt(dtMatch[4], 10);
    const minute = parseInt(dtMatch[5], 10);
    const second = dtMatch[6] ? parseInt(dtMatch[6], 10) : 0;
    const ms = dtMatch[7] ? parseInt(dtMatch[7].padEnd(3, '0'), 10) : 0;
    const utcMs = localPartsToUtcMs({ year, month, day, hour, minute, second, ms }, timeZone);
    return new Date(utcMs).toISOString();
  }

  // Match date-only "YYYY-MM-DD"
  const dMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dMatch) {
    const year = parseInt(dMatch[1], 10);
    const month = parseInt(dMatch[2], 10);
    const day = parseInt(dMatch[3], 10);
    const utcMs = localPartsToUtcMs({ year, month, day, hour: 0, minute: 0, second: 0, ms: 0 }, timeZone);
    return new Date(utcMs).toISOString();
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

/**
 * Returns the UTC timestamp (ms) of the start of the calendar day (00:00:00.000) in `timeZone`.
 * Accepts a Date object or a "YYYY-MM-DD" string.
 */
export function getStartOfDayUtcMs(
  dateOrDateStr: Date | string,
  timeZone: string = cachedProjectTimezone
): number {
  if (typeof dateOrDateStr === 'string') {
    const m = dateOrDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      return localPartsToUtcMs(
        {
          year: parseInt(m[1], 10),
          month: parseInt(m[2], 10),
          day: parseInt(m[3], 10),
          hour: 0,
          minute: 0,
          second: 0,
          ms: 0,
        },
        timeZone
      );
    }
    const parsed = new Date(dateOrDateStr);
    if (!Number.isNaN(parsed.getTime())) {
      const p = getDatePartsInTimezone(parsed, timeZone);
      return localPartsToUtcMs(
        { year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0, ms: 0 },
        timeZone
      );
    }
    return NaN;
  }

  const p = getDatePartsInTimezone(dateOrDateStr, timeZone);
  return localPartsToUtcMs(
    { year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0, ms: 0 },
    timeZone
  );
}

/**
 * Returns the UTC timestamp (ms) of the end of the calendar day (23:59:59.999) in `timeZone`.
 * Accepts a Date object or a "YYYY-MM-DD" string.
 */
export function getEndOfDayUtcMs(
  dateOrDateStr: Date | string,
  timeZone: string = cachedProjectTimezone
): number {
  if (typeof dateOrDateStr === 'string') {
    const m = dateOrDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      return localPartsToUtcMs(
        {
          year: parseInt(m[1], 10),
          month: parseInt(m[2], 10),
          day: parseInt(m[3], 10),
          hour: 23,
          minute: 59,
          second: 59,
          ms: 999,
        },
        timeZone
      );
    }
    const parsed = new Date(dateOrDateStr);
    if (!Number.isNaN(parsed.getTime())) {
      const p = getDatePartsInTimezone(parsed, timeZone);
      return localPartsToUtcMs(
        { year: p.year, month: p.month, day: p.day, hour: 23, minute: 59, second: 59, ms: 999 },
        timeZone
      );
    }
    return NaN;
  }

  const p = getDatePartsInTimezone(dateOrDateStr, timeZone);
  return localPartsToUtcMs(
    { year: p.year, month: p.month, day: p.day, hour: 23, minute: 59, second: 59, ms: 999 },
    timeZone
  );
}

/**
 * Returns the UTC timestamp (ms) of the next calendar midnight (start of tomorrow) in `timeZone`.
 */
export function getNextMidnightUtcMs(
  nowInput: Date | number | string = new Date(),
  timeZone: string = cachedProjectTimezone
): number {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const p = getDatePartsInTimezone(now, timeZone);
  const nextCalDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return localPartsToUtcMs(
    {
      year: nextCalDay.getUTCFullYear(),
      month: nextCalDay.getUTCMonth() + 1,
      day: nextCalDay.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      ms: 0,
    },
    timeZone
  );
}

/**
 * Returns the calendar day difference (dateA - dateB) in whole calendar days in `timeZone`.
 * E.g. if dateA is 2026-05-10 and dateB is 2026-05-09 in `timeZone`, returns 1.
 */
export function getCalendarDaysDiffInTimezone(
  dateA: Date | number | string,
  dateB: Date | number | string,
  timeZone: string = cachedProjectTimezone
): number {
  const partsA = getDatePartsInTimezone(dateA, timeZone);
  const partsB = getDatePartsInTimezone(dateB, timeZone);
  const utcMidnightA = Date.UTC(partsA.year, partsA.month - 1, partsA.day);
  const utcMidnightB = Date.UTC(partsB.year, partsB.month - 1, partsB.day);
  return Math.round((utcMidnightA - utcMidnightB) / 86_400_000);
}

/**
 * Returns the synchronously cached project timezone.
 */
export function getProjectTimezoneSync(): string {
  return cachedProjectTimezone;
}

/**
 * Sets the in-memory cached project timezone (used during DB seed/initialization and updates).
 */
export function setCachedProjectTimezone(tz: string): void {
  const normalized = normalizeIanaTimezone(tz);
  if (isValidIanaTimezone(normalized)) {
    cachedProjectTimezone = normalized;
    isTimezoneLoadedFromDb = true;
  }
}

/**
 * Loads the project timezone from the `project_settings` table in the database.
 */
export async function getProjectTimezone(): Promise<string> {
  if (isTimezoneLoadedFromDb) {
    return cachedProjectTimezone;
  }
  try {
    const db = getDatabase();
    const res = await db.execute({
      sql: `SELECT value FROM project_settings WHERE key = 'project_timezone' LIMIT 1`,
      args: [],
    });
    if (res.rows.length > 0 && res.rows[0].value) {
      const val = normalizeIanaTimezone(String(res.rows[0].value));
      if (isValidIanaTimezone(val)) {
        cachedProjectTimezone = val;
        isTimezoneLoadedFromDb = true;
        return cachedProjectTimezone;
      }
    }
  } catch (err) {
    console.warn('[Timezone] Failed to read project_timezone from DB, using cached value:', err);
  }
  return cachedProjectTimezone;
}

/**
 * Retrieves full metadata for the project timezone setting from DB.
 */
export async function getProjectTimezoneConfig(): Promise<{
  timezone: string;
  offsetLabel: string;
  offsetMinutes: number;
  currentLocalDate: string;
  currentLocalTime: string;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  const tz = await getProjectTimezone();
  let updatedAt: string | null = null;
  let updatedBy: string | null = null;

  try {
    const db = getDatabase();
    const res = await db.execute({
      sql: `SELECT value, updated_at, updated_by FROM project_settings WHERE key = 'project_timezone' LIMIT 1`,
      args: [],
    });
    if (res.rows.length > 0) {
      updatedAt = res.rows[0].updated_at ? String(res.rows[0].updated_at) : null;
      updatedBy = res.rows[0].updated_by ? String(res.rows[0].updated_by) : null;
    }
  } catch {}

  const now = new Date();
  const parts = getDatePartsInTimezone(now, tz);
  return {
    timezone: tz,
    offsetLabel: getTimezoneOffsetLabel(tz, now),
    offsetMinutes: getTimezoneOffsetMinutes(tz, now),
    currentLocalDate: parts.dateStr,
    currentLocalTime: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`,
    updatedAt,
    updatedBy,
  };
}

/**
 * Validates and persists a new project timezone in `project_settings`.
 */
export async function updateProjectTimezone(
  newTimezone: string,
  adminIdentifier: string
): Promise<{
  previousTimezone: string;
  timezone: string;
  offsetLabel: string;
  updatedAt: string;
  updatedBy: string;
}> {
  const normalized = normalizeIanaTimezone(newTimezone);
  if (!isValidIanaTimezone(normalized)) {
    throw new Error(`Некорректный идентификатор часового пояса IANA: «${newTimezone}»`);
  }

  const previousTimezone = await getProjectTimezone();
  const nowIso = new Date().toISOString();
  const db = getDatabase();

  await db.execute({
    sql: `
      INSERT INTO project_settings (key, value, updated_at, updated_by)
      VALUES ('project_timezone', ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `,
    args: [normalized, nowIso, adminIdentifier],
  });

  cachedProjectTimezone = normalized;
  isTimezoneLoadedFromDb = true;

  return {
    previousTimezone,
    timezone: normalized,
    offsetLabel: getTimezoneOffsetLabel(normalized, new Date()),
    updatedAt: nowIso,
    updatedBy: adminIdentifier,
  };
}

/**
 * Returns the list of available IANA timezones with user-friendly names and live UTC offsets.
 */
export function getAvailableTimezonesList(now: Date = new Date()): TimezoneOptionInfo[] {
  const priorityIds = Object.keys(CURATED_TIMEZONE_LABELS);
  let allSupported: string[] = [];
  try {
    if (typeof Intl !== 'undefined' && typeof (Intl as any).supportedValuesOf === 'function') {
      allSupported = (Intl as any).supportedValuesOf('timeZone') as string[];
    }
  } catch {}

  const combinedSet = new Set<string>(['UTC', ...priorityIds, ...allSupported]);
  const result: TimezoneOptionInfo[] = [];

  for (const id of combinedSet) {
    if (!isValidIanaTimezone(id)) continue;
    const offsetMinutes = getTimezoneOffsetMinutes(id, now);
    const offsetLabel = getTimezoneOffsetLabel(id, now);
    const parts = getDatePartsInTimezone(now, id);
    const friendly = CURATED_TIMEZONE_LABELS[id] || id;
    result.push({
      id,
      label: `${friendly} (${offsetLabel})`,
      offsetLabel,
      offsetMinutes,
      currentLocalTime: `${parts.dateStr} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
    });
  }

  // Sort: priority curated ones first (in order), then others sorted by offset and ID
  const priorityIndex = new Map<string, number>();
  priorityIds.forEach((id, idx) => priorityIndex.set(id, idx));

  result.sort((a, b) => {
    const pA = priorityIndex.has(a.id) ? priorityIndex.get(a.id)! : 9999;
    const pB = priorityIndex.has(b.id) ? priorityIndex.get(b.id)! : 9999;
    if (pA !== pB) return pA - pB;
    if (a.offsetMinutes !== b.offsetMinutes) return a.offsetMinutes - b.offsetMinutes;
    return a.id.localeCompare(b.id);
  });

  return result;
}
