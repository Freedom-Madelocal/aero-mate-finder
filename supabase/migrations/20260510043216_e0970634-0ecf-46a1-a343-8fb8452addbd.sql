create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  work_email text not null,
  company text not null,
  role text,
  team_size text,
  message text,
  created_at timestamptz not null default now()
);
alter table public.demo_requests enable row level security;
create policy "Anyone can submit a demo request"
  on public.demo_requests for insert
  to anon, authenticated
  with check (true);
create policy "Authenticated can view demo requests"
  on public.demo_requests for select
  to authenticated
  using (true);