import fs from "node:fs";
import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { createGoldenClients, loadGoldenEnvironment, readManifest } from "./lib/environment.mjs";

const environment = loadGoldenEnvironment();
const manifest = readManifest();
const { admin } = createGoldenClients(environment);

type Scenario = (typeof manifest.scenarios)[keyof typeof manifest.scenarios];

async function activate(context: BrowserContext, page: Page, scenario: Scenario, route: "/calendar" | "/process-flow" | "/wafer-status") {
  await context.addCookies([{
    name: "waferwatch_active_process_v1",
    value: scenario.templateId,
    url: environment.baseUrl,
    httpOnly: true,
    sameSite: "Lax"
  }]);
  await page.goto(route);
  await page.waitForLoadState("networkidle");
}

async function snapshot(templateId: string) {
  const { data, error } = await admin.rpc("get_process_workspace_snapshot", { target_template_id: templateId });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

async function evidence(testInfo: TestInfo, scenario: Scenario, command: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  const { data: changes, error } = await admin
    .from("workflow_change_log")
    .select("revision,mutation_kind,client_mutation_id,changed_entities,committed_at")
    .eq("template_id", scenario.templateId)
    .order("revision", { ascending: true });
  if (error) throw new Error(error.message);
  await testInfo.attach("workflow-command.json", {
    body: Buffer.from(JSON.stringify({ command, templateId: scenario.templateId, changes }, null, 2)),
    contentType: "application/json"
  });
  await testInfo.attach("workspace-before.json", {
    body: Buffer.from(JSON.stringify(before, null, 2)), contentType: "application/json"
  });
  await testInfo.attach("workspace-after.json", {
    body: Buffer.from(JSON.stringify(after, null, 2)), contentType: "application/json"
  });
}

function revision(value: Record<string, unknown>) {
  return Number(value.revision ?? 0);
}

async function expectOneRevision(scenario: Scenario, before: Record<string, unknown>) {
  await expect.poll(async () => revision(await snapshot(scenario.templateId))).toBe(revision(before) + 1);
  return snapshot(scenario.templateId);
}

async function dragBetween(source: ReturnType<Page["locator"]>, target: ReturnType<Page["locator"]>, targetPhase: "beginning" | "complete" = "beginning") {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Golden-flow drag target is not visible.");
  const targetX = targetBox.x + targetBox.width * (targetPhase === "beginning" ? 0.25 : 0.75);
  const targetY = targetBox.y + Math.min(125, targetBox.height * 0.68);
  await source.click();
  await source.hover();
  await source.page().mouse.down();
  await source.page().mouse.move(targetX, targetY, { steps: 12 });
  await source.page().mouse.up();
}

async function connectSteps(page: Page, sourceId: string, targetId: string) {
  const source = page.locator(`[data-node-id="${sourceId}"]`);
  const target = page.locator(`[data-node-id="${targetId}"]`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Golden-flow process nodes are not visible.");
  await source.click();
  await page.keyboard.down("Shift");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
}

async function createCalendarEvent(page: Page, description: string) {
  const timeline = page.locator(".rct-scroll").first();
  await expect(timeline).toBeVisible();
  const box = await timeline.boundingBox();
  if (!box) throw new Error("Calendar timeline is not visible.");
  await timeline.dblclick({ position: { x: Math.round(box.width * 0.62), y: Math.min(90, box.height - 10) } });
  await expect(page.getByText("New event", { exact: true })).toBeVisible();
  await page.getByLabel("Step / action").selectOption({ label: "Process" });
  await page.getByLabel("Additional information").fill(description);
  await page.getByRole("button", { name: "Save event" }).click();
}

async function expectInsideVisualViewport(page: Page, selector: string) {
  const geometry = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    return {
      inside: rect.left >= left && rect.right <= left + width && rect.top >= top && rect.bottom <= top + height,
      overflow: document.documentElement.scrollWidth > width + 1,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      viewport: { left, top, width, height }
    };
  });
  expect(geometry.inside, JSON.stringify(geometry)).toBe(true);
  expect(geometry.overflow, JSON.stringify(geometry)).toBe(false);
}

