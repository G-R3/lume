import { MinusCircleIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import type { PlaylistDetails } from "../../shared/lib";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useMusicLibrary } from "@/hooks/use-music-library";
import { playlistQueryOptions, useRemovePlaylistTrackMutation } from "@/lib/library-query";
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
  const audioPlayer = useAudioPlayer();
  const removePlaylistTrack = useRemovePlaylistTrackMutation();
  const tracksById = new Map(library.tracks.map((track) => [track.id, track]));

  const items = playlist.tracks.flatMap((playlistTrack) => {
    const track = tracksById.get(playlistTrack.trackId);

    return track ? [{ key: playlistTrack.id, track }] : [];
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
          audioPlayer.removeQueueItem(playlistTrackId);
          toast.add({ title: `Removed from ${playlist.title}`, type: "success" });
        },
      },
    );
  };

  return (
    <main>
      <section className="flex min-h-36 items-end gap-4 px-5 py-5">
        <div
          aria-hidden="true"
          className="font-berkeley grid size-20 shrink-0 place-items-center rounded-md bg-linear-to-br from-lime-950 to-lime-500 text-xl font-semibold tracking-[-0.04em] text-neutral-100"
        >
          {getPlaylistInitials(playlist.title)}
        </div>
        <div className="min-w-0 pb-0.5">
          <p className="font-berkeley mb-2 text-[9px] tracking-[0.12em] text-lime-300 uppercase">
            Playlist
          </p>
          <h2 className="truncate text-3xl font-semibold tracking-[-0.04em] text-neutral-50">
            {playlist.title}
          </h2>
          {playlist.description && (
            <p className="mt-2 text-xs text-neutral-400">{playlist.description}</p>
          )}
        </div>
      </section>

      {playlist.tracks.length === 0 ? (
        <div className="grid min-h-64 place-items-center px-6 text-center">
          <div>
            <MusicNotesIcon aria-hidden="true" className="mx-auto mb-3 size-5 text-neutral-600" />
            <p className="text-sm font-medium text-neutral-300">No tracks in this playlist yet.</p>
          </div>
        </div>
      ) : (
        <TrackList
          caption={`${playlist.title} tracks`}
          items={items}
          playlistId={playlist.id}
          renderMenuItems={(item) => (
            <DropdownMenuItem
              disabled={removePlaylistTrack.isPending}
              onClick={() => handleRemove(item.key)}
              variant="destructive"
            >
              <MinusCircleIcon aria-hidden="true" />
              Remove from playlist
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
      <section className="flex min-h-36 items-end gap-4 px-5 py-5">
        <Skeleton className="size-20 shrink-0 rounded-md bg-neutral-900" />
        <div className="w-full max-w-sm space-y-3 pb-0.5">
          <Skeleton className="h-2 w-16 bg-neutral-900" />
          <Skeleton className="h-8 w-64 max-w-full bg-neutral-900" />
          <Skeleton className="h-3 w-full bg-neutral-900" />
          <Skeleton className="h-2 w-20 bg-neutral-900" />
        </div>
      </section>
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
