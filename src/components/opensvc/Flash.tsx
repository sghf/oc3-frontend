import { useRef, type ComponentProps, type ReactNode } from "react";
import { FlashScopeContext, useFlash } from "./use-flash";

/** A value that flashes when a live update changes it. */
export function FlashValue({
  signature,
  className,
  children,
}: {
  signature: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useFlash<HTMLSpanElement>(signature);
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

/**
 * A table cell that flashes when a live update changes its value. The first cell
 * of a row (`header`) also flashes the whole row when the row appears during a
 * live refresh (`appear`).
 */
export function FlashCell({
  signature,
  header = false,
  appear = false,
  className,
  children,
}: {
  signature: string;
  header?: boolean;
  appear?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useFlash<HTMLTableCellElement>(signature, {
    appear,
    target: (cell) => cell.parentElement,
  });
  return header ? (
    <th ref={ref} scope="row" className={className}>
      {children}
    </th>
  ) : (
    <td ref={ref} className={className}>
      {children}
    </td>
  );
}

/** A table row that flashes when a live update changes it, or brings it. */
export function FlashRow({
  signature,
  appear,
  children,
  ...props
}: {
  signature: string;
  appear: boolean;
  children: ReactNode;
} & Omit<ComponentProps<"tr">, "ref" | "children">) {
  const ref = useFlash<HTMLTableRowElement>(signature, { appear });
  return (
    <tr ref={ref} {...props}>
      {children}
    </tr>
  );
}

/**
 * Tells the flashing elements inside what they are showing: `subject` names it —
 * the page, sort and filters of a list, the record of a panel. When it changes,
 * the data that follows belongs to the new subject and does not flash; only a
 * later live update does.
 */
export function FlashScope({ subject, children }: { subject: string; children: ReactNode }) {
  const since = useRef(0);
  const shown = useRef<string | null>(null);
  if (shown.current !== subject) {
    shown.current = subject;
    since.current = Date.now();
  }
  return <FlashScopeContext.Provider value={since}>{children}</FlashScopeContext.Provider>;
}
