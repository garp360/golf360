-- Skins game (money-pot model with cross-event group carryover) and Closest to Pin.

create type skins_mode as enum ('gross', 'net', 'both');
create type skins_win_condition as enum ('any', 'birdie_or_better');
create type skins_winning_type as enum ('gross', 'net', 'none');

create table public.event_skins_configs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id) on delete cascade,
  enabled boolean not null default false,
  -- 'both': gross is checked first each hole; net only wins if no qualifying gross score exists.
  mode skins_mode not null default 'gross',
  win_condition skins_win_condition not null default 'any',
  pool_amount numeric(10, 2) not null default 0
);

-- Running pot per group: an event that pays out zero skins rolls its whole pot into this
-- balance, which compounds into the *next* event for that group (not a per-hole carryover).
create table public.skins_pot_carryovers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.groups (id) on delete cascade,
  carried_amount numeric(10, 2) not null default 0,
  originating_event_id uuid references public.events (id),
  updated_at timestamptz not null default now()
);

create table public.skins_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  hole_id uuid not null references public.holes (id),
  winning_type skins_winning_type not null default 'none',
  winner_participant_id uuid references public.event_participants (id),
  payout_amount numeric(10, 2),
  unique (event_id, hole_id)
);

create table public.event_ctp_holes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  hole_id uuid not null references public.holes (id),
  prize_amount numeric(10, 2) not null,
  unique (event_id, hole_id)
);

create table public.ctp_results (
  id uuid primary key default gen_random_uuid(),
  event_ctp_hole_id uuid not null unique references public.event_ctp_holes (id) on delete cascade,
  winner_participant_id uuid not null references public.event_participants (id),
  recorded_by uuid not null references public.users (id),
  recorded_at timestamptz not null default now()
);

alter table public.event_skins_configs enable row level security;
alter table public.skins_pot_carryovers enable row level security;
alter table public.skins_results enable row level security;
alter table public.event_ctp_holes enable row level security;
alter table public.ctp_results enable row level security;

create policy "skins_configs_select_group_members" on public.event_skins_configs
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
create policy "skins_configs_manage_group_admins" on public.event_skins_configs
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "skins_carryovers_select_group_members" on public.skins_pot_carryovers
  for select using (public.is_group_member(group_id));

create policy "skins_results_select_group_members" on public.skins_results
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );

create policy "ctp_holes_select_group_members" on public.event_ctp_holes
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
create policy "ctp_holes_manage_group_admins" on public.event_ctp_holes
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "ctp_results_select_group_members" on public.ctp_results
  for select using (
    exists (
      select 1 from public.event_ctp_holes h
      join public.events e on e.id = h.event_id
      where h.id = event_ctp_hole_id and public.is_group_member(e.group_id)
    )
  );
create policy "ctp_results_manage_group_admins" on public.ctp_results
  for all using (
    exists (
      select 1 from public.event_ctp_holes h
      join public.events e on e.id = h.event_id
      where h.id = event_ctp_hole_id and public.is_group_admin(e.group_id)
    )
  ) with check (
    exists (
      select 1 from public.event_ctp_holes h
      join public.events e on e.id = h.event_id
      where h.id = event_ctp_hole_id and public.is_group_admin(e.group_id)
    )
  );
