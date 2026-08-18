-- Allows admins to re-number hole stroke indices (e.g. swapping which hole is
-- the hardest) in one update without transiently violating the unique constraint.

alter table public.holes
  drop constraint holes_course_id_stroke_index_key,
  add constraint holes_course_id_stroke_index_key
    unique (course_id, stroke_index) deferrable initially deferred;

create or replace function public.admin_upsert_holes(p_course_id uuid, p_holes jsonb)
returns setof public.holes
language plpgsql
as $$
begin
  update public.holes h
  set par = (elem->>'par')::int,
      stroke_index = (elem->>'stroke_index')::int
  from jsonb_array_elements(p_holes) elem
  where h.course_id = p_course_id
    and h.hole_number = (elem->>'hole_number')::int;

  return query select * from public.holes where course_id = p_course_id order by hole_number;
end;
$$;
