import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useLibraryMutation } from "@/lib/library-query";
import type { SourceNotice } from "@/lib/source-presentation";

export function LibraryStatus({ notice }: { notice: SourceNotice }) {
  const libraryMutation = useLibraryMutation();

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
      <Notice role="alert" title={libraryMutation.error.message}>
        {manageFolders("ghost")}
      </Notice>
    );
  }

  switch (notice.kind) {
    case "issue":
      return (
        <Notice detail={notice.detail} title={notice.title}>
          {scanAgain({ kind: "rescan-source", sourceId: notice.sourceId })}
          {manageFolders("ghost")}
        </Notice>
      );
    case "off":
      return <Notice title={notice.title}>{manageFolders("secondary")}</Notice>;
    case "unavailable":
      return (
        <Notice detail={notice.detail} title={notice.title}>
          {scanAgain({ kind: "rescan-sources" })}
        </Notice>
      );
    case "none":
      return null;
  }
}

function Notice({
  children,
  detail,
  role,
  title,
}: {
  children: ReactNode;
  detail?: string | null;
  role?: "alert";
  title: string;
}) {
  return (
    <div
      className="flex h-10 shrink-0 items-center gap-3 pr-4 pl-6"
      data-slot="library-notice"
      role={role}
    >
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
  );
}
