-- Group admins finalize event standings client-side (compute + persist), so scoring_results
-- needs write access — it was read-only, same original assumption as the handicap tables.

create policy "scoring_results_write_group_admins" on public.scoring_results
  for insert with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "scoring_results_update_group_admins" on public.scoring_results
  for update using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );
