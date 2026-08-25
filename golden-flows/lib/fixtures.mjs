import { randomUUID } from "node:crypto";
import { createGoldenClients, loadGoldenEnvironment } from "./environment.mjs";

const now = () => new Date();
const iso = (minutes = 0) => new Date(Date.now() + minutes * 60_000).toISOString();

async function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function slug(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "").slice(0, 60);
}

export class GoldenFixtureRun {
  constructor(environment = loadGoldenEnvironment()) {
    this.environment = environment;
    this.clients = createGoldenClients(environment);
    this.runId = randomUUID();
    this.runTag = `gf-${this.runId.slice(0, 8)}`;
    this.scenarios = {};
    this.projectIds = [];
    this.personIds = [];
    this.sharedPersonId = null;
  }

  async assertActors() {
    const ids = [this.environment.operator.userId, this.environment.reviewer.userId];
    const profiles = await must(
      await this.clients.admin.from("profiles").select("id,display_name,email,is_active").in("id", ids),
      "load golden-flow actors"
    );
    if (profiles.length !== 2 || profiles.some((profile) => !profile.is_active)) {
      throw new Error("Both golden-flow storage states must belong to active staging profiles.");
    }
    this.profiles = new Map(profiles.map((profile) => [profile.id, profile]));
  }

  async createBase(name, { published = true, connected = true } = {}) {
    const projectId = randomUUID();
    const templateId = randomUUID();
    const stageIds = [randomUUID(), randomUUID(), randomUUID()];
    const stepIds = [randomUUID(), randomUUID(), randomUUID()];
    const prefix = `${this.runTag}-${slug(name)}`;
    this.projectIds.push(projectId);

    await must(await this.clients.admin.from("projects").insert({
      id: projectId,
      slug: prefix,
      name: `Golden ${name} ${this.runTag}`,
      description: `staging golden-flow owner=${this.runId}`,
      owner_id: this.environment.operator.userId,
      visibility: "group",
      status: "active"
    }), `create ${name} project`);
    await must(await this.clients.admin.from("project_members").insert([
      { project_id: projectId, user_id: this.environment.operator.userId, role: "owner" },
      { project_id: projectId, user_id: this.environment.reviewer.userId, role: "editor" }
    ]), `attach ${name} actors`);
    await must(await this.clients.admin.from("process_templates").insert({
      id: templateId,
      owner_project_id: projectId,
      name: `Golden ${name}`,
      version: this.runTag,
      description: `staging golden-flow owner=${this.runId}`,
      lifecycle_status: "draft",
      is_active: true,
      created_by: this.environment.operator.userId
    }), `create ${name} template`);

    const stages = [
      { id: stageIds[0], template_id: templateId, name: "Intake", slug: "intake", stage_order: 10, canvas_x: 80, canvas_y: 100 },
      { id: stageIds[1], template_id: templateId, name: "Process", slug: "process", stage_order: 20, canvas_x: 480, canvas_y: 100 },
      { id: stageIds[2], template_id: templateId, name: "Finish", slug: "finish", stage_order: 30, canvas_x: 880, canvas_y: 100 }
    ];
    await must(await this.clients.admin.from("process_stages").insert(stages), `create ${name} stages`);

    const steps = [
      { id: stepIds[0], stage_id: stageIds[0], stage_step_order: 1, template_id: templateId, step_order: 10, name: "Intake", slug: "intake", process_area: "Intake", node_type: "start", canvas_x: 80, canvas_y: 100 },
      { id: stepIds[1], stage_id: stageIds[1], stage_step_order: 1, template_id: templateId, step_order: 20, name: "Process", slug: "process", process_area: "Processing", node_type: "procedure", canvas_x: 480, canvas_y: 100 },
      { id: stepIds[2], stage_id: stageIds[2], stage_step_order: 1, template_id: templateId, step_order: 30, name: "Finish", slug: "finish", process_area: "Finish", node_type: "end", canvas_x: 880, canvas_y: 100 }
    ].map((step) => ({
      ...step,
      execution_mode: "main",
      required_reviewer_id: this.environment.reviewer.userId,
      parameters_schema: { version: 1, fields: [] }
    }));
    await must(await this.clients.admin.from("process_steps").insert(steps), `create ${name} steps`);

    const transitionIds = [];
    if (connected) {
      for (let index = 0; index < 2; index += 1) {
        const id = randomUUID();
        transitionIds.push(id);
        await must(await this.clients.admin.from("process_step_transitions").insert({
          id,
          template_id: templateId,
          from_step_id: stepIds[index],
          to_step_id: stepIds[index + 1],
          edge_type: "flow",
          priority: index * 10
        }), `create ${name} transition ${index + 1}`);
      }
    }

    if (published) {
      await must(await this.clients.operator.rpc("publish_process_template_version", {
        target_template_id: templateId
      }), `publish ${name} template`);
    }

    return { projectId, templateId, stageIds, stepIds, transitionIds, name };
  }

