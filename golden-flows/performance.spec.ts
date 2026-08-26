import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { createGoldenClients, loadGoldenEnvironment, readManifest } from "./lib/environment.mjs";

const environment = loadGoldenEnvironment();
const manifest = readManifest();
const { admin, reviewer } = createGoldenClients(environment);
const warmups = Number(process.env.PERF_WARMUP_REPETITIONS ?? 3);
const measured = Number(process.env.PERF_MEASURED_REPETITIONS ?? 5);

type Scenario = {
  templateId: string;
  stepIds: string[];
  wafers: Array<{ assignmentId: string; waferId: string }>;
  name: string;
};

type PerformanceReport = {
  runId: string;
  repetitions: { warmups: number; measured: number };
  samples: Record<string, number[]>;
  p95: Record<string, number>;
  payloadBytes: Record<string, number[]>;
  commits: Array<{
    size: number;
    revision: number;
    mutationIds: string[];
  }>;
};

type PerformanceScenarios = {
  cold: Scenario;
  batches: Record<"1" | "8" | "25", Scenario[]>;
  stale: Scenario;
  idempotent: Scenario;
  recovery: Scenario;
  revisionGap: Scenario;
};

function moveRpcInput(scenario: Scenario, expectedRevision: number, mutationId = randomUUID()) {
  const wafer = scenario.wafers[0];
  return {
    requested_template_id: scenario.templateId,
    expected_workspace_revision: expectedRevision,
    command_mutation_id: mutationId,
    mutations: [{
      kind: "move",
      batchId: randomUUID(),
      mutationId,
      assignmentId: wafer.assignmentId,
      sourceStepId: scenario.stepIds[1],
      targetStepId: scenario.stepIds[2],
      note: "Performance contract verification",
      correctCheckpointRoute: false
    }]
  };
}

function percentile95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

