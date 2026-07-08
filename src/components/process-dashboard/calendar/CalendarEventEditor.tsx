import type {
  ProcessCalendarEventView,
  ProcessCalendarPersonOption
} from "@/features/calendar/queries";
import { formatCompactDateTime, formatWindow } from "./date-helpers";
import { eventLabel } from "./event-helpers";
import type { ActionMode, DraftEvent, ProcessCalendarWaferOption, ProcessStepOption } from "./types";

type PersonSuggestion = {
  person: ProcessCalendarPersonOption;
  conflictReason: string | null;
};

type CalendarEventEditorProps = {
  actionMode: ActionMode;
  canEdit: boolean;
  description: string;
  draft: DraftEvent | null;
  error: string | null;
  filteredPeople: PersonSuggestion[];
  isPending: boolean;
  manualAction: string;
  personQuery: string;
  selectedEvent: ProcessCalendarEventView | null;
  selectedPeople: ProcessCalendarPersonOption[];
  selectedStepId: string;
  selectedWaferId: string;
  steps: ProcessStepOption[];
  wafers: ProcessCalendarWaferOption[];
  stepsById: Map<string, string>;
  onActionModeChange: (mode: ActionMode) => void;
  onAddPerson: (person: ProcessCalendarPersonOption) => void;
  onCancelDraft: () => void;
  onDescriptionChange: (value: string) => void;
  onManualActionChange: (value: string) => void;
  onPersonQueryChange: (value: string) => void;
  onRemovePerson: (personId: string) => void;
  onResetSelectedEvent: (event: ProcessCalendarEventView) => void;
  onSaveDraft: () => void;
  onSaveSelectedEvent: () => void;
  onSelectedStepIdChange: (stepId: string) => void;
  onSelectedWaferIdChange: (waferId: string) => void;
};

function EventFields({
  actionMode,
  canEdit,
  description,
  filteredPeople,
  manualAction,
  personQuery,
  selectedPeople,
  selectedStepId,
  selectedWaferId,
  steps,
  wafers,
  onActionModeChange,
  onAddPerson,
  onDescriptionChange,
  onManualActionChange,
  onPersonQueryChange,
  onRemovePerson,
  onSelectedStepIdChange,
  onSelectedWaferIdChange
}: Omit<
  CalendarEventEditorProps,
  | "draft"
  | "error"
  | "isPending"
  | "selectedEvent"
  | "stepsById"
  | "onCancelDraft"
  | "onResetSelectedEvent"
  | "onSaveDraft"
  | "onSaveSelectedEvent"
>) {
  return (
    <>
      <label className="field">
        <span>Step / action</span>
        <select
          value={actionMode === "step" ? selectedStepId : "__manual"}
          disabled={!canEdit}
          onChange={(event) => {
            if (event.target.value === "__manual") {
              onActionModeChange("manual");
              onSelectedStepIdChange("");
            } else {
              onActionModeChange("step");
              onSelectedStepIdChange(event.target.value);
            }
          }}
        >
          {steps.map((step) => (
            <option key={step.id} value={step.id}>
              {step.name}
            </option>
          ))}
          <option value="__manual">New action</option>
        </select>
      </label>

      {actionMode === "manual" ? (
        <label className="field">
          <span>New action</span>
          <input
            value={manualAction}
            disabled={!canEdit}
            onChange={(event) => onManualActionChange(event.target.value)}
            placeholder="Poling"
          />
        </label>
      ) : null}

      <label className="field">
        <span>Wafer / die</span>
        <select
          value={selectedWaferId}
          disabled={!canEdit}
          onChange={(event) => onSelectedWaferIdChange(event.target.value)}
        >
          <option value="">No wafer linked</option>
          {wafers.map((wafer) => (
            <option key={wafer.id} value={wafer.id}>
              {wafer.wafer_code}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>People</span>
        <div className="person-picker">
          <div className="person-chips">
            {selectedPeople.map((person) => (
              <button key={person.id} type="button" disabled={!canEdit} onClick={() => onRemovePerson(person.id)}>
                {person.display_name}
              </button>
            ))}
          </div>
          <input
            value={personQuery}
            disabled={!canEdit}
            onChange={(event) => onPersonQueryChange(event.target.value)}
            onKeyDown={(event) => {
              const firstAvailablePerson = filteredPeople.find((entry) => !entry.conflictReason)?.person;

              if (event.key === "Enter" && firstAvailablePerson) {
                event.preventDefault();
                onAddPerson(firstAvailablePerson);
              }
            }}
            placeholder="Type a name"
          />
          {personQuery.trim() ? (
            <div className="person-suggestions">
              {filteredPeople.map(({ person, conflictReason }) => (
                <button
                  disabled={!canEdit || Boolean(conflictReason)}
                  key={person.id}
                  type="button"
                  title={conflictReason ?? undefined}
                  onClick={() => onAddPerson(person)}
                >
                  <span>{person.display_name}</span>
                  {conflictReason ? <small>{conflictReason}</small> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <label className="field">
        <span>Additional information</span>
        <textarea
          value={description}
          disabled={!canEdit}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={4}
          placeholder="Notes, sample set, handoff details"
        />
      </label>
    </>
  );
}

export function CalendarEventEditor(props: CalendarEventEditorProps) {
  const {
    canEdit,
    draft,
    error,
    isPending,
    selectedEvent,
    stepsById,
    onCancelDraft,
    onResetSelectedEvent,
    onSaveDraft,
    onSaveSelectedEvent,
    ...fieldProps
  } = props;

  if (draft && canEdit) {
    return (
      <>
        <div className="calendar-inspector-header">
          <p className="eyebrow">New event</p>
          <h3>{draft.location}</h3>
          <p className="muted">{formatWindow(draft.startsAt, draft.endsAt)}</p>
        </div>

        <EventFields canEdit={canEdit} {...fieldProps} />

        {error ? <p className="form-error">{error}</p> : null}

        <div className="calendar-inspector-actions">
          <button className="button button-primary" disabled={isPending || !canEdit} type="button" onClick={onSaveDraft}>
            Save event
          </button>
          <button className="button" type="button" onClick={onCancelDraft}>
            Cancel
          </button>
        </div>
      </>
    );
  }

  if (selectedEvent) {
    return (
      <>
        <div className="calendar-inspector-header">
          <h3>{eventLabel(selectedEvent, stepsById)}</h3>
          <p className="muted">
            {selectedEvent.location} · {formatCompactDateTime(new Date(selectedEvent.starts_at))} -{" "}
            {formatCompactDateTime(new Date(selectedEvent.ends_at))}
          </p>
        </div>

        <EventFields canEdit={canEdit} {...fieldProps} />

        {error ? <p className="form-error">{error}</p> : null}

        <div className="calendar-inspector-actions">
          <button className="button button-primary" disabled={isPending || !canEdit} type="button" onClick={onSaveSelectedEvent}>
            Save event
          </button>
          {canEdit ? (
            <button className="button" type="button" onClick={() => onResetSelectedEvent(selectedEvent)}>
              Cancel
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div className="calendar-inspector-empty">
      <p className="eyebrow">Calendar</p>
      <h3>No event selected</h3>
      <p className="muted">Choose a bar to inspect it.</p>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
