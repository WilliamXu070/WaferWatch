import "server-only";

function normalizeUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function isLocalUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(url);
}

function vercelUrl() {
  const host =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    process.env.VERCEL_URL ??
    process.env.VERCEL_BRANCH_URL;

  if (!host) {
    return null;
  }

  return host.startsWith("http") ? host : `https://${host}`;
}

export function getAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const deploymentUrl = vercelUrl();

  if (configuredUrl && (process.env.NODE_ENV !== "production" || !isLocalUrl(configuredUrl))) {
    return normalizeUrl(configuredUrl);
  }

  const resolvedUrl = deploymentUrl ?? configuredUrl ?? "http://localhost:3000";

  return normalizeUrl(resolvedUrl);
}