async function addProcessCookies(context: BrowserContext, scenario: Scenario) {
  await context.addCookies([
    {
      name: "waferwatch_active_process_v1",
      value: scenario.templateId,
      url: environment.baseUrl,
      httpOnly: true,
      sameSite: "Lax"
    },
    {
      name: "waferwatch_perf_run_id",
      value: manifest.runId,
      url: environment.baseUrl,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
}

async function workspaceSnapshot(templateId: string) {
  const { data, error } = await admin.rpc("get_process_workspace_snapshot", { target_template_id: templateId });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

async function gotoWorkspace(context: BrowserContext, page: Page, scenario: Scenario, route: "/calendar" | "/process-flow") {
  await addProcessCookies(context, scenario);
  const startedAt = Date.now();
  await page.goto(route);
  await page.locator("[data-workspace-revision]").waitFor({ state: "visible" });
  const readyMs = Date.now() - startedAt;
  const timing = await page.evaluate(() => ({
    domContentLoadedMs: performance.getEntriesByType("navigation")[0]
      ? (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).domContentLoadedEventEnd
      : 0,
    transferBytes: performance.getEntriesByType("resource")
      .reduce((total, entry) => total + ((entry as PerformanceResourceTiming).transferSize || 0), 0)
  }));
  return { readyMs, ...timing };
}

async function coldSwitchInto(
  context: BrowserContext,
  page: Page,
  source: Scenario,
  target: Scenario,
  routeName: "Calendar" | "Process Flow"
) {
  await addProcessCookies(context, source);
  await page.goto("/dashboard");
  await page.evaluate(() => performance.clearMarks());
  await page.getByRole("button", { name: `Golden ${target.name}`, exact: true }).click();
  await page.getByRole("button", { name: routeName, exact: true }).click();
  await page.locator("[data-workspace-revision]").waitFor({ state: "visible" });
  const [labelMs, bootstrapMs, routeMs] = await Promise.all([
    markDuration(page, "waferwatch:process-selection-start", "waferwatch:process-label-ready"),
    markDuration(page, "waferwatch:process-selection-start", "waferwatch:process-bootstrap-ready"),
    markDuration(page, "waferwatch:process-selection-start", "waferwatch:route-dom-ready")
  ]);
  return { labelMs, bootstrapMs, routeMs };
}

async function dragBetween(source: ReturnType<Page["locator"]>, target: ReturnType<Page["locator"]>) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Performance drag target is not visible.");
  await source.hover();
  await source.page().mouse.down();
  await source.page().mouse.move(
    targetBox.x + targetBox.width * 0.25,
    targetBox.y + Math.min(125, targetBox.height * 0.68),
    { steps: 12 }
  );
  await source.page().mouse.up();
}

async function installMoveStateObserver(page: Page, assignmentIds: string[]) {
  await page.evaluate((ids) => {
    const state = Object.fromEntries(ids.map((id) => [id, [] as string[]]));
    const scan = () => {
      for (const id of ids) {
        const chip = document.querySelector(`[data-assignment-id="${id}"]`);
        const value = chip?.getAttribute("data-move-state");
        if (value && state[id].at(-1) !== value) state[id].push(value);
      }
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    (window as unknown as { __waferwatchMoveObserver?: MutationObserver }).__waferwatchMoveObserver?.disconnect();
    (window as unknown as { __waferwatchMoveObserver: MutationObserver }).__waferwatchMoveObserver = observer;
    (window as unknown as { __waferwatchMoveStates: Record<string, string[]> }).__waferwatchMoveStates = state;
  }, assignmentIds);
}

async function markDuration(page: Page, from: string, to: string) {
  return page.evaluate(({ from, to }) => {
    const start = performance.getEntriesByName(from, "mark").at(-1)?.startTime;
    const end = performance.getEntriesByName(to, "mark").at(-1)?.startTime;
    if (start === undefined || end === undefined) throw new Error(`Missing performance marks ${from} -> ${to}.`);
    return end - start;
  }, { from, to });
}

async function runMovement(browser: Browser, scenario: Scenario) {
  const initiator = await browser.newContext({ storageState: environment.reviewerStatePath });
  const observer = await browser.newContext({ storageState: environment.operatorStatePath });
  const page = await initiator.newPage();
  const secondPage = await observer.newPage();
  await Promise.all([
    gotoWorkspace(initiator, page, scenario, "/process-flow"),
    gotoWorkspace(observer, secondPage, scenario, "/process-flow")
  ]);
  const assignmentIds = scenario.wafers.map((wafer) => wafer.assignmentId);
  await installMoveStateObserver(page, assignmentIds);
  await page.evaluate(() => performance.clearMarks());
  for (const assignmentId of assignmentIds) {
    await page.locator(`[data-assignment-id="${assignmentId}"]`).click();
  }
  await dragBetween(
    page.locator(`[data-assignment-id="${assignmentIds[0]}"]`),
    page.locator(`[data-node-id="${scenario.stepIds[2]}"]`)
  );
  await page.getByRole("button", { name: "Create planned batch" }).click();
  const releaseEpoch = await page.evaluate(() => {
    const release = performance.getEntriesByName("waferwatch:drag-release", "mark").at(-1);
    if (!release) throw new Error("The drag release performance mark is missing.");
    return performance.timeOrigin + release.startTime;
  });
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName("waferwatch:move-committed").length)).toBe(1);
  const optimisticMs = await markDuration(page, "waferwatch:drag-release", "waferwatch:optimistic-chip-painted");
  const acknowledgeMs = await markDuration(page, "waferwatch:drag-release", "waferwatch:command-acknowledged");
  const convergenceMs = await markDuration(page, "waferwatch:drag-release", "waferwatch:move-committed");
  const mutationIds = (await Promise.all(assignmentIds.map((assignmentId) =>
    page.locator(`[data-assignment-id="${assignmentId}"]`).getAttribute("data-mutation-id")
  ))).filter((value): value is string => Boolean(value));
  for (const assignmentId of assignmentIds) {
    await expect(page.locator(`[data-node-id="${scenario.stepIds[2]}"] [data-assignment-id="${assignmentId}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-node-id="${scenario.stepIds[1]}"] [data-assignment-id="${assignmentId}"]`)).toHaveCount(0);
    await expect(secondPage.locator(`[data-node-id="${scenario.stepIds[2]}"] [data-assignment-id="${assignmentId}"]`)).toHaveCount(1);
  }
  const secondSessionMs = Date.now() - releaseEpoch;
  const states = await page.evaluate(() => (
    (window as unknown as { __waferwatchMoveStates: Record<string, string[]> }).__waferwatchMoveStates
  ));
  for (const assignmentId of assignmentIds) {
    const ordered = states[assignmentId].filter((value, index, all) => index === 0 || all[index - 1] !== value);
    expect(ordered).toEqual(expect.arrayContaining(["optimistic", "saving", "committed"]));
    expect(ordered.indexOf("optimistic")).toBeLessThan(ordered.indexOf("saving"));
    expect(ordered.indexOf("saving")).toBeLessThan(ordered.indexOf("committed"));
  }
  const canonical = await workspaceSnapshot(scenario.templateId);
  const currentState = canonical.currentState as Array<Record<string, unknown>>;
  for (const assignmentId of assignmentIds) {
    expect(currentState.find((row) => row.assignment_id === assignmentId)?.current_step_id).toBe(scenario.stepIds[2]);
  }
  const canonicalRevision = Number(canonical.revision);
  const { data: runs, error: runError } = await admin
    .from("operation_runs")
    .select("id")
    .eq("template_id", scenario.templateId)
    .eq("process_step_id", scenario.stepIds[2]);
  if (runError) throw new Error(runError.message);
  expect(runs).toHaveLength(1);
  const { count: memberCount, error: memberError } = await admin
    .from("operation_run_members")
    .select("id", { count: "exact", head: true })
    .eq("operation_run_id", runs[0].id);
  if (memberError) throw new Error(memberError.message);
  expect(memberCount).toBe(assignmentIds.length);

  let parameterMs = 0;
  const parameterButton = page.getByRole("button", { name: /Save parameters|Save for all/ });
  if (await parameterButton.isVisible().catch(() => false)) {
    await parameterButton.click();
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName("waferwatch:parameter-batch-completed").length)).toBe(1);
    parameterMs = await markDuration(page, "waferwatch:parameter-batch-started", "waferwatch:parameter-batch-completed");
  }
  await page.reload();
  for (const assignmentId of assignmentIds) {
    await expect(page.locator(`[data-node-id="${scenario.stepIds[2]}"] [data-assignment-id="${assignmentId}"]`)).toHaveCount(1);
  }
  await initiator.close();
  await observer.close();
  return {
    optimisticMs,
    acknowledgeMs,
    convergenceMs,
    secondSessionMs,
    parameterMs,
    mutationIds,
    canonicalRevision
  };
}

