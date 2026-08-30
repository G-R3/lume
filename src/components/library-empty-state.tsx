import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LibraryEmptyState({
  errorMessage,
  isLoading,
  isMac,
  onAddSource,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  isMac: boolean;
  onAddSource: () => void;
}) {
  return (
    <main
      className={cn(
        "grid min-h-screen place-items-center bg-black px-6 text-neutral-50",
        isMac && "pt-9",
      )}
    >
      {isMac && (
        <div className="font-berkeley fixed inset-x-0 top-0 flex h-9 items-center justify-center text-[10px] tracking-[0.08em] text-neutral-500 [-webkit-app-region:drag]">
          Lume
        </div>
      )}

      <div className="flex max-w-md flex-col items-center text-center">
        <div
          aria-hidden="true"
          className="mb-7 grid size-14 place-items-center rounded-xl border border-neutral-800 bg-neutral-950"
        >
          <span className="flex h-5 items-end gap-1">
            {[7, 18, 12, 21, 9].map((height) => (
              <span className="w-0.75 rounded-full bg-lime-300" key={height} style={{ height }} />
            ))}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Add your music to Lume</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Choose a folder containing audio files. Lume reads files where they are and never copies
          or modifies them.
        </p>
        <Button
          className="mt-7 bg-lime-300 px-4 text-neutral-950 hover:bg-lime-200"
          disabled={isLoading}
          onClick={onAddSource}
          size="lg"
          type="button"
        >
          {isLoading ? "Adding source..." : "Add source"}
        </Button>
        <p className="mt-3 text-xs text-neutral-600">You can add more folders later.</p>
        {errorMessage && (
          <p className="mt-6 text-sm text-red-300" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    </main>
  );
}
