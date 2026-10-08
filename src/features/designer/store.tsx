import { useCallback, useMemo, useReducer, useState, type ReactNode } from "react";
import { DesignerContext, type Designer, type Notice } from "./designer-context";
import { commitAll, recordVersion, type CommitResult, type RecordedVersion } from "./commit";
import { apply, describe, refusal, type Draft, type LogLine, type Operation } from "./model";

/**
 * The state of the designer sandbox: the draft as loaded, the draft as edited, and
 * the history of the operations applied to it, for the change log, for undo and
 * for the commit, which replays them against the collector. Nothing leaves the
 * browser tab until then.
 */
interface State {
  original: Draft;
  draft: Draft;
  history: { before: Draft; operation: Operation; line: LogLine }[];
  /** The version of the compliance history the pending changes restore, if they do. */
  restoredFrom?: string;
}

type Action =
  | { type: "apply"; operation: Operation; author: string }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "committed"; count: number }
  | { type: "restore"; operations: Operation[]; author: string; commit: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "apply": {
      if (refusal(state.draft, action.operation) !== null) return state;
      const line = describe(state.draft, action.operation);
      const { draft } = apply(state.draft, action.operation, {
        author: action.author,
        now: localTimestamp(new Date()),
      });
      return {
        ...state,
        draft,
        history: [...state.history, { before: state.draft, operation: action.operation, line }],
      };
    }
    case "undo": {
      const last = state.history.at(-1);
      if (last === undefined) return state;
      const history = state.history.slice(0, -1);
      // Every change undone, nothing is being restored any more.
      return {
        ...state,
        draft: last.before,
        history,
        restoredFrom: history.length === 0 ? undefined : state.restoredFrom,
      };
    }
    case "reset":
      return { ...state, draft: state.original, history: [], restoredFrom: undefined };
    case "restore": {
      // The plan's operations, applied in turn as they were planned.
      let next: State = state;
      for (const operation of action.operations)
        next = reducer(next, { type: "apply", operation, author: action.author });
      return { ...next, restoredFrom: action.commit };
    }
    case "committed": {
      // The operations saved leave the sandbox: the collector now holds the draft
      // the first one left pending started from. The draft itself is unchanged.
      const pending = state.history.slice(action.count);
      return {
        ...state,
        original: pending[0]?.before ?? state.draft,
        history: pending,
        restoredFrom: pending.length === 0 ? undefined : state.restoredFrom,
      };
    }
  }
}

/** "YYYY-MM-DD HH:MM:SS", as apicollector gives its dates. */
function localTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let noticeId = 0;

export function DesignerProvider({
  original,
  author,
  onCommitted,
  children,
}: {
  original: Draft;
  /** The name stamped on the variables changed in the draft. */
  author: string;
  /**
   * Called once every pending change is saved, with their number and the version
   * of the compliance export recording them: the page reads the collector again.
   */
  onCommitted: (count: number, version: RecordedVersion | undefined) => void;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, { original, draft: original, history: [] });

  const run = useCallback(
    (operation: Operation) => {
      const refused = refusal(state.draft, operation);
      if (refused !== null) return { refused };
      // The id an operation creates is the draft's next one, known before applying it.
      const created =
        operation.op === "create"
          ? { kind: operation.kind, id: state.draft.nextId }
          : operation.op === "clone"
            ? { kind: operation.ref.kind, id: state.draft.nextId }
            : undefined;
      dispatch({ type: "apply", operation, author });
      return { refused: null, created };
    },
    [state.draft, author],
  );

  const [notices, setNotices] = useState<Notice[]>([]);
  const notify = useCallback((notice: Omit<Notice, "id">) => {
    const id = ++noticeId;
    // The last few only: a burst of drops must not pile up messages.
    // Each notice leaves by itself after the time to read it (`Notices`).
    setNotices((previous) => [...previous.slice(-2), { ...notice, id }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setNotices((previous) => previous.filter((n) => n.id !== id));
  }, []);

  const runAndTell = useCallback(
    (operation: Operation) => {
      const line = describe(state.draft, operation);
      const { refused, created } = run(operation);
      if (refused !== null) notify({ key: refused.key, values: refused.values, tone: "refused" });
      else notify({ key: line.key, values: line.values, tone: "done" });
      return created;
    },
    [state.draft, run, notify],
  );

  const commit = useCallback(
    async (
      onProgress: (done: number) => void,
      historyMessage: (saved: LogLine[], total: number) => string,
      baselineMessage: string,
    ): Promise<CommitResult> => {
      // The export as found first: what changed since the last version came from
      // elsewhere (another view, an import), and must not be counted as this
      // commit's. The collector records nothing when nothing changed.
      await recordVersion(baselineMessage, "elsewhere");
      const result = await commitAll(state.history, onProgress);
      if (result.saved === 0) return result;
      // What was saved becomes a version of the compliance export, even when a
      // refusal stopped the commit: the collector holds those changes.
      const saved = state.history.slice(0, result.saved).map((h) => h.line);
      const version = await recordVersion(historyMessage(saved, result.total), "designer");
      dispatch({ type: "committed", count: result.saved });
      if (result.failure === undefined) onCommitted(result.saved, version);
      return { ...result, version };
    },
    [state.history, onCommitted],
  );

  const value = useMemo<Designer>(
    () => ({
      original: state.original,
      draft: state.draft,
      log: state.history.map((h) => h.line),
      run,
      runAndTell,
      describe: (operation: Operation) => describe(state.draft, operation),
      undo: () => {
        if (state.history.length === 0) return;
        const last = state.history.at(-1);
        dispatch({ type: "undo" });
        if (last !== undefined) notify({ key: "designer.undone", inner: last.line, tone: "done" });
      },
      reset: () => {
        dispatch({ type: "reset" });
      },
      commit,
      restoredFrom: state.restoredFrom,
      restore: (commit: string, operations: Operation[]) => {
        dispatch({ type: "restore", operations, author, commit });
      },
      author,
      notices,
      notify,
      dismiss,
    }),
    [state, run, runAndTell, commit, author, notices, notify, dismiss],
  );

  return <DesignerContext.Provider value={value}>{children}</DesignerContext.Provider>;
}
