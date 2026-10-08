import type { MusicLibrary } from "../../../shared/lib";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useLibraryMutation } from "@/lib/library-query";
import { getSourceName } from "@/lib/source-name";

export function LibraryStatus({ library }: { library: MusicLibrary }) {
  const libraryMutation = useLibraryMutation();

  const failedSource = library.sources.find((source) => source.lastScanError);

  if (libraryMutation.error) {
    return (
      <p
        className="border-b border-danger/30 bg-danger-subtle px-5 py-3 text-xs text-danger"
        role="alert"
      >
        {libraryMutation.error.message}
      </p>
    );
  }

  if (failedSource) {
    const name = getSourceName(failedSource.path);

    return (
      <div className="flex items-center gap-4 border-b border-default bg-raised px-5 py-3 text-xs">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-primary">{name} could not be scanned</p>
          <p
            className="mt-1 truncate text-secondary"
            title={failedSource.lastScanError ?? undefined}
          >
            {failedSource.lastScanError}
          </p>
        </div>
        {failedSource.enabled && (
          <Button
            className="border-strong bg-selected text-primary hover:bg-hover"
            disabled={libraryMutation.isPending}
            onClick={() =>
              libraryMutation.mutate({ kind: "rescan-source", sourceId: failedSource.id })
            }
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        )}
        <Button
          className="text-secondary hover:bg-selected hover:text-primary"
          render={<Link to="/settings" />}
          variant="ghost"
        >
          Manage sources
        </Button>
      </div>
    );
  }

  if (library.sources.length > 0 && library.sources.every((source) => !source.enabled)) {
    return (
      <div className="flex items-center gap-4 border-b border-default bg-page px-5 py-3 text-xs text-secondary">
        <p className="flex-1">
          All sources are disabled. Their tracks remain saved but cannot play.
        </p>
        <Button
          className="border-strong bg-raised text-primary hover:bg-selected hover:text-primary"
          render={<Link to="/settings" />}
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

  const sourceName = getSourceName(emptySource.path);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <div aria-hidden="true" className="mb-5 text-3xl text-disabled">
        ♪
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No audio found in {sourceName}</h2>
      <p className="mt-2 text-sm leading-6 text-tertiary">
        The folder was added, but Lume did not find a supported audio file.
      </p>
      <div className="mt-6 flex items-center gap-2">
        <Button
          className="bg-inverse text-inverse hover:bg-inverse-hover"
          disabled={libraryMutation.isPending}
          onClick={() =>
            libraryMutation.mutate({ kind: "rescan-source", sourceId: emptySource.id })
          }
          type="button"
        >
          Rescan
        </Button>
        <Button
          className="border-strong bg-raised text-primary hover:bg-selected hover:text-primary"
          disabled={libraryMutation.isPending}
          onClick={() => libraryMutation.mutate({ kind: "add-source" })}
          type="button"
          variant="outline"
        >
          Add another source
        </Button>
        <Button
          className="text-secondary hover:bg-raised hover:text-primary"
          render={<Link to="/settings" />}
          variant="ghost"
        >
          Manage sources
        </Button>
      </div>
    </div>
  );
}
