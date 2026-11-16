import type { ComponentProps } from "react";
import { formatPlaybackNotice, type PlaybackNotice } from "@/lib/playback-notices";
import { cn } from "@/lib/utils";

export function PlaybackNotices({
  notices,
  className,
  ...props
}: { notices: readonly PlaybackNotice[] } & ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-1 text-meta text-danger", className)} {...props}>
      {notices.map((notice) => (
        <p key={notice.kind}>{formatPlaybackNotice(notice)}</p>
      ))}
    </div>
  );
}
