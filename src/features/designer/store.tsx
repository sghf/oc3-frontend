import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { DesignerContext, type Designer, type Notice, type Resumed } from "./designer-context";
import { commitAll, type CommitResult, type RecordedVersion } from "./commit";
import { apply, describe, refusal, type Draft, type LogLine, type Operation } from "./model";
import {
  isSavedDraft,
  readSavedDraft,
  watchSavedDraft,
  writeSavedDraft,
  type SavedDraft,
} from "./saved-draft";

/**
 * The state of the designer sandbox: the draft as loaded, the draft as edited, and
 * the history of the operations applied to it, for the change log, for undo and
 * for the commit, which replays them against the collector. Nothing reaches the
 * collector until then; the operations are kept in the browser meanwhile
 * (`saved-draft.ts`), and replayed when the designer opens again.
 */
interface State {
  original: Draft;
  draft: Draft;
  history: {
    before: Draft;
    operation: Operation;
    line: LogLine;
    /** When it was made and by whom, stamped again when it is replayed. */
    at: string;
    author: string;
  }[];
  /** The version of the compliance history the pending changes restore, if they do. */
  restoredFrom?: string;
  /** The changes found kept in the browser when the sandbox started, until dismissed. */
  resumed?: Resumed;
}

type Action =
  | { type: "apply"; operation: Operation; author: string; at: string }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "committed" }
  | { type: "restore"; operations: Operation[]; author: string; at: string; commit: string }
  | { type: "dismissResumed" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "apply": {
      if (refusal(state.draft, action.operation) !== null) return state;
      const line = describe(state.draft, action.operation);
      const { draft } = apply(state.draft, action.operation, {
        author: action.author,
        now: action.at,
      });
      const entry = {
        before: state.draft,
        operation: action.operation,
        line,
        at: action.at,
        author: action.author,
      };
      return { ...state, draft, history: [...state.history, entry] };
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
      return {
        ...state,
        draft: state.original,
        history: [],
        restoredFrom: undefined,
        resumed: undefined,
      };
    case "restore": {
      // The plan's operations, applied in turn as they were planned.
      let next: State = state;
      for (const operation of action.operations)
        next = reducer(next, { type: "apply", operation, author: action.author, at: action.at });
      return { ...next, restoredFrom: action.commit };
    }
    case "committed":
      // All the operations saved leave the sandbox: the collector now holds the
      // draft. The draft itself is unchanged.
      return {
        ...state,
        original: state.draft,
        history: [],
        restoredFrom: undefined,
        resumed: undefined,
      };
    case "dismissResumed":
      return { ...state, resumed: undefined };
  }
}

/**
 * The sandbox on the collector's data, with the changes kept in the browser
 * applied again in turn; those the data no longer allows, because it changed
 * meanwhile, are left out and reported.
 */
function resume(original: Draft, saved: SavedDraft | null): State {
  let state: State = { original, draft: original, history: [] };
  if (saved === null || saved.entries.length === 0) return state;
  const dropped: LogLine[] = [];
  for (const { operation, author, at } of saved.entries) {
    let line: LogLine = { key: "designer.resume.unknown", values: {} };
    try {
      line = describe(state.draft, operation);
      const next = reducer(state, { type: "apply", operation, author, at });
      if (next === state) dropped.push(line);
      else state = next;
    } catch {
      // An operation the model cannot read any more, kept by an older version.
      dropped.push(line);
    }
  }
  return {
    ...state,
    restoredFrom: state.history.length > 0 ? saved.restoredFrom : undefined,
    resumed: { count: state.history.length, at: saved.entries.at(-1)?.at ?? "", dropped },
  };
}

function toSaved(state: State): SavedDraft {
  return {
    entries: state.history.map(({ operation, at, author }) => ({ operation, at, author })),
    restoredFrom: state.restoredFrom,
  };
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
  user,
  onCommitted,
  onReload,
  children,
}: {
  original: Draft;
  /** The name stamped on the variables changed in the draft. */
  author: string;
  /** Whose changes are kept in the browser; null keeps none. */
  user: string | null;
  /**
   * Called once the pending changes are saved, with their number and the version
   * of the compliance export recording them: the page reads the collector again.
   */
  onCommitted: (count: number, version: RecordedVersion | undefined) => void;
  /** Reads the collector again and starts a new sandbox, from the changes kept. */
  onReload: () => void;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, null, () =>
    resume(original, user === null ? null : readSavedDraft(user)),
  );

  // Every change kept at once, a commit or a reset forgetting them all: the
  // sandbox survives leaving the page, a reload or a closed browser.
  useEffect(() => {
    if (user !== null) writeSavedDraft(user, toSaved(state));
  }, [user, state]);

  // Another tab of the same user changed the changes kept: told, and offered to
  // load them, rather than overwritten unseen by the next change made here. The
  // warning holds for the state it was raised on: the next change made here
  // replaces what the other tab kept, and that tab is told in turn.
  const [elsewhere, setElsewhere] = useState<State | null>(null);
  const changedElsewhere = elsewhere === state;
  useEffect(() => {
    if (user === null) return;
    return watchSavedDraft(user, () => {
      setElsewhere(isSavedDraft(user, toSaved(state)) ? null : state);
    });
  }, [user, state]);

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
      dispatch({ type: "apply", operation, author, at: localTimestamp(new Date()) });
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
      historyMessage: (saved: LogLine[]) => string,
      baselineMessage: string,
    ): Promise<CommitResult> => {
      // All or nothing: the collector applies the whole history in one change,
      // between a version of what changed elsewhere and one of these changes.
      const lines = state.history.map((h) => h.line);
      const result = await commitAll(state.history, historyMessage(lines), baselineMessage);
      if (!result.saved) return result;
      dispatch({ type: "committed" });
      onCommitted(lines.length, result.version);
      return result;
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
        dispatch({ type: "restore", operations, author, at: localTimestamp(new Date()), commit });
      },
      resumed: state.resumed,
      dismissResumed: () => {
        dispatch({ type: "dismissResumed" });
      },
      changedElsewhere,
      reload: onReload,
      author,
      notices,
      notify,
      dismiss,
    }),
    [state, run, runAndTell, commit, author, notices, notify, dismiss, changedElsewhere, onReload],
  );

  return <DesignerContext.Provider value={value}>{children}</DesignerContext.Provider>;
}
