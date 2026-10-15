import { DotsThreeIcon, FolderIcon, FolderMinusIcon, PlusIcon } from "@phosphor-icons/react";
import type { LibrarySource, MusicLibrary } from "../../../shared/lib";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useLibraryMutation } from "@/lib/library-query";
import { getSourceName } from "@/lib/source-name";
import { cn } from "@/lib/utils";

type LibraryMutation = ReturnType<typeof useLibraryMutation>;

type LibraryCommand = Parameters<LibraryMutation["mutate"]>[0];

export function FolderSettings({ library }: { library: MusicLibrary }) {
  const libraryMutation = useLibraryMutation();
  const now = useMinuteClock();
  const pending = libraryMutation.isPending ? libraryMutation.variables : undefined;

  const run = (command: LibraryCommand, failure: string) =>
    libraryMutation.mutate(command, {
      onError: (error) => {
        toast.add({ description: error.message, title: failure, type: "error" });
      },
    });

  const isScanning = (source: LibrarySource) =>
    pending?.kind === "rescan-sources"
      ? source.enabled
      : (pending?.kind === "rescan-source" ||
          (pending?.kind === "set-source-enabled" && pending.enabled)) &&
        pending.sourceId === source.id;

  const isAdding = pending?.kind === "add-source";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 px-6" data-slot="page-header">
        <h1 className="min-w-0 flex-1 truncate text-title font-semibold text-primary">Folders</h1>
        <Button
          busy={isAdding}
          disabled={libraryMutation.isPending}
          onClick={() => run({ kind: "add-source" }, "Couldn’t add folder")}
          type="button"
          variant="primary"
        >
          {!isAdding && (
            <PlusIcon aria-hidden="true" className="size-3.5" data-icon="inline-start" />
          )}
          Add folder…
        </Button>
      </header>

      {library.sources.length === 0 ? (
        <div className="flex flex-1 justify-center border-t border-separator px-6 pt-24">
          <div className="flex w-100 flex-col gap-2">
            <h2 className="text-title font-semibold text-primary">No folders</h2>
            <p className="text-copy text-secondary">
              Add a folder of audio files to build your library. Lume plays them where they are.
            </p>
          </div>
        </div>
      ) : (
        <div className="@container min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 px-2">
            <caption className="sr-only">Folders</caption>
            <thead className="sticky top-0 z-10 text-left font-mono text-meta tracking-[0.08em] text-secondary uppercase">
              <tr className="*:h-8 *:border-b *:border-separator *:bg-page *:font-normal *:first:relative *:first:before:absolute *:first:before:top-0 *:first:before:right-full *:first:before:-bottom-px *:first:before:w-2 *:first:before:border-b *:first:before:border-separator *:first:before:bg-page *:last:relative *:last:after:absolute *:last:after:top-0 *:last:after:-bottom-px *:last:after:left-full *:last:after:w-2 *:last:after:border-b *:last:after:border-separator *:last:after:bg-page">
                <th className="pl-14" scope="col">
                  Folder
                </th>
                <th className="hidden w-74 pl-4 @3xl:table-cell" scope="col">
                  Status
                </th>
                <th className="w-20 pl-4 text-right" scope="col">
                  Tracks
                </th>
                <th className="w-32 pl-4" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
                <th className="w-15 pr-4 pl-4" scope="col">
                  <span className="sr-only">On</span>
                </th>
              </tr>
            </thead>
            <tbody className="before:table-row before:h-1">
              {library.sources.map((source) => (
                <FolderRow
                  isBusy={libraryMutation.isPending}
                  isScanning={isScanning(source)}
                  key={source.id}
                  now={now}
                  onForget={() =>
                    run({ kind: "forget-source", sourceId: source.id }, "Couldn’t forget folder")
                  }
                  onRescan={() =>
                    run({ kind: "rescan-source", sourceId: source.id }, "Couldn’t scan folder")
                  }
                  onToggle={() =>
                    run(
                      { enabled: !source.enabled, kind: "set-source-enabled", sourceId: source.id },
                      source.enabled ? "Couldn’t turn folder off" : "Couldn’t turn folder on",
                    )
                  }
                  source={source}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FolderRow({
  isBusy,
  isScanning,
  now,
  onForget,
  onRescan,
  onToggle,
  source,
}: {
  isBusy: boolean;
  isScanning: boolean;
  now: number;
  onForget: () => void;
  onRescan: () => void;
  onToggle: () => void;
  source: LibrarySource;
}) {
  const name = getSourceName(source.path);
  const isOff = !source.enabled;
  const hasError = source.enabled && source.lastScanError !== null;
  const isEmpty = source.lastScannedAt !== null && source.trackCount === 0;

  const status = isScanning
    ? "Scanning…"
    : isOff
      ? "Off"
      : hasError
        ? source.lastScanError?.includes("ENOENT")
          ? `Not connected${source.lastScannedAt === null ? "" : ` · last scanned ${formatScanTime(source.lastScannedAt, now)}`}`
          : `Couldn’t scan · ${source.lastScanError}`
        : source.lastScannedAt === null
          ? "Not scanned yet"
          : isEmpty
            ? "No audio found"
            : `Scanned ${formatScanTime(source.lastScannedAt, now)}`;

  const revealOnHover =
    "opacity-0 group-hover/folder:opacity-100 group-has-focus-visible/folder:opacity-100";

  return (
    <tr className="group/folder *:h-10 *:first:rounded-l-md *:last:rounded-r-md hover:*:bg-hover">
      <td className="pl-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-raised inset-ring inset-ring-default">
            <FolderIcon
              aria-hidden="true"
              className={cn("size-4 text-secondary", isOff && "opacity-disabled")}
            />
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-body font-medium",
                isOff ? "text-tertiary" : "text-primary",
              )}
            >
              {name}
            </p>
            <p
              className={cn(
                "truncate font-mono text-meta",
                isOff ? "text-disabled" : "text-secondary",
              )}
              title={source.path}
            >
              {source.path}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden pl-4 @3xl:table-cell">
        <p className="flex min-w-0 items-center gap-2 text-meta">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              isScanning ? "bg-accent" : hasError ? "bg-danger" : "bg-current text-faint",
            )}
          />
          <span
            className={cn("truncate", hasError && !isScanning ? "text-primary" : "text-secondary")}
            title={hasError ? (source.lastScanError ?? undefined) : undefined}
          >
            {status}
          </span>
        </p>
      </td>
      <td
        className={cn(
          "pl-4 text-right font-mono text-meta tabular-nums",
          isOff || hasError ? "text-disabled" : "text-secondary",
        )}
      >
        {isOff || hasError ? "—" : source.trackCount.toLocaleString()}
      </td>
      <td className="pl-4">
        <div className="flex items-center justify-end gap-1">
          {hasError ? (
            <Button busy={isScanning} disabled={isBusy} onClick={onRescan} size="sm" type="button">
              Scan again
            </Button>
          ) : (
            !isOff && (
              <Button
                busy={isScanning}
                disabled={isBusy}
                onClick={onRescan}
                size="sm"
                type="button"
                variant="ghost"
              >
                Rescan
              </Button>
            )
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={`More options for ${name}`}
                  className={cn(revealOnHover, "data-popup-open:opacity-100")}
                  disabled={isBusy}
                  onMouseDown={(event) => event.preventDefault()}
                  size="icon-sm"
                  static
                  variant="row-action"
                />
              }
            >
              <DotsThreeIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onForget} variant="danger">
                <FolderMinusIcon aria-hidden="true" />
                Forget folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
      <td className="pr-4 pl-4">
        <Switch
          aria-label={`Enable ${name}`}
          checked={source.enabled}
          disabled={isBusy}
          onCheckedChange={onToggle}
        />
      </td>
    </tr>
  );
}

const scanDateFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const scanDateWithYearFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatScanTime(scannedAt: number, now: number) {
  const minutes = Math.floor((now - scannedAt) / 60_000);

  if (minutes < 1) return "just now";

  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  return new Date(scannedAt).getFullYear() === new Date(now).getFullYear()
    ? scanDateFormatter.format(scannedAt)
    : scanDateWithYearFormatter.format(scannedAt);
}
