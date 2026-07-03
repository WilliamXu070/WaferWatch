import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

type IconSource = "fallback" | "searcher";

type IconSuggestion = {
  iconQuery: string;
  iconSource: IconSource;
  confidence: number;
  reason: string;
};

type ErrorShape = {
  ok: false;
  iconUrl: null;
  iconQuery: null;
  source: "fallback";
  reason: string;
};

type SuccessShape = {
  ok: true;
  iconUrl: string | null;
  iconQuery: string | null;
  source: IconSource;
  reason: string;
  confidence: number;
};

type RouteResponse = ErrorShape | SuccessShape;

type IconRequest = {
  stepName?: string;
  processArea?: string;
};

type HardcodedRule = {
  iconQuery: string;
  confidence: number;
  reason: string;
  keywords: readonly string[];
};

const PUBLIC_ICON_DIR = path.join(process.cwd(), "public", "flow-step-icons");
const LUCIDE_ICON_BASE = "https://unpkg.com/lucide-static@latest/icons";
const DEFAULT_ICON_SLUG = "file-text";
const MAX_INPUT_LENGTH = 180;

// Temporary hardcoded resolver for predictable local behavior.
const HARDCODED_ICON_RULES: readonly HardcodedRule[] = [
  {
    iconQuery: "sparkles",
    confidence: 0.92,
    reason: "Hardcoded keyword / spelling match (etch family)",
    keywords: [
      "etch",
      "etching",
      "etching",
      "etchig",
      "etchin",
      "plasma",
      "strip",
      "stripped",
      "deposition",
      "dryetch",
      "dry etch",
      "chemicalmechanical",
      "chemical mechanical",
      "cmp",
      "ion",
      "implant",
      "reactiveion",
      "reactive ion",
      "plasmaetch",
      "plama"
    ]
  },
  {
    iconQuery: "droplets",
    confidence: 0.9,
    reason: "Hardcoded keyword / spelling match (clean family)",
    keywords: [
      "solvent",
      "clean",
      "cleane",
      "cleaning",
      "rinse",
      "wash",
      "degrease",
      "degreas",
      "preclean",
      "purify",
      "pre clean",
      "sovlent",
      "solvant",
      "cleanl",
      "cleean",
      "clena"
    ]
  },
  {
    iconQuery: "scan-line",
    confidence: 0.89,
    reason: "Hardcoded keyword / spelling match (lithography)",
    keywords: [
      "litho",
      "lithography",
      "photoresist",
      "expose",
      "exposure",
      "mask",
      "coat",
      "scan",
      "overlay",
      "alignment",
      "align",
      "lito",
      "litoe",
      "photolith",
      "lithph"
    ]
  },
  {
    iconQuery: "activity",
    confidence: 0.88,
    reason: "Hardcoded keyword / spelling match (inspection)",
    keywords: [
      "characterization",
      "character",
      "meta",
      "metrology",
      "inspect",
      "inspection",
      "inspec",
      "qa",
      "measurement",
      "quality",
      "test",
      "metrologies",
      "inspected"
    ]
  },
  {
    iconQuery: "circle-play",
    confidence: 0.84,
    reason: "Hardcoded keyword / spelling match (start)",
    keywords: [
      "start",
      "entry",
      "receive",
      "intake",
      "ticket",
      "inbound",
      "incoming"
    ]
  }
];

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.svg$/i, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isSafeSvg(raw: string) {
  return !/<(script|iframe|object|embed|link|meta|base|frame|frameset|form|input|textarea|select|option|style)\b/i.test(raw) &&
    !/on[a-z]+\s*=/i.test(raw);
}

function localIconPath(slug: string) {
  const safeSlug = slug || DEFAULT_ICON_SLUG;
  return path.join(PUBLIC_ICON_DIR, `${safeSlug}.svg`);
}

function localIconUrl(slug: string) {
  return `/flow-step-icons/${slug}.svg`;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalIcon(slug: string) {
  const safeSlug = normalizeSlug(slug) || DEFAULT_ICON_SLUG;
  const target = localIconPath(safeSlug);

  if (await exists(target)) {
    return localIconUrl(safeSlug);
  }

  const fallback = localIconPath(DEFAULT_ICON_SLUG);
  if (safeSlug !== DEFAULT_ICON_SLUG && (await exists(fallback))) {
    return localIconUrl(DEFAULT_ICON_SLUG);
  }

  return null;
}

function candidateIconQueries(stepName: string, processArea: string) {
  const sourceText = normalizeText(`${stepName} ${processArea}`);
  const tokens = sourceText.split(/\s+/).filter(Boolean);

  const queries = new Set<string>([
    normalizeSlug(stepName),
    normalizeSlug(processArea),
    normalizeSlug(sourceText)
  ]);

  for (let i = 0; i < tokens.length; i += 1) {
    queries.add(tokens[i]);
    if (i + 1 < tokens.length) {
      queries.add(`${tokens[i]}-${tokens[i + 1]}`);
    }
  }

  queries.delete("");

  return [...queries].filter(Boolean);
}

async function fetchLucideIcon(slug: string) {
  const safeSlug = normalizeSlug(slug);
  if (!safeSlug) {
    return null;
  }

  const target = localIconPath(safeSlug);
  await fs.mkdir(PUBLIC_ICON_DIR, { recursive: true });

  const existing = await exists(target);
  if (existing) {
    return localIconUrl(safeSlug);
  }

  const response = await fetch(`${LUCIDE_ICON_BASE}/${safeSlug}.svg`);
  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("svg") && !contentType?.includes("xml")) {
    return null;
  }

  const body = await response.text();
  if (!body.includes("<svg")) {
    return null;
  }

  if (!isSafeSvg(body)) {
    return null;
  }

  await fs.writeFile(target, body, "utf8");
  return localIconUrl(safeSlug);
}

