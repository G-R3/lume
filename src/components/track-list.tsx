import { useAudioPlayer } from "@/hooks/use-audio-player";
import type { Track } from "../../shared/lib";
import { formatDuration } from "@/lib/format-duration";

export function TrackList({ tracks }: { tracks: Track[] }) {
  const audioPlayer = useAudioPlayer();
  if (!tracks) return null;

  return (
    tracks && (
      <div className="overflow-hidden rounded-md border border-white/10">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-white/10 text-left text-white/60">
            <tr>
              <th className="w-14 px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="w-28 px-4 py-3 font-medium">Format</th>
              <th className="w-24 px-4 py-3 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {tracks.map((track, index) => (
              <tr
                className={
                  audioPlayer.activeTrack?.id === track.id
                    ? "bg-white/10"
                    : "hover:bg-white/5"
                }
                key={track.id}
              >
                <td className="px-4 py-3 text-white/60">{index + 1}</td>
                <td>
                  <button
                    className="w-full cursor-pointer truncate px-4 py-3 text-left"
                    onClick={() => {
                      audioPlayer.play(track);
                    }}
                    type="button"
                  >
                    {track.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-white/60">{track.format}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white/60">
                  {formatDuration(track.duration)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );
}
