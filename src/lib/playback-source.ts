import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { SourceEntry, SourceIdentity, SourceRef } from "./queue";

export type PlaybackSource = {
  source: Exclude<SourceRef, { kind: "detached" }>;
  entries: SourceEntry[];
};

export function playlistQueryOptions(playlistId: number) {
  return queryOptions({
    networkMode: "always",
    queryKey: ["playlist", playlistId],
    queryFn: () => window.lume.loadPlaylist(playlistId),
    retry: false,
  });
}

/** Use the saved playlist order. Load it only when the cache is missing or stale. */
export function createPlaybackSourceReader(queryClient: QueryClient) {
  return {
    read: async (source: SourceIdentity, refresh = false): Promise<PlaybackSource | null> => {
      if (source.kind === "all-tracks") return null;

      const options = playlistQueryOptions(source.playlistId);

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