  async createPerson(label) {
    if (this.sharedPersonId) return this.sharedPersonId;

    const existing = await must(
      await this.clients.admin
        .from("process_people")
        .select("id")
        .eq("profile_id", this.environment.operator.userId)
        .maybeSingle(),
      "load operator calendar person"
    );
    if (existing) {
      this.sharedPersonId = existing.id;
      return existing.id;
    }

    const id = randomUUID();
    this.personIds.push(id);
    await must(await this.clients.admin.from("process_people").insert({
      id,
      display_name: `${label} ${this.runTag}`,
      profile_id: this.environment.operator.userId,
      is_active: true
    }), `create ${label} calendar person`);
    this.sharedPersonId = id;
    return id;
  }

  async calendarEventReady(name, { withEvent }) {
    const scenario = await this.createBase(name);
    const personId = await this.createPerson(name);
    const location = await must(
      await this.clients.admin.from("fabrication_locations").select("id,name").eq("slug", "toronto").single(),
      "load Toronto location"
    );
    const eventId = withEvent ? randomUUID() : null;
    const startsAt = iso(24 * 60 + 9 * 60);
    const endsAt = iso(24 * 60 + 10 * 60);
    if (eventId) {
      await must(await this.clients.admin.from("process_calendar_events").insert({
        id: eventId,
        process_template_id: scenario.templateId,
        location_id: location.id,
        location: location.name,
        starts_at: startsAt,
        ends_at: endsAt,
        process_step_id: scenario.stepIds[1],
        process_step_name_snapshot: "Process",
        description: `golden-flow owner=${this.runId}`
      }), `seed ${name} event`);
      await must(await this.clients.admin.from("process_calendar_event_people").insert({
        event_id: eventId,
        person_id: personId
      }), `seed ${name} event person`);
    }
    return { ...scenario, eventId, personId, startsAt, endsAt, locationId: location.id, location: location.name };
  }

