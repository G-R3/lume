# Library sync design

The renderer shows one library. Four kinds of update can change it, and they overlap: library reads, the startup scan result, folder and playlist command results, and like writes. This note states which update wins, why, and how to check it.

## Problem

On main, the `["library"]` query had five writers. Reads, scan pushes, and command results replaced it. A like's `onMutate` wrote a guess into it, and the like's settle wrote the stored time back. Three hidden rules kept that working: the last write wins, an ownership map decides which like may settle a track, and `cancelQueries` stops reads from overwriting guesses. Each rule caused a visible bug:

- Guesses lived next to confirmed data. So any confirmed write, such as a folder result, a scan push, or a reread after a failed like, flipped a pending heart back.
- `cancelQueries` dropped reads that should have landed. A playlist's new track count never showed.
- Rollback restored whatever the cache held, which could be another like's guess.

"The last write wins" also assumed replies arrive in the order main built them. A throwaway probe on Electron 43.8.3 measured 642 and 689 push-vs-reply inversions in two 8,000-round runs. Invoke replies never reordered in those runs, but Electron does not document that, so the design does not rely on arrival order at all.

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

Main keeps one counter in `electron/library.ts` and stamps every library payload with the next value when it builds it. Payloads are built synchronously against synchronous SQLite, so a higher revision always saw a newer database. Three places build payloads: `getLibrarySnapshotJson` (full libraries), the sources branch of `getLibraryUpdate`, and `setTracksLiked`.

The renderer has two stores, each with one owner. They meet only when the library is read.

- **Confirmed library.** The `["library"]` query in `src/lib/library-query.ts` holds a `ConfirmedLibrary`: the newest snapshot, a sources update newer than it, and per-track like results newer than it. Each part carries the revision main gave it. Only this module writes it, through one pure merge per payload kind (`withNewerSnapshot`, `withNewerSources`, `withNewerLikes`). Reads, `replaceLibrary`, the startup scan, and like confirmations all go through those merges.
- **Pending likes.** TanStack's mutation cache, filtered to the `["set-tracks-liked"]` key and `pending` status. A like is pending from click time until its `onSuccess` returns.
- **Shown library.** The snapshot, with kept sources and likes laid over it, then pending intents over that. With nothing kept, the snapshot object itself is shown, so track identities survive.

The policy:

1. **The newest revision wins, for each part.** An older snapshot is ignored. A newer snapshot drops every kept part older than it. A sources update or a like result is kept only if newer than what it would cover. Arrival order never matters.
2. **A pending like wins over confirmed data for its tracks until main answers.** On success, the stored time is merged before the like stops being pending. On failure, nothing is written, so stored truth shows again.
3. **Likes run one at a time, in their own scope.** So main commits them in click order, and a slow earlier like can never show over a later one. They do not wait for folder or playlist commands, which share the separate `library` scope.
4. **The startup scan is pulled, not pushed.** `awaitStartupScan` resolves when the scan settles. A failed scan replies with the whole stored library, because earlier sources may have committed. A sources update that arrives before the first read is kept and outranks that read's older folders.

## Transition table

S is the confirmed snapshot with revision s (∅ means none yet). K is the kept sources and likes. P is the set of pending likes. The user sees S with K and P on top.

| State | Event | Next state | User sees |
| --- | --- | --- | --- |
| ∅ | first read returns R | S = R | library R |
| ∅ | first read fails | ∅, error | the "could not load" screen |
| ∅ | scan returns sources at r | K keeps them, a read joins or starts | loading, then the read with these folders |
| S, any | snapshot X with revision > s | S = X, K drops parts older than X | X with newer K and P on top |
| S, any | snapshot X with revision ≤ s | unchanged | unchanged |
| S library | scan returns sources at r > s | K keeps them, same track objects | new folder status only |
| S, P | like starts | P gains the intent | heart changes now |
| S, P | like succeeds at r > s | K keeps the stored time, then the intent leaves P | heart stays, time becomes the stored one |
| S, P | like succeeds at r ≤ s | unchanged, then the intent leaves P | S already has the like |
| S, P | like fails | the intent leaves P | stored truth, or a newer pending intent |
| S, P | second like for a track | waits for the first to finish | heart follows the newest click |
| ∅, error | user clicks **Try again** | a new read starts | error screen, then library |

## Design history

Two runners competed first. Opus proposed the overlay shape with arrival order. GPT-6.1 Sol proposed a reducer with revision stamps from main. I picked the Opus shape, because the stamps looked like they needed every main-process writer to bump a revision.

That objection was wrong. Every payload is built in three functions, so stamping where payloads are built covers every writer. With no users to protect, the stamps replaced the arrival-order assumption and the probe that watched it. A GPT-6.1 Sol review of the stamp design then found two holes, both fixed with tests: an older pending like could show over a newer confirmed unlike (fixed by rule 3), and a sources update that beat the first read was lost (fixed by keeping parts without a snapshot).

## Tradeoffs accepted

- Likes on the same or different tracks save one at a time. Each save is one SQLite transaction, so the wait is short, and hearts still change on click.
- Kept likes stay as an overlay until the next snapshot. Laying them over the library maps every track, the same cost as the pending overlay.
- We keep a long-lived `awaitStartupScan` request in exchange for deleting the push, its buffer, and the case where a push is lost before the preload exists.
- The click time shows as the like time until main answers.
- The revision counter lives in memory. It restarts with main, and the renderer restarts with main.

## Alternatives considered

- **Arrival order plus a probe.** The previous version of this branch. Rejected because it rested on undocumented Electron behavior that only a manual probe checked.
- **Bump the snapshot revision on a like or sources update.** A late older snapshot would then be dropped and lose its changes. Keeping each part with its own revision handles both orders.
- **Send a full snapshot for every scan and like.** Removes the kept parts, but turns every like and unchanged scan into a 20k-track read and breaks track identity.
- **Push only a "scan done" signal and refetch.** Same cost problem for unchanged scans.

## Open questions

- Should the playlist detail cache refresh when a library snapshot lands? Today it does not, on main or here.
- Should a failed startup scan show a message? It sends the stored library and logs the error.

## Verification checklist

Another engineer or model can follow these steps from the repository root on branch `library-sync-v2`:

1. Run `pnpm check`. Expect exit 0. The ordering cases are in `src/lib/library-query.test.tsx` under "replies that arrive out of revision order", and the main-side numbering test is in `tests/library-json.test.ts`.
2. Run `pnpm build`, then `pnpm test:e2e`. Expect exit 0.
3. Run the verify-lume journey `like-during-rescan`. Expect the heart transitions to be unliked, then liked, with no later unliked. Expect one liked row in `track_state`.
4. Manual check. Add a folder with many files. Start **Rescan** in Settings. Go to Tracks and like a track before the scan ends. The heart must not flicker. Quit and reopen the app. The like must still be there.
