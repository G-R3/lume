import type { TrackUnavailableReason } from "../shared/lib";
import type { ScanOutcomeColumn, SourceStatusColumn } from "./database/schema";

export type SourceGate =
  | { kind: "open" }
  | { kind: "closed"; reason: Exclude<TrackUnavailableReason, "file-missing"> };

export function sourceGate(status: SourceStatusColumn, outcome: ScanOutcomeColumn): SourceGate {
  switch (status) {
    case "forgotten":
      return { kind: "closed", reason: "source-forgotten" };
    case "off":
      return { kind: "closed", reason: "source-off" };
    case "active":
      switch (outcome) {
        case "missing":
          return { kind: "closed", reason: "source-missing" };
        case "permission":
          return { kind: "closed", reason: "source-permission" };
        case "failed":
          return { kind: "closed", reason: "source-unreadable" };
        case "unscanned":
        case "ok":
          return { kind: "open" };
      }
  }
}

export function trackUnavailableReason(
  gate: SourceGate,
  missingSince: number | null,
): TrackUnavailableReason | null {
  if (gate.kind === "closed") return gate.reason;

  return missingSince === null ? null : "file-missing";
}

export function gateChanged(before: SourceGate, after: SourceGate) {
  if (before.kind === "open" || after.kind === "open") return before.kind !== after.kind;

  return before.reason !== after.reason;
}
