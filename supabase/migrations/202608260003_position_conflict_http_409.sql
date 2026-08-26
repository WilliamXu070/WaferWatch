-- A stale canvas position is an application-level optimistic-concurrency
-- conflict, not a PostgreSQL serialization failure. PostgREST versions before
-- 16 retry SQLSTATE 40001 internally, so using that code here can turn one
-- rejected drag into an unbounded transaction retry storm.
create or replace function public.update_process_step_positions_versioned(
  position_updates jsonb
)
returns setof public.process_steps
language plpgsql
security invoker
set search_path = public
as $$
declare
  position_update jsonb;
  step public.process_steps%rowtype;
begin
  if jsonb_typeof(position_updates) <> 'array' then
    raise exception using errcode = '22023', message = 'Position updates must be an array.';
  end if;

  for position_update in
    select value
    from jsonb_array_elements(position_updates)
    order by value->>'stepId'
  loop
    select *
    into step
    from public.process_steps
    where id = (position_update->>'stepId')::uuid
    for update;

    if step.id is null then
      raise exception using errcode = 'P0002', message = 'A selected process step no longer exists.';
    end if;

    if step.canvas_x is distinct from (position_update->>'expectedCanvasX')::integer
      or step.canvas_y is distinct from (position_update->>'expectedCanvasY')::integer then
      raise exception using
        errcode = 'PT409',
        message = format('Process step %s was moved by another collaborator.', step.name);
    end if;
  end loop;

  for position_update in select value from jsonb_array_elements(position_updates)
  loop
    update public.process_steps
    set canvas_x = (position_update->>'canvasX')::integer,
        canvas_y = (position_update->>'canvasY')::integer
    where id = (position_update->>'stepId')::uuid;
  end loop;

  return query
    select process_step.*
    from public.process_steps process_step
    where process_step.id in (
      select (value->>'stepId')::uuid
      from jsonb_array_elements(position_updates)
    );
end;
$$;

comment on function public.update_process_step_positions_versioned(jsonb) is
  'Atomically updates process-step canvas positions and returns PT409 for stale optimistic-concurrency writes.';
