import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = {
  researcher: "30000000-0000-4000-8000-000000000001",
  viewer: "30000000-0000-4000-8000-000000000002",
  member: "30000000-0000-4000-8000-000000000003",
  admin: "30000000-0000-4000-8000-000000000004",
  activePrivate: "30000000-0000-4000-8000-000000000005",
  activeGroup: "30000000-0000-4000-8000-000000000006",
  archivedPrivate: "30000000-0000-4000-8000-000000000007"
};

await db.exec(`
  create role authenticated;
  create schema auth;
  create type public.user_role as enum ('admin', 'process_engineer', 'researcher', 'viewer');
  create type public.project_member_role as enum ('owner', 'editor', 'viewer');
  create type public.project_status as enum ('active', 'archived');
  create type public.project_visibility as enum ('private', 'group');

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.actor_id', true), '')::uuid
  $$;

  create table public.profiles (
    id uuid primary key,
    role public.user_role not null,
    is_active boolean not null default true
  );
  create table public.projects (
    id uuid primary key,
    owner_id uuid references public.profiles(id),
    visibility public.project_visibility not null,
    status public.project_status not null
  );
  create table public.project_members (
    project_id uuid not null references public.projects(id),
    user_id uuid not null references public.profiles(id),
    role public.project_member_role not null,
    primary key (project_id, user_id)
  );
  create table public.wafers (
    id uuid primary key,
    project_id uuid not null references public.projects(id),
    wafer_code text not null
  );

  create function public.current_user_role()
  returns public.user_role
  language sql stable security definer set search_path = public
  as $$
    select role from public.profiles where id = auth.uid() and is_active = true
  $$;

  create function public.is_admin()
  returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(public.current_user_role() = 'admin', false) $$;

  create function public.can_edit_project(target_project_id uuid)
  returns boolean
  language sql stable security definer set search_path = public
  as $$
    select coalesce(
      public.is_admin()
      or exists (
        select 1 from public.project_members member
        where member.project_id = target_project_id
          and member.user_id = auth.uid()
          and member.role in ('owner', 'editor')
      )
      or exists (
        select 1 from public.projects project
        where project.id = target_project_id and project.owner_id = auth.uid()
      ),
      false
    )
  $$;

  insert into public.profiles (id, role) values
    ('${id.researcher}', 'researcher'),
    ('${id.viewer}', 'viewer'),
    ('${id.member}', 'viewer'),
    ('${id.admin}', 'admin');
  insert into public.projects (id, owner_id, visibility, status) values
    ('${id.activePrivate}', '${id.admin}', 'private', 'active'),
    ('${id.activeGroup}', '${id.admin}', 'group', 'active'),
    ('${id.archivedPrivate}', '${id.admin}', 'private', 'archived');
  insert into public.project_members (project_id, user_id, role) values
    ('${id.activePrivate}', '${id.member}', 'viewer'),
    ('${id.archivedPrivate}', '${id.member}', 'viewer');
  insert into public.wafers (id, project_id, wafer_code) values
    ('30000000-0000-4000-8000-000000000008', '${id.activePrivate}', 'ACTIVE-PRIVATE'),
    ('30000000-0000-4000-8000-000000000009', '${id.activeGroup}', 'ACTIVE-GROUP'),
    ('30000000-0000-4000-8000-000000000010', '${id.archivedPrivate}', 'ARCHIVED-PRIVATE');
`);

const migration = await readFile(
  new URL("../supabase/migrations/202607170006_researcher_project_read_access.sql", import.meta.url),
  "utf8"
);
await db.exec(migration);

await db.exec(`
  alter table public.projects enable row level security;
  alter table public.wafers enable row level security;
  create policy project_read on public.projects for select
    using (public.can_access_project(id));
  create policy wafer_read on public.wafers for select
    using (public.can_access_project(project_id));
  create policy wafer_update on public.wafers for update
    using (public.can_edit_project(project_id))
    with check (public.can_edit_project(project_id));
  grant usage on schema public to authenticated;
  grant select on public.projects to authenticated;
  grant select, update on public.wafers to authenticated;
  grant execute on function public.current_user_role() to authenticated;
  grant execute on function public.is_admin() to authenticated;
  grant execute on function public.can_access_project(uuid) to authenticated;
  grant execute on function public.can_edit_project(uuid) to authenticated;
`);

async function asUser(userId, query) {
  await db.exec(`set app.actor_id = '${userId}'; set role authenticated;`);
  try {
    return await db.query(query);
  } finally {
    await db.exec("reset role");
  }
}

const researcherRows = await asUser(id.researcher, "select wafer_code from public.wafers order by wafer_code");
assert.deepEqual(researcherRows.rows.map((row) => row.wafer_code), ["ACTIVE-GROUP", "ACTIVE-PRIVATE"]);

const viewerRows = await asUser(id.viewer, "select wafer_code from public.wafers order by wafer_code");
assert.deepEqual(viewerRows.rows.map((row) => row.wafer_code), ["ACTIVE-GROUP"]);

const memberRows = await asUser(id.member, "select wafer_code from public.wafers order by wafer_code");
assert.deepEqual(memberRows.rows.map((row) => row.wafer_code), ["ACTIVE-GROUP", "ACTIVE-PRIVATE", "ARCHIVED-PRIVATE"]);

const adminRows = await asUser(id.admin, "select wafer_code from public.wafers order by wafer_code");
assert.equal(adminRows.rows.length, 3);

const researcherWrite = await asUser(
  id.researcher,
  "update public.wafers set wafer_code = 'MUTATED' where wafer_code = 'ACTIVE-PRIVATE' returning id"
);
assert.equal(researcherWrite.rows.length, 0);

const unchanged = await db.query("select wafer_code from public.wafers where project_id = $1", [id.activePrivate]);
assert.equal(unchanged.rows[0]?.wafer_code, "ACTIVE-PRIVATE");

console.log(JSON.stringify({
  researcher: "reads every active project without membership",
  viewer: "remains limited to group or member projects",
  archived: "remains hidden from non-member researchers",
  writes: "researcher update rejected by unchanged edit policy"
}, null, 2));
