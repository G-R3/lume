import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { SessionSource } from "@/lib/queue/commands";

export function playlistQueryOptions(playlistId: number) {
  return queryOptions({
    networkMode: "always",
    queryKey: ["playlist", playlistId],
    queryFn: () => window.lume.loadPlaylist(playlistId),
    retry: false,
  });
}

/** Reads a playlist's saved order. Loads it only when the cache is missing or invalidated, or for a refresh. */
export function createPlaylistReader(queryClient: QueryClient) {
  return {
    read: async (playlistId: number, refresh: boolean): Promise<SessionSource | null> => {
      const options = playlistQueryOptions(playlistId);

      if (refresh) await queryClient.cancelQueries({ queryKey: options.queryKey });

      const cached = refresh ? undefined : queryClient.getQueryData(options.queryKey);

      const playlist =
        cached !== undefined && !queryClient.getQueryState(options.queryKey)?.isInvalidated
          ? cached
          : await queryClient.fetchQuery({ ...options, staleTime: refresh ? 0 : Infinity });

      if (!playlist) return null;

      return {
        source: { kind: "playlist", playlistId: playlist.id, title: playlist.title },
        entries: playlist.tracks.map((track) => ({
          sourceEntryId: track.id,
          trackId: track.trackId,
        })),
      };
    },
  };
}
