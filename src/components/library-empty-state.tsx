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
        "grid min-h-screen place-items-center bg-page px-6 text-primary",
        isMac && "pt-9",
      )}
    >
      {isMac && (
        <div className="font-mono fixed inset-x-0 top-0 flex h-9 items-center justify-center text-[10px] tracking-[0.08em] text-tertiary [-webkit-app-region:drag]">
          Lume
        </div>
      )}

      <div className="flex max-w-md flex-col items-center text-center">
        <div
          aria-hidden="true"
          className="mb-7 grid size-14 place-items-center rounded-xl border border-default bg-page"
        >
          <span className="flex h-5 items-end gap-1">
            {[7, 18, 12, 21, 9].map((height) => (
              <span className="w-0.75 rounded-full bg-accent" key={height} style={{ height }} />
            ))}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Add your music to Lume</h1>
        <p className="mt-3 text-sm leading-6 text-secondary">
          Choose a folder containing audio files. Lume reads files where they are and never copies
          or modifies them.
        </p>
        <Button
          className="mt-7 bg-inverse px-4 text-inverse hover:bg-inverse-hover"
          disabled={isLoading}
          onClick={onAddSource}
          size="lg"
          type="button"
        >
          {isLoading ? "Adding source..." : "Add source"}
        </Button>
        <p className="mt-3 text-xs text-disabled">You can add more folders later.</p>
        {errorMessage && (
          <p className="mt-6 text-sm text-danger" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    </main>
  );
}
