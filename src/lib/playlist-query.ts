import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { PlaylistDetails } from "../../shared/lib";

export function playlistQueryOptions(playlistId: number) {
  return queryOptions({
    networkMode: "always",
    queryKey: ["playlist", playlistId],
    queryFn: () => window.lume.loadPlaylist(playlistId),
    retry: false,
  });
}

export function createPlaylistReader(queryClient: QueryClient) {
  return {
    read: async (playlistId: number, refresh: boolean): Promise<PlaylistDetails | null> => {
      const options = playlistQueryOptions(playlistId);

      if (refresh) await queryClient.cancelQueries({ queryKey: options.queryKey });

      const cached = refresh ? undefined : queryClient.getQueryData(options.queryKey);

      return cached !== undefined && !queryClient.getQueryState(options.queryKey)?.isInvalidated
        ? cached
        : queryClient.fetchQuery({ ...options, staleTime: refresh ? 0 : Infinity });
    },
  };
}
