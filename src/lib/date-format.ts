import i18n from "i18next";

/**
 * How dates and times read, apart from the language of the interface: by default
 * the browser's regional settings ("system"), or a convention chosen by the user,
 * with a 12- or 24-hour clock or the convention's own. As the language, the
 * choice follows the account (`dateFormat`, `hourCycle` of the user preferences,
 * absent for the defaults) and is cached locally, so that a page shows its dates
 * right before the preferences are read.
 *
 * Every date of the interface is formatted through `dateTimeFormat`: a format
 * never takes the language of the interface for its locale. Words around the
 * dates ("5 minutes ago") stay in that language.
 */
export const DATE_FORMATS = ["system", "en-US", "en-GB", "fr-FR", "de-DE", "iso"] as const;
export type DateFormatChoice = (typeof DATE_FORMATS)[number];

export const HOUR_CYCLES = ["auto", "h23", "h12"] as const;
export type HourCycleChoice = (typeof HOUR_CYCLES)[number];

export interface DateFormatPrefs {
  format: DateFormatChoice;
  hourCycle: HourCycleChoice;
}

export const DEFAULT_DATE_FORMAT: DateFormatPrefs = { format: "system", hourCycle: "auto" };

const STORAGE_KEY = "oc3.date-format";

export function isDateFormatChoice(value: unknown): value is DateFormatChoice {
  return typeof value === "string" && DATE_FORMATS.includes(value as DateFormatChoice);
}

export function isHourCycleChoice(value: unknown): value is HourCycleChoice {
  return typeof value === "string" && HOUR_CYCLES.includes(value as HourCycleChoice);
}

/**
 * The locale a choice formats dates in; undefined lets the browser use its own
 * regional settings. ISO 8601 is read in Swedish, whose numeric dates and times
 * are exactly ISO's ("2026-03-09 15:04"), with a 24-hour clock; where words show
 * (a month by name) or the user asks for a 12-hour clock, in Canadian English,
 * whose numeric dates are year-month-day too.
 */
function localeOf(
  format: DateFormatChoice,
  options: Intl.DateTimeFormatOptions = {},
  hourCycle?: string,
): string | undefined {
  if (format === "system") return undefined;
  if (format !== "iso") return format;
  const words =
    (options.dateStyle !== undefined && options.dateStyle !== "short") ||
    (options.month !== undefined && options.month !== "numeric" && options.month !== "2-digit") ||
    options.weekday !== undefined;
  return words || hourCycle === "h12" ? "en-CA" : "sv-SE";
}

/** The clock a choice gives the times: its own, 24 hours for ISO 8601, or the convention's. */
function hourCycleOf(prefs: DateFormatPrefs): "h23" | "h12" | undefined {
  if (prefs.hourCycle !== "auto") return prefs.hourCycle;
  return prefs.format === "iso" ? "h23" : undefined;
}

let current: DateFormatPrefs = cachedDateFormat();
const cache = new Map<string, Intl.DateTimeFormat>();

/** Choice cached locally, the defaults as long as nothing has been chosen. */
export function cachedDateFormat(): DateFormatPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return DEFAULT_DATE_FORMAT;
    const { format, hourCycle } = raw as Record<string, unknown>;
    return {
      format: isDateFormatChoice(format) ? format : "system",
      hourCycle: isHourCycleChoice(hourCycle) ? hourCycle : "auto",
    };
  } catch {
    // Private browsing or storage refused: the browser's settings will do.
    return DEFAULT_DATE_FORMAT;
  }
}

/**
 * Formats the dates after `prefs`, and caches the choice. What is on display is
 * rendered again: the components reading the language follow its changes, and
 * that event is the one they listen to.
 */
export function applyDateFormat(prefs: DateFormatPrefs): void {
  const changed = prefs.format !== current.format || prefs.hourCycle !== current.hourCycle;
  current = prefs;
  cache.clear();
  try {
    if (prefs.format === "system" && prefs.hourCycle === "auto")
      localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Without the cache the format stays right: it is applied again on the next load.
  }
  if (changed) i18n.emit("languageChanged", i18n.language);
}

/**
 * A date and time format after the user's choice: the options say what to show,
 * the choice how it reads. Formats are kept, a list formatting a date per cell.
 */
export function dateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  const known = cache.get(key);
  if (known !== undefined) return known;
  const withTime =
    options.timeStyle !== undefined || options.hour !== undefined || options.minute !== undefined;
  const hourCycle = hourCycleOf(current);
  const format = new Intl.DateTimeFormat(localeOf(current.format, options, hourCycle), {
    ...options,
    ...(withTime && hourCycle !== undefined ? { hourCycle } : {}),
  });
  cache.set(key, format);
  return format;
}

/** The current choice, for the profile page. */
export function currentDateFormat(): DateFormatPrefs {
  return current;
}

/**
 * A moment as `prefs` would show it, for the choices of the profile page: the 9th
 * of March, so that the day and the month cannot be mistaken one for the other,
 * in the afternoon, so that the clock shows.
 */
export function formatExample(prefs: DateFormatPrefs): string {
  const hourCycle = hourCycleOf(prefs);
  const options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };
  return new Intl.DateTimeFormat(localeOf(prefs.format, options, hourCycle), {
    ...options,
    ...(hourCycle === undefined ? {} : { hourCycle }),
  }).format(new Date(2026, 2, 9, 15, 4, 5));
}
