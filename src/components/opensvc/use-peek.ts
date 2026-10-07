import { useNavigate } from "@tanstack/react-router";
import { serialiseTrail } from "@/lib/peek-trail";

/**
 * Opens the record of an object in the detail panel, over whatever view is on
 * display (see `PeekPanel`). Shared by every badge that names an object, by the
 * bookmarks, by the global search and by the panel title, so that they all behave
 * alike. The panel title then records it in the history (`PanelTitle`); nothing
 * is bookmarked: only the bookmark button of a panel does that. `tab` opens the
 * panel on one of its tabs rather than on the properties.
 */
export function usePeek() {
  const navigate = useNavigate();
  return (kind: string, id: string, tab?: string) => {
    void navigate({
      to: ".",
      search: (previous) => ({
        ...(previous as Record<string, unknown>),
        sel: undefined,
        tab: undefined,
        peek: serialiseTrail([{ kind, id }]),
        peekat: undefined,
        peektab: tab,
      }),
      resetScroll: false,
    });
  };
}
