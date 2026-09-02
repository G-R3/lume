import { createContext, useContext } from "react";
import type { MusicLibrary } from "../../shared/lib";

export const MusicLibraryContext = createContext<MusicLibrary | null>(null);

export function useMusicLibrary() {
  const library = useContext(MusicLibraryContext);

  if (!library) throw new Error("Library routes must render within the library app");
  return library;
}
