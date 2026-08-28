import { useAudioPlayer } from "@/hooks/use-audio-player";
import type { Track } from "../../shared/lib";
import { formatDuration } from "@/lib/format-duration";

export function TrackList({ tracks }: { tracks: Track[] }) {
  const audioPlayer = useAudioPlayer();
  if (!tracks) return null;

  return (
    tracks && (
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
              <th
                className="w-24 px-3 py-2.5 text-right font-normal"
                scope="col"
              >
                Format
              </th>
              <th
                className="w-24 py-2.5 pr-5 pl-3 text-right font-normal"
                scope="col"
              >
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track, index) => {
              const isActive = audioPlayer.activeTrack?.id === track.id;
              const coverClasses = [
                "from-orange-950 to-orange-500",
                "from-cyan-950 to-cyan-500",
                "from-purple-950 to-purple-500",
                "from-emerald-950 to-emerald-500",
                "from-stone-800 to-stone-500",
                "from-indigo-950 to-indigo-500",
              ];

              return (
                <tr
                  className={
                    isActive
                      ? "cursor-pointer border-b border-l-2 border-neutral-900 border-l-lime-300 bg-neutral-900 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-lime-300"
                      : "cursor-pointer border-b border-l-2 border-neutral-900 border-l-transparent hover:bg-neutral-950 focus-within:bg-neutral-900 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-lime-300"
                  }
                  key={track.id}
                  onClick={() => audioPlayer.play(track)}
                >
                  <td className="font-berkeley h-10.5 pr-3 pl-5 text-neutral-400 tabular-nums">
                    {isActive && audioPlayer.isPlaying ? (
                      <span
                        aria-label="Playing"
                        className="flex h-3 items-end gap-0.5"
                      >
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
                      className="flex w-full cursor-pointer items-center gap-2.5 text-left outline-none"
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={`font-berkeley grid size-7 shrink-0 place-items-center rounded-[3px] bg-linear-to-br ${coverClasses[index % coverClasses.length]} text-[8px] font-semibold tracking-[-0.04em] text-neutral-100`}
                      >
                        {track.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((word) => word[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <span className="truncate text-neutral-100">
                        {track.name}
                      </span>
                    </button>
                  </td>
                  <td className="font-berkeley h-10.5 px-3 text-right text-neutral-400">
                    {track.format}
                  </td>
                  <td className="font-berkeley h-10.5 pr-5 pl-3 text-right text-neutral-400 tabular-nums">
                    {formatDuration(track.duration)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )
  );
}
