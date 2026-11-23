import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import {
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const ROW_HEIGHT = 40;

const HEADER_HEIGHT = 32;

const LIST_INSET = 4;

export type TrackListBodyHandle = {
  focusRow: (index: number, sourceEntryId: number) => void;
  rowsPerPage: () => number;
  scrollToTop: () => void;
};

type TrackListBodyProps = {
  count: number;
  onReady?: (list: HTMLElement) => void;
  pinnedIndex: number;
  ref: Ref<TrackListBodyHandle>;
  renderRow: (index: number) => ReactNode;
};

// The React Compiler skips any component that calls `useVirtualizer`, so the virtualizer lives
// here, apart from TrackList.
export function TrackListBody({ count, onReady, pinnedIndex, ref, renderRow }: TrackListBodyProps) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const table = bodyRef.current?.closest("table");
    const container = table?.parentElement?.closest<HTMLElement>("[data-scroll-container]") ?? null;

    setScrollContainer(container);

    if (!table || !container) return;

    const measureScrollMargin = () =>
      setScrollMargin(
        table.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop,
      );

    measureScrollMargin();
    const observer = new ResizeObserver(measureScrollMargin);
    observer.observe(container);
    observer.observe(table);

    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count,
    enabled: Boolean(scrollContainer),
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollContainer,
    overscan: 8,
    paddingStart: HEADER_HEIGHT + LIST_INSET,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);

      return pinnedIndex < 0 || indexes.includes(pinnedIndex)
        ? indexes
        : [...indexes, pinnedIndex].sort((left, right) => left - right);
    },
    scrollMargin,
    scrollPaddingStart: HEADER_HEIGHT + LIST_INSET,
  });

  const mountedIndexes = scrollContainer
    ? virtualizer.getVirtualItems().map((virtualItem) => virtualItem.index)
    : [];

  const hasMountedRows = mountedIndexes.length > 0;

  useLayoutEffect(() => {
    const table = bodyRef.current?.closest("table");

    if (hasMountedRows && table) onReady?.(table);
  }, [hasMountedRows, onReady]);

  useImperativeHandle(ref, () => ({
    focusRow: (index, sourceEntryId) => {
      virtualizer.scrollToIndex(index);

      const row = bodyRef.current?.querySelector<HTMLElement>(
        `tr[data-entry-id="${sourceEntryId}"]`,
      );

      if (!row) throw new Error(`Row ${sourceEntryId} at ${index} is not mounted`);

      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    },
    rowsPerPage: () =>
      Math.max(1, Math.floor((scrollContainer?.clientHeight ?? 0) / ROW_HEIGHT) - 1),
    scrollToTop: () => scrollContainer?.scrollTo({ top: 0 }),
  }));

  const bodyRows: ReactNode[] = [];
  let nextUnmountedIndex = 0;

  const addSpacerRow = (untilIndex: number) => {
    if (untilIndex <= nextUnmountedIndex) return;

    bodyRows.push(
      <tr aria-hidden="true" key={`spacer-${nextUnmountedIndex}`}>
        <td style={{ height: (untilIndex - nextUnmountedIndex) * ROW_HEIGHT }} />
      </tr>,
    );
  };

  for (const index of mountedIndexes) {
    addSpacerRow(index);
    bodyRows.push(renderRow(index));
    nextUnmountedIndex = index + 1;
  }

  if (scrollContainer) addSpacerRow(count);

  return (
    <tbody className="before:table-row before:h-1" ref={bodyRef}>
      {bodyRows}
    </tbody>
  );
}
