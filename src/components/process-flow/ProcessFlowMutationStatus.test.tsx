import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessFlowMutationStatus } from "./ProcessFlowMutationStatus";

test("renders accessible per-die saving, sync, and retry states", () => {
  const markup = renderToStaticMarkup(
    <ProcessFlowMutationStatus
      items={[
        { assignmentId: "a1", label: "A1", mutationId: "m1", state: "saving_move" },
        { assignmentId: "a2", label: "A2", mutationId: "m2", state: "synced" },
        { assignmentId: "a3", label: "A3", mutationId: "m3", state: "failed", retry: () => undefined }
      ]}
      onDismiss={() => undefined}
    />
  );
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /Moving A1…/);
  assert.match(markup, /A2 synced/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, />Retry</);
  assert.match(markup, /data-sync-state="failed"/);
});
