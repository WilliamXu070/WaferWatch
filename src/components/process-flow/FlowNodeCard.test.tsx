import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowNodeCard } from "./FlowNodeCard";
import type { FlowNode } from "./types";

const node: FlowNode = {
  id: "cleaning",
  label: "Cleaning",
  subLabel: "Process step",
  x: 0,
  y: 0,
  width: 392,
  height: 176,
  role: "normal",
  executionMode: "main",
  order: 2,
  parametersSchema: {},
  revision: 1,
  wafers: [
    {
      assignmentId: "beginning",
      waferCode: "ALPHA_1",
      dieLabel: null,
      currentStepStatus: "queued"
    },
    {
      assignmentId: "complete",
      waferCode: "ALPHA_2",
      dieLabel: null,
      currentStepStatus: "ready_to_move"
    }
  ]
};

test("renders Beginning and Complete selection through the same wafer chip component", () => {
  const markup = renderToStaticMarkup(
    <svg>
      <FlowNodeCard
        node={node}
        isConnecting={false}
        isDragging={false}
        dropTargetKind={null}
        isSelected={false}
        selectedWaferAssignmentIds={new Set(["beginning", "complete"])}
        syncStateByAssignmentId={new Map([["complete", "saving_move"]])}
        isEditing={false}
        editingNodeLabel=""
        editingInputRef={{ current: null }}
        onNodePointerDown={() => undefined}
        onNodePointerMove={() => undefined}
        onNodePointerUp={() => undefined}
        onNodePointerCancel={() => undefined}
        onNodeContextMenu={() => undefined}
        onBeginLabelEdit={() => undefined}
        onEditingLabelChange={() => undefined}
        onCommitLabel={() => undefined}
        onCancelLabelEdit={() => undefined}
        onBeginWaferDrag={() => undefined}
        onPrefetchWaferDetails={() => undefined}
        onOpenWaferDetails={() => undefined}
        onOpenStepParameters={() => undefined}
      />
    </svg>
  );

  assert.equal((markup.match(/flow-wafer-chip--selected/g) ?? []).length, 2);
  assert.match(markup, /flow-wafer-chip--queued flow-wafer-chip--selected/);
  assert.match(markup, /flow-wafer-chip--ready-to-move[^\"]*flow-wafer-chip--selected/);
  assert.match(markup, /data-sync-state="saving_move"/);
  assert.match(markup, /flow-wafer-chip--sync-saving-move/);
  assert.equal((markup.match(/flow-node-wafer-touch-layer/g) ?? []).length, 2);
  assert.match(markup, /data-checkpoint-phase="beginning"/);
  assert.match(markup, /data-checkpoint-phase="complete"/);
  assert.doesNotMatch(markup, /flow-node-complete-touch-layer/);
  assert.match(markup, /clipPath id="flow-node-phase-clip-cleaning"/);
  assert.match(markup, /clip-path="url\(#flow-node-phase-clip-cleaning\)"/);
  assert.match(markup, /data-node-id="cleaning"[^>]*tabindex="-1"/);
});

test("renders an anytime procedure as a clearly separate disconnected step", () => {
  const markup = renderToStaticMarkup(
    <svg>
      <FlowNodeCard
        node={{ ...node, executionMode: "anytime", wafers: [] }}
        isConnecting={false}
        isDragging={false}
        dropTargetKind={null}
        isSelected={false}
        selectedWaferAssignmentIds={new Set()}
        isEditing={false}
        editingNodeLabel=""
        editingInputRef={{ current: null }}
        onNodePointerDown={() => undefined}
        onNodePointerMove={() => undefined}
        onNodePointerUp={() => undefined}
        onNodePointerCancel={() => undefined}
        onNodeContextMenu={() => undefined}
        onBeginLabelEdit={() => undefined}
        onEditingLabelChange={() => undefined}
        onCommitLabel={() => undefined}
        onCancelLabelEdit={() => undefined}
        onBeginWaferDrag={() => undefined}
        onPrefetchWaferDetails={() => undefined}
        onOpenWaferDetails={() => undefined}
        onOpenStepParameters={() => undefined}
      />
    </svg>
  );

  assert.match(markup, /flow-node--anytime/);
  assert.match(markup, />Anytime</);
});
