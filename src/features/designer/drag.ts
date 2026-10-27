import { createContext, useContext, useState, type DragEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useDesigner } from "./designer-context";
import { refusal, type Operation, type Refusal, type TeamRole } from "./model";

/**
 * Drag and drop of the designer, on the native HTML API: what is being dragged is
 * kept in a context, since a drop target cannot read the transferred data before
 * the drop. Every drag has a keyboard equivalent (a picker or a menu), drag and
 * drop being a shortcut, never the only way.
 */
export type DragItem =
  | { type: "ruleset"; id: number }
  | { type: "moduleset"; id: number }
  | { type: "filterset"; id: number; name: string }
  | { type: "group"; id: number; role: string }
  | { type: "module"; name: string }
  | { type: "variable"; rulesetId: number; variableId: number }
  | { type: "team"; kind: "ruleset" | "moduleset"; id: number; role: TeamRole; team: string };

export interface DragHintState {
  text: string;
  refused: boolean;
}

export interface DragState {
  item: DragItem | null;
  setItem: (item: DragItem | null) => void;
  /** What dropping here would do, or why it would be refused, for the hint line. */
  hint: DragHintState | null;
  setHint: (hint: DragHintState | null) => void;
  /**
   * The refusal of the target last hovered, and when: a refused drop fires no drop
   * event, so the source tells the reason itself when released on it.
   */
  lastRefusal: RefObject<{ refusal: Refusal; at: number } | null>;
}

export const DragContext = createContext<DragState | null>(null);

export function useDrag(): DragState {
  const state = useContext(DragContext);
  if (state === null) throw new Error("useDrag outside of DragProvider");
  return state;
}

/** The props making an element the source of a drag. */
export function useDraggable(item: DragItem, label: string) {
  const { setItem, setHint, lastRefusal } = useDrag();
  const designer = useDesigner();
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "copyMove";
      // Text for drops outside of the page, such as in a text editor.
      event.dataTransfer.setData("text/plain", label);
      setItem(item);
    },
    onDragEnd: (event: DragEvent) => {
      setItem(null);
      setHint(null);
      const last = lastRefusal.current;
      lastRefusal.current = null;
      // Released on a refusing target: dragover fires every few tens of milliseconds
      // while the pointer stays on a target, so a recent one means it was there.
      if (last !== null && event.dataTransfer.dropEffect === "none" && Date.now() - last.at < 350)
        designer.notify({ key: last.refusal.key, values: last.refusal.values, tone: "refused" });
    },
  };
}

/** A drop target, as `useDropTarget` returns it. */
export interface DropTarget {
  /** An item that could land here is being dragged. */
  candidate: boolean;
  accepts: boolean;
  over: boolean;
  props: {
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
}

/**
 * A drop target: `operationFor` tells what dropping the item would do, null when
 * the item has nothing to do here. The target then reports whether it accepts the
 * drop and why not, and applies the operation, or hands it to `onDrop`, when the
 * item is released on it.
 */
export function useDropTarget(
  operationFor: (item: DragItem) => Operation | null,
  onDrop?: (operation: Operation, item: DragItem, at: { x: number; y: number }) => void,
): DropTarget {
  const { t } = useTranslation();
  const { item, setItem, setHint, lastRefusal } = useDrag();
  const designer = useDesigner();
  const [over, setOver] = useState(false);

  const operation = item === null ? null : operationFor(item);
  const refused: Refusal | null = operation === null ? null : refusal(designer.draft, operation);
  const accepts = operation !== null && refused === null;

  return {
    candidate: operation !== null,
    accepts,
    over,
    props: {
      onDragOver: (event: DragEvent) => {
        if (operation === null) return;
        event.stopPropagation();
        setOver(true);
        if (refused !== null) {
          setHint({ text: t(refused.key, refused.values), refused: true });
          lastRefusal.current = { refusal: refused, at: Date.now() };
          return;
        }
        lastRefusal.current = null;
        event.preventDefault();
        event.dataTransfer.dropEffect = operation.op === "copyVariable" ? "copy" : "move";
        const line = designer.describe(operation);
        setHint({ text: t(line.key, line.values), refused: false });
      },
      onDragLeave: (event: DragEvent) => {
        // Moving onto a child of the target is not leaving it.
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        setOver(false);
        setHint(null);
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        setHint(null);
        const dragged = item;
        setItem(null);
        if (operation === null || refused !== null || dragged === null) return;
        if (onDrop !== undefined)
          onDrop(operation, dragged, { x: event.clientX, y: event.clientY });
        else designer.runAndTell(operation);
      },
    },
  };
}
