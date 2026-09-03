import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LibrarySnapshot } from "../../shared/lib";

export const libraryQueryOptions = queryOptions({
  networkMode: "always",
  queryKey: ["library"],
  queryFn: () => window.lume.loadLibrary(),
  retry: false,
  staleTime: Infinity,
});

export function useAddSource() {
  return useLibrary(window.lume.addSource);
}

export function useCreatePlaylist() {
  return useLibrary(window.lume.createPlaylist);
}

export function useLibrary<TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<LibrarySnapshot>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    networkMode: "always",
    scope: { id: "library" },
    onSuccess: (library) => queryClient.setQueryData(libraryQueryOptions.queryKey, library),
  });
}
