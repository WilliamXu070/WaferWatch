#!/usr/bin/env node

import process from "node:process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const CANONICAL_STEPS = [
  {
    step_order: 10,
    name: "Dicing",
    slug: "dicing",
    process_area: "dicing",
    node_type: "start",
    expected_duration_minutes: 60,
    queue_target_minutes: 240,
    required_tool_type: "dicing-saw",
    requires_recipe: false,
    instructions: "Dice the incoming wafer into tracked die pieces."
  },
  {
    step_order: 20,
    name: "Sample cleaning / EBL prep",
    slug: "sample-cleaning-ebl-prep",
    process_area: "cleaning",
    node_type: "procedure",
    expected_duration_minutes: 90,
    queue_target_minutes: 240,
    required_tool_type: "wet-bench",
    requires_recipe: false,
    instructions: "Clean diced samples and prepare them for EBL."
  },
  {
    step_order: 30,
    name: "Chrome deposition",
    slug: "chrome-deposition",
    process_area: "deposition",
    node_type: "procedure",
    expected_duration_minutes: 90,
    queue_target_minutes: 240,
    required_tool_type: "evaporator",
    requires_recipe: true,
    instructions: "Deposit chrome for the active sample run."
  },
  {
    step_order: 40,
    name: "EBL lithography",
    slug: "ebl-lithography",
    process_area: "lithography",
    node_type: "procedure",
    expected_duration_minutes: 240,
    queue_target_minutes: 480,
    required_tool_type: "ebl",
    requires_recipe: true,
    instructions: "Run EBL lithography on prepared samples."
  },
  {
    step_order: 50,
    name: "Pad fabrication",
    slug: "pad-fabrication",
    process_area: "fabrication",
    node_type: "procedure",
    expected_duration_minutes: 180,
    queue_target_minutes: 480,
    required_tool_type: "fabrication",
    requires_recipe: true,
    instructions: "Fabricate pads after lithography."
  },
  {
    step_order: 60,
    name: "PL2",
    slug: "pl2",
    process_area: "characterization",
    node_type: "procedure",
    expected_duration_minutes: 90,
    queue_target_minutes: 240,
    required_tool_type: "pl-station",
    requires_recipe: false,
    instructions: "Run PL2 characterization."
  },
  {
    step_order: 70,
    name: "Poling",
    slug: "poling",
    process_area: "poling",
    node_type: "procedure",
    expected_duration_minutes: 120,
    queue_target_minutes: 240,
    required_tool_type: "poling-station",
    requires_recipe: true,
    instructions: "Pole the prepared samples."
  },
  {
    step_order: 80,
    name: "Inspection",
    slug: "inspection",
    process_area: "inspection",
    node_type: "end",
    expected_duration_minutes: 60,
    queue_target_minutes: 240,
    required_tool_type: "inspection",
    requires_recipe: false,
    instructions: "Inspect final sample results."
  }
];

const COMMANDS = new Set(["seed", "verify"]);
const command = process.argv[2] ?? "verify";

if (!COMMANDS.has(command)) {
  console.error(`Unknown command "${command}". Expected one of: ${Array.from(COMMANDS).join(", ")}`);
  process.exit(1);
}

function getEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getAdminKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
}

function parseFlags() {
  const flags = new Map();
  for (const raw of process.argv.slice(3)) {
    if (!raw.startsWith("--")) {
      continue;
    }

    const [key, value = "true"] = raw.slice(2).split("=");
    flags.set(key, value);
  }

  return flags;
}

