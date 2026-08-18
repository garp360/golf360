-- Event lifecycle: events, event courses/rounds, participants.

create type competition_format as enum ('individual', 'team');
create type event_status as enum ('draft', 'open', 'closed', 'completed', 'cancelled');
create type participant_status as enum ('registered', 'withdrawn');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  event_date date not null,
  -- 'team' is modeled for future build-out; only 'individual' is implemented in v1.
  competition_format competition_format not null default 'individual',
  created_by uuid not null references public.users (id),
  status event_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.event_courses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  course_id uuid not null references public.courses (id)
);

create table public.event_rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  event_course_id uuid not null references public.event_courses (id) on delete cascade,
  round_number int not null check (round_number > 0),
  round_date date not null,
  unique (event_id, round_number)
);

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id),
  tee_box_id uuid not null references public.tee_boxes (id),
  handicap_index_at_signup numeric(4, 1),
  -- true when handicap_index_at_signup was manually entered by an admin because the
  -- player has fewer than 3 posted rounds (no official HandicapSnapshot yet).
  is_provisional_handicap boolean not null default false,
  course_handicap int,
  paid boolean not null default false,
  checked_in boolean not null default false,
  status participant_status not null default 'registered',
  signed_up_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.events enable row level security;
alter table public.event_courses enable row level security;
alter table public.event_rounds enable row level security;
alter table public.event_participants enable row level security;

create policy "events_select_group_members" on public.events
  for select using (public.is_group_member(group_id));
create policy "events_manage_group_admins" on public.events
  for all using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy "event_courses_select_group_members" on public.event_courses
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
create policy "event_courses_manage_group_admins" on public.event_courses
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "event_rounds_select_group_members" on public.event_rounds
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
create policy "event_rounds_manage_group_admins" on public.event_rounds
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "event_participants_select_group_members" on public.event_participants
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
create policy "event_participants_insert_self_or_admin" on public.event_participants
  for insert with check (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );
create policy "event_participants_update_self_or_admin" on public.event_participants
  for update using (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );
