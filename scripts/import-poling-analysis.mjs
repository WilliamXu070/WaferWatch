import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const catalogUrl = new URL("../src/features/analysis/polingCatalog.json", import.meta.url);

function parseArguments(argv) {
  const options = {
    apply: false,
    projectId: null,
    importedBy: null,
    chunkSize: 100
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--project-id" || argument === "--imported-by" || argument === "--chunk-size") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      if (argument === "--project-id") options.projectId = value;
      if (argument === "--imported-by") options.importedBy = value;
      if (argument === "--chunk-size") options.chunkSize = Number(value);
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      console.log(`Usage: npm run analysis:import -- [options]

Options:
  --project-id <uuid>  Import into this active project. If omitted, use the
                       owner project of the newest active published process.
  --imported-by <uuid> Optional profile attribution for the import.
  --chunk-size <n>     Records per request (1-500, default 100).
  --apply              Perform database writes. Without this flag, only
                       validate and print the catalog import plan.
  --help               Show this help.`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!Number.isInteger(options.chunkSize) || options.chunkSize < 1 || options.chunkSize > 500) {
    throw new Error("--chunk-size must be an integer from 1 through 500.");
  }

  return options;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function serviceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.");
  return key;
}

function assertString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string") {
    return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
    );
  }
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${canonicalJson(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`Catalog contains a non-JSON ${typeof value} value.`);
}

async function validateCatalog(catalog) {
  if (!Number.isInteger(catalog.schemaVersion) || catalog.schemaVersion < 1) {
    throw new Error("Catalog schemaVersion must be a positive integer.");
  }
  if (typeof catalog.manifestSha256 !== "string" || !/^[0-9a-f]{64}$/.test(catalog.manifestSha256)) {
    throw new Error("Catalog manifestSha256 must be a lowercase SHA-256 digest.");
  }
  if (!Array.isArray(catalog.records) || catalog.records.length === 0) {
    throw new Error("Catalog records must be a non-empty array.");
  }
  if (catalog.summary?.recordCount !== catalog.records.length) {
    throw new Error(`Catalog summary recordCount does not match ${catalog.records.length} records.`);
  }

  const sourceKeys = new Set();
  const recordIds = new Set();
  const displayOrders = new Set();
  const imageHashes = new Set();
  let recordsWithImages = 0;
  for (const [index, record] of catalog.records.entries()) {
    const prefix = `records[${index}]`;
    for (const [field, value] of [
      ["id", record.id],
      ["sourceKey", record.sourceKey],
      ["specimenReference", record.specimenReference],
      ["dieLabel", record.dieLabel],
      ["sourceFile", record.sourceFile],
      ["confidence", record.confidence]
    ]) assertString(value, `${prefix}.${field}`);
    if (!/^R[0-9]+C[0-9]+$/.test(record.dieLabel)) {
      throw new Error(`${prefix}.dieLabel is not an R#C# die reference.`);
    }
    if (sourceKeys.has(record.sourceKey)) {
      throw new Error(`Duplicate sourceKey: ${record.sourceKey}`);
    }
    sourceKeys.add(record.sourceKey);
    if (recordIds.has(record.id)) throw new Error(`Duplicate record id: ${record.id}`);
    recordIds.add(record.id);
    for (const field of ["voltage", "pulseWidthMs", "pulses", "postPulseVoltage", "postPulseWidthMs"]) {
      if (typeof record[field] !== "number" || !Number.isFinite(record[field]) || record[field] < 0) {
        throw new Error(`${prefix}.${field} must be a non-negative finite number.`);
      }
    }
    if (!Number.isInteger(record.pulses)) throw new Error(`${prefix}.pulses must be an integer.`);
    if (!Number.isInteger(record.displayOrder) || record.displayOrder < 0) {
      throw new Error(`${prefix}.displayOrder must be a non-negative integer.`);
    }
    if (displayOrders.has(record.displayOrder)) {
      throw new Error(`Duplicate displayOrder: ${record.displayOrder}`);
    }
    displayOrders.add(record.displayOrder);
    if ((record.imagePath == null) !== (record.imageSha256 == null)) {
      throw new Error(`${prefix} must supply both imagePath and imageSha256, or neither.`);
    }
    if (record.imageSha256 != null && !/^[0-9a-f]{64}$/.test(record.imageSha256)) {
      throw new Error(`${prefix}.imageSha256 must be a lowercase SHA-256 digest.`);
    }
    if (record.imagePath != null) {
      const expectedPath = new RegExp(
        `^/analysis/poling/[0-9]{4}-[0-9]{2}-[0-9]{2}/${record.imageSha256}\\.jpg$`
      );
      if (!expectedPath.test(record.imagePath)) {
        throw new Error(`${prefix}.imagePath is not the content-addressed path for its digest.`);
      }
      if (imageHashes.has(record.imageSha256)) {
        throw new Error(`Duplicate image digest must be represented as source provenance: ${record.imageSha256}`);
      }
      imageHashes.add(record.imageSha256);
      recordsWithImages += 1;

      let bytes;
      try {
        bytes = await readFile(new URL(`../public${record.imagePath}`, import.meta.url));
      } catch (error) {
        throw new Error(`${prefix}.imagePath does not resolve to a readable public asset.`, {
          cause: error
        });
      }
      const actualDigest = createHash("sha256").update(bytes).digest("hex");
      if (actualDigest !== record.imageSha256) {
        throw new Error(`${prefix}.imageSha256 does not match the public asset.`);
      }
    }
  }

  for (let displayOrder = 0; displayOrder < catalog.records.length; displayOrder += 1) {
    if (!displayOrders.has(displayOrder)) {
      throw new Error(`Catalog displayOrder sequence is missing ${displayOrder}.`);
    }
  }
  if (catalog.summary?.assetCount !== imageHashes.size) {
    throw new Error(`Catalog summary assetCount does not match ${imageHashes.size} unique assets.`);
  }
  if (catalog.summary?.recordsWithImages !== recordsWithImages) {
    throw new Error(
      `Catalog summary recordsWithImages does not match ${recordsWithImages} image records.`
    );
  }

  const computedManifest = createHash("sha256")
    .update(
      canonicalJson({
        schemaVersion: catalog.schemaVersion,
        sourceFiles: catalog.sourceFiles,
        records: catalog.records
      })
    )
    .digest("hex");
  if (computedManifest !== catalog.manifestSha256) {
    throw new Error(
      `Catalog manifest digest mismatch: expected ${catalog.manifestSha256}, computed ${computedManifest}.`
    );
  }
  return { assetCount: imageHashes.size, recordCount: catalog.records.length };
}

