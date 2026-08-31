import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useState } from "react";
import { backupKinds, backupLimits, type LibraryBackup } from "../../shared/lib";
import { Button } from "@/components/ui/button";

const backupDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const backupLabels = {
  emergency: "Emergency",
  manual: "Manual",
  migration: "Before migration",
} as const;

export function BackupSettings() {
  const [backups, setBackups] = useState<LibraryBackup[]>([]);
  const [backupToRestore, setBackupToRestore] = useState<LibraryBackup | null>(null);
  const [isConfirmingReplacement, setIsConfirmingReplacement] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const manualBackups = backups.filter((backup) => backup.kind === "manual");
  const oldestManualBackup = manualBackups.at(-1);

  useEffect(() => {
    let active = true;

    void window.lume
      .loadBackups()
      .then((backups) => {
        if (active) setBackups(backups);
      })
      .catch((error: Error) => {
        if (active) setErrorMessage(error.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function runBackup(createBackup: () => Promise<LibraryBackup[]>) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      setBackups(await createBackup());
      setIsConfirmingReplacement(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create backup");
    } finally {
      setIsLoading(false);
    }
  }

  async function restoreBackup() {
    if (!backupToRestore) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await window.lume.restoreBackup(backupToRestore.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not restore backup");
      setBackupToRestore(null);
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <header className="flex items-start justify-between gap-8 border-b border-neutral-800 pb-8">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">Backups</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Backups contain your Lume library data and settings. Audio files are not copied.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            onClick={() =>
              void window.lume
                .openDataFolder()
                .catch((error: Error) => setErrorMessage(error.message))
            }
            type="button"
            variant="outline"
          >
            Open data folder
          </Button>
          <Button
            className="bg-lime-300 text-neutral-950 hover:bg-lime-200"
            disabled={isLoading}
            onClick={() => {
              if (manualBackups.length >= backupLimits.manual) {
                setIsConfirmingReplacement(true);
                return;
              }

              void runBackup(window.lume.createManualBackup);
            }}
            type="button"
          >
            {isLoading ? "Working..." : "Back Up Now"}
          </Button>
        </div>
      </header>

      {errorMessage && (
        <p className="mt-5 text-sm text-red-300" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="space-y-8 pt-8">
        {backupKinds.map((kind) => {
          const matchingBackups = backups.filter((backup) => backup.kind === kind);
          const limit = backupLimits[kind];

          if (kind === "emergency" && matchingBackups.length === 0) return null;

          return (
            <section key={kind}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-medium text-neutral-200">{backupLabels[kind]}</h3>
                <span className="font-berkeley text-[10px] text-neutral-500 tabular-nums">
                  {matchingBackups.length.toLocaleString()}
                  {limit === null ? "" : ` of ${limit.toLocaleString()}`}
                </span>
              </div>

              <div className="mt-3 divide-y divide-neutral-800 border-y border-neutral-800">
                {matchingBackups.map((backup) => (
                  <article className="flex items-center gap-6 py-4" key={backup.id}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-neutral-300">
                        {backupDateFormatter.format(backup.createdAt)}
                      </p>
                      <p className="font-berkeley mt-1 text-[10px] text-neutral-600">
                        {backupLabels[kind]} backup
                      </p>
                    </div>
                    <Button
                      className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                      disabled={isLoading}
                      onClick={() => setBackupToRestore(backup)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Restore
                    </Button>
                  </article>
                ))}

                {matchingBackups.length === 0 && !isLoading && (
                  <p className="py-5 text-xs text-neutral-600">
                    No {backupLabels[kind].toLowerCase()} backups yet.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 max-w-2xl text-xs leading-5 text-neutral-600">
        Lume keeps up to five manual backups and three migration backups. Migration backups are
        created automatically before database changes.
      </p>

      <Dialog.Root
        onOpenChange={(open) => {
          if (!open && !isLoading) setIsConfirmingReplacement(false);
        }}
        open={isConfirmingReplacement}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-60 bg-black/80" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-60 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-700 bg-neutral-950 p-6 text-neutral-100 shadow-2xl outline-none">
            <Dialog.Title className="text-base font-semibold">
              Replace the oldest manual backup?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-neutral-400">
              Lume keeps five manual backups. Creating a new one will remove the oldest manual
              backup.
            </Dialog.Description>

            {oldestManualBackup && (
              <div className="mt-5 rounded-md border border-neutral-800 bg-black p-3">
                <p className="text-xs font-medium text-neutral-300">Oldest backup</p>
                <p className="font-berkeley mt-1 text-[10px] text-neutral-500">
                  Manual · {backupDateFormatter.format(oldestManualBackup.createdAt)}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                disabled={isLoading}
                onClick={() => setIsConfirmingReplacement(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="bg-amber-300 text-neutral-950 hover:bg-amber-200"
                disabled={isLoading}
                onClick={() => void runBackup(window.lume.replaceOldestManualBackup)}
                type="button"
              >
                {isLoading ? "Creating..." : "Replace oldest"}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        onOpenChange={(open) => {
          if (!open && !isLoading) setBackupToRestore(null);
        }}
        open={backupToRestore !== null}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-60 bg-black/80" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-60 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-700 bg-neutral-950 p-6 text-neutral-100 shadow-2xl outline-none">
            <Dialog.Title className="text-base font-semibold">Restore this backup?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-neutral-400">
              Lume will verify this backup, save an emergency copy of the current database, and
              restart. Changes made after restore begins may not be preserved.
            </Dialog.Description>

            {backupToRestore && (
              <div className="mt-5 rounded-md border border-neutral-800 bg-black p-3">
                <p className="text-xs font-medium text-neutral-300">
                  {backupLabels[backupToRestore.kind]} backup
                </p>
                <p className="font-berkeley mt-1 text-[10px] text-neutral-500">
                  {backupDateFormatter.format(backupToRestore.createdAt)}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                disabled={isLoading}
                onClick={() => setBackupToRestore(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="bg-red-400 text-neutral-950 hover:bg-red-300"
                disabled={isLoading}
                onClick={() => void restoreBackup()}
                type="button"
              >
                {isLoading ? "Preparing..." : "Restore and restart"}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
