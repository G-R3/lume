import type { MusicLibrary } from "../../../shared/lib";
import { Button } from "@/components/ui/button";
import { useLibraryMutation } from "@/lib/library-query";
import { cn } from "@/lib/utils";
import { getSourceName } from "@/lib/source-name";
import { Switch } from "@/components/ui/switch";

const scanDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SourceSettings({ library }: { library: MusicLibrary }) {
  const libraryMutation = useLibraryMutation();

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <header className="flex items-start justify-between gap-8 border-b border-default pb-8">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">Library sources</h2>
          <p className="mt-2 text-sm leading-6 text-secondary">
            Lume reads audio files from enabled folders. Disabling or forgetting a source does not
            delete its files or saved track state.
          </p>
        </div>
        <Button
          disabled={libraryMutation.isPending}
          onClick={() => libraryMutation.mutate({ kind: "add-source" })}
          type="button"
          variant="primary"
        >
          Add source
        </Button>
      </header>

      {libraryMutation.error && (
        <p className="border-b border-danger/30 py-4 text-sm text-danger" role="alert">
          {libraryMutation.error.message}
        </p>
      )}

      <div className="divide-y divide-separator">
        {library.sources.map((source) => {
          const name = getSourceName(source.path);

          const status = source.lastScanError
            ? source.lastScanError
            : !source.enabled
              ? "Disabled"
              : source.lastScannedAt !== null && source.trackCount === 0
                ? "No supported audio found"
                : source.lastScannedAt
                  ? `Last scanned ${scanDateFormatter.format(source.lastScannedAt)}`
                  : "Not scanned yet";

          return (
            <article className="flex items-center gap-8 py-5" key={source.id}>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-primary">{name}</h3>
                <p className="mt-1 truncate text-xs text-tertiary" title={source.path}>
                  {source.path}
                </p>
                <p
                  className={cn(
                    "mt-2 text-xs",
                    source.lastScanError ? "text-danger" : "text-secondary",
                  )}
                >
                  {status}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {source.enabled && (
                  <Button
                    disabled={libraryMutation.isPending}
                    onClick={() =>
                      libraryMutation.mutate({ kind: "rescan-source", sourceId: source.id })
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {source.lastScanError ? "Try again" : "Rescan"}
                  </Button>
                )}
                <Button
                  disabled={libraryMutation.isPending}
                  onClick={() =>
                    libraryMutation.mutate({ kind: "forget-source", sourceId: source.id })
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Forget
                </Button>

                <Switch
                  checked={source.enabled}
                  aria-label={`Enable ${name}`}
                  disabled={libraryMutation.isPending}
                  onCheckedChange={() => {
                    libraryMutation.mutate({
                      enabled: !source.enabled,
                      kind: "set-source-enabled",
                      sourceId: source.id,
                    });
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>

      {library.sources.length === 0 && !libraryMutation.isPending && (
        <div className="border-b border-default py-12 text-center">
          <h3 className="text-sm font-medium">No library sources</h3>
          <p className="mt-2 text-xs text-tertiary">Add a folder to start building your library.</p>
        </div>
      )}

      <p className="mt-6 max-w-2xl text-xs leading-5 text-disabled">
        Tracks from disabled and forgotten sources remain saved as unavailable. Permanent track
        removal is a separate action.
      </p>
    </div>
  );
}
