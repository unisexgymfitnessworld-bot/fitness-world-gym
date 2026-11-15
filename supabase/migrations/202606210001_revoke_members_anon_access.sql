-- Close the anon SELECT grant on members.
--
-- The base schema revokes everything from anon/authenticated and then
-- re-grants SELECT on members to anon (currently neutralized only by a
-- deny-all RLS policy). Every other table is revoke-all + backend-only.
-- The frontend never queries Supabase directly (all reads go through the
-- worker with service_role), so this revoke breaks nothing and removes the
-- footgun where any RLS misconfiguration would expose all member rows
-- (names, phones, addresses) to the public anon key.
revoke all on public.members from anon, authenticated;
