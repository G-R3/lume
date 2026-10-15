import { createContext, useContext } from "react";

export const FirstScanContext = createContext<{
  isRevealing: boolean;
  onListReady: (list: HTMLElement | null) => void;
} | null>(null);

export function useFirstScan() {
  const context = useContext(FirstScanContext);

  if (!context) throw new Error("useFirstScan must be used within FirstScanContext");

  return context;
}
