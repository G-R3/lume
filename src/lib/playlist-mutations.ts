import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AddTracksToPlaylistInput,
  PlaylistCreationInput,
  RemovePlaylistTracksInput,
} from "../../shared/library";
import { waitUntilLibraryRevisionShown } from "@/lib/library-query";
import { forgetViewSort } from "@/lib/view-sort";

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationFn: async (input: PlaylistCreationInput) => {
      const result = await window.lume.createPlaylist(input);
      await waitUntilLibraryRevisionShown(queryClient, result.revision);

      return result;
    },
    onSuccess: ({ playlist }) => forgetViewSort({ kind: "playlist", playlistId: playlist.id }),
  });
}

export function useDeletePlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationFn: async (playlistId: number) =>
      waitUntilLibraryRevisionShown(queryClient, await window.lume.deletePlaylist(playlistId)),
    onSuccess: (_result, playlistId) => forgetViewSort({ kind: "playlist", playlistId }),
  });
}

export function useAddTracksToPlaylistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationFn: async (input: AddTracksToPlaylistInput) => {
      const result = await window.lume.addTracksToPlaylist(input);
      await waitUntilLibraryRevisionShown(queryClient, result.revision);

      return result;
    },
  });
}

export function useRemovePlaylistTracksMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationFn: async (input: RemovePlaylistTracksInput) =>
      waitUntilLibraryRevisionShown(queryClient, await window.lume.removePlaylistTracks(input)),
  });
}
