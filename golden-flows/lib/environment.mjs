import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const manifestPath = path.join(process.cwd(), ".golden-flow", "run.json");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required golden-flow environment variable: ${name}`);
  return value;
}

function decodeBase64Url(value) {
  const padded = value.padEnd(value.length + (4 - (value.length % 4 || 4)) % 4, "=");
  return Buffer.from(padded.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
}

function readAuthCookie(storageStatePath) {
  const state = JSON.parse(fs.readFileSync(storageStatePath, "utf8"));
  const cookie = state.cookies?.find((candidate) => (
    candidate.name?.startsWith("sb-") && candidate.name.endsWith("-auth-token")
  ));
  if (!cookie?.value) throw new Error(`No Supabase auth cookie found in ${storageStatePath}`);
  const decoded = decodeURIComponent(cookie.value);
  const payload = decoded.startsWith("base64-")
    ? Buffer.from(decoded.slice("base64-".length), "base64").toString("utf8")
    : decoded;
  const session = JSON.parse(payload);
  const accessToken = Array.isArray(session) ? session[0] : session.access_token;
  if (!accessToken) throw new Error(`No Supabase access token found in ${storageStatePath}`);
  const claims = JSON.parse(decodeBase64Url(accessToken.split(".")[1]));
  if (!claims.sub) throw new Error(`No user id found in ${storageStatePath}`);
  return { accessToken, userId: claims.sub };
}

export function loadGoldenEnvironment() {
  if (process.env.GOLDEN_FLOW_ENV !== "staging") {
    throw new Error("Golden flows are staging-only. Set GOLDEN_FLOW_ENV=staging explicitly.");
  }
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = required("GOLDEN_STAGING_PROJECT_REF");
  const hostname = new URL(supabaseUrl).hostname;
  if (!hostname.startsWith(`${projectRef}.`)) {
    throw new Error("GOLDEN_STAGING_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
  }
  const productionRef = required("GOLDEN_PRODUCTION_PROJECT_REF");
  if (productionRef === projectRef) {
    throw new Error("Refusing to run golden flows against the production Supabase project.");
  }

  const operatorStatePath = path.resolve(required("GOLDEN_OPERATOR_STORAGE_STATE"));
  const reviewerStatePath = path.resolve(required("GOLDEN_REVIEWER_STORAGE_STATE"));
  const operator = readAuthCookie(operatorStatePath);
  const reviewer = readAuthCookie(reviewerStatePath);
  if (operator.userId === reviewer.userId) {
    throw new Error("Operator and reviewer golden flows require distinct authenticated users.");
  }

  return {
    baseUrl: process.env.GOLDEN_BASE_URL?.trim() || "http://127.0.0.1:3000",
    supabaseUrl,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
      || required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || required("SUPABASE_SECRET_KEY"),
    projectRef,
    operatorStatePath,
    reviewerStatePath,
    operator,
    reviewer
  };
}

export function createGoldenClients(environment = loadGoldenEnvironment()) {
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    admin: createClient(environment.supabaseUrl, environment.serviceKey, options),
    operator: createClient(environment.supabaseUrl, environment.anonKey, {
      ...options,
      global: { headers: { Authorization: `Bearer ${environment.operator.accessToken}` } }
    }),
    reviewer: createClient(environment.supabaseUrl, environment.anonKey, {
      ...options,
      global: { headers: { Authorization: `Bearer ${environment.reviewer.accessToken}` } }
    })
  };
}

export function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function writeManifest(manifest) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