  async seedWafer(scenario, { code, currentStepIndex = 0, executionStatus = "queued", priorCompleted = true }) {
    const waferId = randomUUID();
    const assignmentId = randomUUID();
    const executionIds = scenario.stepIds.map(() => randomUUID());
    const currentStepId = scenario.stepIds[currentStepIndex];
    await must(await this.clients.admin.from("wafers").insert({
      id: waferId,
      project_id: scenario.projectId,
      wafer_code: `${code}-${this.runTag.toUpperCase()}`,
      status: executionStatus === "completed" ? "completed" : "in_progress",
      metadata: { golden_flow_run_id: this.runId, wafer_display_mode: "undiced", wafer_family: code }
    }), `seed ${code} wafer`);
    await must(await this.clients.admin.from("wafer_process_assignments").insert({
      id: assignmentId,
      wafer_id: waferId,
      template_id: scenario.templateId,
      current_step_id: currentStepId,
      assigned_by: this.environment.operator.userId,
      status: executionStatus === "completed" ? "completed" : "in_progress",
      started_at: iso(-30),
      completed_at: executionStatus === "completed" ? iso(-1) : null
    }), `seed ${code} assignment`);

    const executionRows = scenario.stepIds.map((stepId, index) => {
      const isPrior = index < currentStepIndex;
      const isCurrent = index === currentStepIndex;
      const status = isPrior && priorCompleted ? "completed" : isCurrent ? executionStatus : "pending";
      return {
        id: executionIds[index],
        assignment_id: assignmentId,
        wafer_id: waferId,
        process_step_id: stepId,
        status,
        queue_started_at: status === "queued" ? iso(-20) : null,
        started_at: status === "pending" || status === "queued" ? null : iso(-20),
        completed_at: status === "completed" || status === "ready_to_move" ? iso(-2) : null,
        run_notes: `golden-flow owner=${this.runId}`,
        metadata: { golden_flow_run_id: this.runId }
      };
    });
    await must(await this.clients.admin.from("step_executions").insert(executionRows), `seed ${code} executions`);

    const runRows = [];
    let previousRunId = null;
    for (let index = 0; index <= currentStepIndex; index += 1) {
      if (index < currentStepIndex && !priorCompleted) continue;
      const isCurrent = index === currentStepIndex;
      const runId = randomUUID();
      const memberId = randomUUID();
      const status = isCurrent
        ? executionStatus === "awaiting_checkpoint" ? "awaiting_review"
          : executionStatus === "queued" ? "queued"
            : "completed"
        : "completed";
      await must(await this.clients.admin.from("operation_runs").insert({
        id: runId,
        template_id: scenario.templateId,
        process_step_id: scenario.stepIds[index],
        run_kind: "normal",
        status,
        started_at: status === "queued" ? null : iso(-20),
        completed_at: status === "completed" ? iso(-2) : null,
        created_by: this.environment.operator.userId,
        client_mutation_id: randomUUID()
      }), `seed ${code} run ${index}`);
      await must(await this.clients.admin.from("operation_run_members").insert({
        id: memberId,
        operation_run_id: runId,
        assignment_id: assignmentId,
        wafer_id: waferId,
        status,
        started_at: status === "queued" ? null : iso(-20),
        completed_at: status === "completed" ? iso(-2) : null,
        legacy_step_execution_id: executionIds[index]
      }), `seed ${code} member ${index}`);
      if (previousRunId) {
        await must(await this.clients.admin.from("operation_run_links").insert({
          parent_run_id: previousRunId,
          child_run_id: runId,
          link_kind: "successor"
        }), `seed ${code} run link ${index}`);
      }
      previousRunId = runId;
      runRows.push({ runId, memberId, stepId: scenario.stepIds[index], status });
    }
    const currentRun = runRows.at(-1);
    await must(await this.clients.admin.from("wafer_process_assignments").update({
      current_operation_run_member_id: currentRun.memberId
    }).eq("id", assignmentId), `attach ${code} current member`);
    return { waferId, assignmentId, executionIds, currentRun, runRows, code: `${code}-${this.runTag.toUpperCase()}` };
  }

  async waferAtBeginning(name = "full-move") {
    const scenario = await this.createBase(name);
    const wafer = await this.seedWafer(scenario, { code: "FLOW", currentStepIndex: 0, executionStatus: "queued" });
    return { ...scenario, wafers: [wafer] };
  }

  async batchReady(name = "batch-move", count = 3) {
    const scenario = await this.createBase(name);
    const wafers = [];
    for (let index = 0; index < count; index += 1) {
      wafers.push(await this.seedWafer(scenario, {
        code: `BATCH${index + 1}`,
        currentStepIndex: 1,
        executionStatus: "ready_to_move"
      }));
    }
    return { ...scenario, wafers };
  }

  async redoReady(name = "redo") {
    const scenario = await this.createBase(name);
    const wafer = await this.seedWafer(scenario, {
      code: "REDO",
      currentStepIndex: 1,
      executionStatus: "awaiting_checkpoint"
    });
    const attemptId = randomUUID();
    const operator = this.profiles.get(this.environment.operator.userId);
    const reviewer = this.profiles.get(this.environment.reviewer.userId);
    await must(await this.clients.admin.from("process_step_attempts").insert({
      id: attemptId,
      assignment_id: wafer.assignmentId,
      wafer_id: wafer.waferId,
      template_id: scenario.templateId,
      process_step_id: scenario.stepIds[1],
      step_execution_id: wafer.executionIds[1],
      operation_run_member_id: wafer.currentRun.memberId,
      attempt_number: 1,
      submitted_by: this.environment.operator.userId,
      submitted_at: iso(-1),
      submission_notes: "Golden redo submission",
      evidence_snapshot: {},
      wafer_code_snapshot: wafer.code,
      template_name_snapshot: `Golden ${name}`,
      template_version_snapshot: this.runTag,
      process_step_name_snapshot: "Process",
      process_step_order_snapshot: 20,
      reviewer_id_snapshot: this.environment.reviewer.userId,
      reviewer_name_snapshot: reviewer.display_name || reviewer.email,
      submitted_by_name_snapshot: operator.display_name || operator.email,
      prior_step_status: "running",
      client_mutation_id: randomUUID()
    }), "seed redo attempt");
    return { ...scenario, wafers: [wafer], attemptId, redoTargetStepId: scenario.stepIds[0] };
  }

