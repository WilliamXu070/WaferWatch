import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL("../supabase/migrations/202608120003_analysis_persistence.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");

for (const requiredFragment of [
  "unique (project_id, manifest_sha256)",
  "unique (import_id, source_key)",
  "unique (import_id, catalog_record_id)",
  "public.can_access_project(project_id)",
  "public.can_edit_project(project_id)",
  "where status = 'ready'",
  "with (security_invoker = true)",
  "protect_ready_analysis_import",
  "protect_ready_analysis_record"
]) {
  assert.ok(migration.includes(requiredFragment), `Migration is missing: ${requiredFragment}`);
}
assert.equal(
  migration.match(/security definer/g)?.length,
  2,
  "Both immutable-import trigger functions must bypass caller RLS with SECURITY DEFINER."
);

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.actor_id', true), '')::uuid
  $$;
  create table public.profiles (id uuid primary key);
  create table public.projects (
    id uuid primary key,
    name text not null,
    status text not null default 'active'
  );
  create function public.set_updated_at() returns trigger language plpgsql as $$
  begin
    new.updated_at = now();
    return new;
  end
  $$;
  create function public.can_access_project(target_project_id uuid)
  returns boolean language sql stable as $$
    select target_project_id = nullif(current_setting('app.access_project', true), '')::uuid
  $$;
  create function public.can_edit_project(target_project_id uuid)
  returns boolean language sql stable as $$
    select target_project_id = nullif(current_setting('app.edit_project', true), '')::uuid
  $$;
`);
await db.exec(migration);

const ids = {
  actor: "71000000-0000-4000-8000-000000000001",
  project: "71000000-0000-4000-8000-000000000002",
  otherProject: "71000000-0000-4000-8000-000000000003",
  firstImport: "71000000-0000-4000-8000-000000000004",
  secondImport: "71000000-0000-4000-8000-000000000005",
  otherImport: "71000000-0000-4000-8000-000000000006",
  draftImport: "71000000-0000-4000-8000-000000000007"
};
const digest = {
  first: "1".repeat(64),
  second: "2".repeat(64),
  other: "3".repeat(64),
  draft: "4".repeat(64),
  image: "a".repeat(64)
};

await db.query("insert into public.profiles (id) values ($1)", [ids.actor]);
await db.query(
  "insert into public.projects (id, name) values ($1, 'Analysis'), ($2, 'Other')",
  [ids.project, ids.otherProject]
);

const schema = await db.query(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('analysis_imports', 'poling_analysis_records')
`);
const columns = new Set(schema.rows.map((row) => `${row.table_name}.${row.column_name}`));
for (const column of [
  "analysis_imports.manifest_sha256",
  "analysis_imports.status",
  "analysis_imports.record_count",
  "poling_analysis_records.source_key",
  "poling_analysis_records.specimen_reference",
  "poling_analysis_records.die_label",
  "poling_analysis_records.pulse_width_ms",
  "poling_analysis_records.source_appearances",
  "poling_analysis_records.display_order"
]) assert.ok(columns.has(column), `Missing column ${column}`);

const rowSecurity = await db.query(`
  select relname, relrowsecurity
  from pg_class
  where relname in ('analysis_imports', 'poling_analysis_records')
`);
assert.deepEqual(
  rowSecurity.rows.map((row) => [row.relname, row.relrowsecurity]).sort(),
  [["analysis_imports", true], ["poling_analysis_records", true]]
);

const triggerFunctionSecurity = await db.query(`
  select proname, prosecdef
  from pg_proc
  where proname in ('protect_ready_analysis_import', 'protect_ready_analysis_record')
  order by proname
`);
assert.deepEqual(triggerFunctionSecurity.rows, [
  { proname: "protect_ready_analysis_import", prosecdef: true },
  { proname: "protect_ready_analysis_record", prosecdef: true }
]);

const policyResult = await db.query(`
  select tablename, cmd
  from pg_policies
  where tablename in ('analysis_imports', 'poling_analysis_records')
`);
for (const table of ["analysis_imports", "poling_analysis_records"]) {
  assert.deepEqual(
    policyResult.rows.filter((row) => row.tablename === table).map((row) => row.cmd).sort(),
    ["DELETE", "INSERT", "SELECT", "UPDATE"]
  );
}

const indexes = await db.query(`
  select indexname from pg_indexes
  where schemaname = 'public'
    and tablename in ('analysis_imports', 'poling_analysis_records')
`);
const indexNames = new Set(indexes.rows.map((row) => row.indexname));
for (const indexName of [
  "analysis_imports_latest_ready_idx",
  "poling_analysis_records_import_order_idx",
  "poling_analysis_records_project_specimen_die_idx"
]) assert.ok(indexNames.has(indexName), `Missing index ${indexName}`);

async function insertImport({ id, projectId, manifest }) {
  await db.query(
    `insert into public.analysis_imports (
       id, project_id, manifest_sha256, schema_version, generated_at, source_summary, imported_by
     ) values ($1, $2, $3, 1, '2026-08-12T00:00:00Z', '{"recordCount":1}', $4)`,
    [id, projectId, manifest, ids.actor]
  );
}

function recordValues(importId, projectId, sourceKey, displayOrder = 0) {
  return [
    projectId,
    importId,
    `catalog-${displayOrder}`,
    sourceKey,
    "TFA1.1M1R1",
    "R1C1",
    430,
    10,
    200,
    300,
    250,
    `/analysis/poling/${displayOrder}.jpg`,
    digest.image,
    "source.pptx",
    20,
    "TFA1 R1C1.JPG",
    displayOrder
  ];
}

