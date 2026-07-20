import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StepParameterHistory } from "./StepParameterHistory";

test("shows the latest selected-step parameter snapshot", () => {
  const markup = renderToStaticMarkup(
    <StepParameterHistory
      projectId="11111111-1111-4111-8111-111111111111"
      waferId="22222222-2222-4222-8222-222222222222"
      stepId="33333333-3333-4333-8333-333333333333"
      stepExecutionId="44444444-4444-4444-8444-444444444444"
      canEdit
      onSave={async () => ({ ok: true, data: null })}
      records={[{
      id: "record-1",
      revision: 2,
      movementMutationId: "movement-1",
      recordedAt: "2026-07-15T12:05:00.000Z",
      recordedById: "user-1",
      recordedByName: "William",
      notes: "Used the standard cleaning sequence.",
      values: [
        {
          id: "blade-speed",
          key: "blade_speed",
          label: "Blade speed",
          type: "number",
          value: 30000,
          unit: "rpm",
          notes: "Nominal spindle setting",
          scope: "global"
        },
        {
          id: "operator-observation",
          key: "operator_observation",
          label: "Operator observation",
          type: "text",
          value: "Clean cut",
          unit: "",
          notes: "No visible chipping",
          scope: "local"
        }
      ]
    }]} />
  );

  assert.match(markup, /Selected step parameters/);
  assert.match(markup, /Parameter/);
  assert.match(markup, /Value/);
  assert.match(markup, /Notes/);
  assert.match(markup, /Blade speed/);
  assert.match(markup, /30000/);
  assert.match(markup, /Nominal spindle setting/);
  assert.match(markup, /Operator observation/);
  assert.match(markup, /No visible chipping/);
  assert.match(markup, /Add parameter/);
  assert.match(markup, /wafer-step-parameter-sheet__content/);
  assert.match(markup, /wafer-step-parameter-sheet__row/);
  assert.doesNotMatch(markup, /Set note/);
  assert.doesNotMatch(markup, /Optional context for this parameter set/);
});
