/**
 * The lines of a log as `LogLines` shows them, and the prefixes of a log message, as the agents write them before the text:
 * "instance: dev/svc/oc3: container#feeder: stdout: …". A prefix is a word
 * without blank nor colon, followed by ": ". The rule of the om3 web
 * application (`om3-webapp/src/components/logPrefixes.js`), for both to read
 * the same messages alike.
 */

const PREFIX = /^([^\s:]+): /;

/** The most prefixes split off a message: the text after a longer chain stays text. */
const MAX_PREFIXES = 6;

/** The prefixes of a message, and the text after them. */
export function splitPrefixes(message: string): { prefixes: string[]; text: string } {
  let text = message;
  const prefixes: string[] = [];
  while (prefixes.length < MAX_PREFIXES) {
    const match = PREFIX.exec(text);
    if (match === null) break;
    prefixes.push(match[1] ?? "");
    text = text.slice(match[0].length);
  }
  return { prefixes, text };
}

/**
 * A message cut where one of its lines starts with prefixes: the agent writes the
 * output of a command as one message, each output line with its prefixes again
 * ("instance: dev/svc/oc3: container#feeder: stdout: …"). A line without prefix
 * continues the segment before it.
 */
export function splitSegments(message: string): { prefixes: string[]; text: string }[] {
  const segments: { prefixes: string[]; text: string }[] = [];
  for (const line of message.split("\n")) {
    const segment = splitPrefixes(line);
    const last = segments.at(-1);
    if (last === undefined || segment.prefixes.length > 0) segments.push(segment);
    else last.text += `\n${line}`;
  }
  return segments;
}

/**
 * The output of a command cut into entries: one for each line the agent prefixes,
 * the lines without prefix that follow joined to it, a table or a trace say. An
 * output without any prefix, a v2 agent's or a table, gives a line an entry,
 * `prefixed` false.
 */
export function outputEntries(output: string): { entries: string[]; prefixed: boolean } {
  const lines = output.replace(/\n+$/, "").split("\n");
  const prefixed = lines.map((line) => splitPrefixes(line).prefixes.length > 0);
  if (!prefixed.includes(true)) return { entries: lines, prefixed: false };
  const entries: string[] = [];
  lines.forEach((line, index) => {
    const last = entries.length - 1;
    if (last < 0 || prefixed[index] === true) entries.push(line);
    else entries[last] += `\n${line}`;
  });
  return { entries, prefixed: true };
}

/** The levels of a line, the most severe first. */
export const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** A line of a log, as the views read it from their rows. */
export interface LogLine {
  key: string;
  /** When it was written, as the collector dates it. */
  at: string | undefined;
  level: LogLevel;
  message: string;
  /** What else tells where the line comes from, a resource say: badges before the prefixes. */
  meta?: string[];
}
