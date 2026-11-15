import { expect, it } from "vite-plus/test";
import { createCoalescingWriter, type WriteResult } from "./coalescing-writer";

function createSink() {
  const log: string[] = [];
  const inFlight: { resolve: () => void; reject: () => void }[] = [];

  const writer = createCoalescingWriter<string>({
    write: (next, previous) => {
      log.push(`write ${next} after ${previous ?? "nothing"}`);

      return new Promise<void>((resolve, reject) => {
        inFlight.push({ resolve, reject: () => reject(new Error("Disk full")) });
      });
    },
    writeFinal: (final) => log.push(`final ${final}`),
    onResult: (result: WriteResult) => log.push(result),
  });

  const settle = async (outcome: "resolve" | "reject" = "resolve") => {
    const write = inFlight.shift();

    if (!write) throw new Error("Expected a write in flight");
    write[outcome]();
    await flushMicrotasks();
  };

  return { writer, log, settle, inFlight };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

it("writes only the latest value, both within one task and behind a write in flight", async () => {
  const { writer, log, settle } = createSink();

  writer.write("a");
  writer.write("b");
  writer.write("c");
  await flushMicrotasks();

  expect(log).toEqual(["write c after nothing"]);

  writer.write("d");
  writer.write("e");
  await settle();

  expect(log).toEqual(["write c after nothing", "written", "write e after c"]);

  await settle();

  expect(log).toEqual(["write c after nothing", "written", "write e after c", "written"]);
});

it("reports a failed write and retries from nothing on the next value", async () => {
  const { writer, log, settle } = createSink();

  writer.write("a");
  await flushMicrotasks();
  await settle();
  writer.write("b");
  await flushMicrotasks();
  await settle("reject");

  expect(log).toEqual(["write a after nothing", "written", "write b after a", "failed"]);

  writer.write("c");
  await flushMicrotasks();
  await settle();

  expect(log.slice(4)).toEqual(["write c after nothing", "written"]);
});

it("closes with one final write after the write in flight, and drops the queued value", async () => {
  const { writer, log, settle, inFlight } = createSink();

  writer.write("a");
  await flushMicrotasks();
  writer.write("b");
  writer.close("final");

  expect(log).toEqual(["write a after nothing", "final final"]);

  await settle("reject");
  writer.write("c");
  writer.close("again");
  await flushMicrotasks();

  expect(log).toEqual(["write a after nothing", "final final"]);
  expect(inFlight).toEqual([]);
});

it("drops queued and later values when its result handler closes the writer", async () => {
  const log: string[] = [];
  const first = { reject: () => {} };

  const writer = createCoalescingWriter<string>({
    write: (next) => {
      log.push(`write ${next}`);

      return next === "a"
        ? new Promise<void>((_, reject) => {
            first.reject = () => reject(new Error("Disk full"));
          })
        : Promise.resolve();
    },
    writeFinal: (final) => log.push(`final ${final}`),
    onResult: (result) => {
      log.push(result);
      writer.close("final");
      writer.write("late");
    },
  });

  writer.write("a");
  await flushMicrotasks();
  writer.write("b");
  first.reject();
  await flushMicrotasks();
  writer.write("c");
  await flushMicrotasks();

  expect(log).toEqual(["write a", "failed", "final final"]);
});

it("closes before a scheduled write starts without sending it, then ignores later writes", async () => {
  const { writer, log } = createSink();

  writer.write("a");
  writer.close(null);
  await flushMicrotasks();
  writer.write("b");
  await flushMicrotasks();

  expect(log).toEqual([]);
});

it("writes each value once and stays idle until the next one", async () => {
  const { writer, log, settle, inFlight } = createSink();

  writer.write("a");
  await flushMicrotasks();
  await settle();
  await flushMicrotasks();

  expect(log).toEqual(["write a after nothing", "written"]);
  expect(inFlight).toEqual([]);

  writer.write("b");
  await flushMicrotasks();

  expect(log).toEqual(["write a after nothing", "written", "write b after a"]);
});
