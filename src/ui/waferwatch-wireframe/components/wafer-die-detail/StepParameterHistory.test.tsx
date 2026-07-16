import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StepParameterHistory } from "./StepParameterHistory";

test("shows the latest selected-step parameter snapshot", () => {
  const markup = renderToStaticMarkup(
    <StepParameterHistory records={[{
      id: "record-1",
      movementMutationId: "movement-1",
      recordedAt: "2026-07-15T12:05:00.000Z",
      recordedById: "user-1",
      recordedByName: "William",
      notes: "Used the standard cleaning sequence.",
      values: [
        {
          key: "blade_speed",
          label: "Blade speed",
          value: 30000,
          unit: "rpm",
          scope: "global"
        },
        {
          key: "operator_observation",
          label: "Operator observation",
          value: "Clean cut",
          unit: "",
          scope: "local"
        }
      ]
    }]} />
  );

  assert.match(markup, /Step parameters/);
  assert.match(markup, /Recorded by William/);
  assert.match(markup, /Blade speed/);
  assert.match(markup, /30000 rpm/);
  assert.match(markup, /Operator observation/);
  assert.match(markup, /local/);
  assert.match(markup, /Used the standard cleaning sequence/);
});
