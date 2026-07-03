import {
  HTMLAttributes,
  RefObject,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { ReactCalendarTimelineProps } from "react-calendar-timeline";
import type {
  CalendarPresentationMode,
  CalendarTimelineItem,
  DraftEvent,
  TimelineLocationGroup
} from "./types";

type TimelineItemRendererProps = Parameters<
  NonNullable<ReactCalendarTimelineProps<CalendarTimelineItem, TimelineLocationGroup>["itemRenderer"]>
>[0];

type RenderCalendarTimelineItemInput = {
  draft: DraftEvent | null;
  presentationMode: CalendarPresentationMode;
  selectedEventId: string | null;
  suppressedItemSelectionIdRef: RefObject<string | null>;
  ignoreStaleItemSelectionUntilRef: RefObject<number>;
  startItemDragSelectionBlock: () => void;
  stopItemDragSelectionBlock: () => void;
  rendererProps: TimelineItemRendererProps;
};

export function renderCalendarTimelineItem({
  draft,
  presentationMode,
  selectedEventId,
  suppressedItemSelectionIdRef,
  ignoreStaleItemSelectionUntilRef,
  startItemDragSelectionBlock,
  stopItemDragSelectionBlock,
  rendererProps
}: RenderCalendarTimelineItemInput) {
  const { item, itemContext, getItemProps, getResizeProps } = rendererProps;
  const isItemSelected = item.isDraft ? Boolean(draft) : item.id === selectedEventId;
  const resizeProps = getResizeProps();
  const { key, onPointerDown, onPointerUp, onPointerCancel, ...itemProps } = getItemProps({
    className: `ww-timeline-item ${item.toneClass} ${isItemSelected ? "ww-timeline-item--selected" : ""}`
  }) as HTMLAttributes<HTMLDivElement> & {
    key?: React.Key;
  };

  const handleItemPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    suppressedItemSelectionIdRef.current = null;
    ignoreStaleItemSelectionUntilRef.current = 0;
    startItemDragSelectionBlock();
    onPointerDown?.(event);
  };

  const handleItemPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerUp?.(event);
    stopItemDragSelectionBlock();
  };

  const handleItemPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerCancel?.(event);
    stopItemDragSelectionBlock();
  };

  return (
    <div
      key={key}
      {...itemProps}
      onPointerDown={handleItemPointerDown}
      onPointerUp={handleItemPointerUp}
      onPointerCancel={handleItemPointerCancel}
    >
      {itemContext.useResizeHandle ? (
        <div {...resizeProps.left} className="ww-timeline-resize ww-timeline-resize--left" />
      ) : null}
      <div className="ww-timeline-item-content">
        {presentationMode === "wireframe" ? (
          <>
            <div className="ww-timeline-item-title-row">
              <strong title={item.title}>{item.title}</strong>
              {item.badgeLabel ? <span className="ww-timeline-item-badge">{item.badgeLabel}</span> : null}
            </div>
            <span className="ww-timeline-item-person">
              {item.peopleLabel ? item.peopleLabel : "No one"}
            </span>
            <span className="ww-timeline-item-time">{item.timeLabel}</span>
          </>
        ) : (
          <>
            <strong>{item.title}</strong>
            <span>{item.peopleLabel || "Unassigned"}</span>
          </>
        )}
      </div>
      {itemContext.useResizeHandle ? (
        <div {...resizeProps.right} className="ww-timeline-resize ww-timeline-resize--right" />
      ) : null}
    </div>
  );
}
