import { createFileRoute } from "@tanstack/react-router";
import { DatabaseIdSchema } from "@shared/schemas";
import { PlaylistPage } from "@/pages/playlist";

export const Route = createFileRoute("/_app/playlists/$playlistId")({
  component: PlaylistPage,
  params: {
    parse: (params) => {
      const playlistId = DatabaseIdSchema.safeParse(Number(params.playlistId));

      return playlistId.success ? { playlistId: playlistId.data } : false;
    },
    stringify: (params) => ({ playlistId: String(params.playlistId) }),
  },
});
