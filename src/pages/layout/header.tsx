import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { useLibraryMutation } from "@/lib/library-query";

export function AppHeader({ isSettings }: { isSettings: boolean }) {
  const library = useMusicLibrary();
  const libraryMutation = useLibraryMutation();
  const sourcePaths = library.sources.map((source) => source.path);
  const unavailableTrackCount = library.tracks.filter((track) => !track.available).length;
  const sourceSummary =
    sourcePaths.length === 1
      ? sourcePaths[0]
      : sourcePaths.length
        ? `${sourcePaths.length.toLocaleString()} sources`
        : null;

  return (
    <>
      <header className="flex h-12.5 shrink-0 items-center gap-2 border-b border-neutral-800 px-5">
        <SidebarTrigger className="-ml-1.5" />
        <Separator
          className="mx-1 h-4 bg-neutral-800 data-vertical:self-center!"
          orientation="vertical"
        />
        <h1 className="text-sm font-semibold tracking-tight">
          {isSettings ? "Settings" : "All tracks"}
        </h1>
        {!isSettings && (
          <span className="font-berkeley rounded bg-neutral-800 px-1.5 py-1 text-[10px] text-neutral-400 tabular-nums">
            {library.tracks.length.toLocaleString()}
          </span>
        )}
        {!isSettings && unavailableTrackCount > 0 && (
          <span className="font-berkeley rounded bg-amber-950 px-1.5 py-1 text-[10px] text-amber-400 tabular-nums">
            {unavailableTrackCount.toLocaleString()} unavailable
          </span>
        )}

        {!isSettings && (
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {sourceSummary && (
              <span
                className="hidden max-w-48 truncate text-[10px] text-neutral-400 lg:block"
                title={sourcePaths.join("\n")}
              >
                {sourceSummary}
              </span>
            )}
            <Button
              className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50"
              disabled={libraryMutation.isPending}
              onClick={() => libraryMutation.mutate({ kind: "add-source" })}
              type="button"
              variant="outline"
            >
              Add source
            </Button>

            {library.sources.some((source) => source.enabled) && (
              <Button
                className="border-lime-800 bg-lime-950 text-lime-300 hover:bg-lime-900 hover:text-lime-200"
                disabled={libraryMutation.isPending}
                onClick={() => libraryMutation.mutate({ kind: "rescan-sources" })}
                type="button"
                variant="outline"
              >
                {libraryMutation.isPending ? "Scanning..." : "Rescan"}
              </Button>
            )}
          </div>
        )}
      </header>

      {libraryMutation.error && (
        <p className="m-4 text-sm text-red-300" role="alert">
          {libraryMutation.error.message}
        </p>
      )}
    </>
  );
}
