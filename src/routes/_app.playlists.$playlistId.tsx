import { createFileRoute } from "@tanstack/react-router";
import { PlaylistPage } from "@/pages/playlist";

export const Route = createFileRoute("/_app/playlists/$playlistId")({
  component: PlaylistPage,
});
