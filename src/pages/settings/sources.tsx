import type { MusicLibrary } from "../../../shared/lib";
import { Button } from "@/components/ui/button";
import { useLibraryMutation } from "@/lib/library-query";
import { cn } from "@/lib/utils";
import { getSourceName } from "@/lib/source-name";

const scanDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SourceSettings({ library }: { library: MusicLibrary }) {
  const libraryMutation = useLibraryMutation();

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <header className="flex items-start justify-between gap-8 border-b border-neutral-800 pb-8">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">Library sources</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Lume reads audio files from enabled folders. Disabling or forgetting a source does not
            delete its files or saved track state.
          </p>
        </div>
        <Button
          className="bg-lime-300 text-neutral-950 hover:bg-lime-200"
          disabled={libraryMutation.isPending}
          onClick={() => libraryMutation.mutate({ kind: "add-source" })}
          type="button"
        >
          Add source
        </Button>
      </header>

      {libraryMutation.error && (
        <p className="border-b border-red-950 py-4 text-sm text-red-300" role="alert">
          {libraryMutation.error.message}
        </p>
      )}

      <div className="divide-y divide-neutral-800">
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
                <h3 className="text-sm font-medium text-neutral-100">{name}</h3>
                <p className="mt-1 truncate text-xs text-neutral-500" title={source.path}>
                  {source.path}
                </p>
                <p
                  className={cn(
                    "mt-2 text-xs",
                    source.lastScanError ? "text-amber-400" : "text-neutral-400",
                  )}
                >
                  {status}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {source.enabled && (
                  <Button
                    className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50"
                    disabled={libraryMutation.isPending}
                    onClick={() =>
                      libraryMutation.mutate({ kind: "rescan-source", sourceId: source.id })
                    }
                    type="button"
                    variant="outline"
                  >
                    {source.lastScanError ? "Try again" : "Rescan"}
                  </Button>
                )}
                <Button
                  className="text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                  disabled={libraryMutation.isPending}
                  onClick={() =>
                    libraryMutation.mutate({ kind: "forget-source", sourceId: source.id })
                  }
                  type="button"
                  variant="ghost"
                >
                  Forget
                </Button>
                <button
                  aria-checked={source.enabled}
                  aria-label={`${source.enabled ? "Disable" : "Enable"} ${name}`}
                  className={cn(
                    "relative h-5 w-9 cursor-pointer rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-50",
                    source.enabled
                      ? "border-lime-300 bg-lime-300"
                      : "border-neutral-700 bg-neutral-800",
                  )}
                  disabled={libraryMutation.isPending}
                  onClick={() =>
                    libraryMutation.mutate({
                      enabled: !source.enabled,
                      kind: "set-source-enabled",
                      sourceId: source.id,
                    })
                  }
                  role="switch"
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-0.5 size-3.5 rounded-full bg-neutral-950 transition-transform",
                      source.enabled ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {library.sources.length === 0 && !libraryMutation.isPending && (
        <div className="border-b border-neutral-800 py-12 text-center">
          <h3 className="text-sm font-medium">No library sources</h3>
          <p className="mt-2 text-xs text-neutral-500">
            Add a folder to start building your library.
          </p>
        </div>
      )}

      <p className="mt-6 max-w-2xl text-xs leading-5 text-neutral-600">
        Tracks from disabled and forgotten sources remain saved as unavailable. Permanent track
        removal is a separate action.
      </p>
    </div>
  );
}
