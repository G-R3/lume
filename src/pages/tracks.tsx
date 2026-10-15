import { useLayoutEffect } from "react";
import { TrackCount } from "@/pages/tracks/track-count";
import { useFirstScan } from "@/hooks/use-first-scan";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { MusicLibrary } from "../../shared/lib";
import { FilterField } from "@/components/filter-field";
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
import { setTrackSort, sortTracks, trackSorts, useTrackSort } from "@/lib/track-sort";
import { LibraryStatus } from "@/pages/tracks/library-status";
import { TrackList } from "@/pages/tracks/track-list";

export function TracksPage() {
  const library = useMusicLibrary();
  const sort = useTrackSort();
  const firstScan = useFirstScan();
  const onListReady = firstScan.onListReady;

  useLayoutEffect(() => {
    if (library.tracks.length === 0) onListReady(null);
  }, [library.tracks.length, onListReady]);

  const isEmpty =
    library.tracks.length === 0 &&
    library.sources.every((source) => source.enabled && !source.lastScanError);

  if (isEmpty) return <EmptyLibrary library={library} />;

  const items = sortTracks(library.tracks, sort).map((track) => ({
    sourceEntryId: track.id,
    track,
  }));

  const unavailableCount = library.tracks.filter((track) => !track.available).length;
  const totalDuration = library.tracks.reduce((total, track) => total + (track.duration ?? 0), 0);

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
            <TrackCount total={library.tracks.length} isRevealing={firstScan.isRevealing}>
              {" · "}
              {formatTotalDuration(totalDuration)}
              {unavailableCount > 0 && ` · ${unavailableCount.toLocaleString()} unavailable`}
            </TrackCount>
          </p>
        </div>
        <FilterField aria-label="Filter tracks" className="w-56" placeholder="Filter tracks" />
        <SortMenu />
      </header>
      <LibraryStatus library={library} />
      {items.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto" data-scroll-container>
          <TrackList caption="Tracks" items={items} onReady={onListReady} />
        </div>
      )}
    </div>
  );
}

function SortMenu() {
  const sort = useTrackSort();
  const label = trackSorts.find((option) => option.value === sort)?.label;

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
        <DropdownMenuRadioGroup onValueChange={setTrackSort} value={sort}>
          {trackSorts.map((option) => (
            <DropdownMenuRadioItem
              className="pr-10"
              closeOnClick
              key={option.value}
              value={option.value}
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
