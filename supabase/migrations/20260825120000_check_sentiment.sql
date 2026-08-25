create table if not exists public.check_sentiment (
  check_id uuid primary key references public.checks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sentiment text not null check (sentiment in ('positive', 'negative')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.check_sentiment enable row level security;

drop policy if exists "Users can view own check sentiment" on public.check_sentiment;
create policy "Users can view own check sentiment"
on public.check_sentiment for select
using (auth.uid() = user_id);

drop policy if exists "Users can submit own check sentiment" on public.check_sentiment;
create policy "Users can submit own check sentiment"
on public.check_sentiment for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.checks
    where checks.id = check_sentiment.check_id
      and checks.user_id = auth.uid()
      and checks.status = 'completed'
  )
);

drop policy if exists "Users can update own check sentiment" on public.check_sentiment;
create policy "Users can update own check sentiment"
on public.check_sentiment for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

comment on table public.check_sentiment is
  'Post-check thumbs up/down prompt. Positive routes the user to the public Google review link client-side; negative note is private, never surfaced publicly.';
