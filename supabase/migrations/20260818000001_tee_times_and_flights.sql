-- Round tee time configuration.
alter table public.event_rounds
  add column first_tee_time time,
  add column tee_time_interval_minutes int check (tee_time_interval_minutes > 0);

-- Tee-time groups ("flights") within a round, and who's assigned to each.
-- Built manually by admins — no auto-fill.
create table public.event_flights (
  id uuid primary key default gen_random_uuid(),
  event_round_id uuid not null references public.event_rounds (id) on delete cascade,
  flight_number int not null check (flight_number > 0),
  tee_time time,
  unique (event_round_id, flight_number)
);

create table public.event_flight_members (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references public.event_flights (id) on delete cascade,
  -- Denormalized from the flight so a participant's one-flight-per-round rule
  -- can be a plain unique constraint instead of a lookup trigger.
  event_round_id uuid not null references public.event_rounds (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete cascade,
  unique (flight_id, participant_id),
  unique (event_round_id, participant_id)
);

create or replace function public.check_flight_capacity()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.event_flight_members where flight_id = new.flight_id) >= 4 then
    raise exception 'Flight is full (max 4 players)';
  end if;
  return new;
end;
$$;

create trigger enforce_flight_capacity
  before insert on public.event_flight_members
  for each row execute function public.check_flight_capacity();

alter table public.event_flights enable row level security;
alter table public.event_flight_members enable row level security;

create policy "event_flights_select_group_members" on public.event_flights
  for select using (
    exists (
      select 1 from public.event_rounds er join public.events e on e.id = er.event_id
      where er.id = event_round_id and public.is_group_member(e.group_id)
    )
  );

create policy "event_flights_manage_group_admins" on public.event_flights
  for all using (
    exists (
      select 1 from public.event_rounds er join public.events e on e.id = er.event_id
      where er.id = event_round_id and public.is_group_admin(e.group_id)
    )
  ) with check (
    exists (
      select 1 from public.event_rounds er join public.events e on e.id = er.event_id
      where er.id = event_round_id and public.is_group_admin(e.group_id)
    )
  );

create policy "event_flight_members_select_group_members" on public.event_flight_members
  for select using (
    exists (
      select 1 from public.event_rounds er join public.events e on e.id = er.event_id
      where er.id = event_round_id and public.is_group_member(e.group_id)
    )
  );

create policy "event_flight_members_manage_group_admins" on public.event_flight_members
  for all using (
    exists (
      select 1 from public.event_rounds er join public.events e on e.id = er.event_id
      where er.id = event_round_id and public.is_group_admin(e.group_id)
    )
  ) with check (
    exists (
      select 1 from public.event_rounds er join public.events e on e.id = er.event_id
      where er.id = event_round_id and public.is_group_admin(e.group_id)
    )
  );
