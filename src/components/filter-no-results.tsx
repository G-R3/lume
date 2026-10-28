export function FilterNoResults({
  filterText,
  onClear,
}: {
  filterText: string;
  onClear: () => void;
}) {
  return (
    <div
      className="flex h-10 items-center gap-3 px-6 text-body text-secondary"
      data-slot="filter-no-results"
      role="status"
    >
      <p className="truncate" dir="auto">
        No tracks match “{filterText}”.
      </p>
      <button
        className="shrink-0 cursor-pointer rounded-xs font-medium text-primary underline decoration-(--color-text-faint) decoration-1 underline-offset-3"
        onClick={onClear}
        type="button"
      >
        Clear filter
      </button>
    </div>
  );
}
