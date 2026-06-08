alter table public.members
add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_members_owner_user_id on public.members(owner_user_id);

comment on column public.members.owner_user_id is 'Supabase Auth user that owns this member record. Used by the API to isolate trainer workspaces.';
