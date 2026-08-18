-- Score entry, handicap engine, individual scoring formats/results.

create type scoring_format as enum ('medal_gross', 'medal_net', 'stableford');

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  event_round_id uuid not null references public.event_rounds (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete cascade,
  hole_id uuid not null references public.holes (id),
  gross_strokes int not null check (gross_strokes > 0),
  -- Both of these are computed by the app at write time: par + 2 + strokes received on the hole,
  -- and min(gross_strokes, net_double_bogey_cap) respectively.
  net_double_bogey_cap int not null,
  adjusted_gross_strokes int not null,
  entered_by uuid not null references public.users (id),
  entered_at timestamptz not null default now(),
  unique (event_round_id, participant_id, hole_id)
);

-- Cached per completed round so the handicap engine doesn't recompute from raw scores every time.
create table public.round_differentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  event_round_id uuid not null references public.event_rounds (id) on delete cascade,
  adjusted_gross_total int not null,
  course_rating numeric(4, 1) not null,
  slope_rating int not null,
  differential numeric(5, 2) not null,
  played_at timestamptz not null default now(),
  unique (user_id, event_round_id)
);

-- Recomputed and cached whenever a new RoundDifferential is added for the user.
create table public.handicap_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  handicap_index numeric(4, 1) not null,
  rounds_used int not null,
  computed_at timestamptz not null default now()
);

create table public.event_scoring_configs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id) on delete cascade,
  format scoring_format not null,
  -- Admin-set; default tiers are enforced in the app (1-6 -> 1, 7-12 -> 2, 13+ -> 3), not the DB.
  payout_places int not null check (payout_places between 1 and 3),
  payout_splits jsonb not null
);

create table public.scoring_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete cascade,
  total_score numeric(6, 2) not null,
  rank int not null,
  payout_amount numeric(10, 2),
  unique (event_id, participant_id)
);

alter table public.scores enable row level security;
alter table public.round_differentials enable row level security;
alter table public.handicap_snapshots enable row level security;
alter table public.event_scoring_configs enable row level security;
alter table public.scoring_results enable row level security;

create policy "scores_select_group_members" on public.scores
  for select using (
    exists (
      select 1 from public.event_rounds er
      join public.events e on e.id = er.event_id
      where er.id = event_round_id and public.is_group_member(e.group_id)
    )
  );
create policy "scores_write_self_or_admin" on public.scores
  for all using (
    exists (
      select 1 from public.event_participants p
      join public.event_rounds er on er.id = event_round_id
      join public.events e on e.id = er.event_id
      where p.id = participant_id
        and (p.user_id = auth.uid() or public.is_group_admin(e.group_id))
    )
  ) with check (
    exists (
      select 1 from public.event_participants p
      join public.event_rounds er on er.id = event_round_id
      join public.events e on e.id = er.event_id
      where p.id = participant_id
        and (p.user_id = auth.uid() or public.is_group_admin(e.group_id))
    )
  );

-- Handicap data is not sensitive and is shown on leaderboards/scorecards for all participants.
-- Writes happen server-side (service role) as part of the handicap engine, not directly by clients.
create policy "round_differentials_select_all_authenticated" on public.round_differentials
  for select using (auth.role() = 'authenticated');
create policy "handicap_snapshots_select_all_authenticated" on public.handicap_snapshots
  for select using (auth.role() = 'authenticated');

create policy "scoring_configs_select_group_members" on public.event_scoring_configs
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
create policy "scoring_configs_manage_group_admins" on public.event_scoring_configs
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "scoring_results_select_group_members" on public.scoring_results
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
