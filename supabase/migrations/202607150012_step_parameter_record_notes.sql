alter table public.step_parameter_records
  add column if not exists notes text;

alter table public.step_parameter_records
  drop constraint if exists step_parameter_records_notes_length;

alter table public.step_parameter_records
  add constraint step_parameter_records_notes_length
  check (notes is null or char_length(notes) <= 4000);
