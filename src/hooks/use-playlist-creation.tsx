import { createContext, type ReactNode, useContext, useState } from "react";
import {
  CreatePlaylistDialog,
  type PlaylistCreationRequest,
} from "@/components/create-playlist-dialog";

type OpenPlaylistCreation = (request: PlaylistCreationRequest) => void;

const PlaylistCreationContext = createContext<OpenPlaylistCreation | null>(null);

export function usePlaylistCreation() {
  const open = useContext(PlaylistCreationContext);

  if (!open) throw new Error("usePlaylistCreation must be used within PlaylistCreationProvider");

  return open;
}

export function PlaylistCreationProvider({ children }: { children: ReactNode }) {
  const [creation, setCreation] = useState<{
    id: number;
    open: boolean;
    request: PlaylistCreationRequest;
  } | null>(null);

  const openCreation: OpenPlaylistCreation = (request) =>
    setCreation((current) =>
      current?.open ? current : { id: (current?.id ?? 0) + 1, open: true, request },
    );

  return (
    <PlaylistCreationContext.Provider value={openCreation}>
      {children}
      {creation && (
        <CreatePlaylistDialog
          key={creation.id}
          onOpenChange={(open) => setCreation((current) => current && { ...current, open })}
          open={creation.open}
          request={creation.request}
        />
      )}
    </PlaylistCreationContext.Provider>
  );
}