async function resolveIconWithFallback(stepName: string, processArea: string, hardcodedQuery: string) {
  if (hardcodedQuery !== DEFAULT_ICON_SLUG) {
    const localResult = await resolveLocalIcon(hardcodedQuery);
    if (localResult) {
      return { iconUrl: localResult, iconQuery: normalizeSlug(hardcodedQuery), source: "fallback" as IconSource };
    }

    const searchResult = await fetchLucideIcon(hardcodedQuery);
    if (searchResult) {
      return { iconUrl: searchResult, iconQuery: normalizeSlug(hardcodedQuery), source: "fallback" as IconSource };
    }
  }

  const candidateQueries = candidateIconQueries(stepName, processArea);
  for (const query of candidateQueries) {
    const url = await fetchLucideIcon(query);
    if (url) {
      return { iconUrl: url, iconQuery: query, source: "searcher" as IconSource };
    }
  }

  const fallbackResult = await resolveLocalIcon(DEFAULT_ICON_SLUG);
  return {
    iconUrl: fallbackResult,
    iconQuery: DEFAULT_ICON_SLUG,
    source: "fallback" as IconSource
  };
}

function safeArea(value: string) {
  return value.trim().slice(0, 200);
}

function safeName(value: string) {
  return value.trim().slice(0, MAX_INPUT_LENGTH);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const rows = m + 1;
  const cols = n + 1;

  if (m === 0) {
    return n;
  }

  if (n === 0) {
    return m;
  }

  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) {
    dp[i][0] = i;
  }

  for (let j = 0; j < cols; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    const c1 = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j += 1) {
      const c2 = b.charCodeAt(j - 1);
      const cost = c1 === c2 ? 0 : 1;
      const deleteCost = dp[i - 1][j] + 1;
      const insertCost = dp[i][j - 1] + 1;
      const replaceCost = dp[i - 1][j - 1] + cost;

      let value = Math.min(deleteCost, insertCost, replaceCost);
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        value = Math.min(value, dp[i - 2][j - 2] + 1);
      }

      dp[i][j] = value;
    }
  }

  return dp[m][n];
}

function isTypoMatch(candidate: string, tokens: string[]) {
  const minTokenLength = 4;
  for (const token of tokens) {
    if (!token || token.length === 0) {
      continue;
    }

    if (token === candidate) {
      return true;
    }

    if (candidate.length >= minTokenLength && token.length >= minTokenLength) {
      const distance = levenshteinDistance(token, candidate);
      if (distance <= 1) {
        return true;
      }

      if (candidate.length >= 7 && token.length >= 7 && distance <= 2) {
        return true;
      }
    }

    if (candidate.length >= 6 && (token.includes(candidate) || candidate.includes(token))) {
      return true;
    }
  }

  return false;
}

function matchesAny(text: string, tokens: string[], keywords: readonly string[]) {
  if (!text || !tokens.length) {
    return false;
  }

  const normalizedKeywords = keywords.map((keyword) => normalizeText(keyword));

  for (const keyword of normalizedKeywords) {
    if (!keyword) {
      continue;
    }

    if (text.includes(keyword)) {
      return true;
    }

    if (isTypoMatch(keyword, tokens)) {
      return true;
    }
  }

  return false;
}

function fallbackSuggestion(stepName: string, processArea: string): IconSuggestion {
  const sourceText = normalizeText(`${stepName} ${processArea}`);
  const tokens = sourceText.split(/\s+/).filter(Boolean);
  const matchedRule = HARDCODED_ICON_RULES.find((rule) => matchesAny(sourceText, tokens, rule.keywords));

  if (matchedRule) {
    return {
      iconSource: "fallback",
      iconQuery: matchedRule.iconQuery,
      confidence: matchedRule.confidence,
      reason: matchedRule.reason
    };
  }

  return {
    iconSource: "searcher",
    iconQuery: "",
    confidence: 0.5,
    reason: "No hardcoded match; using icon search fallback"
  };
}

export async function POST(request: NextRequest) {
  let body: IconRequest;

  try {
    body = (await request.json()) as IconRequest;
  } catch {
    const error: ErrorShape = {
      ok: false,
      iconUrl: null,
      iconQuery: null,
      source: "fallback",
      reason: "Invalid JSON body"
    };

    return NextResponse.json(error, { status: 400 });
  }

  const stepName = safeName(typeof body.stepName === "string" ? body.stepName : "");
  const processArea = safeArea(typeof body.processArea === "string" ? body.processArea : "");

  if (!stepName) {
    const error: ErrorShape = {
      ok: false,
      iconUrl: null,
      iconQuery: null,
      source: "fallback",
      reason: "stepName is required"
    };

    return NextResponse.json(error, { status: 400 });
  }

  const suggestion: IconSuggestion = fallbackSuggestion(stepName, processArea);

  const hardcodedQuery = normalizeSlug(suggestion.iconQuery) || DEFAULT_ICON_SLUG;
  const resolution = await resolveIconWithFallback(stepName, processArea, hardcodedQuery);

  const result: RouteResponse = {
    ok: true,
    iconUrl: resolution.iconUrl,
    iconQuery: resolution.iconQuery,
    source: resolution.source,
    reason: suggestion.reason,
    confidence: suggestion.confidence
  };

  return NextResponse.json(result);
}
