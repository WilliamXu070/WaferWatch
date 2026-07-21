export function getSupabaseStatus() {
  return {
    hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasPublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    hasServerSecret: Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

type HealthFetch = typeof fetch;

type SupabaseHealthOptions = {
  fetchImpl?: HealthFetch;
  timeoutMs?: number;
};

export async function checkSupabaseHealth({
  fetchImpl = fetch,
  timeoutMs = 3_000
}: SupabaseHealthOptions = {}) {
  const configuration = getSupabaseStatus();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return {
      ...configuration,
      ok: false,
      state: "misconfigured" as const,
      httpStatus: null,
      errorCode: "MISSING_CONFIGURATION",
      latencyMs: 0
    };
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${url}/rest/v1/process_steps?select=id&limit=0`, {
      cache: "no-store",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`
      },
      signal: controller.signal
    });

    let errorCode: string | null = null;
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      errorCode = typeof body?.code === "string" ? body.code : `HTTP_${response.status}`;
    }

    return {
      ...configuration,
      ok: response.ok,
      state: response.ok ? ("healthy" as const) : ("unavailable" as const),
      httpStatus: response.status,
      errorCode,
      latencyMs: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      ...configuration,
      ok: false,
      state: "unavailable" as const,
      httpStatus: null,
      errorCode: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      latencyMs: Math.round(performance.now() - startedAt)
    };
  } finally {
    clearTimeout(timeout);
  }
}
