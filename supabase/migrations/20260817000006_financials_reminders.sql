-- Event financials, reminder config, and sent-reminder dedup log.

create table public.event_financials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id) on delete cascade,
  entry_fee numeric(10, 2) not null check (entry_fee >= 0),
  scoring_pool_per_player numeric(10, 2) not null default 0 check (scoring_pool_per_player >= 0),
  skins_pool_per_player numeric(10, 2) not null default 0 check (skins_pool_per_player >= 0),
  -- Informational only: actual CTP prizes are set independently per hole in event_ctp_holes.
  ctp_pool_per_player numeric(10, 2) not null default 0 check (ctp_pool_per_player >= 0)
);

create table public.event_reminder_configs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  days_before int not null check (days_before >= 0),
  unique (event_id, days_before)
);

create table public.sent_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id),
  reminder_type text not null,
  sent_at timestamptz not null default now(),
  unique (event_id, user_id, reminder_type)
);

alter table public.event_financials enable row level security;
alter table public.event_reminder_configs enable row level security;
alter table public.sent_reminders enable row level security;

create policy "event_financials_select_group_members" on public.event_financials
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
create policy "event_financials_manage_group_admins" on public.event_financials
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "reminder_configs_select_group_members" on public.event_reminder_configs
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
create policy "reminder_configs_manage_group_admins" on public.event_reminder_configs
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  ) with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

-- sent_reminders is written only by the scheduled Edge Function (service role bypasses RLS).
create policy "sent_reminders_select_group_members" on public.sent_reminders
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_member(e.group_id))
  );
