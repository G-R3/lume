import { SortArrow } from "@/components/sort-arrow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  sortFieldInfo,
  sortFields,
  sortName,
  type SortField,
  type TrackSort,
} from "@/lib/track-sort";

const fieldLabels = sortFields.map(({ label }) => label);

const directionLabels = [
  ...new Set(sortFields.flatMap(({ directions }) => [directions.asc, directions.desc])),
];

// Every label sits hidden in the same grid cell, so the box is as wide as the longest one
// and changing the sort never moves the layout around it.
function WidestOf({ labels, shown }: { labels: readonly string[]; shown: string | null }) {
  return (
    <span className="grid justify-items-end">
      {labels.map((label) => (
        <span
          aria-hidden={label !== shown}
          className={label === shown ? "[grid-area:1/1]" : "invisible [grid-area:1/1]"}
          key={label}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

export function SortMenu({
  onSort,
  sort,
}: {
  onSort: (field: SortField) => void;
  sort: TrackSort;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Sort: ${sortName(sort, sort.field)}`}
            className="gap-1 pr-1.5 pl-2 font-normal"
            variant="ghost"
          />
        }
      >
        <WidestOf labels={fieldLabels} shown={sortFieldInfo(sort.field).label} />
        <SortArrow direction={sort.direction} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" finalFocus>
        {/* Items step the sort on click, so picking the sorted field again flips it. */}
        <DropdownMenuRadioGroup value={sort.field}>
          {sortFields.map((option) => {
            const isSorted = sort.field === option.field;

            return (
              <DropdownMenuRadioItem
                className="gap-4 pr-2 [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden"
                closeOnClick
                key={option.field}
                onClick={() => onSort(option.field)}
                value={option.field}
              >
                {option.label}
                <span className="ml-auto flex items-center gap-1 text-meta whitespace-nowrap text-secondary">
                  <WidestOf
                    labels={directionLabels}
                    shown={isSorted ? option.directions[sort.direction] : null}
                  />
                  <span className={isSorted ? "contents" : "invisible contents"}>
                    <SortArrow direction={sort.direction} />
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
