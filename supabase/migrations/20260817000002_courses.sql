-- Golf course reference data: courses, holes, tee boxes.
-- Shared across all groups (not scoped to a single group), manageable by any group admin.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text
);

create table public.holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  par int not null check (par between 3 and 6),
  stroke_index int not null check (stroke_index between 1 and 18),
  unique (course_id, hole_number),
  unique (course_id, stroke_index)
);

create table public.tee_boxes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null,
  course_rating numeric(4, 1) not null,
  slope_rating int not null check (slope_rating between 55 and 155),
  total_yardage int
);

create table public.tee_box_hole_yardages (
  id uuid primary key default gen_random_uuid(),
  tee_box_id uuid not null references public.tee_boxes (id) on delete cascade,
  hole_id uuid not null references public.holes (id) on delete cascade,
  yardage int not null check (yardage > 0),
  unique (tee_box_id, hole_id)
);

alter table public.courses enable row level security;
alter table public.holes enable row level security;
alter table public.tee_boxes enable row level security;
alter table public.tee_box_hole_yardages enable row level security;

create policy "courses_select_all_authenticated" on public.courses
  for select using (auth.role() = 'authenticated');
create policy "courses_manage_group_admins" on public.courses
  for all using (public.is_any_group_admin()) with check (public.is_any_group_admin());

create policy "holes_select_all_authenticated" on public.holes
  for select using (auth.role() = 'authenticated');
create policy "holes_manage_group_admins" on public.holes
  for all using (public.is_any_group_admin()) with check (public.is_any_group_admin());

create policy "tee_boxes_select_all_authenticated" on public.tee_boxes
  for select using (auth.role() = 'authenticated');
create policy "tee_boxes_manage_group_admins" on public.tee_boxes
  for all using (public.is_any_group_admin()) with check (public.is_any_group_admin());

create policy "tee_box_yardages_select_all_authenticated" on public.tee_box_hole_yardages
  for select using (auth.role() = 'authenticated');
create policy "tee_box_yardages_manage_group_admins" on public.tee_box_hole_yardages
  for all using (public.is_any_group_admin()) with check (public.is_any_group_admin());
