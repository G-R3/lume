import { XIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import type { LibrarySource, ScanFailure } from "../../shared/lib";

export function ScanErrorToast({
  failures,
  onDismiss,
  sources,
}: {
  failures: readonly ScanFailure[];
  onDismiss: () => void;
  sources: readonly LibrarySource[];
}) {
  useEffect(() => {
    if (failures.length === 0) return;

    const timeout = window.setTimeout(onDismiss, 8_000);
    return () => window.clearTimeout(timeout);
  }, [failures, onDismiss]);

  const failure = failures[0];
  if (!failure) return null;

  const source = sources.find((source) => source.id === failure.sourceId);
  const sourceName = source?.path.split(/[/\\]/).filter(Boolean).at(-1);
  const title =
    failures.length === 1
      ? `${sourceName ?? "A source"} could not be scanned`
      : `${failures.length.toLocaleString()} sources could not be scanned`;

  return (
    <div
      className="fixed right-4 bottom-24 z-60 w-full max-w-sm border border-amber-900 bg-neutral-950 p-4 shadow-2xl"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-300">{title}</p>
          <p className="mt-1 text-xs leading-5 text-neutral-400">{failure.error}</p>
          {failures.length > 1 && (
            <p className="mt-2 text-xs text-neutral-600">Open Sources to review each folder.</p>
          )}
        </div>
        <button
          aria-label="Dismiss scan error"
          className="grid size-6 shrink-0 cursor-pointer place-items-center text-neutral-500 hover:text-neutral-200"
          onClick={onDismiss}
          type="button"
        >
          <XIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
