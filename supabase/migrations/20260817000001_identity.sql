-- Identity & Access: users, groups, group memberships
create extension if not exists pgcrypto;

create type auth_provider as enum ('google', 'apple');
create type membership_role as enum ('member', 'admin');
create type membership_status as enum ('pending', 'active', 'denied', 'removed');

-- Mirrors auth.users, populated by the handle_new_user trigger below.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  auth_provider auth_provider not null,
  provider_user_id text not null,
  email text not null,
  display_name text,
  avatar_url text,
  is_site_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, auth_provider, provider_user_id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'provider', 'google')::auth_provider,
    coalesce(new.raw_user_meta_data->>'provider_id', new.raw_app_meta_data->>'provider_id', new.id::text),
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role membership_role not null default 'member',
  status membership_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.users (id),
  unique (group_id, user_id)
);

-- Helper functions used throughout RLS policies in later migrations.
create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = target_group_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_group_admin(target_group_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = target_group_id
      and user_id = auth.uid()
      and status = 'active'
      and role = 'admin'
  );
$$;

create or replace function public.is_any_group_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.group_memberships
    where user_id = auth.uid()
      and status = 'active'
      and role = 'admin'
  );
$$;

alter table public.users enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;

create policy "users_select_own_or_shared_group" on public.users
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.group_memberships gm1
      join public.group_memberships gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm1.status = 'active'
        and gm2.user_id = public.users.id and gm2.status = 'active'
    )
  );

create policy "users_update_own" on public.users
  for update using (id = auth.uid());

create policy "groups_select_all_authenticated" on public.groups
  for select using (auth.role() = 'authenticated');

create policy "groups_insert_self" on public.groups
  for insert with check (created_by = auth.uid());

create policy "groups_update_admin" on public.groups
  for update using (public.is_group_admin(id));

create policy "memberships_select_own_or_group_admin" on public.group_memberships
  for select using (
    user_id = auth.uid() or public.is_group_admin(group_id)
  );

create policy "memberships_insert_self_pending" on public.group_memberships
  for insert with check (
    user_id = auth.uid() and status = 'pending' and role = 'member'
  );

create policy "memberships_update_admin_decision" on public.group_memberships
  for update using (public.is_group_admin(group_id));

-- Whoever creates a group is immediately its first active admin.
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.group_memberships (group_id, user_id, role, status, decided_at, decided_by)
  values (new.id, new.created_by, 'admin', 'active', now(), new.created_by);
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();