  async archiveReady(name = "archive") {
    const scenario = await this.createBase(name);
    const wafer = await this.seedWafer(scenario, { code: "ARCHIVE", currentStepIndex: 2, executionStatus: "completed" });
    return { ...scenario, wafers: [wafer] };
  }

  async editableDraft(name, { connected = true } = {}) {
    return this.createBase(name, { published: false, connected });
  }

  async seedAll() {
    await this.assertActors();
    this.scenarios.calendarCreate = await this.calendarEventReady("calendar-create", { withEvent: false });
    this.scenarios.calendarMove = await this.calendarEventReady("calendar-move", { withEvent: true });
    this.scenarios.calendarDelete = await this.calendarEventReady("calendar-delete", { withEvent: true });
    this.scenarios.stepCreate = await this.editableDraft("step-create");
    this.scenarios.transitionCreate = await this.editableDraft("transition-create", { connected: false });
    this.scenarios.waferCreate = await this.editableDraft("wafer-create");
    this.scenarios.fullMove = await this.waferAtBeginning();
    this.scenarios.batchMove = await this.batchReady();
    this.scenarios.redo = await this.redoReady();
    this.scenarios.archive = await this.archiveReady();
    this.scenarios.mobileCalendarCreate = await this.calendarEventReady("mobile-calendar-create", { withEvent: false });
    this.scenarios.mobileStepCreate = await this.editableDraft("mobile-step-create");
    return this.manifest();
  }

  manifest() {
    return {
      version: 1,
      runId: this.runId,
      runTag: this.runTag,
      createdAt: now().toISOString(),
      stagingProjectRef: this.environment.projectRef,
      operatorUserId: this.environment.operator.userId,
      reviewerUserId: this.environment.reviewer.userId,
      projectIds: this.projectIds,
      personIds: this.personIds,
      scenarios: this.scenarios
    };
  }
}

export async function teardownGoldenRun(manifest, environment = loadGoldenEnvironment()) {
  const { admin } = createGoldenClients(environment);
  const templateIds = Object.values(manifest.scenarios).map((scenario) => scenario.templateId);
  const projectIds = manifest.projectIds;
  const remove = async (table, column, ids) => {
    if (!ids?.length) return;
    await must(await admin.from(table).delete().in(column, ids), `teardown ${table}`);
  };
  await remove("checkpoint_submission_withdrawals", "template_id", templateIds);
  await remove("checkpoint_decisions", "template_id", templateIds);
  await remove("process_step_attempts", "template_id", templateIds);
  await remove("process_events", "project_id", projectIds);
  await remove("workflow_change_log", "template_id", templateIds);
  await remove("workflow_revisions", "template_id", templateIds);
  const runs = await must(await admin.from("operation_runs").select("id").in("template_id", templateIds), "load teardown runs");
  const runIds = runs.map((run) => run.id);
  await remove("operation_run_links", "parent_run_id", runIds);
  await remove("operation_run_links", "child_run_id", runIds);
  await remove("operation_run_members", "operation_run_id", runIds);
  await remove("operation_runs", "template_id", templateIds);
  await remove("process_calendar_event_people", "event_id", Object.values(manifest.scenarios).map((scenario) => scenario.eventId).filter(Boolean));
  await remove("process_calendar_events", "process_template_id", templateIds);
  await remove("step_executions", "process_step_id", Object.values(manifest.scenarios).flatMap((scenario) => scenario.stepIds));
  await remove("wafer_process_assignments", "template_id", templateIds);
  await remove("wafers", "project_id", projectIds);
  await remove("process_step_transitions", "template_id", templateIds);
  await remove("process_steps", "template_id", templateIds);
  await remove("process_stages", "template_id", templateIds);
  await remove("process_templates", "id", templateIds);
  await remove("projects", "id", projectIds);
  await remove("process_people", "id", manifest.personIds);
}
