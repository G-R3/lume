import { createFileRoute } from "@tanstack/react-router";
import { PlaylistPage } from "@/pages/playlist";

export const Route = createFileRoute("/_app/playlists/$playlistId")({
  component: PlaylistPage,
  params: {
    parse: (params) => {
      const playlistId = Number(params.playlistId);

      return Number.isSafeInteger(playlistId) && playlistId > 0 ? { playlistId } : false;
    },
    stringify: (params) => ({ playlistId: String(params.playlistId) }),
  },
});
