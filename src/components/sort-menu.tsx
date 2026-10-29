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

function WidestLabelSlot({ labels, shown }: { labels: readonly string[]; shown: string | null }) {
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
  onStepSort,
  sort,
}: {
  onStepSort: (field: SortField) => void;
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
        <WidestLabelSlot labels={fieldLabels} shown={sortFieldInfo(sort.field).label} />
        <SortArrow direction={sort.direction} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" finalFocus>
        <DropdownMenuRadioGroup value={sort.field}>
          {sortFields.map((option) => {
            const isSorted = sort.field === option.field;

            return (
              <DropdownMenuRadioItem
                className="gap-4 pr-2 [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden"
                closeOnClick
                key={option.field}
                onClick={() => onStepSort(option.field)}
                value={option.field}
              >
                {option.label}
                <span className="ml-auto flex items-center gap-1 text-meta whitespace-nowrap text-secondary">
                  <WidestLabelSlot
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
