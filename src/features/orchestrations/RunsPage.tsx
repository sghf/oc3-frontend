import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import { formatDuration } from "@/lib/format";
import { useRuns, type Run } from "./api";
import { elapsed } from "./helpers";
import { RunStatusPill } from "./RunStatusPill";
import { CARD } from "./ui";

/** Where a run stands: the step it is at, out of how many. */
function progress(run: Run): string {
  const done = run.steps.filter((step) => step.status === "succeeded").length;
  return `${String(done)}/${String(run.steps.length)}`;
}

/** The runs of every orchestration, the latest first; a row opens the run. */
export function RunsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const runs = useRuns();
  const open = (id: number) => {
    void navigate({ to: "/orchestrations/runs/$runId", params: { runId: String(id) } });
  };
  return (
    <section>
      <div className="mb-1 text-data text-ink-muted">
        <Link to="/orchestrations" className="hover:underline">
          {t("orchestrations.title")}
        </Link>{" "}
        ›
      </div>
      <h1 className="mb-3 flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="orchestration" className="h-5 w-5" />
        {t("orchestrations.runs.title")}
      </h1>
      {runs.isPending && <p className="text-ink-muted">{t("detail.loading")}</p>}
      {runs.isError && <p className="text-state-down">■ {runs.error.message}</p>}
      {runs.data !== undefined && runs.data.length === 0 && (
        <p className="text-ink-muted">{t("orchestrations.runs.empty")}</p>
      )}
      {runs.data !== undefined && runs.data.length > 0 && (
        <div className={CARD}>
          <table className="w-full border-collapse text-data">
            <caption className="sr-only">{t("orchestrations.runs.title")}</caption>
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="px-3 py-1.5 font-medium">#</th>
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.fields.name")}</th>
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.runs.status")}</th>
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.runs.steps")}</th>
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.runs.started")}</th>
                <th className="px-3 py-1.5 text-right font-medium">
                  {t("orchestrations.runs.duration")}
                </th>
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.runs.message")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((run) => {
                const seconds = elapsed(run.started, run.ended);
                return (
                  <tr
                    key={run.id}
                    tabIndex={0}
                    onClick={() => {
                      open(run.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") open(run.id);
                    }}
                    className="cursor-pointer border-b border-line/60 align-top last:border-b-0 hover:bg-surface-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <td className="px-3 py-1.5 text-ink-muted tabular-nums">{run.id}</td>
                    <td className="px-3 py-1.5 font-medium">{run.name}</td>
                    <td className="px-3 py-1.5">
                      <RunStatusPill status={run.status} />
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">{progress(run)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <DateTime value={run.started} locale={i18n.language} />
                      <div className="text-ink-muted">{run.started_by}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {seconds === undefined ? "—" : formatDuration(seconds, i18n.language)}
                    </td>
                    <td className="px-3 py-1.5 text-ink-muted">{run.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
