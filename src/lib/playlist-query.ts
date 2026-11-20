import { isCancelledError, queryOptions, type QueryClient, useQuery } from "@tanstack/react-query";
import type { PlaylistRead } from "@shared/library";
import type { PlaylistEffects } from "@/lib/playlist-events";

export function playlistQueryOptions(playlistId: number) {
  return queryOptions({
    networkMode: "always",
    queryKey: ["playlist", playlistId],
    queryFn: () => window.lume.loadPlaylist(playlistId),
    retry: false,
    staleTime: Infinity,
  });
}

export function usePlaylist(playlistId: number) {
  return useQuery({ ...playlistQueryOptions(playlistId), select: (read) => read.playlist });
}

export function applyPlaylistRead(queryClient: QueryClient, effects: PlaylistEffects) {
  const filters = { exact: true, queryKey: playlistQueryOptions(effects.playlistId).queryKey };

  void queryClient.cancelQueries(filters);
  const next = effects.nextRead(queryClient.getQueryData(filters.queryKey));

  if (next) queryClient.setQueryData(filters.queryKey, next);
  else void queryClient.invalidateQueries(filters);
}

export function createPlaylistReader(queryClient: QueryClient) {
  const read = (playlistId: number): Promise<PlaylistRead> =>
    queryClient.ensureQueryData(playlistQueryOptions(playlistId)).catch((error: Error) => {
      if (isCancelledError(error)) return read(playlistId);

      throw error;
    });

  return { read };
}
