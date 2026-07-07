#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const FIXTURE = {
  projectId: "11111111-1111-4111-8111-111111111101",
  lotId: "11111111-1111-4111-8111-111111111102",
  templateId: "11111111-1111-4111-8111-111111111103",
  alphaWaferId: "11111111-1111-4111-8111-111111111104",
  betaWaferId: "11111111-1111-4111-8111-111111111105",
  alphaAssignmentId: "11111111-1111-4111-8111-111111111106",
  betaAssignmentId: "11111111-1111-4111-8111-111111111107",
  calendarEventId: "11111111-1111-4111-8111-111111111108",
  processEventId: "11111111-1111-4111-8111-111111111109",
  personName: "Codex Wireframe Verifier",
  projectSlug: "codex-wireframe-fixture",
  projectName: "Codex Wireframe Fixture",
  templateName: "Codex Wireframe Verification Flow",
  templateVersion: "2026.07.03",
  lotCode: "CODEX-WF-LOT",
  alphaWaferCode: "ALPHA-VERIFY-01",
  betaWaferCode: "BETA-VERIFY-02",
  textScopeType: "wireframe:wafer",
  textFieldKey: "status_note",
  textValue: "Fixture note: backend text surface is persisted.",
  startIso: "2026-07-06T14:00:00.000Z",
  endIso: "2026-07-06T16:00:00.000Z"
};

const START_DIE_FIXTURES = Array.from({ length: 8 }, (_, index) => {
  const dieNumber = index + 1;
  const suffix = String(dieNumber).padStart(2, "0");
  return {
    waferId: `11111111-1111-4111-8111-1111111114${suffix}`,
    assignmentId: `11111111-1111-4111-8111-1111111115${suffix}`,
    dieLabel: `A${dieNumber}`,
    waferCode: `A${dieNumber}`
  };
});

const STEPS = [
  {
    id: "11111111-1111-4111-8111-111111111201",
    step_order: 10,
    name: "Fixture intake",
    slug: "fixture-intake",
    process_area: "intake",
    expected_duration_minutes: 60,
    queue_target_minutes: 120,
    required_tool_type: null,
    requires_recipe: false,
    instructions: "Fixture intake step for wireframe backend verification."
  },
  {
    id: "11111111-1111-4111-8111-111111111202",
    step_order: 20,
    name: "Fixture poling",
    slug: "fixture-poling",
    process_area: "poling",
    expected_duration_minutes: 120,
    queue_target_minutes: 240,
    required_tool_type: "poling-station",
    requires_recipe: true,
    instructions: "Fixture poling step for active wafer movement checks."
  },
  {
    id: "11111111-1111-4111-8111-111111111203",
    step_order: 30,
    name: "Fixture inspection",
    slug: "fixture-inspection",
    process_area: "inspection",
    expected_duration_minutes: 60,
    queue_target_minutes: 240,
    required_tool_type: "inspection",
    requires_recipe: false,
    instructions: "Fixture inspection step for blocked-state checks."
  },
  {
    id: "11111111-1111-4111-8111-111111111204",
    step_order: 40,
    name: "Fixture complete",
    slug: "fixture-complete",
    process_area: "complete",
    expected_duration_minutes: 60,
    queue_target_minutes: 240,
    required_tool_type: null,
    requires_recipe: false,
    instructions: "Fixture completion step."
  }
];

