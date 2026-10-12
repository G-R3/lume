import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FirstRunScreen } from "@/components/library-onboarding";
import { Button } from "@/components/ui/button";
import { playFirstScan } from "@/lib/first-scan";
import { cn } from "@/lib/utils";
import { libraryQueryOptions, useLibraryMutation } from "@/lib/library-query";
import { MusicLibraryContext } from "@/hooks/use-music-library";

export function AppRoot() {
  const queryClient = useQueryClient();
  const library = useQuery(libraryQueryOptions);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  // From choosing the first folder until the library has been revealed
  const [isAddingFirstFolder, setIsAddingFirstFolder] = useState(false);

  useEffect(
    () =>
      window.lume.onLibraryUpdate((library) => {
        queryClient.setQueryData(libraryQueryOptions.queryKey, library);
      }),
    [queryClient],
  );

  if (library.data === undefined) {
    if (!library.error) return <div className="min-h-screen bg-page" />;

    return (
      <main className="grid min-h-screen place-items-center bg-page px-6 text-primary">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight">Lume could not load your library</h1>
          <p className="mt-3 text-sm leading-6 text-danger" role="alert">
            {recoveryError ?? library.error.message}
          </p>
          <div className="mt-7 flex justify-center gap-2">
            <Button
              onClick={() => {
                setRecoveryError(null);
                void library.refetch();
              }}
              type="button"
              variant="primary"
            >
              Try again
            </Button>
            <Button
              onClick={() =>
                void window.lume
                  .openDataFolder()
                  .catch((error: Error) => setRecoveryError(error.message))
              }
              type="button"
            >
              Open data folder
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const isFirstRun = library.data.kind === "first-run";

  // The first-run screen stays in the same place in the tree when the library arrives, so the screen
  // that sits over the new library during its reveal is the same one, mid-shimmer.
  return (
    <>
      {library.data.kind === "library" && (
        <MusicLibraryContext.Provider value={library.data}>
          <Outlet />
        </MusicLibraryContext.Provider>
      )}
      {(isFirstRun || isAddingFirstFolder) && (
        <FirstRun
          isRevealingLibrary={!isFirstRun}
          onChooseFolder={() => setIsAddingFirstFolder(true)}
          onRevealEnd={() => setIsAddingFirstFolder(false)}
        />
      )}
    </>
  );
}

function FirstRun({
  isRevealingLibrary,
  onChooseFolder,
  onRevealEnd,
}: {
  isRevealingLibrary: boolean;
  onChooseFolder: () => void;
  onRevealEnd: () => void;
}) {
  const libraryMutation = useLibraryMutation();
  const screenRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isRevealingLibrary || !screenRef.current) return;

    return playFirstScan(screenRef.current, onRevealEnd);
  }, [isRevealingLibrary, onRevealEnd]);

  return (
    <div
      aria-hidden={isRevealingLibrary || undefined}
      className={cn(isRevealingLibrary && "pointer-events-none fixed inset-0 z-50")}
      inert={isRevealingLibrary}
      ref={screenRef}
    >
      <FirstRunScreen
        errorMessage={isRevealingLibrary ? null : (libraryMutation.error?.message ?? null)}
        isLoading={isRevealingLibrary || libraryMutation.isPending}
        isMac={window.lume.isMac}
        onAddSource={() => {
          onChooseFolder();
          libraryMutation.mutate({ kind: "add-source" });
        }}
      />
    </div>
  );
}

export default AppRoot;