test("stale batches reject atomically without moving the assignment", async () => {
  const scenarios = manifest.performanceScenarios as PerformanceScenarios | null;
  expect(scenarios, "Run with GOLDEN_PERFORMANCE=1.").not.toBeNull();
  const scenario = scenarios!.stale;
  const before = await workspaceSnapshot(scenario.templateId);
  const input = moveRpcInput(scenario, Number(before.revision) + 1);
  const { error } = await reviewer.rpc("execute_process_flow_mutations_batch_v2", input);
  expect(error).toBeTruthy();
  const after = await workspaceSnapshot(scenario.templateId);
  expect(after.revision).toBe(before.revision);
  const row = (after.currentState as Array<Record<string, unknown>>)
    .find((candidate) => candidate.assignment_id === scenario.wafers[0].assignmentId);
  expect(row?.current_step_id).toBe(scenario.stepIds[1]);
});

test("duplicate batch delivery is idempotent", async () => {
  const scenarios = manifest.performanceScenarios as PerformanceScenarios | null;
  expect(scenarios, "Run with GOLDEN_PERFORMANCE=1.").not.toBeNull();
  const scenario = scenarios!.idempotent;
  const before = await workspaceSnapshot(scenario.templateId);
  const input = moveRpcInput(scenario, Number(before.revision));
  const first = await reviewer.rpc("execute_process_flow_mutations_batch_v2", input);
  if (first.error) throw new Error(first.error.message);
  const second = await reviewer.rpc("execute_process_flow_mutations_batch_v2", input);
  if (second.error) throw new Error(second.error.message);
  expect((second.data as Record<string, unknown>).workflowRevision)
    .toBe((first.data as Record<string, unknown>).workflowRevision);
  const after = await workspaceSnapshot(scenario.templateId);
  expect(Number(after.revision)).toBe(Number(before.revision) + 1);
  const { data: runs, error: runError } = await admin
    .from("operation_runs")
    .select("id")
    .eq("template_id", scenario.templateId)
    .eq("process_step_id", scenario.stepIds[2]);
  if (runError) throw new Error(runError.message);
  expect(runs).toHaveLength(1);
});

test("focus recovery applies a missed delta after realtime disconnection", async ({ browser }) => {
  const scenarios = manifest.performanceScenarios as PerformanceScenarios | null;
  expect(scenarios, "Run with GOLDEN_PERFORMANCE=1.").not.toBeNull();
  const scenario = scenarios!.recovery;
  const context = await browser.newContext({ storageState: environment.operatorStatePath });
  const page = await context.newPage();
  await gotoWorkspace(context, page, scenario, "/process-flow");
  const background = await context.newPage();
  await background.goto("about:blank");
  await background.bringToFront();
  await context.setOffline(true);
  await page.waitForTimeout(1100);
  const before = await workspaceSnapshot(scenario.templateId);
  const moved = await reviewer.rpc(
    "execute_process_flow_mutations_batch_v2",
    moveRpcInput(scenario, Number(before.revision))
  );
  if (moved.error) throw new Error(moved.error.message);
  await context.setOffline(false);
  await page.bringToFront();
  await expect(page.locator(
    `[data-node-id="${scenario.stepIds[2]}"] [data-assignment-id="${scenario.wafers[0].assignmentId}"]`
  )).toHaveCount(1);
  await context.close();
});

