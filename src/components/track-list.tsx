import { LockSimpleIcon } from "@phosphor-icons/react";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import type { Track } from "../../shared/lib";
import { formatDuration } from "@/lib/format-duration";
import { cn } from "@/lib/utils";

const coverClasses = [
  "from-orange-950 to-orange-500",
  "from-cyan-950 to-cyan-500",
  "from-purple-950 to-purple-500",
  "from-emerald-950 to-emerald-500",
  "from-stone-800 to-stone-500",
  "from-indigo-950 to-indigo-500",
];

export function TrackList({ tracks }: { tracks: readonly Track[] }) {
  const audioPlayer = useAudioPlayer();

  return (
    <div id="tracks">
      <table className="w-full table-fixed text-xs">
        <caption className="sr-only">All tracks</caption>
        <thead className="font-berkeley border-b border-neutral-800 text-left tracking-[0.08em] text-neutral-400 uppercase">
          <tr>
            <th className="w-14 py-2.5 pr-3 pl-5 font-normal" scope="col">
              #
            </th>
            <th className="px-2 py-2.5 font-normal" scope="col">
              Title
            </th>
            <th className="w-24 px-3 py-2.5 text-right font-normal" scope="col">
              Format
            </th>
            <th className="w-24 py-2.5 pr-5 pl-3 text-right font-normal" scope="col">
              Time
            </th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, index) => {
            const isActive = audioPlayer.activeTrack?.id === track.id;
            const metadataColor = track.available ? "text-neutral-400" : "text-neutral-700";

            return (
              <tr
                className={cn(
                  "border-b border-l-2 border-neutral-900",
                  isActive
                    ? "border-l-lime-300 bg-neutral-900 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-lime-300"
                    : "border-l-transparent",
                  track.available
                    ? "cursor-pointer hover:bg-neutral-950 focus-within:bg-neutral-900 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-lime-300"
                    : "bg-neutral-950/40",
                )}
                key={track.id}
                onClick={track.available ? () => audioPlayer.playFrom(tracks, index) : undefined}
              >
                <td className={cn("font-berkeley h-10.5 pr-3 pl-5 tabular-nums", metadataColor)}>
                  {isActive && audioPlayer.isPlaying ? (
                    <span aria-label="Playing" className="flex h-3 items-end gap-0.5">
                      <i className="h-1 w-0.5 bg-lime-300" />
                      <i className="h-2.5 w-0.5 bg-lime-300" />
                      <i className="h-1.5 w-0.5 bg-lime-300" />
                    </span>
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </td>
                <td className="h-10.5 px-2">
                  <button
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 text-left outline-none",
                      track.available ? "cursor-pointer" : "cursor-not-allowed",
                    )}
                    disabled={!track.available}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "font-berkeley grid size-7 shrink-0 place-items-center rounded-[3px] bg-linear-to-br text-[8px] font-semibold tracking-[-0.04em] text-neutral-100",
                        coverClasses[index % coverClasses.length],
                        !track.available && "grayscale opacity-40",
                      )}
                    >
                      {track.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((word) => word[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span
                      className={cn(
                        "truncate",
                        track.available ? "text-neutral-100" : "text-neutral-500",
                      )}
                    >
                      {track.name}
                    </span>
                    {!track.available && (
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-neutral-600">
                        <LockSimpleIcon aria-hidden="true" />
                        Unavailable
                      </span>
                    )}
                  </button>
                </td>
                <td className={cn("font-berkeley h-10.5 px-3 text-right", metadataColor)}>
                  {track.format}
                </td>
                <td
                  className={cn(
                    "font-berkeley h-10.5 pr-5 pl-3 text-right tabular-nums",
                    metadataColor,
                  )}
                >
                  {formatDuration(track.duration)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
