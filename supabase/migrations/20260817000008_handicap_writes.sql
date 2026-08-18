-- The handicap engine runs client-side (self-entry or group-admin score entry), so it needs
-- write access to the derived tables that were previously read-only (computed_at server-side
-- was the original assumption; there is no server-side compute layer in this app).

create policy "round_differentials_write_self_or_admin" on public.round_differentials
  for insert with check (user_id = auth.uid() or public.is_any_group_admin());

create policy "round_differentials_update_self_or_admin" on public.round_differentials
  for update using (user_id = auth.uid() or public.is_any_group_admin());

create policy "handicap_snapshots_write_self_or_admin" on public.handicap_snapshots
  for insert with check (user_id = auth.uid() or public.is_any_group_admin());
