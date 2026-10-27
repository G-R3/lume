import { BackspaceIcon, MinusCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import type { PlaylistDetails } from "../../shared/lib";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuShortcut } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { useRemovePlaylistTrackMutation } from "@/lib/playlist-mutations";
import { playlistQueryOptions } from "@/lib/playlist-query";
import { PlaylistHeader } from "@/pages/playlist/playlist-header";
import { TrackList, type TrackListItem, TrackListSkeleton } from "@/pages/tracks/track-list";

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

  if (playlist.data === undefined) return <PlaylistPageSkeleton />;

  if (playlist.data === null) return null;

  return <PlaylistContent playlist={playlist.data} />;
}

export function PlaylistContent({ playlist }: { playlist: PlaylistDetails }) {
  const library = useMusicLibrary();

  const { isPending: isRemovingTrack, mutate: removePlaylistTrack } =
    useRemovePlaylistTrackMutation();

  const tracksById = new Map(library.tracks.map((track) => [track.id, track]));

  const items = playlist.tracks.flatMap((playlistTrack) => {
    const track = tracksById.get(playlistTrack.trackId);

    return track ? [{ sourceEntryId: playlistTrack.id, track }] : [];
  });

  const handleRemove = (playlistTrackId: number) => {
    removePlaylistTrack(
      { playlistTrackId, playlistId: playlist.id },
      {
        onError: (error) => {
          toast.add({
            description: error.message,
            priority: "high",
            title: "Could not remove track from playlist",
            type: "error",
          });
        },
        onSuccess: () => {
          toast.add({ title: `Removed from ${playlist.title}`, type: "success" });
        },
      },
    );
  };

  // The compiler caches an inline callback with the JSX around it, and that JSX reads `items`.
  // Inline, a like would re-render every playlist row.
  const renderMenuItems = (item: TrackListItem) => (
    <DropdownMenuItem
      disabled={isRemovingTrack}
      onClick={() => handleRemove(item.sourceEntryId)}
      variant="danger"
    >
      <MinusCircleIcon aria-hidden="true" />
      <span className="truncate" title={`Remove from ${playlist.title}`}>
        Remove from {playlist.title}
      </span>
      <DropdownMenuShortcut aria-hidden="true" className="flex pl-2">
        <BackspaceIcon className="size-3" weight="bold" />
      </DropdownMenuShortcut>
    </DropdownMenuItem>
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <PlaylistHeader items={items} playlist={playlist} />
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
        <div className="min-h-0 flex-1 overflow-y-auto" data-scroll-container>
          <TrackList
            caption={playlist.title}
            items={items}
            key={playlist.id}
            playlistId={playlist.id}
            renderMenuItems={renderMenuItems}
          />
        </div>
      )}
    </main>
  );
}

export function PlaylistPageSkeleton() {
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
      <TrackListSkeleton isPlaylist />
    </main>
  );
}
