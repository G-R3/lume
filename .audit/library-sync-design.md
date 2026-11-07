# Library sync design

The renderer shows one library. Four kinds of update can change it, and they overlap: library reads, the startup scan result, folder and playlist command results, and like writes. This note states which update wins, why, and how to check it.

## Problem

On main, the `["library"]` query had five writers. Reads, scan pushes, and command results replaced it. A like's `onMutate` wrote a guess into it, and the like's settle wrote the stored time back. Three hidden rules kept that working: the last write wins, an ownership map decides which like may settle a track, and `cancelQueries` stops reads from overwriting guesses. Each rule caused a visible bug:

- Guesses lived next to confirmed data. So any confirmed write, such as a folder result, a scan push, or a reread after a failed like, flipped a pending heart back.
- `cancelQueries` dropped reads that should have landed. A playlist's new track count never showed.
- Rollback restored whatever the cache held, which could be another like's guess.

Two constraints shaped the fix. First, `onMutate` runs at click time, outside the mutation scope, while only `mutationFn` waits. Second, Electron delivers `webContents.send` pushes and `invoke` replies on different paths, and they reorder. `scripts/ipc-order-probe` measured 689 push-vs-reply inversions in 8,000 rounds on Electron 43.8.3.

## Usage

```tsx
// AppRoot is the only reader. It gets the library to show.
const { error, library, refetch } = useLibrary();

// Track actions. No rollback or ownership to manage.
useSetTracksLiked().mutate({ liked: true, trackIds });

// Folder commands and playlist mutations return or refresh the confirmed library.
useLibraryMutation().mutate({ kind: "rescan-sources" });
replaceLibrary(queryClient, result.library);
void refreshLibrary(queryClient);
```

Pages below `AppRoot` keep reading `useMusicLibrary()`.

## Shape

There are two stores, each with one owner. They meet only when the library is read.

- **Confirmed library.** The `["library"]` query in `src/lib/library-query.ts`. It holds only libraries main sent: reads, the startup scan update, command results, and stored like times. Only this module writes it. Other modules call `replaceLibrary` and `refreshLibrary`.
- **Pending likes.** TanStack's mutation cache, filtered to the `["set-tracks-liked"]` key and `pending` status. A like is pending from click time until its `onSuccess` returns. Nothing copies this state.
- **Shown library.** `withPendingLikes(confirmed, pendingLikes)`. Intents apply in call order, so the newest intent for a track wins. Tracks that a confirmed library removed are not brought back. With no pending likes, it returns the confirmed object unchanged.

The policy:

1. **The last confirmed library applied wins.** Every library payload is an invoke reply, so this holds as long as replies arrive in the order main computed them. Main computes each payload synchronously right after its commit.
2. **A pending like wins over confirmed data for its tracks until main answers.** On success, the stored time is written to the confirmed library before the like stops being pending. On failure, nothing is written, so stored truth shows again.
3. **The startup scan is pulled, not pushed.** `awaitStartupScan` resolves when the scan settles and is computed at reply time. A failed scan replies with the whole stored library, because earlier sources may have committed.
4. **Likes do not wait for folder or playlist commands.** Main runs each like as one synchronous transaction, so any library computed after it already contains it. Folder and playlist commands still share `libraryCommandOptions`, which serializes them.

## Transition table

C is the confirmed library (∅ means none yet). F is a read in flight. P is the set of pending likes. The user sees `withPendingLikes(C, P)`.

| State | Event | Next state | User sees |
| --- | --- | --- | --- |
| ∅, F | first read returns R | C = R | library R |
| ∅, F | first read fails | ∅, error | the "could not load" screen |
| ∅, F | scan returns a snapshot U | C = U, then R replaces it when R lands | U, then R |
| ∅, F | scan returns sources only | the refresh joins F | R, which already has those sources |
| ∅, error | scan returns sources only | a new read starts | error screen, then library |
| ∅, error | user clicks **Try again** | a new read starts | error screen, then library |
| C, any | scan returns a snapshot U | C = U | U with P on top |
| C library | scan returns sources S | C.sources = S, same track objects | new folder status only |
| C, P | folder or playlist result X | C = X | X with P on top |
| C, P | playlist add or remove succeeds | detail patched, refresh starts | new track count when the read lands |
| C, P | refetch returns R | C = R, never cancelled | R with P on top |
| C, P | like starts | P gains the intent | heart changes now |
| C, P | like succeeds | stored times go into C, then the intent leaves P | heart stays, time becomes the stored one |
| C, P | like fails | the intent leaves P | stored truth, or a newer pending intent |

