import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("all five pages resolve server selection instead of reading processId search state", async () => {
  const pageSources = await Promise.all([
    source("../../app/(app)/dashboard/page.tsx"),
    source("../../app/(app)/calendar/page.tsx"),
    source("../../app/(app)/analysis/page.tsx"),
    source("../../app/(app)/process-flow/page.tsx"),
    source("../../app/(app)/wafer-status/page.tsx")
  ]);

  for (const pageSource of pageSources) {
    assert.match(pageSource, /resolveActiveProcess/);
    assert.doesNotMatch(pageSource, /searchParams[\s\S]{0,120}processId|\.processId/);
  }
});

test("shell clients no longer read processId from the address", async () => {
  const clientSources = await Promise.all([
    source("../../ui/waferwatch-wireframe/components/WireframeSidebar.tsx"),
    source("../../ui/waferwatch-wireframe/components/WireframeMobileChrome.tsx"),
    source("../../ui/waferwatch-wireframe/components/ProcessRoutePrefetcher.tsx"),
    source("../collaboration/RealtimeWorkflowBridge.tsx")
  ]);

  for (const clientSource of clientSources) {
    assert.doesNotMatch(clientSource, /useSearchParams|\.get\(["']processId["']\)/);
  }
});

test("mobile keeps five reachable clean-route controls above its fixed bottom edge", async () => {
  const [mobileSource, navigationSource, globalStyles] = await Promise.all([
    source("../../ui/waferwatch-wireframe/components/WireframeMobileChrome.tsx"),
    source("../../ui/waferwatch-wireframe/nav.ts"),
    source("../../app/globals.css")
  ]);

  assert.doesNotMatch(mobileSource, /processId|hrefWithProcess/);
  for (const route of ["/dashboard", "/calendar", "/analysis", "/process-flow", "/wafer-status"]) {
    assert.match(navigationSource, new RegExp(`href: "${route}"`));
  }
  assert.match(globalStyles, /\.wireframe-mobile-bottom-nav \{[\s\S]*?position: fixed;[\s\S]*?bottom: 0;[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(globalStyles, /\.wireframe-mobile-bottom-nav__item \{[\s\S]*?min-height: 52px/);
});

test("selection refreshes clean route cache before redirecting", async () => {
  const actionSource = await source("./actions.ts");
  const cookieIndex = actionSource.indexOf("setActiveProcessCookie(data.id)");
  const refreshIndex = actionSource.indexOf("refresh()", cookieIndex);
  const redirectIndex = actionSource.indexOf("redirect(selection.destination)", refreshIndex);

  assert.ok(cookieIndex >= 0);
  assert.ok(refreshIndex > cookieIndex);
  assert.ok(redirectIndex > refreshIndex);
});

test("creation, active deletion, and sign-out maintain cookie lifecycle", async () => {
  const [processActions, accountActions] = await Promise.all([
    source("../process-flows/actions.ts"),
    source("../accounts/actions.ts")
  ]);

  assert.match(processActions, /lifecycle_status: "draft"/);
  assert.match(processActions, /setActiveProcessCookie\(data\.id\)/);
  assert.match(processActions, /clearActiveProcessCookieIfSelected\(parsed\.templateId\)/);
  assert.match(accountActions, /clearActiveProcessCookie\(\)[\s\S]{0,120}supabase\.auth\.signOut\(\)/);
});

test("proxy transfers refreshed authentication cookies onto compatibility redirects", async () => {
  const proxySource = await source("../../proxy.ts");
  assert.match(proxySource, /sessionResponse\.cookies\.getAll\(\)/);
  assert.match(proxySource, /response\.cookies\.set\(cookie\)/);
  assert.match(proxySource, /NextResponse\.redirect\(destination, 307\)/);
});

test("realtime receives server selection and unsubscribes when that prop changes", async () => {
  const bridgeSource = await source("../collaboration/RealtimeWorkflowBridge.tsx");
  assert.match(bridgeSource, /activeProcessId: string \| null/);
  assert.match(bridgeSource, /supabase\.removeChannel\(channel\)/);
  assert.match(bridgeSource, /pathname !== "\/wafer-status"/);
  assert.match(bridgeSource, /if \(loadsWorkspaceSnapshot\) \{[\s\S]{0,120}void loadSnapshot/);
  assert.match(bridgeSource, /\[enabled, loadsWorkspaceSnapshot, processTemplateId, router\]/);
});
