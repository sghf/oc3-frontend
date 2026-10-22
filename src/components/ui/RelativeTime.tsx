import { DateStamp } from "@/components/ui/DateTime";
import { formatDateTime, formatRelativeTime, parseCollectorDate } from "@/lib/format";

/**
 * Timestamp as a distance from now, the exact instant staying readable as a tooltip.
 *
 * In a list, "3 minutes ago" compares at a glance where a full date asks for a mental
 * subtraction; the full date stays available on hover, and in `dateTime` for the
 * tools that read the page.
 */
export function RelativeTime({ value, locale }: { value: string | undefined; locale: string }) {
  const parsed = parseCollectorDate(value);
  const exact = formatDateTime(value);
  // Empty or unreadable value: nothing to place in time, so the raw text is rendered.
  if (parsed === null) return exact;
  return (
    <DateStamp date={parsed} title={exact}>
      {formatRelativeTime(value, locale)}
    </DateStamp>
  );
}