async function upsertRecord(importId, projectId, sourceKey, displayOrder = 0) {
  return db.query(
    `insert into public.poling_analysis_records (
       project_id, import_id, catalog_record_id, source_key, specimen_reference, die_label,
       voltage, pulse_width_ms, pulse_count, post_pulse_voltage, post_pulse_width_ms,
       image_path, image_sha256, source_file, source_slide, source_image_label,
       source_appearances, parameter_source, confidence, flags,
       replicate_index, replicate_count, display_order
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
       '[]', '{"kind":"workbook"}', 'confirmed', '[]', 1, 1, $17
     )
     on conflict (import_id, source_key) do update set
       catalog_record_id = excluded.catalog_record_id,
       display_order = excluded.display_order`,
    recordValues(importId, projectId, sourceKey, displayOrder)
  );
}

async function insertRecord(importId, projectId, sourceKey, displayOrder = 0) {
  return db.query(
    `insert into public.poling_analysis_records (
       project_id, import_id, catalog_record_id, source_key, specimen_reference, die_label,
       voltage, pulse_width_ms, pulse_count, post_pulse_voltage, post_pulse_width_ms,
       image_path, image_sha256, source_file, source_slide, source_image_label,
       source_appearances, parameter_source, confidence, flags,
       replicate_index, replicate_count, display_order
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
       '[]', '{"kind":"workbook"}', 'confirmed', '[]', 1, 1, $17
     )`,
    recordValues(importId, projectId, sourceKey, displayOrder)
  );
}

await insertImport({ id: ids.firstImport, projectId: ids.project, manifest: digest.first });
await upsertRecord(ids.firstImport, ids.project, "asset:first");
await upsertRecord(ids.firstImport, ids.project, "asset:first");
const idempotentCount = await db.query(
  "select count(*)::integer as count from public.poling_analysis_records where import_id = $1",
  [ids.firstImport]
);
assert.equal(idempotentCount.rows[0].count, 1);
await assert.rejects(
  insertRecord(ids.firstImport, ids.project, "asset:duplicate-catalog-id"),
  /poling_analysis_records_import_catalog_record_key/
);

await assert.rejects(
  db.query("update public.analysis_imports set status = 'ready' where id = $1", [ids.firstImport]),
  /Ready analysis import counts do not match|analysis_imports_status_fields_check/
);
await db.query(
  `update public.analysis_imports
   set status = 'ready', record_count = 1, asset_count = 1, completed_at = '2026-08-12T10:00:00Z'
   where id = $1`,
  [ids.firstImport]
);
await assert.rejects(
  db.query("update public.analysis_imports set record_count = 2 where id = $1", [ids.firstImport]),
  /Ready analysis imports are immutable/
);
await assert.rejects(
  upsertRecord(ids.firstImport, ids.project, "asset:late", 1),
  /Records in a ready analysis import are immutable/
);

await insertImport({ id: ids.secondImport, projectId: ids.project, manifest: digest.second });
await upsertRecord(ids.secondImport, ids.project, "asset:second", 1);
await db.query(
  `update public.analysis_imports
   set status = 'ready', record_count = 1, asset_count = 1, completed_at = '2026-08-12T11:00:00Z'
   where id = $1`,
  [ids.secondImport]
);

await insertImport({ id: ids.otherImport, projectId: ids.otherProject, manifest: digest.other });
await upsertRecord(ids.otherImport, ids.otherProject, "asset:other", 2);
await db.query(
  `update public.analysis_imports
   set status = 'ready', record_count = 1, asset_count = 1, completed_at = '2026-08-12T12:00:00Z'
   where id = $1`,
  [ids.otherImport]
);

const latest = await db.query(`
  select project_id, source_key
  from public.vw_poling_analysis_latest_records
  order by project_id
`);
assert.deepEqual(latest.rows, [
  { project_id: ids.project, source_key: "asset:second" },
  { project_id: ids.otherProject, source_key: "asset:other" }
]);

await db.exec(`
  select set_config('app.actor_id', '${ids.actor}', false);
  select set_config('app.access_project', '${ids.project}', false);
  select set_config('app.edit_project', '${ids.project}', false);
  set role authenticated;
`);
const scopedLatest = await db.query("select project_id, source_key from public.vw_poling_analysis_latest_records");
assert.deepEqual(scopedLatest.rows, [{ project_id: ids.project, source_key: "asset:second" }]);
await db.query(
  `insert into public.analysis_imports (id, project_id, manifest_sha256, schema_version)
   values ($1, $2, $3, 1)`,
  [ids.draftImport, ids.project, digest.draft]
);
await assert.rejects(
  db.query(
    `insert into public.analysis_imports (project_id, manifest_sha256, schema_version)
     values ($1, $2, 1)`,
    [ids.otherProject, "5".repeat(64)]
  ),
  /row-level security policy/
);
await db.exec("reset role;");

console.log(JSON.stringify({
  tables: ["analysis_imports", "poling_analysis_records"],
  rowLevelSecurity: "read via can_access_project; writes via can_edit_project",
  importStates: ["importing", "ready", "failed"],
  retry: "idempotent by import_id and source_key",
  readyImports: "immutable",
  readModel: "latest ready import per project",
  indexes: [...indexNames].filter((name) => name.includes("analysis"))
}, null, 2));