test.describe("canonical workflow golden flows", () => {
  test.use({ storageState: environment.operatorStatePath });

  test("calendar.create: selected range commits once and survives reload", async ({ context, page }, testInfo) => {
    const scenario = manifest.scenarios.calendarCreate;
    const before = await snapshot(scenario.templateId);
    await activate(context, page, scenario, "/calendar");
    const marker = `Golden calendar create ${manifest.runTag}`;
    await createCalendarEvent(page, marker);
    const after = await expectOneRevision(scenario, before);
    const { data: events } = await admin.from("process_calendar_events").select("id,description").eq("process_template_id", scenario.templateId).eq("description", marker);
    expect(events).toHaveLength(1);
    await page.reload();
    await expect(page.locator(`[data-calendar-event-id="${events![0].id}"]`)).toBeVisible();
    await evidence(testInfo, scenario, "calendar.create", before, after);
  });

  test("calendar.move: drag preserves identity, increments revision, and survives reload", async ({ context, page }, testInfo) => {
    const scenario = manifest.scenarios.calendarMove;
    const before = await snapshot(scenario.templateId);
    await activate(context, page, scenario, "/calendar");
    const item = page.locator(`[data-calendar-event-id="${scenario.eventId}"]`);
    await expect(item).toBeVisible();
    const originalBox = await item.boundingBox();
    if (!originalBox) throw new Error("Calendar event is not visible.");
    await page.mouse.move(originalBox.x + originalBox.width / 2, originalBox.y + originalBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(originalBox.x + originalBox.width / 2 + 120, originalBox.y + originalBox.height / 2, { steps: 12 });
    await page.mouse.up();
    const after = await expectOneRevision(scenario, before);
    const { data: events, error } = await admin.from("process_calendar_events").select("id,starts_at,ends_at,revision").eq("id", scenario.eventId);
    if (error) throw new Error(error.message);
    expect(events).toHaveLength(1);
    expect(events![0].starts_at).not.toBe(scenario.startsAt);
    expect(events![0].revision).toBeGreaterThan(1);
    await page.reload();
    await expect(page.locator(`[data-calendar-event-id="${scenario.eventId}"]`)).toBeVisible();
    await evidence(testInfo, scenario, "calendar.move", before, after);
  });

  test("calendar.delete: UI removal is canonical and durable", async ({ context, page }, testInfo) => {
    const scenario = manifest.scenarios.calendarDelete;
    const before = await snapshot(scenario.templateId);
    await activate(context, page, scenario, "/calendar");
    await page.locator(`[data-calendar-event-id="${scenario.eventId}"]`).click();
    await page.getByRole("button", { name: "Delete event" }).click();
    const after = await expectOneRevision(scenario, before);
    await expect.poll(async () => (await admin.from("process_calendar_events").select("id", { count: "exact", head: true }).eq("id", scenario.eventId)).count).toBe(0);
    await page.reload();
    await expect(page.locator(`[data-calendar-event-id="${scenario.eventId}"]`)).toHaveCount(0);
    await evidence(testInfo, scenario, "calendar.delete", before, after);
  });

  test("process.step.create: canvas create synthesizes one stage without RLS failure", async ({ context, page }, testInfo) => {
    const scenario = manifest.scenarios.stepCreate;
    const before = await snapshot(scenario.templateId);
    await activate(context, page, scenario, "/process-flow");
    const canvas = page.locator("svg.flow-map-canvas--editable");
    await canvas.dblclick({ position: { x: 720, y: 460 } });
    await page.locator("#step-template-name").fill(`Golden step ${manifest.runTag}`);
    await page.locator("#step-template-process-area").fill("Golden verification");
    await page.getByRole("button", { name: "Create step", exact: true }).click();
    const after = await expectOneRevision(scenario, before);
    const { data: steps, error } = await admin.from("process_steps").select("id,stage_id,name,process_stages!inner(id,template_id)").eq("template_id", scenario.templateId).eq("name", `Golden step ${manifest.runTag}`);
    if (error) throw new Error(error.message);
    expect(steps).toHaveLength(1);
    await page.reload();
    await expect(page.locator(`[data-node-id="${steps![0].id}"]`)).toBeVisible();
    await evidence(testInfo, scenario, "process.step.create", before, after);
  });

  test("process.transition.create: port gesture persists one visual edge", async ({ context, page }, testInfo) => {
    const scenario = manifest.scenarios.transitionCreate;
    const before = await snapshot(scenario.templateId);
    await activate(context, page, scenario, "/process-flow");
    await connectSteps(page, scenario.stepIds[0], scenario.stepIds[1]);
    const after = await expectOneRevision(scenario, before);
    const { data: transitions, error } = await admin.from("process_step_transitions").select("id").eq("template_id", scenario.templateId).eq("from_step_id", scenario.stepIds[0]).eq("to_step_id", scenario.stepIds[1]);
    if (error) throw new Error(error.message);
    expect(transitions).toHaveLength(1);
    await page.reload();
    await expect(page.locator(".flow-edge-group")).toHaveCount(1);
    await evidence(testInfo, scenario, "process.transition.create", before, after);
  });

  test("wafer.create: Add wafer commits assignment, executions, run, and evidence atomically", async ({ context, page }, testInfo) => {
    const scenario = manifest.scenarios.waferCreate;
    const before = await snapshot(scenario.templateId);
    await activate(context, page, scenario, "/process-flow");
    await page.getByRole("button", { name: "Add wafer" }).click();
    const waferCode = `CREATE-${manifest.runTag.toUpperCase()}`;
    await page.locator("#flow-wafer-create-name").fill(waferCode);
    await page.locator("#flow-wafer-create-die-count").fill("4");
    await page.getByRole("button", { name: "Create wafer", exact: true }).click();
    const after = await expectOneRevision(scenario, before);
    const { data: wafer, error } = await admin.from("wafers").select("id").eq("project_id", scenario.projectId).eq("wafer_code", waferCode).single();
    if (error) throw new Error(error.message);
    const { data: assignment } = await admin.from("wafer_process_assignments").select("id,current_operation_run_member_id").eq("wafer_id", wafer.id).single();
    const { count: executions } = await admin.from("step_executions").select("id", { count: "exact", head: true }).eq("assignment_id", assignment!.id);
    const { count: evidenceCount } = await admin.from("process_events").select("id", { count: "exact", head: true }).eq("wafer_id", wafer.id).eq("event_type", "wafer_created");
    expect(executions).toBe(3);
    expect(assignment!.current_operation_run_member_id).toBeTruthy();
    expect(evidenceCount).toBe(1);
    await page.reload();
    await expect(page.locator(`[data-assignment-id="${assignment!.id}"]`)).toBeVisible();
    await evidence(testInfo, scenario, "wafer.create", before, after);
  });

  test("wafer submit and reviewer route propagate across sessions and reload", async ({ browser }, testInfo) => {
    const scenario = manifest.scenarios.fullMove;
    const wafer = scenario.wafers[0];
    const before = await snapshot(scenario.templateId);
    const operatorContext = await browser.newContext({ storageState: environment.operatorStatePath });
    const reviewerContext = await browser.newContext({ storageState: environment.reviewerStatePath });
    const operatorPage = await operatorContext.newPage();
    const reviewerPage = await reviewerContext.newPage();
    await activate(operatorContext, operatorPage, scenario, "/process-flow");
    await activate(reviewerContext, reviewerPage, scenario, "/process-flow");
    const operatorChip = operatorPage.locator(`[data-assignment-id="${wafer.assignmentId}"]`);
    await dragBetween(operatorChip, operatorPage.locator(`[data-node-id="${scenario.stepIds[0]}"]`), "complete");
    await operatorPage.locator("#process-wafer-move-note").fill("Golden operator submission");
    await operatorPage.getByRole("button", { name: "Submit for review" }).click();
    await expect.poll(async () => ((await snapshot(scenario.templateId)).currentState as Array<Record<string, unknown>>).find((row) => row.assignment_id === wafer.assignmentId)?.current_member_status).toBe("awaiting_review");
    await expect(reviewerPage.locator(`[data-assignment-id="${wafer.assignmentId}"]`)).toBeVisible();
    await dragBetween(reviewerPage.locator(`[data-assignment-id="${wafer.assignmentId}"]`), reviewerPage.locator(`[data-node-id="${scenario.stepIds[1]}"]`));
    await reviewerPage.getByRole("button", { name: "Create planned batch" }).click();
    await expect.poll(async () => ((await snapshot(scenario.templateId)).currentState as Array<Record<string, unknown>>).find((row) => row.assignment_id === wafer.assignmentId)?.current_step_id).toBe(scenario.stepIds[1]);
    const after = await snapshot(scenario.templateId);
    expect(revision(after)).toBe(revision(before) + 2);
    for (const page of [operatorPage, reviewerPage]) {
      await page.reload();
      await expect(page.locator(`[data-node-id="${scenario.stepIds[1]}"] [data-assignment-id="${wafer.assignmentId}"]`)).toBeVisible();
    }
    await evidence(testInfo, scenario, "wafer.submit + wafer.route", before, after);
    await operatorContext.close();
    await reviewerContext.close();
  });

  test("wafer.batch.move: one drag creates one run and N atomic members", async ({ browser }, testInfo) => {
    const scenario = manifest.scenarios.batchMove;
    const before = await snapshot(scenario.templateId);
    const context = await browser.newContext({ storageState: environment.reviewerStatePath });
    const page = await context.newPage();
    await activate(context, page, scenario, "/process-flow");
    for (const wafer of scenario.wafers) await page.locator(`[data-assignment-id="${wafer.assignmentId}"]`).click();
    await dragBetween(page.locator(`[data-assignment-id="${scenario.wafers[0].assignmentId}"]`), page.locator(`[data-node-id="${scenario.stepIds[2]}"]`));
    await page.getByRole("button", { name: "Create planned batch" }).click();
    const after = await expectOneRevision(scenario, before);
    const changed = ((after.activeBatchRuns ?? []) as Array<Record<string, unknown>>).filter((run) => run.process_step_id === scenario.stepIds[2]);
    expect(changed).toHaveLength(1);
    expect(Number(changed[0].member_count)).toBe(scenario.wafers.length);
    await page.reload();
    for (const wafer of scenario.wafers) await expect(page.locator(`[data-node-id="${scenario.stepIds[2]}"] [data-assignment-id="${wafer.assignmentId}"]`)).toBeVisible();
    await evidence(testInfo, scenario, "wafer.batch.move", before, after);
    await context.close();
  });

  test("wafer.redo: completed visit remains and distinct redo visit is highlighted once", async ({ browser }, testInfo) => {
    const scenario = manifest.scenarios.redo;
    const wafer = scenario.wafers[0];
    const before = await snapshot(scenario.templateId);
    const context = await browser.newContext({ storageState: environment.reviewerStatePath });
    const page = await context.newPage();
    await activate(context, page, scenario, "/process-flow");
    await dragBetween(page.locator(`[data-assignment-id="${wafer.assignmentId}"]`), page.locator(`[data-node-id="${scenario.redoTargetStepId}"]`));
    await page.getByRole("button", { name: "Create planned batch" }).click();
    const after = await expectOneRevision(scenario, before);
    const history = (after.operationHistory as Array<Record<string, unknown>>).filter((row) => row.assignment_id === wafer.assignmentId && row.process_step_id === scenario.redoTargetStepId);
    expect(history.filter((row) => row.run_kind === "normal" && row.member_status === "completed")).toHaveLength(1);
    expect(history.filter((row) => row.run_kind === "redo")).toHaveLength(1);
    await activate(context, page, scenario, "/wafer-status");
    await page.goto(`/wafer-status?waferId=${wafer.waferId}&tab=history`);
    await expect(page.getByText(/redo/i).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(/redo/i).first()).toBeVisible();
    await evidence(testInfo, scenario, "wafer.redo", before, after);
    await context.close();
  });

  test("wafer.archive: archive dock removes active state and preserves history", async ({ context, page }, testInfo) => {
    const scenario = manifest.scenarios.archive;
    const wafer = scenario.wafers[0];
    const before = await snapshot(scenario.templateId);
    await activate(context, page, scenario, "/process-flow");
    const archiveDock = page.getByRole("button", { name: /Open archive/ });
    await dragBetween(page.locator(`[data-assignment-id="${wafer.assignmentId}"]`), archiveDock);
    const after = await expectOneRevision(scenario, before);
    expect((after.currentState as Array<Record<string, unknown>>).some((row) => row.assignment_id === wafer.assignmentId)).toBe(false);
    expect((after.archivedState as Array<Record<string, unknown>>).some((row) => row.assignment_id === wafer.assignmentId)).toBe(true);
    expect((after.operationHistory as Array<Record<string, unknown>>).some((row) => row.assignment_id === wafer.assignmentId)).toBe(true);
    await page.reload();
    await expect(page.locator(`[data-assignment-id="${wafer.assignmentId}"]`)).toHaveCount(0);
    await archiveDock.click();
    await expect(page.getByText(wafer.code, { exact: true })).toBeVisible();
    await evidence(testInfo, scenario, "wafer.archive", before, after);
  });

  test("390x844 dialogs keep required actions reachable without mutating fixtures", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: environment.operatorStatePath, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const calendar = manifest.scenarios.mobileCalendarCreate;
    const calendarBefore = await snapshot(calendar.templateId);
    await activate(context, page, calendar, "/calendar");
    await page.getByRole("button", { name: "New event" }).click();
    await page.getByLabel("Additional information").focus();
    await expectInsideVisualViewport(page, ".calendar-inspector-actions");
    await page.getByRole("button", { name: "Cancel" }).click();
    const step = manifest.scenarios.mobileStepCreate;
    const stepBefore = await snapshot(step.templateId);
    await activate(context, page, step, "/process-flow");
    await page.locator("svg.flow-map-canvas--editable").dblclick({ position: { x: 180, y: 420 } });
    await page.locator("#step-template-name").focus();
    await expectInsideVisualViewport(page, ".step-template-dialog__footer");
    await page.getByRole("button", { name: "Cancel" }).click();
    const calendarAfter = await snapshot(calendar.templateId);
    const stepAfter = await snapshot(step.templateId);
    expect(revision(calendarAfter)).toBe(revision(calendarBefore));
    expect(revision(stepAfter)).toBe(revision(stepBefore));
    await evidence(testInfo, step, "mobile non-mutating reachability", stepBefore, stepAfter);
    await context.close();
  });
});

test.afterAll(() => {
  if (!fs.existsSync(environment.operatorStatePath) || !fs.existsSync(environment.reviewerStatePath)) {
    throw new Error("Golden-flow auth storage states disappeared during the run.");
  }
});
