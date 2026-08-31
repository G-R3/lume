import type { LibraryUpdate, MusicLibrary } from "../../shared/lib";
import { Button } from "@/components/ui/button";

export function LibraryStatus({
  isLoading,
  library,
  requestLibrary,
}: {
  isLoading: boolean;
  library: MusicLibrary;
  requestLibrary: (request: () => Promise<LibraryUpdate>) => Promise<void>;
}) {
  const failedSource = library.sources.find((source) => source.lastScanError);

  if (failedSource) {
    const name = failedSource.path.split(/[/\\]/).filter(Boolean).at(-1) ?? failedSource.path;

    return (
      <div className="flex items-center gap-4 border-b border-amber-900/60 bg-amber-950/30 px-5 py-3 text-xs">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-300">{name} could not be scanned</p>
          <p
            className="mt-1 truncate text-amber-500"
            title={failedSource.lastScanError ?? undefined}
          >
            {failedSource.lastScanError}
          </p>
        </div>
        {failedSource.enabled && (
          <Button
            className="border-amber-800 bg-amber-950 text-amber-300 hover:bg-amber-900"
            disabled={isLoading}
            onClick={() => void requestLibrary(() => window.lume.rescanSource(failedSource.id))}
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        )}
        <Button
          className="text-amber-400 hover:bg-amber-950 hover:text-amber-200"
          render={<a href="#settings/sources" />}
          variant="ghost"
        >
          Manage sources
        </Button>
      </div>
    );
  }

  if (library.sources.length > 0 && library.sources.every((source) => !source.enabled)) {
    return (
      <div className="flex items-center gap-4 border-b border-neutral-800 bg-neutral-950 px-5 py-3 text-xs text-neutral-400">
        <p className="flex-1">
          All sources are disabled. Their tracks remain saved but cannot play.
        </p>
        <Button
          className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50"
          render={<a href="#settings/sources" />}
          variant="outline"
        >
          Manage sources
        </Button>
      </div>
    );
  }

  const emptySource = library.sources.find(
    (source) => source.enabled && source.lastScannedAt !== null && source.trackCount === 0,
  );

  if (!emptySource) return null;

  const sourceName = emptySource.path.split(/[/\\]/).filter(Boolean).at(-1) ?? "this source";

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <div aria-hidden="true" className="mb-5 text-3xl text-neutral-700">
        ♪
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No audio found in {sourceName}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-500">
        The folder was added, but Lume did not find a supported audio file.
      </p>
      <div className="mt-6 flex items-center gap-2">
        <Button
          className="bg-lime-300 text-neutral-950 hover:bg-lime-200"
          disabled={isLoading}
          onClick={() => void requestLibrary(() => window.lume.rescanSource(emptySource.id))}
          type="button"
        >
          Rescan
        </Button>
        <Button
          className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50"
          disabled={isLoading}
          onClick={() => void requestLibrary(window.lume.addSource)}
          type="button"
          variant="outline"
        >
          Add another source
        </Button>
        <Button
          className="text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
          render={<a href="#settings/sources" />}
          variant="ghost"
        >
          Manage sources
        </Button>
      </div>
    </div>
  );
}