test("retained-log gaps recover only the affected bounded bootstrap", async ({ browser }) => {
  const scenarios = manifest.performanceScenarios as PerformanceScenarios | null;
  expect(scenarios, "Run with GOLDEN_PERFORMANCE=1.").not.toBeNull();
  const scenario = scenarios!.revisionGap;
  const context = await browser.newContext({ storageState: environment.operatorStatePath });
  const page = await context.newPage();
  await gotoWorkspace(context, page, scenario, "/process-flow");
  const cachedRevision = Number(await page.locator("[data-workspace-revision]").getAttribute("data-workspace-revision"));
  const background = await context.newPage();
  await background.goto("about:blank");
  await background.bringToFront();
  await page.waitForTimeout(1100);
  const nextRevision = cachedRevision + 2;
  const { error: deleteError } = await admin.from("workflow_change_log").delete().eq("template_id", scenario.templateId);
  if (deleteError) throw new Error(deleteError.message);
  const { error: revisionError } = await admin.from("workflow_revisions").upsert({
    template_id: scenario.templateId,
    current_revision: nextRevision,
    updated_at: new Date().toISOString()
  });
  if (revisionError) throw new Error(revisionError.message);
  const { error: changeError } = await admin.from("workflow_change_log").insert({
    template_id: scenario.templateId,
    revision: nextRevision,
    client_mutation_id: randomUUID(),
    mutation_kind: "performance.retained-gap",
    changed_entities: {},
    actor_id: environment.operator.userId
  });
  if (changeError) throw new Error(changeError.message);
  await page.bringToFront();
  await expect(page.locator("[data-workspace-revision]")).toHaveAttribute("data-workspace-revision", String(nextRevision));
  await context.close();
});

test("operator submission and reviewer routing converge across two sessions", async ({ browser }) => {
  const scenario = manifest.scenarios.fullMove as Scenario;
  const wafer = scenario.wafers[0];
  const operatorContext = await browser.newContext({ storageState: environment.operatorStatePath });
  const reviewerContext = await browser.newContext({ storageState: environment.reviewerStatePath });
  const operatorPage = await operatorContext.newPage();
  const reviewerPage = await reviewerContext.newPage();
  await Promise.all([
    gotoWorkspace(operatorContext, operatorPage, scenario, "/process-flow"),
    gotoWorkspace(reviewerContext, reviewerPage, scenario, "/process-flow")
  ]);
  await dragBetween(
    operatorPage.locator(`[data-assignment-id="${wafer.assignmentId}"]`),
    operatorPage.locator(`[data-node-id="${scenario.stepIds[0]}"]`)
  );
  await operatorPage.locator("#process-wafer-move-note").fill("Performance operator submission");
  await operatorPage.getByRole("button", { name: "Submit for review" }).click();
  await expect.poll(async () => {
    const snapshot = await workspaceSnapshot(scenario.templateId);
    return (snapshot.currentState as Array<Record<string, unknown>>)
      .find((row) => row.assignment_id === wafer.assignmentId)?.current_member_status;
  }).toBe("awaiting_review");
  await dragBetween(
    reviewerPage.locator(`[data-assignment-id="${wafer.assignmentId}"]`),
    reviewerPage.locator(`[data-node-id="${scenario.stepIds[1]}"]`)
  );
  await reviewerPage.getByRole("button", { name: "Create planned batch" }).click();
  for (const page of [operatorPage, reviewerPage]) {
    await expect(page.locator(
      `[data-node-id="${scenario.stepIds[1]}"] [data-assignment-id="${wafer.assignmentId}"]`
    )).toHaveCount(1);
  }
  await operatorContext.close();
  await reviewerContext.close();
});

