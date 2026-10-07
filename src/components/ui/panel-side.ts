import { createContext, useContext } from "react";

/** The edge of the window the side panels stand against. */
export type PanelSide = "left" | "right";

export interface PanelSideSetting {
  side: PanelSide;
  /** Moves the panels to the other edge; with it, each panel offers the button. */
  switchSide?: () => void;
  /** Name of that button, for the side the panels are on. */
  switchLabel?: string;
}

/**
 * Where the side panels open, given by the application shell. Without a provider,
 * on the right and without a button to move them.
 */
export const PanelSideContext = createContext<PanelSideSetting>({ side: "right" });

export function usePanelSide(): PanelSideSetting {
  return useContext(PanelSideContext);
}
