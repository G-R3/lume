import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { PlaylistDetails } from "../../shared/lib";
import { FilterField, type FilterFieldHandle } from "@/components/filter-field";
import { FilterNoResults } from "@/components/filter-no-results";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { playlistQueryOptions } from "@/lib/playlist-query";
import { matchesTrackFilter, parseTrackFilter } from "@/lib/track-filter";
import { playlistRows, sortRows } from "@/lib/track-sort";
import { useViewSort } from "@/lib/view-sort";
import { PlaylistHeader } from "@/pages/playlist/playlist-header";
import { TrackList, type TrackListHandle, TrackListSkeleton } from "@/pages/tracks/track-list";
import { isListBackgroundPointerDown } from "@/pages/tracks/list-background-pointer";

export function PlaylistPage() {
  const navigate = useNavigate();
  const { playlistId } = useParams({ from: "/_app/playlists/$playlistId" });
  const playlist = useQuery(playlistQueryOptions(playlistId));

  useEffect(() => {
    if (playlist.data === null) {
      void navigate({ replace: true, to: "/" });

      return;
    }

    if (!playlist.error) return;

    toast.add({
      description: "Returning to Tracks.",
      priority: "high",
      title: "Could not open playlist",
      type: "error",
    });
    void navigate({ replace: true, to: "/" });
  }, [navigate, playlist.data, playlist.error]);

  if (playlist.data === undefined) return <PlaylistPageSkeleton playlistId={playlistId} />;

  if (playlist.data === null) return null;

  return <PlaylistContent key={playlist.data.id} playlist={playlist.data} />;
}

export function PlaylistContent({ playlist }: { playlist: PlaylistDetails }) {
  const library = useMusicLibrary();

  const [filterText, setFilterText] = useState("");
  const deferredFilterText = useDeferredValue(filterText);
  const filter = playlist.tracks.length > 0 ? parseTrackFilter(deferredFilterText) : null;
  const filterRef = useRef<FilterFieldHandle>(null);
  const trackListRef = useRef<TrackListHandle>(null);
  const tracksById = new Map(library.tracks.map((track) => [track.id, track]));
  const source = { kind: "playlist", playlistId: playlist.id, title: playlist.title } as const;
  const [sort, stepSort] = useViewSort(source);
  const sorted = sortRows(source, playlistRows(playlist, tracksById), sort);
  const items = filter ? sorted.filter((row) => matchesTrackFilter(row.track, filter)) : sorted;

  const clearFilter = () => {
    setFilterText("");
    filterRef.current?.focus();
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      <PlaylistHeader
        filter={filter?.normalizedText ?? null}
        filterField={
          playlist.tracks.length > 0 && (
            <FilterField
              aria-label={`Filter ${playlist.title}`}
              className="w-56"
              onValueChange={setFilterText}
              placeholder="Filter tracks"
              ref={filterRef}
              value={filterText}
            />
          )
        }
        items={items}
        onStepSort={stepSort}
        playlist={playlist}
        sort={sort}
      />
      {playlist.tracks.length === 0 ? (
        <div className="flex flex-1 justify-center border-t border-separator px-6 pt-24">
          <div className="flex w-100 flex-col gap-2" data-slot="playlist-empty">
            <h2 className="text-title font-semibold text-primary">Nothing here yet</h2>
            <p className="text-copy text-secondary">
              Open a track’s menu and choose Add to playlist…
            </p>
            <div className="pt-4">
              <Link className={buttonVariants({ variant: "secondary" })} to="/">
                Browse tracks
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto has-data-[selection-bar]:scroll-pb-24"
          data-scroll-container
          onPointerDown={(event) => {
            if (isListBackgroundPointerDown(event)) trackListRef.current?.clearSelection();
          }}
        >
          <TrackList
            caption={playlist.title}
            filter={filter?.normalizedText ?? null}
            items={items}
            onStepSort={stepSort}
            ref={trackListRef}
            sort={sort}
            source={source}
          />
          {filter && items.length === 0 && (
            <FilterNoResults filterText={filter.text} onClear={clearFilter} />
          )}
        </div>
      )}
    </main>
  );
}

export function PlaylistPageSkeleton({ playlistId }: { playlistId: number }) {
  const [sort] = useViewSort({ kind: "playlist", playlistId });

  return (
    <main aria-busy="true" aria-label="Loading playlist" className="flex min-h-0 flex-1 flex-col">
      <header aria-hidden="true" className="flex h-22 shrink-0 items-center gap-4 pr-4 pl-6">
        <span className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center justify-items-start gap-x-4 gap-y-1">
          <span className="h-4 w-50 rounded-sm bg-raised" />
          <span className="flex translate-y-0.75 items-center gap-2 pr-10">
            <span className="h-8 w-17 rounded-md bg-raised" />
            <span className="h-8 w-22 rounded-md bg-raised" />
          </span>
          <span className="col-start-1 my-1 h-2 w-80 rounded-xs bg-raised" />
        </span>
      </header>
      <TrackListSkeleton isPlaylist sort={sort} />
    </main>
  );
}