function createSupabase() {
  const key = getAdminKey();
  if (!key) {
    throw new Error("Missing Supabase service role environment variable.");
  }

  return createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function getTargetTemplate(supabase, flags) {
  const requestedTemplateId = flags.get("template-id") ?? process.env.PROCESS_TEMPLATE_ID;
  if (requestedTemplateId) {
    const { data, error } = await supabase
      .from("process_templates")
      .select("id, name, version, owner_project_id, is_active, updated_at")
      .eq("id", requestedTemplateId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from("process_templates")
    .select("id, name, version, owner_project_id, is_active, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("No active process template found. Pass --template-id=<uuid>.");
  }

  return data;
}

async function loadSteps(supabase, templateId) {
  const { data, error } = await supabase
    .from("process_steps")
    .select("*")
    .eq("template_id", templateId)
    .order("step_order", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

function stepPatch(templateId, existingStep, step, index) {
  const row = {
    id: existingStep?.id ?? randomUUID(),
    template_id: templateId,
    ...step,
    canvas_x: 120 + index * 300,
    canvas_y: index % 2 === 0 ? 180 : 360,
    parameters_schema: {}
  };

  return row;
}

async function seed(supabase, template) {
  const existingSteps = await loadSteps(supabase, template.id);
  const usedStepIds = new Set();
  const rows = CANONICAL_STEPS.map((step, index) => {
    const matchingBySlug = existingSteps.find(
      (existingStep) => existingStep.slug === step.slug && !usedStepIds.has(existingStep.id)
    );
    const fallbackByOrder = existingSteps.find((existingStep) => !usedStepIds.has(existingStep.id));
    const existingStep = matchingBySlug ?? fallbackByOrder;
    if (existingStep) {
      usedStepIds.add(existingStep.id);
    }

    return stepPatch(template.id, existingStep, step, index);
  });

  const { data: savedSteps, error: stepsError } = await supabase
    .from("process_steps")
    .upsert(rows, { onConflict: "id" })
    .select("id, name, slug, step_order")
    .order("step_order", { ascending: true });

  if (stepsError) {
    throw stepsError;
  }

  const canonicalStepIds = new Set(rows.map((row) => row.id));
  const extraStepIds = existingSteps
    .filter((step) => !canonicalStepIds.has(step.id))
    .map((step) => step.id);

  if (extraStepIds.length) {
    const { error: extraTransitionError } = await supabase
      .from("process_step_transitions")
      .delete()
      .eq("template_id", template.id)
      .or(`from_step_id.in.(${extraStepIds.join(",")}),to_step_id.in.(${extraStepIds.join(",")})`);

    if (extraTransitionError) {
      throw extraTransitionError;
    }

    const { error: extraStepError } = await supabase
      .from("process_steps")
      .delete()
      .in("id", extraStepIds);

    if (extraStepError) {
      throw extraStepError;
    }
  }

  const { error: deleteTransitionsError } = await supabase
    .from("process_step_transitions")
    .delete()
    .eq("template_id", template.id);

  if (deleteTransitionsError) {
    throw deleteTransitionsError;
  }

  const transitions = rows.slice(0, -1).map((step, index) => ({
    id: randomUUID(),
    template_id: template.id,
    from_step_id: step.id,
    to_step_id: rows[index + 1].id,
    edge_type: "flow",
    label: null,
    condition: {},
    priority: (index + 1) * 10
  }));

  const { error: insertTransitionsError } = await supabase
    .from("process_step_transitions")
    .insert(transitions);

  if (insertTransitionsError) {
    throw insertTransitionsError;
  }

  console.log(
    JSON.stringify(
      {
        template,
        seededSteps: savedSteps,
        transitionCount: transitions.length
      },
      null,
      2
    )
  );
}

async function verify(supabase, template) {
  const steps = await loadSteps(supabase, template.id);
  const firstEight = steps.slice(0, CANONICAL_STEPS.length);
  const nameMismatches = CANONICAL_STEPS.flatMap((expected, index) => {
    const actual = firstEight[index];
    return actual?.name === expected.name && actual.step_order === expected.step_order
      ? []
      : [{ index, expected: expected.name, actual: actual?.name ?? null }];
  });

  const { data: transitions, error: transitionError } = await supabase
    .from("process_step_transitions")
    .select("from_step_id, to_step_id")
    .eq("template_id", template.id);

  if (transitionError) {
    throw transitionError;
  }

  const transitionPairs = new Set((transitions ?? []).map((transition) => `${transition.from_step_id}:${transition.to_step_id}`));
  const transitionMismatches = firstEight.slice(0, -1).flatMap((step, index) => {
    const nextStep = firstEight[index + 1];
    return nextStep && transitionPairs.has(`${step.id}:${nextStep.id}`)
      ? []
      : [{ from: step.name, to: nextStep?.name ?? null }];
  });

  const ok = steps.length === CANONICAL_STEPS.length && !nameMismatches.length && !transitionMismatches.length;
  console.log(
    JSON.stringify(
      {
        ok,
        template,
        stepCount: steps.length,
        steps: steps.map((step) => step.name),
        transitionCount: transitions?.length ?? 0,
        nameMismatches,
        transitionMismatches
      },
      null,
      2
    )
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

const flags = parseFlags();
const supabase = createSupabase();
const template = await getTargetTemplate(supabase, flags);

if (command === "seed") {
  await seed(supabase, template);
} else {
  await verify(supabase, template);
}
