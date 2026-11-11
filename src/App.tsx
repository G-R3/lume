import { Outlet, useLocation } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { FirstRunScreen } from "@/components/library-onboarding";
import { Button } from "@/components/ui/button";
import { playFirstScan } from "@/lib/first-scan";
import { cn } from "@/lib/utils";
import { useLibrary, useLibraryMutation } from "@/lib/library-query";
import { MusicLibraryContext } from "@/hooks/use-music-library";
import { LibraryRevealContext, type Onboarding, useOnboarding } from "@/hooks/use-onboarding";

export function AppRoot() {
  const onTracksRoute = useLocation({ select: (location) => location.pathname === "/" });
  const { error, library, refetch } = useLibrary();
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const { onboarding, onRevealEnd, reveal } = useOnboarding(library?.kind, onTracksRoute);

  if (library === undefined) {
    if (!error) return <div className="min-h-screen bg-page" />;

    return (
      <main className="flex min-h-screen justify-center bg-page px-6 pt-66 text-primary">
        <div className="flex w-100 max-w-full flex-col items-start">
          <h1 className="text-display font-semibold">Lume could not load your library</h1>
          <p className="pt-2 text-copy text-danger" role="alert">
            {recoveryError ?? error.message}
          </p>
          <div className="flex items-center gap-2 pt-6">
            <Button
              onClick={() => {
                setRecoveryError(null);
                void refetch();
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

  return (
    <LibraryRevealContext.Provider value={reveal}>
      {library.kind === "library" && (
        <MusicLibraryContext.Provider value={library}>
          <Outlet />
        </MusicLibraryContext.Provider>
      )}
      {onboarding.phase !== "none" && (
        <FirstRun onboarding={onboarding} onRevealEnd={onRevealEnd} />
      )}
    </LibraryRevealContext.Provider>
  );
}

function FirstRun({
  onboarding,
  onRevealEnd,
}: {
  onboarding: Exclude<Onboarding, { phase: "none" }>;
  onRevealEnd: () => void;
}) {
  const libraryMutation = useLibraryMutation();
  const screenRef = useRef<HTMLDivElement>(null);
  const isCovering = onboarding.phase !== "first-run";
  const isLeaving = onboarding.phase === "revealing" || onboarding.phase === "fading-out";
  const list = onboarding.phase === "revealing" ? onboarding.list : null;

  useLayoutEffect(() => {
    if (!isLeaving || !screenRef.current) return;

    return playFirstScan(screenRef.current, list, onRevealEnd);
  }, [isLeaving, list, onRevealEnd]);

  return (
    <div
      aria-hidden={isCovering || undefined}
      className={cn(isCovering && "pointer-events-none fixed inset-0 z-50")}
      inert={isCovering}
      ref={screenRef}
    >
      <FirstRunScreen
        errorMessage={isCovering ? null : (libraryMutation.error?.message ?? null)}
        isLoading={isCovering || libraryMutation.isPending}
        isMac={window.lume.isMac}
        onAddSource={() => libraryMutation.mutate({ kind: "add-source" })}
      />
    </div>
  );
}

export default AppRoot;
