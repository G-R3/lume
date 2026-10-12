import { CaretDownIcon } from "@phosphor-icons/react";
import type { MusicLibrary } from "../../../shared/lib";
import { FilterField } from "@/components/filter-field";
import { LibraryOnboarding } from "@/motion-lab/scan/library-empty-state";
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
import { TrackList } from "@/motion-lab/scan/track-list";

export function TracksPage() {
  const library = useMusicLibrary();
  const sort = useTrackSort();

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
          <h1 className="shrink-0 text-title font-semibold text-primary">Tracks</h1>
          <p className="truncate text-meta text-secondary tabular-nums">
            <span data-slot="track-count">{library.tracks.length.toLocaleString()}</span>
            <span className="inline-block whitespace-pre" data-slot="track-stat-rest">
              {" · "}
              {formatTotalDuration(totalDuration)}
              {unavailableCount > 0 && ` · ${unavailableCount.toLocaleString()} unavailable`}
            </span>
          </p>
        </div>
        <FilterField aria-label="Filter tracks" className="w-56" placeholder="Filter tracks" />
        <SortMenu />
      </header>
      <LibraryStatus library={library} />
      {items.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto" data-scroll-container>
          <TrackList caption="Tracks" items={items} />
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
      {/* Choosing a sort closes the menu, so focus goes back to the trigger however it was chosen */}
      <DropdownMenuContent align="end" finalFocus>
        <DropdownMenuRadioGroup onValueChange={setTrackSort} value={sort}>
          {trackSorts.map((option) => (
            <DropdownMenuRadioItem closeOnClick key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Frame 07b C when a scanned folder held no audio; frame 07 when no folder is left. */
function EmptyLibrary({ library }: { library: MusicLibrary }) {
  const libraryMutation = useLibraryMutation();
  const emptySource = library.sources.find((source) => source.lastScannedAt !== null);

  const chooseFolder = (label: string) => (
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
              {chooseFolder("Choose another folder…")}
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
          actions={chooseFolder("Choose folder…")}
          busy={libraryMutation.isPending}
          description="Choose a folder of audio files. Lume plays them where they are."
          errorMessage={libraryMutation.error?.message}
          title="Add your music"
        />
      )}
    </div>
  );
}
