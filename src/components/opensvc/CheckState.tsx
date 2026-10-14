import { useTranslation } from "react-i18next";
import { CHECK_STATE_KEY } from "./check-state";

/**
 * Where a check stands against its thresholds, `chk_err`: within them, under the
 * low one, over the high one; nothing for a check without thresholds. Out of
 * bounds is said with a glyph and a word, not by its colour alone.
 */
export function CheckState({ err }: { err: number | null | undefined }) {
  const { t } = useTranslation();
  if (err === 1) return <span className="text-state-down">▼ {t(CHECK_STATE_KEY[1] ?? "")}</span>;
  if (err === 2) return <span className="text-state-down">▲ {t(CHECK_STATE_KEY[2] ?? "")}</span>;
  if (err === 0) return <span className="text-state-up">● {t(CHECK_STATE_KEY[0] ?? "")}</span>;
  return null;
}

/** The thresholds of a check, an open bound shown as infinite, and their source. */
export function CheckThresholds({
  low,
  high,
  provider,
}: {
  low: number | null | undefined;
  high: number | null | undefined;
  provider?: string;
}) {
  const { t } = useTranslation();
  if ((low ?? null) === null && (high ?? null) === null)
    return <span className="text-ink-muted">{t("nodes.checks.noThresholds")}</span>;
  return (
    <>
      <span className="tabular-nums">
        {low ?? "−∞"} – {high ?? "+∞"}
      </span>
      {provider !== undefined && provider !== "" && (
        <>
          {" "}
          <span className="text-ink-muted">{provider}</span>
        </>
      )}
    </>
  );
}
