-- Additional profile fields captured during the required first-login onboarding step.
alter table public.users
  add column first_name text,
  add column last_name text,
  add column gender text;
