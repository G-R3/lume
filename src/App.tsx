import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FirstRunScreen } from "@/components/library-onboarding";
import { Button } from "@/components/ui/button";
import { FirstScanContext } from "@/hooks/use-first-scan";
import { playFirstScan } from "@/lib/first-scan";
import { cn } from "@/lib/utils";
import { libraryQueryOptions, useLibraryMutation } from "@/lib/library-query";
import { MusicLibraryContext } from "@/hooks/use-music-library";

export function AppRoot() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const queryClient = useQueryClient();
  const library = useQuery(libraryQueryOptions);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isAddingFirstFolder, setIsAddingFirstFolder] = useState(false);

  const [readyList, setReadyList] = useState<HTMLElement | null | undefined>(undefined);
  const onRevealEnd = useCallback(() => setIsAddingFirstFolder(false), []);

  const reveal = useMemo(
    () => ({
      isRevealing: isAddingFirstFolder && library.data?.kind === "library" && Boolean(readyList),
      onListReady: setReadyList,
    }),
    [isAddingFirstFolder, library.data?.kind, readyList],
  );

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
      <main className="flex min-h-screen justify-center bg-page px-6 pt-66 text-primary">
        <div className="flex w-100 max-w-full flex-col items-start">
          <h1 className="text-display font-semibold">Lume could not load your library</h1>
          <p className="pt-2 text-copy text-danger" role="alert">
            {recoveryError ?? library.error.message}
          </p>
          <div className="flex items-center gap-2 pt-6">
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

  return (
    <FirstScanContext.Provider value={reveal}>
      {library.data.kind === "library" && (
        <MusicLibraryContext.Provider value={library.data}>
          <Outlet />
        </MusicLibraryContext.Provider>
      )}
      {(isFirstRun || isAddingFirstFolder) && (
        <FirstRun
          isRevealingLibrary={!isFirstRun}
          onChooseFolder={() => {
            setReadyList(undefined);
            setIsAddingFirstFolder(true);
          }}
          onRevealEnd={onRevealEnd}
          readyList={pathname === "/" ? readyList : null}
        />
      )}
    </FirstScanContext.Provider>
  );
}

function FirstRun({
  isRevealingLibrary,
  onChooseFolder,
  onRevealEnd,
  readyList,
}: {
  isRevealingLibrary: boolean;
  onChooseFolder: () => void;
  onRevealEnd: () => void;
  readyList: HTMLElement | null | undefined;
}) {
  const libraryMutation = useLibraryMutation();
  const screenRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isRevealingLibrary || !screenRef.current || readyList === undefined) return;

    return playFirstScan(screenRef.current, readyList, onRevealEnd);
  }, [isRevealingLibrary, onRevealEnd, readyList]);

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
