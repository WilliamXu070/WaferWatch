-- Replace per-subscriber Postgres Changes authorization with private,
-- process-scoped Broadcast messages. Canonical tables remain the source of
-- truth; broadcasts are compact invalidation hints only.

create or replace function public.can_receive_waferwatch_broadcast(target_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_process_id uuid;
  target_project_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
  ) then
    return false;
  end if;

  if target_topic in ('workflow:library', 'team:messages') then
    return true;
  end if;

  if target_topic like 'workflow:process:%' then
    begin
      target_process_id := substring(target_topic from length('workflow:process:') + 1)::uuid;
    exception when invalid_text_representation then
      return false;
    end;

    return exists (
      select 1
      from public.process_templates template
      where template.id = target_process_id
        and (
          template.is_active = true
          or public.can_manage_process_library()
          or (
            template.owner_project_id is not null
            and public.can_access_project(template.owner_project_id)
          )
        )
    );
  end if;

  if target_topic like 'workflow:project:%' then
    begin
      target_project_id := substring(target_topic from length('workflow:project:') + 1)::uuid;
    exception when invalid_text_representation then
      return false;
    end;

    return public.can_access_project(target_project_id);
  end if;

  return false;
end;
$$;

revoke execute on function public.can_receive_waferwatch_broadcast(text) from public, anon;
grant execute on function public.can_receive_waferwatch_broadcast(text) to authenticated;

drop policy if exists "active users receive waferwatch broadcasts" on realtime.messages;
create policy "active users receive waferwatch broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    (select public.can_receive_waferwatch_broadcast(realtime.topic()))
  );

create or replace function public.broadcast_waferwatch_workflow_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row jsonb;
  entity_id text;
  target_template_ids uuid[] := array[]::uuid[];
  target_template_id uuid;
  target_project_id uuid;
  target_wafer_id uuid;
  event_payload jsonb;
begin
  changed_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  entity_id := coalesce(changed_row ->> 'id', changed_row ->> 'event_id');

  case tg_table_name
    when 'process_templates' then
      if changed_row ->> 'id' is not null then
        target_template_ids := array[(changed_row ->> 'id')::uuid];
      end if;
    when 'process_steps', 'process_step_transitions', 'wafer_process_assignments',
         'process_step_attempts', 'checkpoint_decisions',
         'checkpoint_submission_withdrawals', 'checkpoint_reviewer_reassignments' then
      if changed_row ->> 'template_id' is not null then
        target_template_ids := array[(changed_row ->> 'template_id')::uuid];
      end if;
    when 'process_calendar_events' then
      if changed_row ->> 'process_template_id' is not null then
        target_template_ids := array[(changed_row ->> 'process_template_id')::uuid];
      end if;
    when 'process_calendar_event_people' then
      select array[event.process_template_id]
      into target_template_ids
      from public.process_calendar_events event
      where event.id = (changed_row ->> 'event_id')::uuid;
    when 'step_executions' then
      select array[assignment.template_id], assignment.wafer_id
      into target_template_ids, target_wafer_id
      from public.wafer_process_assignments assignment
      where assignment.id = (changed_row ->> 'assignment_id')::uuid;
    when 'wafers' then
      target_wafer_id := (changed_row ->> 'id')::uuid;
      target_project_id := (changed_row ->> 'project_id')::uuid;
    when 'process_events' then
      target_project_id := (changed_row ->> 'project_id')::uuid;
      if changed_row ->> 'wafer_id' is not null then
        target_wafer_id := (changed_row ->> 'wafer_id')::uuid;
      end if;
    when 'text_surfaces' then
      target_project_id := (changed_row ->> 'project_id')::uuid;
    when 'die_inspections' then
      target_wafer_id := (changed_row ->> 'wafer_id')::uuid;
      select wafer.project_id
      into target_project_id
      from public.wafers wafer
      where wafer.id = target_wafer_id;
    else
      null;
  end case;

  if coalesce(cardinality(target_template_ids), 0) = 0 and target_wafer_id is not null then
    select coalesce(array_agg(distinct assignment.template_id), array[]::uuid[])
    into target_template_ids
    from public.wafer_process_assignments assignment
    where assignment.wafer_id = target_wafer_id
      and assignment.deleted_at is null;
  end if;

  if coalesce(cardinality(target_template_ids), 0) = 0 and target_project_id is not null then
    select coalesce(array_agg(distinct assignment.template_id), array[]::uuid[])
    into target_template_ids
    from public.wafer_process_assignments assignment
    join public.wafers wafer on wafer.id = assignment.wafer_id
    where wafer.project_id = target_project_id
      and assignment.deleted_at is null;
  end if;

  event_payload := jsonb_build_object(
    'table', tg_table_name,
    'operation', tg_op,
    'entityId', entity_id,
    'projectId', target_project_id,
    'waferId', target_wafer_id,
    'changedAt', clock_timestamp()
  );

  foreach target_template_id in array coalesce(target_template_ids, array[]::uuid[])
  loop
    perform realtime.send(
      event_payload || jsonb_build_object('processTemplateId', target_template_id),
      'workflow_changed',
      'workflow:process:' || target_template_id::text,
      true
    );
  end loop;

  if tg_table_name in ('process_templates', 'process_people', 'profiles') then
    perform realtime.send(
      event_payload,
      'workflow_changed',
      'workflow:library',
      true
    );
  end if;

  return null;
