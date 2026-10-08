import { createContext, useContext } from "react";
import type { CommitResult } from "./commit";
import type { Draft, LogLine, ObjectRef, Operation, Refusal } from "./model";

/** A message of the designer: a translation key with its values, and its tone. */
export interface Notice {
  id: number;
  key: string;
  values?: Record<string, string>;
  /** A change log line the message is about, translated into its `what` value. */
  inner?: LogLine;
  tone: "done" | "refused";
}

/** The designer sandbox as the components see it, provided by `DesignerProvider`. */
export interface Designer {
  original: Draft;
  draft: Draft;
  log: LogLine[];
  /**
   * Applies an operation to the draft; the refusal when the collector would not
   * accept it, and the object it created, if any.
   */
  run: (operation: Operation) => { refused: Refusal | null; created?: ObjectRef };
  /** Like run, telling the outcome in a notice. */
  runAndTell: (operation: Operation) => ObjectRef | undefined;
  describe: (operation: Operation) => LogLine;
  undo: () => void;
  reset: () => void;
  /**
   * Saves the pending changes to the collector, in order, up to the first it
   * refuses; those saved leave the sandbox, the others stay pending, and the
   * compliance export is recorded as a version of its git history.
   */
  commit: (
    onProgress: (done: number) => void,
    /** The message of the version recording the changes saved, out of `total`. */
    historyMessage: (saved: LogLine[], total: number) => string,
    /** The message of the version of the export as found before saving, if it changed. */
    baselineMessage: string,
  ) => Promise<CommitResult>;
  /** The version of the compliance history the pending changes restore, if they do. */
  restoredFrom: string | undefined;
  /** Adds the operations restoring a version to the pending changes. */
  restore: (commit: string, operations: Operation[]) => void;
  /** The name stamped on the variables changed in the draft. */
  author: string;
  notices: Notice[];
  notify: (notice: Omit<Notice, "id">) => void;
  dismiss: (id: number) => void;
}

export const DesignerContext = createContext<Designer | null>(null);

export function useDesigner(): Designer {
  const designer = useContext(DesignerContext);
  if (designer === null) throw new Error("useDesigner outside of DesignerProvider");
  return designer;
}
