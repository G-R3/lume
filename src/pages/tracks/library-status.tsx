import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { MusicLibrary } from "../../../shared/lib";
import { Button } from "@/components/ui/button";
import { useLibraryMutation } from "@/lib/library-query";
import { getSourceName } from "@/lib/source-name";
import { cn } from "@/lib/utils";

export function LibraryStatus({ library }: { library: MusicLibrary }) {
  const libraryMutation = useLibraryMutation();
  const failedSource = library.sources.find((source) => source.enabled && source.lastScanError);
  const unavailableCount = library.tracks.filter((track) => !track.available).length;

  const scanAgain = (command: Parameters<typeof libraryMutation.mutate>[0]) => (
    <Button
      busy={libraryMutation.isPending}
      onClick={() => libraryMutation.mutate(command)}
      size="sm"
      type="button"
    >
      Scan again
    </Button>
  );

  const manageFolders = (variant: "ghost" | "secondary") => (
    <Button nativeButton={false} render={<Link to="/settings" />} size="sm" variant={variant}>
      Manage folders
    </Button>
  );

  if (libraryMutation.error) {
    return (
      <Notice role="alert" title={libraryMutation.error.message} tone="danger">
        {manageFolders("ghost")}
      </Notice>
    );
  }

  if (failedSource) {
    const name = getSourceName(failedSource.path);
    const isMissing = failedSource.lastScanError?.includes("ENOENT");

    return (
      <Notice
        detail={isMissing ? "Its tracks can’t play until it’s back." : failedSource.lastScanError}
        title={isMissing ? `${name} isn’t connected` : `${name} couldn’t be scanned`}
        tone="danger"
      >
        {scanAgain({ kind: "rescan-source", sourceId: failedSource.id })}
        {manageFolders("ghost")}
      </Notice>
    );
  }

  if (library.sources.length > 0 && library.sources.every((source) => !source.enabled)) {
    return <Notice title="All folders are off">{manageFolders("secondary")}</Notice>;
  }

  if (unavailableCount > 0 && library.sources.every((source) => source.enabled)) {
    return (
      <Notice
        detail="Their files were moved or deleted."
        title={`${unavailableCount.toLocaleString()} ${unavailableCount === 1 ? "track is" : "tracks are"} unavailable`}
      >
        {scanAgain({ kind: "rescan-sources" })}
      </Notice>
    );
  }

  return null;
}

function Notice({
  children,
  detail,
  role,
  title,
  tone = "neutral",
}: {
  children: ReactNode;
  detail?: string | null;
  role?: "alert";
  title: string;
  tone?: "danger" | "neutral";
}) {
  return (
    <div className="px-2 pb-2" data-slot="library-notice">
      <div
        className="flex h-12 items-center gap-3 rounded-lg bg-raised px-4 surface-raised inset-ring inset-ring-default"
        role={role}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            tone === "danger" ? "bg-danger" : "bg-current text-tertiary",
          )}
        />
        <p className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="max-w-full shrink-0 truncate text-body font-medium text-primary">
            {title}
          </span>
          {detail && (
            <span className="truncate text-meta text-secondary" title={detail}>
              {detail}
            </span>
          )}
        </p>
        {children}
      </div>
    </div>
  );
}