## Synthesis decision

Two runners competed. Opus proposed this shape. GPT-6.1 Sol proposed a private reducer that owned confirmed data, like receipts, and a command queue, with main stamping every commit with a revision. The GPT-6.1 Sol judge preferred the reducer, because it removes the reply-order assumption.

The base is the Opus shape. It deleted far more code, and it came with a working prototype, while the reducer was still a sketch. The reducer's guarantee depends on every main-process writer bumping a revision. No type or test enforces that, so a missed writer would break it silently.

One graft came from the judge's ownership criterion: a single module writes the library cache. I rejected one suggestion, an automatic follow-up read when a scan update joins a first read that then fails. The **Try again** button already recovers, as it did on main.

## Tradeoffs accepted

- We rely on one undocumented order, invoke replies in compute order, in exchange for no revision plumbing. If Electron breaks it, a stale confirmed library can linger until the next confirmed write. Pending likes are not affected.
- We keep a long-lived `awaitStartupScan` request in exchange for deleting the push, its buffer, and the case where a push is lost before the preload exists.
- The click time shows as the like time until main answers.
- The overlay maps every track while a like is pending. That is the same cost as the optimistic write it replaced.

## Alternatives considered

- **Revision stamps from main with a reducer.** Covered in the synthesis decision.
- **Keep the push and order it in the renderer.** Rejected on the probe evidence.
- **Push only a "scan done" signal and refetch.** It turns every unchanged scan into a full 20k-track read and drops the cheap sources-only path.
- **Store pending likes in their own query.** It duplicates mutation state and needs its own cleanup, which is the ownership map again.

## Open questions

- Should the playlist detail cache refresh when a library snapshot lands? Today it does not, on main or here.
- Should a failed startup scan show a message? It sends the stored library and logs the error.

## Evidence for the ordering probe

The probe counts order, not speed, so only part of the benchmark checklist applies.

- **Did the work happen?** Each run reports `applied`, the count of messages the renderer handled. It was about 1.6 per round, which matches reads, slow replies, and pushes.
- **Errors.** A run exits 1 only when replies arrive out of order. Push inversions are reported, not counted as failures.
- **Repeatability.** Runs at 8,000 (twice), 4,000 (twice), and 2,000 (twice) rounds all gave 0 reply-vs-reply inversions. The first 8,000-round run gave 642 push-vs-reply inversions and the second 689. The 25 inversions where an older read landed after a newer push come from the second.
- **Relevance.** The probe uses Lume's window settings (`contextIsolation`, `sandbox`) and renderer chains of 1 to 40 microtasks. It does not drive TanStack itself. So the reply-order claim is measured for the transport and inferred for the app.

## Verification checklist

Another engineer or model can follow these steps from the repository root on branch `library-sync-v2`:

1. Run `pnpm check`. Expect exit 0.
2. Run `pnpm vitest run src/lib/library-query.test.tsx tests/startup-scan.test.ts`. Expect every test to pass.
3. Run `ROUNDS=4000 pnpm probe:ipc-order`. Expect exit 0 and `"repliesOutOfOrder":0` in the output.
4. Run `pnpm build`. Then run the verify-lume journey `like-during-rescan`. Expect the heart transitions to be unliked, then liked, with no later unliked. Expect one liked row in `track_state`.
5. Manual check. Add a folder with many files. Start **Rescan** in Settings. Go to Tracks and like a track before the scan ends. The heart must not flicker. Quit and reopen the app. The like must still be there.
