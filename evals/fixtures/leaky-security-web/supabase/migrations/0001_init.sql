create table public.notes (
  id bigint generated always as identity primary key,
  owner uuid not null,
  body text
);

create table public.profiles (
  id uuid primary key,
  display_name text
);
alter table public.profiles enable row level security;
create policy "anyone can edit profiles" on public.profiles for update using (true);
