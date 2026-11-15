export type WriteResult = "written" | "failed";

export function createCoalescingWriter<T>(sink: {
  write: (next: T, stored: T | null) => Promise<void>;
  writeFinal: (final: T) => void;
  onResult: (result: WriteResult) => void;
}) {
  let phase: "idle" | "scheduled" | "writing" | "closed" = "idle";
  let pending: T | null = null;
  let stored: T | null = null;
  const isClosed = () => phase === "closed";

  const drain = async () => {
    if (phase !== "scheduled") return;
    phase = "writing";

    while (pending !== null) {
      const write = sink.write(pending, stored);
      stored = pending;
      pending = null;

      const result: WriteResult = await write.then(
        () => "written",
        () => "failed",
      );

      if (isClosed()) return;

      if (result === "failed") stored = null;
      sink.onResult(result);
    }

    if (!isClosed()) phase = "idle";
  };

  return {
    write: (value: T) => {
      if (isClosed()) return;
      pending = value;

      if (phase !== "idle") return;
      phase = "scheduled";
      queueMicrotask(() => void drain());
    },
    close: (final: T | null) => {
      if (phase === "closed") return;
      phase = "closed";
      pending = null;

      if (final !== null) sink.writeFinal(final);
    },
  };
}