async function resolveProject(supabase, requestedProjectId) {
  if (requestedProjectId) {
    const result = await supabase
      .from("projects")
      .select("id, name, status")
      .eq("id", requestedProjectId)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error(`Project ${requestedProjectId} does not exist.`);
    if (result.data.status !== "active") throw new Error(`Project ${requestedProjectId} is not active.`);
    return result.data;
  }

  const templateResult = await supabase
    .from("process_templates")
    .select("owner_project_id, published_at, created_at")
    .eq("is_active", true)
    .eq("lifecycle_status", "published")
    .not("owner_project_id", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(25);
  if (templateResult.error) throw templateResult.error;

  const candidateIds = [...new Set(templateResult.data.map((item) => item.owner_project_id).filter(Boolean))];
  if (candidateIds.length === 0) {
    throw new Error("No active published process has an owner project. Pass --project-id explicitly.");
  }
  const projectsResult = await supabase
    .from("projects")
    .select("id, name, status")
    .in("id", candidateIds)
    .eq("status", "active");
  if (projectsResult.error) throw projectsResult.error;
  const projectById = new Map(projectsResult.data.map((project) => [project.id, project]));
  const project = candidateIds.map((id) => projectById.get(id)).find(Boolean);
  if (!project) throw new Error("Published process owner projects are not active. Pass --project-id explicitly.");
  return project;
}

function databaseRecord(projectId, importId, record) {
  return {
    project_id: projectId,
    import_id: importId,
    catalog_record_id: record.id,
    source_key: record.sourceKey,
    specimen_reference: record.specimenReference,
    die_label: record.dieLabel,
    voltage: record.voltage,
    pulse_width_ms: record.pulseWidthMs,
    pulse_count: record.pulses,
    post_pulse_voltage: record.postPulseVoltage,
    post_pulse_width_ms: record.postPulseWidthMs,
    image_path: record.imagePath,
    image_sha256: record.imageSha256,
    source_file: record.sourceFile,
    source_slide: record.slide,
    source_image_label: record.sourceImageLabel,
    source_appearances: record.sourceAppearances,
    parameter_source: record.parameterSource,
    workbook_provenance: record.workbookProvenance,
    confidence: record.confidence,
    flags: record.flags,
    replicate_index: record.replicateIndex,
    replicate_count: record.replicateCount,
    display_order: record.displayOrder
  };
}

async function markFailed(supabase, importId, error) {
  if (!importId) return;
  const message = error instanceof Error ? error.message : String(error);
  const result = await supabase
    .from("analysis_imports")
    .update({ status: "failed", error_message: message.slice(0, 4000), completed_at: new Date().toISOString() })
    .eq("id", importId)
    .neq("status", "ready");
  if (result.error) console.error(`Could not mark import failed: ${result.error.message}`);
}

async function applyImport(supabase, project, catalog, counts, options) {
  const existingResult = await supabase
    .from("analysis_imports")
    .select("id, status, record_count, asset_count")
    .eq("project_id", project.id)
    .eq("manifest_sha256", catalog.manifestSha256)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  if (existingResult.data?.status === "ready") {
    const countResult = await supabase
      .from("poling_analysis_records")
      .select("id", { count: "exact", head: true })
      .eq("import_id", existingResult.data.id);
    if (countResult.error) throw countResult.error;
    if (
      countResult.count !== counts.recordCount
      || existingResult.data.record_count !== counts.recordCount
      || existingResult.data.asset_count !== counts.assetCount
    ) {
      throw new Error("Existing ready import count does not match the immutable manifest.");
    }
    return { id: existingResult.data.id, alreadyReady: true };
  }

  let importId = existingResult.data?.id ?? null;
  try {
    if (importId) {
      const reset = await supabase
        .from("analysis_imports")
        .update({
          status: "importing",
          error_message: null,
          completed_at: null,
          record_count: 0,
          asset_count: 0,
          generated_at: catalog.generatedAt,
          schema_version: catalog.schemaVersion,
          source_summary: { sourceFiles: catalog.sourceFiles, notes: catalog.notes, summary: catalog.summary },
          imported_by: options.importedBy,
          started_at: new Date().toISOString()
        })
        .eq("id", importId)
        .select("id")
        .single();
      if (reset.error) throw reset.error;
      const clear = await supabase.from("poling_analysis_records").delete().eq("import_id", importId);
      if (clear.error) throw clear.error;
    } else {
      const created = await supabase
        .from("analysis_imports")
        .insert({
          project_id: project.id,
          manifest_sha256: catalog.manifestSha256,
          schema_version: catalog.schemaVersion,
          generated_at: catalog.generatedAt,
          source_summary: { sourceFiles: catalog.sourceFiles, notes: catalog.notes, summary: catalog.summary },
          imported_by: options.importedBy
        })
        .select("id")
        .single();
      if (created.error) throw created.error;
      importId = created.data.id;
    }

    const records = catalog.records.map((record) => databaseRecord(project.id, importId, record));
    for (let start = 0; start < records.length; start += options.chunkSize) {
      const chunk = records.slice(start, start + options.chunkSize);
      const result = await supabase
        .from("poling_analysis_records")
        .upsert(chunk, { onConflict: "import_id,source_key" });
      if (result.error) throw result.error;
      console.log(`Imported ${Math.min(start + chunk.length, records.length)}/${records.length} records.`);
    }

    const countResult = await supabase
      .from("poling_analysis_records")
      .select("id", { count: "exact", head: true })
      .eq("import_id", importId);
    if (countResult.error) throw countResult.error;
    if (countResult.count !== counts.recordCount) {
      throw new Error(`Stored record count ${countResult.count} does not match ${counts.recordCount}.`);
    }

    const completedAt = new Date().toISOString();
    const ready = await supabase
      .from("analysis_imports")
      .update({
        status: "ready",
        record_count: counts.recordCount,
        asset_count: counts.assetCount,
        completed_at: completedAt,
        error_message: null
      })
      .eq("id", importId)
      .eq("status", "importing")
      .select("id")
      .single();
    if (ready.error) throw ready.error;
    return { id: importId, alreadyReady: false };
  } catch (error) {
    await markFailed(supabase, importId, error);
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  const counts = await validateCatalog(catalog);
  const plan = {
    mode: options.apply ? "apply" : "dry-run",
    manifestSha256: catalog.manifestSha256,
    schemaVersion: catalog.schemaVersion,
    records: counts.recordCount,
    imageRecords: counts.assetCount,
    specimens: catalog.summary.specimens,
    requestedProjectId: options.projectId,
    chunkSize: options.chunkSize
  };

  if (!options.apply) {
    console.log(JSON.stringify(plan, null, 2));
    console.log("Dry run only. Add --apply to write this validated manifest to Supabase.");
    return;
  }

  const supabase = createClient(requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const project = await resolveProject(supabase, options.projectId);
  console.log(JSON.stringify({ ...plan, project }, null, 2));
  const result = await applyImport(supabase, project, catalog, counts, options);
  console.log(JSON.stringify({
    importId: result.id,
    projectId: project.id,
    manifestSha256: catalog.manifestSha256,
    status: "ready",
    outcome: result.alreadyReady ? "already-ready-no-op" : "imported"
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