const EXECUTIONS = [
  {
    id: "11111111-1111-4111-8111-111111111301",
    assignment_id: FIXTURE.alphaAssignmentId,
    wafer_id: FIXTURE.alphaWaferId,
    process_step_id: STEPS[0].id,
    status: "completed",
    planned_start_at: "2026-07-06T12:00:00.000Z",
    planned_end_at: "2026-07-06T13:00:00.000Z",
    queue_started_at: null,
    started_at: "2026-07-06T12:00:00.000Z",
    completed_at: "2026-07-06T12:55:00.000Z",
    run_notes: "Fixture intake completed for alpha wafer.",
    metadata: { fixture: "wireframe" }
  },
  {
    id: "11111111-1111-4111-8111-111111111302",
    assignment_id: FIXTURE.alphaAssignmentId,
    wafer_id: FIXTURE.alphaWaferId,
    process_step_id: STEPS[1].id,
    status: "running",
    planned_start_at: "2026-07-06T14:00:00.000Z",
    planned_end_at: "2026-07-06T16:00:00.000Z",
    queue_started_at: "2026-07-06T13:30:00.000Z",
    started_at: "2026-07-06T14:03:00.000Z",
    completed_at: null,
    run_notes: "Fixture alpha is running in poling.",
    metadata: { fixture: "wireframe" }
  },
  {
    id: "11111111-1111-4111-8111-111111111303",
    assignment_id: FIXTURE.alphaAssignmentId,
    wafer_id: FIXTURE.alphaWaferId,
    process_step_id: STEPS[2].id,
    status: "pending",
    planned_start_at: null,
    planned_end_at: null,
    queue_started_at: null,
    started_at: null,
    completed_at: null,
    run_notes: null,
    metadata: { fixture: "wireframe" }
  },
  {
    id: "11111111-1111-4111-8111-111111111304",
    assignment_id: FIXTURE.alphaAssignmentId,
    wafer_id: FIXTURE.alphaWaferId,
    process_step_id: STEPS[3].id,
    status: "pending",
    planned_start_at: null,
    planned_end_at: null,
    queue_started_at: null,
    started_at: null,
    completed_at: null,
    run_notes: null,
    metadata: { fixture: "wireframe" }
  },
  {
    id: "11111111-1111-4111-8111-111111111305",
    assignment_id: FIXTURE.betaAssignmentId,
    wafer_id: FIXTURE.betaWaferId,
    process_step_id: STEPS[0].id,
    status: "completed",
    planned_start_at: "2026-07-06T13:00:00.000Z",
    planned_end_at: "2026-07-06T14:00:00.000Z",
    queue_started_at: null,
    started_at: "2026-07-06T13:03:00.000Z",
    completed_at: "2026-07-06T13:57:00.000Z",
    run_notes: "Fixture intake completed for beta wafer.",
    metadata: { fixture: "wireframe" }
  },
  {
    id: "11111111-1111-4111-8111-111111111306",
    assignment_id: FIXTURE.betaAssignmentId,
    wafer_id: FIXTURE.betaWaferId,
    process_step_id: STEPS[1].id,
    status: "completed",
    planned_start_at: "2026-07-06T14:00:00.000Z",
    planned_end_at: "2026-07-06T15:00:00.000Z",
    queue_started_at: null,
    started_at: "2026-07-06T14:10:00.000Z",
    completed_at: "2026-07-06T14:55:00.000Z",
    run_notes: "Fixture beta completed poling.",
    metadata: { fixture: "wireframe" }
  },
  {
    id: "11111111-1111-4111-8111-111111111307",
    assignment_id: FIXTURE.betaAssignmentId,
    wafer_id: FIXTURE.betaWaferId,
    process_step_id: STEPS[2].id,
    status: "blocked",
    planned_start_at: "2026-07-06T16:00:00.000Z",
    planned_end_at: "2026-07-06T17:00:00.000Z",
    queue_started_at: "2026-07-06T15:30:00.000Z",
    started_at: "2026-07-06T16:05:00.000Z",
    completed_at: null,
    run_notes: "Fixture beta is blocked at inspection.",
    metadata: { fixture: "wireframe" }
  },
  {
    id: "11111111-1111-4111-8111-111111111308",
    assignment_id: FIXTURE.betaAssignmentId,
    wafer_id: FIXTURE.betaWaferId,
    process_step_id: STEPS[3].id,
    status: "pending",
    planned_start_at: null,
    planned_end_at: null,
    queue_started_at: null,
    started_at: null,
    completed_at: null,
    run_notes: null,
    metadata: { fixture: "wireframe" }
  }
];

