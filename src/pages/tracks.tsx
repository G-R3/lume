import { useDeferredValue, useLayoutEffect, useRef, useState } from "react";
import { TrackCount } from "@/pages/tracks/track-count";
import { useLibraryReveal } from "@/hooks/use-onboarding";
import { FilterField, type FilterFieldHandle } from "@/components/filter-field";
import { FilterNoResults } from "@/components/filter-no-results";
import { LibraryOnboarding } from "@/components/library-onboarding";
import { SortMenu } from "@/components/sort-menu";
import { Button } from "@/components/ui/button";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { formatTotalDuration } from "@/lib/format-duration";
import { useLibraryMutation } from "@/lib/library-query";
import { presentLibrarySources, type SourceEmpty } from "@/lib/source-presentation";
import { matchesTrackFilter, parseTrackFilter } from "@/lib/track-filter";
import { libraryRows, sortRows } from "@/lib/track-sort";
import { useViewSort } from "@/lib/view-sort";
import { LibraryStatus } from "@/pages/tracks/library-status";
import { TrackList } from "@/components/track-list/track-list";

const allTracks = { kind: "all-tracks" } as const;

export function TracksPage() {
  const library = useMusicLibrary();
  const [sort, stepSort] = useViewSort(allTracks);
  const reveal = useLibraryReveal();
  const onListReady = reveal.onListReady;
  const [filterText, setFilterText] = useState("");
  const filter = parseTrackFilter(useDeferredValue(filterText));
  const filterRef = useRef<FilterFieldHandle>(null);
  const sources = presentLibrarySources(library, useMinuteClock());

  useLayoutEffect(() => {
    if (library.tracks.length === 0) onListReady(null);
  }, [library.tracks.length, onListReady]);

  if (sources.empty.kind !== "hidden") return <EmptyLibrary empty={sources.empty} />;

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
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 pr-4 pl-6" data-slot="page-header">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1 className="shrink-0 text-title font-semibold text-primary">Tracks</h1>
          <p className="truncate text-meta text-secondary tabular-nums">
            {filter ? (
              <>
                {items.length.toLocaleString()} {items.length === 1 ? "track" : "tracks"}
                {" · "}
                {formatTotalDuration(totalDuration)}
                {unavailableText}
              </>
            ) : (
              <TrackCount total={library.tracks.length} isRevealing={reveal.isRevealing}>
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
        <SortMenu onStepSort={stepSort} sort={sort} />
      </header>
      <LibraryStatus notice={sources.notice} />
      {(items.length > 0 || filter) && (
        <TrackList
          caption="Tracks"
          filter={filter?.normalizedText ?? null}
          items={items}
          onReady={onListReady}
          onStepSort={stepSort}
          sort={sort}
          source={allTracks}
        >
          {filter && items.length === 0 && (
            <FilterNoResults filterText={filter.text} onClear={clearFilter} />
          )}
        </TrackList>
      )}
    </div>
  );
}

function EmptyLibrary({ empty }: { empty: Exclude<SourceEmpty, { kind: "hidden" }> }) {
  const libraryMutation = useLibraryMutation();

  const chooseFolderButton = (
    <Button
      busy={libraryMutation.isPending && libraryMutation.variables?.kind === "add-source"}
      disabled={libraryMutation.isPending}
      onClick={() => libraryMutation.mutate({ kind: "add-source" })}
      type="button"
      variant="primary"
    >
      {empty.chooseLabel}
    </Button>
  );

  return (
    <div className="flex flex-1 justify-center px-6 pt-54">
      <LibraryOnboarding
        actions={
          empty.kind === "no-audio" ? (
            <>
              {chooseFolderButton}
              <Button
                busy={libraryMutation.isPending && libraryMutation.variables?.kind !== "add-source"}
                disabled={libraryMutation.isPending}
                onClick={() =>
                  libraryMutation.mutate({ kind: "rescan-source", sourceId: empty.sourceId })
                }
                type="button"
              >
                Scan again
              </Button>
            </>
          ) : (
            chooseFolderButton
          )
        }
        busy={libraryMutation.isPending}
        description={empty.description}
        errorMessage={libraryMutation.error?.message}
        title={empty.title}
      />
    </div>
  );
}
