import { DotsThreeIcon, FolderMinusIcon, PlusIcon } from "@phosphor-icons/react";
import type { MusicLibrary } from "../../../shared/lib";
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
import { type FolderPresentation, presentLibrarySources } from "@/lib/source-presentation";
import { cn } from "@/lib/utils";

type LibraryMutation = ReturnType<typeof useLibraryMutation>;

type LibraryCommand = Parameters<LibraryMutation["mutate"]>[0];

export function FolderSettings({ library }: { library: MusicLibrary }) {
  const libraryMutation = useLibraryMutation();
  const { folders } = presentLibrarySources(library, useMinuteClock());
  const pending = libraryMutation.isPending ? libraryMutation.variables : undefined;

  const run = (command: LibraryCommand, failure: string) =>
    libraryMutation.mutate(command, {
      onError: (error) => {
        toast.add({ description: error.message, title: failure, type: "error" });
      },
    });

  const isScanning = (folder: FolderPresentation) =>
    pending?.kind === "rescan-sources"
      ? folder.enabled
      : (pending?.kind === "rescan-source" ||
          (pending?.kind === "set-source-enabled" && pending.enabled)) &&
        pending.sourceId === folder.id;

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
          Add folder
        </Button>
      </header>

      {folders.length === 0 ? (
        <div className="flex flex-1 justify-center border-t border-separator px-6 pt-24">
          <div className="flex w-100 flex-col gap-2">
            <h2 className="text-title font-semibold text-primary">No folders</h2>
            <p className="text-copy text-secondary">
              Add a folder of audio files to build your library. Lume plays them where they are.
            </p>
          </div>
        </div>
      ) : (
        <div className="@container min-h-0 flex-1 overflow-y-auto scroll-area-scrollbar">
          <table className="w-full table-fixed border-separate border-spacing-0 px-2 select-none">
            <caption className="sr-only">Folders</caption>
            <thead className="sticky top-0 z-10 text-left font-mono text-meta text-secondary">
              <tr className="*:h-8 *:border-b *:border-separator *:bg-page *:font-normal *:first:relative *:first:before:absolute *:first:before:top-0 *:first:before:right-full *:first:before:-bottom-px *:first:before:w-2 *:first:before:border-b *:first:before:border-separator *:first:before:bg-page *:last:relative *:last:after:absolute *:last:after:top-0 *:last:after:-bottom-px *:last:after:left-full *:last:after:w-2 *:last:after:border-b *:last:after:border-separator *:last:after:bg-page">
                <th className="pl-4" scope="col">
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
              {folders.map((folder) => (
                <FolderRow
                  folder={folder}
                  isBusy={libraryMutation.isPending}
                  isScanning={isScanning(folder)}
                  key={folder.id}
                  onForget={() =>
                    run({ kind: "forget-source", sourceId: folder.id }, "Couldn’t forget folder")
                  }
                  onRescan={() =>
                    run({ kind: "rescan-source", sourceId: folder.id }, "Couldn’t scan folder")
                  }
                  onToggle={() =>
                    run(
                      { enabled: !folder.enabled, kind: "set-source-enabled", sourceId: folder.id },
                      folder.enabled ? "Couldn’t turn folder off" : "Couldn’t turn folder on",
                    )
                  }
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
  folder,
  isBusy,
  isScanning,
  onForget,
  onRescan,
  onToggle,
}: {
  folder: FolderPresentation;
  isBusy: boolean;
  isScanning: boolean;
  onForget: () => void;
  onRescan: () => void;
  onToggle: () => void;
}) {
  const { hasIssue, name } = folder;
  const isOff = !folder.enabled;

  const revealOnHover =
    "opacity-0 group-hover/folder:opacity-100 group-has-focus-visible/folder:opacity-100";

  return (
    <tr className="group/folder *:h-10 *:first:rounded-l-md *:last:rounded-r-md hover:*:bg-hover">
      <td className="pl-4">
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
            title={folder.path}
          >
            {folder.path}
          </p>
        </div>
      </td>
      <td className="hidden pl-4 @3xl:table-cell">
        <p
          className={cn(
            "truncate text-meta",
            hasIssue && !isScanning ? "text-primary" : "text-secondary",
          )}
          title={folder.tooltip}
        >
          {isScanning ? "Scanning…" : folder.statusText}
        </p>
      </td>
      <td className="pl-4 text-right font-mono text-meta text-secondary tabular-nums">
        {folder.trackCountText}
      </td>
      <td className="pl-4">
        <div className="flex items-center justify-end gap-1">
          {folder.scanLabel && (
            <Button
              busy={isScanning}
              disabled={isBusy}
              onClick={onRescan}
              size="sm"
              type="button"
              variant={folder.scanLabel === "Scan again" ? "secondary" : "ghost"}
            >
              {folder.scanLabel}
            </Button>
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
          checked={folder.enabled}
          disabled={isBusy}
          onCheckedChange={onToggle}
        />
      </td>
    </tr>
  );
}
