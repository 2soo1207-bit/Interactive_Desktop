begin;

create table public.guestbook_entries (
  id uuid primary key,
  nickname text not null check (
    char_length(nickname) between 1 and 24 and nickname ~ '[^[:space:]]'
  ),
  message text not null check (
    char_length(message) between 1 and 1000 and message ~ '[^[:space:]]'
  ),
  created_at timestamptz not null default now()
);

create index guestbook_entries_chronology on public.guestbook_entries (created_at desc, id desc);
alter table public.guestbook_entries enable row level security;
revoke all on public.guestbook_entries from public, anon, authenticated;
grant select on public.guestbook_entries to anon, authenticated;
grant insert (id, nickname, message) on public.guestbook_entries to anon, authenticated;

create policy "Visitors read the guestbook" on public.guestbook_entries
  for select to anon, authenticated using (true);
create policy "Visitors post guestbook entries" on public.guestbook_entries
  for insert to anon, authenticated with check (true);

commit;