test("staging hot-loading and movement p95 budgets", async ({ browser }, testInfo: TestInfo) => {
  const performanceScenarios = manifest.performanceScenarios as PerformanceScenarios | null;
  expect(performanceScenarios, "Run with GOLDEN_PERFORMANCE=1.").not.toBeNull();
  const report: PerformanceReport = {
    runId: manifest.runId,
    repetitions: { warmups, measured },
    samples: {},
    p95: {},
    payloadBytes: {},
    commits: []
  };
  const add = (key: string, value: number, repetition: number) => {
    if (repetition < warmups) return;
    (report.samples[key] ??= []).push(Math.round(value * 100) / 100);
  };

  for (let repetition = 0; repetition < warmups + measured; repetition += 1) {
    for (const route of ["/calendar", "/process-flow"] as const) {
      const context = await browser.newContext({ storageState: environment.operatorStatePath });
      const page = await context.newPage();
      const timing = await gotoWorkspace(context, page, performanceScenarios!.cold, route);
      add(`cold:${route}`, timing.readyMs, repetition);
      add(`navigation-dcl:${route}`, timing.domContentLoadedMs, repetition);
      if (repetition >= warmups) (report.payloadBytes[route] ??= []).push(timing.transferBytes);
      await context.close();
    }
  }

  for (let repetition = 0; repetition < warmups + measured; repetition += 1) {
    for (const routeName of ["Calendar", "Process Flow"] as const) {
      const context = await browser.newContext({ storageState: environment.operatorStatePath });
      const page = await context.newPage();
      const switched = await coldSwitchInto(
        context,
        page,
        performanceScenarios!.revisionGap,
        performanceScenarios!.cold,
        routeName
      );
      add(`selection:${routeName}:label`, switched.labelMs, repetition);
      add(`selection:${routeName}:bootstrap`, switched.bootstrapMs, repetition);
      add(`selection:${routeName}:route`, switched.routeMs, repetition);
      await context.close();
    }
  }

  const warmContext = await browser.newContext({ storageState: environment.operatorStatePath });
  const warmPage = await warmContext.newPage();
  await gotoWorkspace(warmContext, warmPage, performanceScenarios!.cold, "/process-flow");
  for (let repetition = 0; repetition < warmups + measured; repetition += 1) {
    for (const target of [
      { name: "Calendar", selector: ".wireframe-calendar-view" },
      { name: "Process Flow", selector: ".process-flow-view" }
    ]) {
      const startedAt = Date.now();
      await warmPage.locator("aside.wireframe-sidebar").getByRole("link", { name: target.name, exact: true }).click();
      await warmPage.locator(`${target.selector}[data-workspace-revision]`).waitFor({ state: "visible" });
      add("warm:route", Date.now() - startedAt, repetition);
    }
  }
  await warmContext.close();

  for (const size of [1, 8, 25] as const) {
    const scenarios = performanceScenarios!.batches[String(size) as "1" | "8" | "25"];
    for (let repetition = 0; repetition < warmups + measured; repetition += 1) {
      const timing = await runMovement(browser, scenarios[repetition]);
      add(`move:${size}:optimistic`, timing.optimisticMs, repetition);
      add(`move:${size}:acknowledge`, timing.acknowledgeMs, repetition);
      add(`move:${size}:initiator`, timing.convergenceMs, repetition);
      add(`move:${size}:second-session`, timing.secondSessionMs, repetition);
      if (timing.parameterMs > 0) add(`move:${size}:parameters`, timing.parameterMs, repetition);
      if (repetition >= warmups) {
        report.commits.push({
          size,
          revision: timing.canonicalRevision,
          mutationIds: timing.mutationIds
        });
      }
    }
  }

  for (const [key, values] of Object.entries(report.samples)) report.p95[key] = percentile95(values);
  for (const key of ["cold:/calendar", "cold:/process-flow"]) expect(report.p95[key], key).toBeLessThanOrEqual(2500);
  for (const routeName of ["Calendar", "Process Flow"]) {
    expect(report.p95[`selection:${routeName}:route`], `${routeName} cold switch`).toBeLessThanOrEqual(2500);
  }
  expect(report.p95["warm:route"], "warm route").toBeLessThanOrEqual(750);
  for (const size of [1, 8, 25]) {
    expect(report.p95[`move:${size}:optimistic`], `${size} optimistic`).toBeLessThanOrEqual(100);
    expect(report.p95[`move:${size}:acknowledge`], `${size} acknowledgement`).toBeLessThanOrEqual(1000);
    expect(report.p95[`move:${size}:initiator`], `${size} initiator`).toBeLessThanOrEqual(1500);
    expect(report.p95[`move:${size}:second-session`], `${size} second session`).toBeLessThanOrEqual(1500);
    if (report.p95[`move:${size}:parameters`] !== undefined) {
      expect(report.p95[`move:${size}:parameters`], `${size} parameters`).toBeLessThanOrEqual(1500);
    }
  }
  await testInfo.attach("normalized-performance-report.json", {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: "application/json"
  });
});