const COMMANDS = new Set(["snapshot", "clear", "seed", "verify"]);
const command = process.argv[2] ?? "snapshot";

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

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findDefaultAuthStatePath() {
  const candidates = [
    path.join(process.cwd(), "playwright/.auth/user.json"),
    path.join(process.cwd(), "../../playwright/.auth/user.json")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function decodeBase64Url(value) {
  const padded = value.padEnd(value.length + (4 - (value.length % 4 || 4)) % 4, "=");
  return Buffer.from(padded.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
}

function decodeCookiePayload(value) {
  const decoded = decodeURIComponent(value);
  const raw = decoded.startsWith("base64-")
    ? Buffer.from(decoded.slice("base64-".length), "base64").toString("utf8")
    : decoded;

  return JSON.parse(raw);
}

function extractAccessToken(cookiePayload) {
  if (Array.isArray(cookiePayload)) {
    return typeof cookiePayload[0] === "string" ? cookiePayload[0] : null;
  }

  if (cookiePayload && typeof cookiePayload === "object") {
    const token = cookiePayload.access_token;
    return typeof token === "string" ? token : null;
  }

  return null;
}

function extractUserIdFromAuthState(authStatePath) {
  const state = readJsonIfExists(authStatePath);
  const cookies = Array.isArray(state?.cookies) ? state.cookies : [];
  const authCookie = cookies.find(
    (cookie) =>
      typeof cookie.name === "string" &&
      cookie.name.startsWith("sb-") &&
      cookie.name.endsWith("-auth-token")
  );

  if (!authCookie?.value) {
    return null;
  }

  const accessToken = extractAccessToken(decodeCookiePayload(authCookie.value));
  if (!accessToken) {
    return null;
  }

  const [, payload] = accessToken.split(".");
  if (!payload) {
    return null;
  }

  const claims = JSON.parse(decodeBase64Url(payload));
  return typeof claims.sub === "string" ? claims.sub : null;
}

async function assertOk(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result.data;
}

async function countRows(supabase, table, queryBuilder) {
  const query = queryBuilder(supabase.from(table).select("*", { count: "exact", head: true }));
  const { count, error } = await query;
  if (error) {
    throw new Error(`${table} count failed: ${error.message}`);
  }

  return count ?? 0;
}

async function fixtureCounts(supabase) {
  const fixtureAssignmentIds = [
    FIXTURE.alphaAssignmentId,
    FIXTURE.betaAssignmentId,
    ...START_DIE_FIXTURES.map((die) => die.assignmentId)
  ];

  return {
    projects: await countRows(supabase, "projects", (query) => query.eq("id", FIXTURE.projectId)),
    projectMembers: await countRows(supabase, "project_members", (query) => query.eq("project_id", FIXTURE.projectId)),
    templates: await countRows(supabase, "process_templates", (query) => query.eq("id", FIXTURE.templateId)),
    steps: await countRows(supabase, "process_steps", (query) => query.eq("template_id", FIXTURE.templateId)),
    people: await countRows(supabase, "process_people", (query) => query.eq("display_name", FIXTURE.personName)),
    lots: await countRows(supabase, "wafer_lots", (query) => query.eq("id", FIXTURE.lotId)),
    wafers: await countRows(supabase, "wafers", (query) => query.eq("project_id", FIXTURE.projectId)),
    assignments: await countRows(supabase, "wafer_process_assignments", (query) =>
      query.in("id", fixtureAssignmentIds)
    ),
    executions: await countRows(supabase, "step_executions", (query) =>
      query.in("assignment_id", [FIXTURE.alphaAssignmentId, FIXTURE.betaAssignmentId])
    ),
    calendarEvents: await countRows(supabase, "process_calendar_events", (query) => query.eq("id", FIXTURE.calendarEventId)),
    textSurfaces: await countRows(supabase, "text_surfaces", (query) => query.eq("project_id", FIXTURE.projectId)),
    processEvents: await countRows(supabase, "process_events", (query) => query.eq("project_id", FIXTURE.projectId))
  };
}

async function globalCounts(supabase) {
  const tables = [
    "projects",
    "process_templates",
    "process_steps",
    "process_people",
    "wafers",
    "wafer_process_assignments",
    "step_executions",
    "process_calendar_events",
    "text_surfaces"
  ];
  const output = {};

  for (const table of tables) {
    output[table] = await countRows(supabase, table, (query) => query);
  }

  return output;
}

async function clearFixture(supabase) {
  const fixtureAssignmentIds = [
    FIXTURE.alphaAssignmentId,
    FIXTURE.betaAssignmentId,
    ...START_DIE_FIXTURES.map((die) => die.assignmentId)
  ];

  await assertOk(
    await supabase
      .from("process_calendar_event_people")
      .delete()
      .eq("event_id", FIXTURE.calendarEventId),
    "delete process_calendar_event_people"
  );
  await assertOk(await supabase.from("process_calendar_events").delete().eq("id", FIXTURE.calendarEventId), "delete calendar event");
  await assertOk(await supabase.from("text_surfaces").delete().eq("project_id", FIXTURE.projectId), "delete text surfaces");
  await assertOk(await supabase.from("process_events").delete().eq("project_id", FIXTURE.projectId), "delete process events");
  await assertOk(
    await supabase.from("step_executions").delete().in("assignment_id", fixtureAssignmentIds),
    "delete step executions"
  );
  await assertOk(
    await supabase.from("wafer_process_assignments").delete().in("id", fixtureAssignmentIds),
    "delete assignments"
  );
  await assertOk(await supabase.from("wafers").delete().eq("project_id", FIXTURE.projectId), "delete wafers");
  await assertOk(await supabase.from("wafer_lots").delete().eq("project_id", FIXTURE.projectId), "delete lots");
  await assertOk(await supabase.from("process_steps").delete().eq("template_id", FIXTURE.templateId), "delete steps");
  await assertOk(await supabase.from("process_templates").delete().eq("id", FIXTURE.templateId), "delete template");
  await assertOk(await supabase.from("project_members").delete().eq("project_id", FIXTURE.projectId), "delete memberships");
  await assertOk(await supabase.from("projects").delete().eq("id", FIXTURE.projectId), "delete project");
  await assertOk(await supabase.from("process_people").delete().eq("display_name", FIXTURE.personName), "delete process person");
}

async function maybeAttachSavedUser(supabase, flags) {
  const explicitUserId = flags.get("member-user-id");
  const authStatePath = flags.get("auth-state") ?? findDefaultAuthStatePath();
  const userId = explicitUserId || extractUserIdFromAuthState(authStatePath);

  if (!userId) {
    return { attached: false, reason: "no saved auth user id found" };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`profile lookup failed: ${error.message}`);
  }

  if (!profile) {
    return { attached: false, reason: "saved auth user has no matching profile" };
  }

  await assertOk(
    await supabase
      .from("project_members")
      .upsert(
        {
          project_id: FIXTURE.projectId,
          user_id: userId,
          role: "owner"
        },
        { onConflict: "project_id,user_id" }
      )
      .select("project_id")
      .single(),
    "upsert project member"
  );

  return { attached: true, reason: "saved auth user attached as fixture project owner" };
}

async function seedFixture(supabase, flags) {
  await clearFixture(supabase);

  await assertOk(
    await supabase
      .from("projects")
      .upsert({
        id: FIXTURE.projectId,
        slug: FIXTURE.projectSlug,
        name: FIXTURE.projectName,
        description: "Scoped fixture for WaferWatch wireframe backend verification.",
        owner_id: null,
        visibility: "group",
        status: "active"
      })
      .select("id")
      .single(),
    "upsert project"
  );

  const member = await maybeAttachSavedUser(supabase, flags);

  await assertOk(
    await supabase
      .from("process_templates")
      .upsert({
        id: FIXTURE.templateId,
        owner_project_id: FIXTURE.projectId,
        name: FIXTURE.templateName,
        version: FIXTURE.templateVersion,
        description: "Deterministic process flow fixture for wireframe verification.",
        is_active: true,
        created_by: null
      })
      .select("id")
      .single(),
    "upsert template"
  );

  await assertOk(
    await supabase.from("process_steps").upsert(
      STEPS.map((step) => ({
        ...step,
        template_id: FIXTURE.templateId,
        parameters_schema: { fixture: "wireframe" }
      }))
    ),
    "upsert steps"
  );

  await assertOk(
    await supabase
      .from("process_people")
      .upsert({ display_name: FIXTURE.personName, is_active: true }, { onConflict: "display_name" })
      .select("id")
      .single(),
    "upsert person"
  );

  const { data: person, error: personError } = await supabase
    .from("process_people")
    .select("id")
    .eq("display_name", FIXTURE.personName)
    .single();

  if (personError) {
    throw new Error(`lookup person: ${personError.message}`);
  }

  await assertOk(
    await supabase
      .from("wafer_lots")
      .upsert({
        id: FIXTURE.lotId,
        project_id: FIXTURE.projectId,
        lot_code: FIXTURE.lotCode,
        substrate_material: "LN on SiO2",
        wafer_size_mm: 100,
        status: "in_progress",
        started_at: "2026-07-06T12:00:00.000Z",
        target_completion_at: "2026-07-10T21:00:00.000Z",
        metadata: { fixture: "wireframe" }
      })
      .select("id")
      .single(),
    "upsert wafer lot"
  );

  await assertOk(
    await supabase.from("wafers").upsert([
      ...START_DIE_FIXTURES.map((die) => ({
        id: die.waferId,
        project_id: FIXTURE.projectId,
        lot_id: FIXTURE.lotId,
        wafer_code: die.waferCode,
        material_stack: "LN / SiO2",
        diameter_mm: 100,
        status: "planned",
        notes: `Fixture die ${die.dieLabel} should render at the start step.`,
        metadata: {
          fixture: "wireframe",
          wafer_family: "A",
          wafer_display_mode: "diced",
          current_die: die.dieLabel
        }
      })),
      {
        id: FIXTURE.alphaWaferId,
        project_id: FIXTURE.projectId,
        lot_id: FIXTURE.lotId,
        wafer_code: FIXTURE.alphaWaferCode,
        material_stack: "LN / SiO2",
        diameter_mm: 100,
        status: "in_progress",
        notes: "Fixture alpha wafer should render as undiced.",
        metadata: {
          fixture: "wireframe",
          wafer_family: "ALPHA",
          wafer_display_mode: "undiced"
        }
      },
      {
        id: FIXTURE.betaWaferId,
        project_id: FIXTURE.projectId,
        lot_id: FIXTURE.lotId,
        wafer_code: FIXTURE.betaWaferCode,
        material_stack: "LN / SiO2",
        diameter_mm: 100,
        status: "on_hold",
        notes: "Fixture beta wafer should render as diced with a die label.",
        metadata: {
          fixture: "wireframe",
          wafer_family: "BETA",
          wafer_display_mode: "diced",
          current_die: "B7"
        }
      }
    ]),
    "upsert wafers"
  );

  await assertOk(
    await supabase.from("wafer_process_assignments").upsert([
      ...START_DIE_FIXTURES.map((die, index) => ({
        id: die.assignmentId,
        wafer_id: die.waferId,
        template_id: FIXTURE.templateId,
        assigned_by: null,
        status: "planned",
        assigned_at: `2026-07-06T11:${String(10 + index).padStart(2, "0")}:00.000Z`,
        started_at: null,
        completed_at: null
      })),
      {
        id: FIXTURE.alphaAssignmentId,
        wafer_id: FIXTURE.alphaWaferId,
        template_id: FIXTURE.templateId,
        assigned_by: null,
        status: "in_progress",
        assigned_at: "2026-07-06T11:45:00.000Z",
        started_at: "2026-07-06T12:00:00.000Z",
        completed_at: null
      },
      {
        id: FIXTURE.betaAssignmentId,
        wafer_id: FIXTURE.betaWaferId,
        template_id: FIXTURE.templateId,
        assigned_by: null,
        status: "on_hold",
        assigned_at: "2026-07-06T11:50:00.000Z",
        started_at: "2026-07-06T12:30:00.000Z",
        completed_at: null
      }
    ]),
    "upsert assignments"
  );

  await assertOk(await supabase.from("step_executions").upsert(EXECUTIONS), "upsert executions");

  await assertOk(
    await supabase
      .from("process_calendar_events")
      .upsert({
        id: FIXTURE.calendarEventId,
        process_template_id: FIXTURE.templateId,
        location: "McMaster",
        starts_at: FIXTURE.startIso,
        ends_at: FIXTURE.endIso,
        process_step_id: STEPS[1].id,
        process_step_name_snapshot: STEPS[1].name,
        manual_action: null,
        description: "Fixture scheduled poling block from Supabase."
      })
      .select("id")
      .single(),
    "upsert calendar event"
  );

  await assertOk(
    await supabase
      .from("process_calendar_event_people")
      .upsert(
        {
          event_id: FIXTURE.calendarEventId,
          person_id: person.id
        },
        { onConflict: "event_id,person_id" }
      ),
    "upsert calendar people link"
  );

  await assertOk(
    await supabase
      .from("text_surfaces")
      .upsert(
        {
          project_id: FIXTURE.projectId,
          scope_type: FIXTURE.textScopeType,
          scope_key: FIXTURE.alphaWaferId,
          field_key: FIXTURE.textFieldKey,
          value: FIXTURE.textValue,
          updated_by: null
        },
        { onConflict: "project_id,scope_type,scope_key,field_key" }
      ),
    "upsert text surface"
  );

  await assertOk(
    await supabase.from("process_events").upsert({
      id: FIXTURE.processEventId,
      project_id: FIXTURE.projectId,
      wafer_id: FIXTURE.alphaWaferId,
      step_execution_id: EXECUTIONS[1].id,
      actor_id: null,
      event_type: "fixture_seeded",
      event_at: "2026-07-06T14:05:00.000Z",
      notes: "Wireframe verification fixture seeded.",
      metadata: { fixture: "wireframe" }
    }),
    "upsert process event"
  );

  return member;
}

async function verifyFixture(supabase) {
  const counts = await fixtureCounts(supabase);
  const expected = {
    projects: 1,
    templates: 1,
    steps: 4,
    people: 1,
    lots: 1,
    wafers: 10,
    assignments: 10,
    executions: 8,
    calendarEvents: 1,
    textSurfaces: 1,
    processEvents: 1
  };

  const failures = Object.entries(expected).filter(([key, value]) => counts[key] !== value);
  if (failures.length) {
    throw new Error(`Fixture verification failed: ${failures.map(([key, value]) => `${key} expected ${value}, saw ${counts[key]}`).join("; ")}`);
  }

  const { data: wafers, error: waferError } = await supabase
    .from("wafers")
    .select("wafer_code, status, metadata")
    .eq("project_id", FIXTURE.projectId)
    .order("wafer_code", { ascending: true });

  if (waferError) {
    throw new Error(`verify wafers: ${waferError.message}`);
  }

  const expectedStartDies = START_DIE_FIXTURES.map((die) => die.dieLabel);
  const seededStartDies = new Set(
    (wafers ?? [])
      .map((wafer) => wafer.metadata?.current_die)
      .filter((die) => typeof die === "string" && /^A[1-8]$/.test(die))
  );
  const missingStartDies = expectedStartDies.filter((die) => !seededStartDies.has(die));
  if (missingStartDies.length > 0) {
    throw new Error(`Expected fixture start dies ${expectedStartDies.join(", ")}, missing ${missingStartDies.join(", ")}`);
  }

  const { data: startAssignments, error: startAssignmentError } = await supabase
    .from("wafer_process_assignments")
    .select("id, status")
    .in("id", START_DIE_FIXTURES.map((die) => die.assignmentId));

  if (startAssignmentError) {
    throw new Error(`verify start assignments: ${startAssignmentError.message}`);
  }

  const plannedStartAssignments = (startAssignments ?? []).filter((assignment) => assignment.status === "planned").length;
  if (plannedStartAssignments !== START_DIE_FIXTURES.length) {
    throw new Error(`Expected ${START_DIE_FIXTURES.length} planned A1-A8 start assignments, saw ${plannedStartAssignments}`);
  }

  const { data: executions, error: executionError } = await supabase
    .from("step_executions")
    .select("status, process_step_id")
    .in("assignment_id", [FIXTURE.alphaAssignmentId, FIXTURE.betaAssignmentId]);

  if (executionError) {
    throw new Error(`verify executions: ${executionError.message}`);
  }

  const runningCount = executions.filter((execution) => execution.status === "running").length;
  const blockedCount = executions.filter((execution) => execution.status === "blocked").length;
  if (runningCount !== 1 || blockedCount !== 1) {
    throw new Error(`Expected one running and one blocked execution, saw running=${runningCount}, blocked=${blockedCount}`);
  }

  return {
    counts,
    expectedWafers: wafers.map((wafer) => ({
      code: wafer.wafer_code,
      status: wafer.status,
      family: wafer.metadata?.wafer_family ?? null,
      mode: wafer.metadata?.wafer_display_mode ?? null,
      die: wafer.metadata?.current_die ?? null
    })),
    expectedStartDies,
    routeHints: {
      dashboard: "/wireframe/dashboard",
      calendar: `/wireframe/calendar?processId=${FIXTURE.templateId}`,
      processFlow: `/wireframe/process-flow?processId=${FIXTURE.templateId}`,
      waferStatus: "/wireframe/wafer-status"
    }
  };
}

async function main() {
  const supabase = createSupabase();
  const flags = parseFlags();

  if (command === "snapshot") {
    console.log(JSON.stringify({ fixture: await fixtureCounts(supabase), global: await globalCounts(supabase) }, null, 2));
    return;
  }

  if (command === "clear") {
    await clearFixture(supabase);
    console.log(JSON.stringify({ ok: true, fixture: await fixtureCounts(supabase) }, null, 2));
    return;
  }

  if (command === "seed") {
    const member = await seedFixture(supabase, flags);
    console.log(JSON.stringify({ ok: true, member, verification: await verifyFixture(supabase) }, null, 2));
    return;
  }

  console.log(JSON.stringify({ ok: true, verification: await verifyFixture(supabase) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
