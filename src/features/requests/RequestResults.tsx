import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/** A log line of an output: its level (0 info, 1 error), its format and its values. */
interface LogLine {
  error: boolean;
  text: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Fills the "%(key)s" placeholders of a collector message. */
function format(fmt: string, dict: unknown): string {
  if (!isRecord(dict)) return fmt;
  return fmt.replace(/%\((\w+)\)[sd]/g, (whole, key: string) => {
    const v = dict[key];
    return typeof v === "string" || typeof v === "number" || typeof v === "boolean"
      ? String(v)
      : whole;
  });
}

interface Results {
  status: string;
  returncode: number;
  outputs: { id: string; lines: LogLine[] }[];
}

/** Reads the results structure of a submission, as the collector stores it. */
function parseResults(raw: unknown): Results {
  const r = isRecord(raw) ? raw : {};
  const log = isRecord(r.log) ? r.log : {};
  const order = Array.isArray(r.outputs_order) ? r.outputs_order.map(String) : Object.keys(log);
  // Lines logged before the outputs run, under an empty id, come first.
  const ids = "" in log && !order.includes("") ? ["", ...order] : order;
  return {
    status: typeof r.status === "string" ? r.status : "",
    returncode: typeof r.returncode === "number" ? r.returncode : 0,
    outputs: ids.map((id) => ({
      id,
      lines: (Array.isArray(log[id]) ? log[id] : []).map((entry: unknown) => {
        const [ret, fmt, dict] = Array.isArray(entry) ? entry : [];
        return { error: ret === 1, text: format(typeof fmt === "string" ? fmt : "", dict) };
      }),
    })),
  };
}

/**
 * The progress and outcome of a request: the results structure of its
 * submission, read again while its outputs run, as they log what they do.
 * `initial`, the structure a submission answered with, spares the first read.
 * `title` replaces the default heading, which names the results by their id.
 */
export function RequestResults({
  resultsId,
  initial,
  title,
}: {
  resultsId: number;
  initial?: unknown;
  title?: string;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["form-output-results", resultsId],
    initialData: initial,
    refetchInterval: (q) => (parseResults(q.state.data).status === "COMPLETED" ? false : 2000),
    queryFn: async () => {
      const { data, error } = await api.GET("/form_output_results/{results_id}", {
        params: { path: { results_id: resultsId } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data as unknown;
    },
  });
  const results = parseResults(query.data);
  const done = results.status === "COMPLETED";
  const failed = done && results.returncode !== 0;

  return (
    <section className="mt-4 rounded-(--radius-panel) border border-line bg-surface-raised p-3">
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-ink">
        {title ?? t("requests.results.title", { id: resultsId })}
        <span
          role="status"
          className={`font-normal ${failed ? "text-state-down" : done ? "text-state-up" : "text-state-warn"}`}
        >
          {failed ? "■ " : done ? "● " : "▲ "}
          {failed
            ? t("requests.results.failed", { code: results.returncode })
            : done
              ? t("requests.results.succeeded")
              : t("requests.results.running", { status: results.status })}
        </span>
      </h2>
      {query.isError && <p className="mb-2 text-state-down">■ {query.error.message}</p>}
      {results.outputs.map((output) => (
        <div key={output.id} className="mb-2">
          {output.id !== "" && <h3 className="font-medium text-ink-muted">{output.id}</h3>}
          {output.lines.length === 0 ? (
            <p className="text-ink-muted">{t("requests.results.noLog")}</p>
          ) : (
            <ul className="font-mono text-data">
              {output.lines.map((line, i) => (
                <li
                  key={i}
                  className={`whitespace-pre-wrap ${line.error ? "text-state-down" : "text-ink"}`}
                >
                  {line.error ? "■ " : "· "}
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
