import assert from "node:assert/strict";
import test from "node:test";
import { getInitialGraph } from "./graphSeed";

test("keeps anytime steps disconnected even if stale transitions still reference them", () => {
  const graph = getInitialGraph([
    {
      id: "cleaning",
      name: "Cleaning",
      process_area: "Clean",
      step_order: 10,
      node_type: "start",
      execution_mode: "main",
      canvas_x: 100,
      canvas_y: 100,
      wafers: []
    },
    {
      id: "piranha",
      name: "Piranha",
      process_area: "Clean",
      step_order: 20,
      node_type: "procedure",
      execution_mode: "anytime",
      canvas_x: 700,
      canvas_y: 100,
      wafers: []
    },
    {
      id: "deposition",
      name: "Deposition",
      process_area: "Deposition",
      step_order: 30,
      node_type: "end",
      execution_mode: "main",
      canvas_x: 100,
      canvas_y: 400,
      wafers: []
    }
  ], [
    {
      id: "cleaning-piranha",
      from_step_id: "cleaning",
      to_step_id: "piranha",
      edge_type: "flow",
      label: null,
      priority: 10
    },
    {
      id: "piranha-deposition",
      from_step_id: "piranha",
      to_step_id: "deposition",
      edge_type: "flow",
      label: null,
      priority: 20
    }
  ]);

  assert.deepEqual(graph.edges, []);
  assert.equal(graph.nodes.find((node) => node.id === "piranha")?.executionMode, "anytime");
});
