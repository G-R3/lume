import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LibraryEmptyState } from "@/components/library-empty-state";
import { Button } from "@/components/ui/button";
import { libraryQueryOptions, useAddSource } from "@/lib/library-query";
import { MusicLibraryContext } from "@/hooks/use-music-library";

export function AppRoot() {
  const queryClient = useQueryClient();
  const library = useQuery(libraryQueryOptions);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  useEffect(
    () =>
      window.lume.onLibraryUpdate((library) => {
        queryClient.setQueryData(libraryQueryOptions.queryKey, library);
      }),
    [queryClient],
  );

  if (library.data === undefined) {
    if (!library.error) return <div className="min-h-screen bg-black" />;

    return (
      <main className="grid min-h-screen place-items-center bg-black px-6 text-neutral-50">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight">Lume could not load your library</h1>
          <p className="mt-3 text-sm leading-6 text-red-300" role="alert">
            {recoveryError ?? library.error.message}
          </p>
          <div className="mt-7 flex justify-center gap-2">
            <Button
              className="bg-lime-300 text-neutral-950 hover:bg-lime-200"
              onClick={() => {
                setRecoveryError(null);
                void library.refetch();
              }}
              type="button"
            >
              Try again
            </Button>
            <Button
              className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
              onClick={() =>
                void window.lume
                  .openDataFolder()
                  .catch((error: Error) => setRecoveryError(error.message))
              }
              type="button"
              variant="outline"
            >
              Open data folder
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (library.data.kind === "first-run") return <FirstRun />;

  return (
    <MusicLibraryContext.Provider value={library.data}>
      <Outlet />
    </MusicLibraryContext.Provider>
  );
}

function FirstRun() {
  const addSource = useAddSource();

  return (
    <LibraryEmptyState
      errorMessage={addSource.error?.message ?? null}
      isLoading={addSource.isPending}
      isMac={window.lume.isMac}
      onAddSource={() => addSource.mutate()}
    />
  );
}

export default AppRoot;
