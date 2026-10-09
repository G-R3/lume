import { MinusCircleIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import type { PlaylistDetails } from "../../shared/lib";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { useRemovePlaylistTrackMutation } from "@/lib/library-query";
import { playlistQueryOptions } from "@/lib/playlist-query";
import { TrackCollectionHeader } from "@/pages/tracks/track-collection-header";
import { TrackList } from "@/pages/tracks/track-list";

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
      description: "Returning to All tracks.",
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

function PlaylistContent({ playlist }: { playlist: PlaylistDetails }) {
  const library = useMusicLibrary();
  const removePlaylistTrack = useRemovePlaylistTrackMutation();
  const tracksById = new Map(library.tracks.map((track) => [track.id, track]));

  const items = playlist.tracks.flatMap((playlistTrack) => {
    const track = tracksById.get(playlistTrack.trackId);

    return track ? [{ sourceEntryId: playlistTrack.id, track }] : [];
  });

  const handleRemove = (playlistTrackId: number) => {
    removePlaylistTrack.mutate(
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

  return (
    <main>
      <TrackCollectionHeader
        artwork={getPlaylistInitials(playlist.title)}
        artworkClassName="font-mono bg-linear-to-br from-[oklch(27.4%_0.072_132.109)] to-[oklch(76.8%_0.233_130.85)] text-4xl font-semibold tracking-[-0.04em] text-primary"
        description={playlist.description}
        eyebrow="Playlist"
        items={items}
        playlistId={playlist.id}
        title={playlist.title}
        trackCount={playlist.tracks.length}
      />

      {playlist.tracks.length === 0 ? (
        <div className="grid min-h-64 place-items-center px-6 text-center">
          <div>
            <MusicNotesIcon aria-hidden="true" className="mx-auto mb-3 size-5 text-disabled" />
            <p className="text-sm font-medium text-primary">No tracks in this playlist yet.</p>
          </div>
        </div>
      ) : (
        <TrackList
          caption={`${playlist.title} tracks`}
          items={items}
          key={playlist.id}
          playlistId={playlist.id}
          renderMenuItems={(item) => (
            <DropdownMenuItem
              disabled={removePlaylistTrack.isPending}
              onClick={() => handleRemove(item.sourceEntryId)}
              variant="danger"
            >
              <MinusCircleIcon aria-hidden="true" />
              <span className="truncate">Remove from {playlist.title}</span>
            </DropdownMenuItem>
          )}
        />
      )}
    </main>
  );
}

function PlaylistPageSkeleton() {
  return (
    <main aria-label="Loading playlist" aria-busy="true">
      <header className="flex items-end gap-6 p-6 max-sm:flex-col max-sm:items-start">
        <Skeleton className="size-40 shrink-0 rounded-lg bg-raised max-sm:aspect-video max-sm:h-auto max-sm:w-full sm:size-52 lg:size-64" />
        <div className="w-full max-w-sm space-y-3 pb-0.5">
          <Skeleton className="h-2 w-16 bg-raised" />
          <Skeleton className="h-10 w-64 max-w-full bg-raised" />
          <Skeleton className="h-3 w-full bg-raised" />
          <Skeleton className="h-3 w-36 bg-raised" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-10 w-20 bg-raised" />
            <Skeleton className="h-10 w-24 bg-raised" />
          </div>
        </div>
      </header>
    </main>
  );
}

function getPlaylistInitials(title: string) {
  return title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
