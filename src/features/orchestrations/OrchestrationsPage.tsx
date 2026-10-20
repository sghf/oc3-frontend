import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import { useOrchestrations, useRuns, type Run } from "./api";
import { RunStatusPill } from "./RunStatusPill";
import { BUTTON, CARD, PRIMARY } from "./ui";

/**
 * The orchestrations: the plans of agent actions, step after step, that a
 * Manager writes once and runs when needed. Each row opens the editor; the last
 * run of each plan says how it went.
 */
export function OrchestrationsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const list = useOrchestrations();
  const runs = useRuns();
  // The runs come the latest first: the first met is the last one.
  const lastRun = new Map<number, Run>();
  for (const run of runs.data ?? []) {
    if (
      run.orchestration_id !== null &&
      run.orchestration_id !== undefined &&
      !lastRun.has(run.orchestration_id)
    )
      lastRun.set(run.orchestration_id, run);
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="orchestration" className="h-5 w-5" />
          {t("orchestrations.title")}
        </h1>
        {/* Beside the title: the right edge is where the panel anchor floats (`PanelAnchor`). */}
        <Link to="/orchestrations/runs" className={BUTTON}>
          {t("orchestrations.runs.title")}
        </Link>
        <Link
          to="/orchestrations/$orchestrationId"
          params={{ orchestrationId: "new" }}
          className={PRIMARY}
        >
          ＋ {t("orchestrations.new")}
        </Link>
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("orchestrations.intro")}</p>
      {list.isPending && <p className="text-ink-muted">{t("detail.loading")}</p>}
      {list.isError && <p className="text-state-down">■ {list.error.message}</p>}
      {list.data !== undefined && list.data.length === 0 && (
        <p className="text-ink-muted">{t("orchestrations.empty")}</p>
      )}
      {list.data !== undefined && list.data.length > 0 && (
        <div className={CARD}>
          <table className="w-full border-collapse text-data">
            <caption className="sr-only">{t("orchestrations.title")}</caption>
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.fields.name")}</th>
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.fields.steps")}</th>
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.fields.lastRun")}</th>
                <th className="px-3 py-1.5 font-medium">{t("orchestrations.fields.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((o) => {
                const run = lastRun.get(o.id);
                return (
                  <tr
                    key={o.id}
                    tabIndex={0}
                    onClick={(event) => {
                      if (event.target instanceof Element && event.target.closest("a") !== null)
                        return;
                      void navigate({
                        to: "/orchestrations/$orchestrationId",
                        params: { orchestrationId: String(o.id) },
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || event.key !== "Enter") return;
                      void navigate({
                        to: "/orchestrations/$orchestrationId",
                        params: { orchestrationId: String(o.id) },
                      });
                    }}
                    className="cursor-pointer border-b border-line/60 align-top last:border-b-0 hover:bg-surface-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{o.name}</div>
                      {o.description !== "" && (
                        <div className="text-ink-muted">{o.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <ol className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {o.steps.map((step, index) => (
                          <li key={index} className="whitespace-nowrap">
                            <span className="text-ink-muted tabular-nums">{index + 1}.</span>{" "}
                            {step.action}{" "}
                            <span className="text-ink-muted">
                              {t(`orchestrations.kinds.${step.kind}`, { count: 2 })}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {run === undefined ? (
                        <span className="text-ink-muted">{t("orchestrations.neverRun")}</span>
                      ) : (
                        <Link
                          to="/orchestrations/runs/$runId"
                          params={{ runId: String(run.id) }}
                          className="inline-flex items-center gap-2 hover:underline"
                        >
                          <RunStatusPill status={run.status} />
                          <DateTime value={run.started} locale={i18n.language} />
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-ink-muted">
                      <DateTime value={o.updated} locale={i18n.language} />
                      <div>{o.updated_by}</div>
                    </td>
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
