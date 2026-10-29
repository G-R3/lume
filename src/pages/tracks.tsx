import { useDeferredValue, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { TrackCount } from "@/pages/tracks/track-count";
import { useFirstScan } from "@/hooks/use-first-scan";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { MusicLibrary } from "../../shared/lib";
import { FilterField, type FilterFieldHandle } from "@/components/filter-field";
import { FilterNoResults } from "@/components/filter-no-results";
import { LibraryOnboarding } from "@/components/library-onboarding";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { formatTotalDuration } from "@/lib/format-duration";
import { useLibraryMutation } from "@/lib/library-query";
import { getSourceName } from "@/lib/source-name";
import { matchesTrackFilter, parseTrackFilter } from "@/lib/track-filter";
import {
  getTrackSort,
  libraryRows,
  setTrackSort,
  sortFieldInfo,
  sortFields,
  sortRows,
  subscribeTrackSort,
  type SortField,
} from "@/lib/track-sort";
import { LibraryStatus } from "@/pages/tracks/library-status";
import { TrackList } from "@/pages/tracks/track-list";

const allTracks = { kind: "all-tracks" } as const;

export function TracksPage() {
  const library = useMusicLibrary();
  const sort = useSyncExternalStore(subscribeTrackSort, getTrackSort);
  const firstScan = useFirstScan();
  const onListReady = firstScan.onListReady;
  const [filterText, setFilterText] = useState("");
  const filter = parseTrackFilter(useDeferredValue(filterText));
  const filterRef = useRef<FilterFieldHandle>(null);

  useLayoutEffect(() => {
    if (library.tracks.length === 0) onListReady(null);
  }, [library.tracks.length, onListReady]);

  const isEmpty =
    library.tracks.length === 0 &&
    library.sources.every((source) => source.enabled && !source.lastScanError);

  if (isEmpty) return <EmptyLibrary library={library} />;

  const sorted = sortRows(allTracks, libraryRows(library.tracks), sort);
  const items = filter ? sorted.filter((row) => matchesTrackFilter(row.track, filter)) : sorted;
  const unavailableCount = items.filter((row) => !row.track.available).length;
  const totalDuration = items.reduce((total, row) => total + (row.track.duration ?? 0), 0);

  const unavailableText =
    unavailableCount > 0 ? ` · ${unavailableCount.toLocaleString()} unavailable` : "";

  const clearFilter = () => {
    setFilterText("");
    filterRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 pr-4 pl-6" data-slot="page-header">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1
            className="shrink-0 text-title font-semibold text-primary"
            data-slot="page-title"
            tabIndex={-1}
          >
            Tracks
          </h1>
          <p className="truncate text-meta text-secondary tabular-nums">
            {filter ? (
              <>
                {items.length.toLocaleString()} {items.length === 1 ? "track" : "tracks"}
                {" · "}
                {formatTotalDuration(totalDuration)}
                {unavailableText}
              </>
            ) : (
              <TrackCount total={library.tracks.length} isRevealing={firstScan.isRevealing}>
                {" · "}
                {formatTotalDuration(totalDuration)}
                {unavailableText}
              </TrackCount>
            )}
          </p>
        </div>
        <FilterField
          aria-label="Filter tracks"
          className="w-56"
          onValueChange={setFilterText}
          placeholder="Filter tracks"
          ref={filterRef}
          value={filterText}
        />
        <SortMenu />
      </header>
      <LibraryStatus library={library} />
      {(items.length > 0 || filter) && (
        <div className="min-h-0 flex-1 overflow-y-auto" data-scroll-container>
          <TrackList
            caption="Tracks"
            filter={filter?.normalizedText ?? null}
            items={items}
            onReady={onListReady}
            source={allTracks}
          />
          {filter && items.length === 0 && (
            <FilterNoResults filterText={filter.text} onClear={clearFilter} />
          )}
        </div>
      )}
    </div>
  );
}

function SortMenu() {
  const sort = useSyncExternalStore(subscribeTrackSort, getTrackSort);
  const label = sortFieldInfo(sort.field).label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Sort: ${label}`}
            className="gap-1 pr-1.5 pl-2 font-normal"
            variant="ghost"
          />
        }
      >
        {label}
        <CaretDownIcon aria-hidden="true" className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" finalFocus>
        <DropdownMenuRadioGroup
          onValueChange={(field: SortField) => setTrackSort(field)}
          value={sort.field}
        >
          {sortFields.map((option) => (
            <DropdownMenuRadioItem
              className="pr-10"
              closeOnClick
              key={option.field}
              value={option.field}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyLibrary({ library }: { library: MusicLibrary }) {
  const libraryMutation = useLibraryMutation();
  const emptySource = library.sources.find((source) => source.lastScannedAt !== null);

  const chooseFolderButton = (label: string) => (
    <Button
      busy={libraryMutation.isPending && libraryMutation.variables?.kind === "add-source"}
      disabled={libraryMutation.isPending}
      onClick={() => libraryMutation.mutate({ kind: "add-source" })}
      type="button"
      variant="primary"
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-1 justify-center px-6 pt-54">
      {emptySource ? (
        <LibraryOnboarding
          actions={
            <>
              {chooseFolderButton("Choose another folder…")}
              <Button
                busy={libraryMutation.isPending && libraryMutation.variables?.kind !== "add-source"}
                disabled={libraryMutation.isPending}
                onClick={() =>
                  libraryMutation.mutate({ kind: "rescan-source", sourceId: emptySource.id })
                }
                type="button"
              >
                Scan again
              </Button>
            </>
          }
          busy={libraryMutation.isPending}
          description="Lume plays FLAC, M4A, MP3, AAC, OGG, OPUS and WAV files."
          errorMessage={libraryMutation.error?.message}
          title={`No audio in “${getSourceName(emptySource.path)}”`}
        />
      ) : (
        <LibraryOnboarding
          actions={chooseFolderButton("Choose folder…")}
          busy={libraryMutation.isPending}
          description="Choose a folder of audio files. Lume plays them where they are."
          errorMessage={libraryMutation.error?.message}
          title="Add your music"
        />
      )}
    </div>
  );
}
