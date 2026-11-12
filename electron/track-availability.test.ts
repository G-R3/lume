import { describe, expect, it } from "vite-plus/test";
import { gateChanged, sourceGate, trackUnavailableReason } from "./track-availability";

const statuses = ["active", "off", "forgotten"] as const;

const outcomes = ["unscanned", "ok", "missing", "permission", "failed"] as const;

const expectedSourceReason = {
  active: {
    failed: "source-unreadable",
    missing: "source-missing",
    ok: null,
    permission: "source-permission",
    unscanned: null,
  },
  forgotten: {
    failed: "source-forgotten",
    missing: "source-forgotten",
    ok: "source-forgotten",
    permission: "source-forgotten",
    unscanned: "source-forgotten",
  },
  off: {
    failed: "source-off",
    missing: "source-off",
    ok: "source-off",
    permission: "source-off",
    unscanned: "source-off",
  },
} as const;

describe("track availability", () => {
  it.each(statuses.flatMap((status) => outcomes.map((outcome) => ({ outcome, status }))))(
    "derives the reason for a $status folder whose last scan was $outcome",
    ({ outcome, status }) => {
      const gate = sourceGate(status, outcome);
      const sourceReason = expectedSourceReason[status][outcome];

      expect(trackUnavailableReason(gate, null)).toBe(sourceReason);
      expect(trackUnavailableReason(gate, 1)).toBe(sourceReason ?? "file-missing");
    },
  );

  it("reports a gate change only when it changes a track's reason", () => {
    const open = sourceGate("active", "ok");

    expect(gateChanged(sourceGate("active", "unscanned"), open)).toBe(false);
    expect(gateChanged(sourceGate("active", "missing"), open)).toBe(true);
    expect(gateChanged(open, sourceGate("off", "ok"))).toBe(true);
    expect(gateChanged(sourceGate("active", "missing"), sourceGate("active", "permission"))).toBe(
      true,
    );
    expect(gateChanged(sourceGate("off", "ok"), sourceGate("off", "failed"))).toBe(false);
  });
});
