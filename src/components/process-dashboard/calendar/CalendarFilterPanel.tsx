import type { ProcessCalendarPersonOption } from "@/features/calendar/queries";
import { toggleSelection } from "./event-helpers";
import type { StageFilterId } from "./types";

type FilterOption = {
  id: StageFilterId;
  name: string;
};

type CalendarFilterPanelProps = {
  people: ProcessCalendarPersonOption[];
  filterPersonIds: string[];
  filterStageIds: StageFilterId[];
  isExpanded: boolean;
  personFilterSummary: string;
  stageFilterSummary: string;
  stageFilterOptions: FilterOption[];
  onExpandedChange: (expanded: boolean) => void;
  onPersonFilterChange: (personIds: string[]) => void;
  onStageFilterChange: (stageIds: StageFilterId[]) => void;
};

export function CalendarFilterPanel({
  people,
  filterPersonIds,
  filterStageIds,
  isExpanded,
  personFilterSummary,
  stageFilterSummary,
  stageFilterOptions,
  onExpandedChange,
  onPersonFilterChange,
  onStageFilterChange
}: CalendarFilterPanelProps) {
  return (
    <div className="calendar-filter-panel">
      <div className="calendar-filter-panel__header">
        <div>
          <p className="eyebrow">Show</p>
          <h3>Calendar filters</h3>
        </div>
        <button
          aria-expanded={isExpanded}
          className="calendar-filter-panel__toggle"
          type="button"
          onClick={() => onExpandedChange(!isExpanded)}
        >
          {isExpanded ? "Compact" : "Expand"}
        </button>
      </div>

      {isExpanded ? (
        <>
          <div className="calendar-filter-group">
            <div className="calendar-filter-group__label">
              <span>People</span>
            </div>
            <div className="calendar-filter-chip-list">
              <button
                aria-pressed={filterPersonIds.length === 0}
                className={filterPersonIds.length === 0 ? "is-selected" : ""}
                type="button"
                onClick={() => onPersonFilterChange([])}
              >
                Everyone
              </button>
              {people.map((person) => (
                <button
                  aria-pressed={filterPersonIds.includes(person.id)}
                  className={filterPersonIds.includes(person.id) ? "is-selected" : ""}
                  key={person.id}
                  type="button"
                  onClick={() => onPersonFilterChange(toggleSelection(filterPersonIds, person.id))}
                >
                  {person.display_name}
                </button>
              ))}
            </div>
          </div>

          <div className="calendar-filter-group">
            <div className="calendar-filter-group__label">
              <span>Process stage</span>
            </div>
            <div className="calendar-filter-chip-list">
              <button
                aria-pressed={filterStageIds.length === 0}
                className={filterStageIds.length === 0 ? "is-selected" : ""}
                type="button"
                onClick={() => onStageFilterChange([])}
              >
                All stages
              </button>
              {stageFilterOptions.map((stage) => (
                <button
                  aria-pressed={filterStageIds.includes(stage.id)}
                  className={filterStageIds.includes(stage.id) ? "is-selected" : ""}
                  key={stage.id}
                  type="button"
                  onClick={() => onStageFilterChange(toggleSelection(filterStageIds, stage.id))}
                >
                  {stage.name}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="calendar-filter-summary">
          <button type="button" onClick={() => onExpandedChange(true)}>
            <span>People</span>
            <strong>{personFilterSummary}</strong>
          </button>
          <button type="button" onClick={() => onExpandedChange(true)}>
            <span>Process stage</span>
            <strong>{stageFilterSummary}</strong>
          </button>
        </div>
      )}
    </div>
  );
}