end;
$$;

revoke execute on function public.broadcast_waferwatch_workflow_change()
  from public, anon, authenticated;

create or replace function public.broadcast_waferwatch_team_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('record', to_jsonb(new)),
    'team_message_inserted',
    'team:messages',
    true
  );
  return null;
end;
$$;

revoke execute on function public.broadcast_waferwatch_team_message()
  from public, anon, authenticated;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles',
    'process_people',
    'process_templates',
    'process_steps',
    'process_step_transitions',
    'process_calendar_events',
    'process_calendar_event_people',
    'wafer_process_assignments',
    'step_executions',
    'wafers',
    'process_events',
    'text_surfaces',
    'die_inspections',
    'process_step_attempts',
    'checkpoint_decisions',
    'checkpoint_submission_withdrawals',
    'checkpoint_reviewer_reassignments'
  ]
  loop
    if to_regclass('public.' || relation_name) is not null then
      execute format(
        'drop trigger if exists waferwatch_broadcast_change on public.%I',
        relation_name
      );
      execute format(
        'create trigger waferwatch_broadcast_change after insert or update or delete on public.%I for each row execute function public.broadcast_waferwatch_workflow_change()',
        relation_name
      );
    end if;
  end loop;

  if to_regclass('public.team_messages') is not null then
    execute 'drop trigger if exists waferwatch_broadcast_team_message on public.team_messages';
    execute 'create trigger waferwatch_broadcast_team_message after insert on public.team_messages for each row execute function public.broadcast_waferwatch_team_message()';
  end if;
end;
$$;

do $$
declare
  relation_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach relation_name in array array[
      'team_messages',
      'process_templates',
      'process_steps',
      'process_step_transitions',
      'process_calendar_events',
      'process_calendar_event_people',
      'wafer_process_assignments',
      'step_executions',
      'wafers',
      'process_events',
      'text_surfaces',
      'die_inspections',
      'process_step_attempts',
      'checkpoint_decisions',
      'checkpoint_submission_withdrawals',
      'checkpoint_reviewer_reassignments'
    ]
    loop
      if exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = relation_name
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', relation_name);
      end if;
    end loop;
  end if;

  foreach relation_name in array array[
    'process_calendar_events',
    'process_calendar_event_people',
    'process_steps',
    'process_step_transitions',
    'wafer_process_assignments',
    'step_executions',
    'wafers',
    'process_events',
    'text_surfaces',
    'die_inspections',
    'process_step_attempts',
    'checkpoint_decisions',
    'checkpoint_submission_withdrawals',
    'checkpoint_reviewer_reassignments'
  ]
  loop
    if to_regclass('public.' || relation_name) is not null then
      execute format('alter table public.%I replica identity default', relation_name);
    end if;
  end loop;
end;
$$;
