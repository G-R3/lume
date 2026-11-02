import { SortArrow } from "@/components/sort-arrow";
import { sortFieldInfo, sortName, type SortField, type TrackSort } from "@/lib/track-sort";
import { cn } from "@/lib/utils";

export function TrackListHead({
  isPlaylist,
  onStepSort,
  sort,
}: {
  isPlaylist: boolean;
  onStepSort?: (field: SortField) => void;
  sort: TrackSort;
}) {
  return (
    <thead className="sticky top-0 z-10 text-left font-mono text-meta text-secondary">
      <tr
        aria-rowindex={1}
        className="*:bg-page *:first:relative *:first:before:absolute *:first:before:top-0 *:first:before:right-full *:first:before:-bottom-px *:first:before:w-2 *:first:before:border-b *:first:before:border-separator *:first:before:bg-page *:last:relative *:last:after:absolute *:last:after:top-0 *:last:after:-bottom-px *:last:after:left-full *:last:after:w-2 *:last:after:border-b *:last:after:border-separator *:last:after:bg-page"
      >
        {isPlaylist && (
          <th className="h-8 w-10 border-b border-separator pl-4 font-normal" scope="col">
            #
          </th>
        )}
        <SortableHeader buttonClassName="pl-14" field="title" onStepSort={onStepSort} sort={sort} />
        <SortableHeader
          buttonClassName="pl-4"
          className="hidden w-[30%] @3xl:table-cell @6xl:w-100"
          field="album"
          onStepSort={onStepSort}
          sort={sort}
        />
        <SortableHeader
          buttonClassName="pl-4"
          className="hidden w-36 @3xl:table-cell"
          field="added"
          onStepSort={onStepSort}
          sort={sort}
        />
        <th className="h-8 w-8 border-b border-separator font-normal" scope="col">
          <span className="sr-only">Like</span>
        </th>
        <SortableHeader
          buttonClassName="flex-row-reverse px-4"
          className="w-28"
          field="duration"
          onStepSort={onStepSort}
          sort={sort}
        />
      </tr>
    </thead>
  );
}

function SortableHeader({
  buttonClassName,
  className,
  field,
  onStepSort,
  sort,
}: {
  buttonClassName: string;
  className?: string;
  field: SortField;
  onStepSort?: (field: SortField) => void;
  sort: TrackSort;
}) {
  const direction = sort.field === field ? sort.direction : null;

  return (
    <th
      aria-sort={direction === null ? undefined : direction === "asc" ? "ascending" : "descending"}
      className={cn("h-8 border-b border-separator p-0 font-normal", className)}
      scope="col"
    >
      <button
        aria-label={sortName(sort, field)}
        className={cn(
          "group/sort flex h-8 w-full cursor-pointer items-center gap-1 focus-visible:-outline-offset-2",
          direction === null
            ? "text-secondary hover:text-primary focus-visible:text-primary"
            : "text-primary",
          buttonClassName,
        )}
        onClick={() => onStepSort?.(field)}
        type="button"
      >
        {sortFieldInfo(field).label}
        <SortArrow direction={direction} />
      </button>
    </th>
  );
}
