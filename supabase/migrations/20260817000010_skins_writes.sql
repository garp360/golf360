-- Group admins finalize skins results client-side (compute + persist), so skins_results and
-- skins_pot_carryovers need write access — same pattern as the earlier handicap/scoring fixes.

create policy "skins_results_write_group_admins" on public.skins_results
  for insert with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "skins_results_update_group_admins" on public.skins_results
  for update using (
    exists (select 1 from public.events e where e.id = event_id and public.is_group_admin(e.group_id))
  );

create policy "skins_carryovers_write_group_admins" on public.skins_pot_carryovers
  for insert with check (public.is_group_admin(group_id));

create policy "skins_carryovers_update_group_admins" on public.skins_pot_carryovers
  for update using (public.is_group_admin(group_id));
