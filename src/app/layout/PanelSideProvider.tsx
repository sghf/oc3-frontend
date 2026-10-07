import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PanelSideContext } from "@/components/ui/panel-side";
import { usePanelSidePref } from "@/lib/user-prefs";

/**
 * Gives the side panels the edge of the window they open against, chosen with the
 * account, and the button that moves them to the other one.
 */
export function PanelSideProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pref = usePanelSidePref();
  const side = pref.value;
  return (
    <PanelSideContext.Provider
      value={{
        side,
        switchSide: () => {
          pref.set(side === "left" ? "right" : "left");
        },
        switchLabel: side === "left" ? t("panelSide.toRight") : t("panelSide.toLeft"),
      }}
    >
      {children}
    </PanelSideContext.Provider>
  );
}
