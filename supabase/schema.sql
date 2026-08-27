-- ─────────────────────────────────────────────────────────────
-- VOLTA 모의투자 — 회원 추적 스키마 (Supabase)
-- 비밀번호는 Supabase Auth(auth.users)가 해시로 관리하며 여기 저장하지 않는다.
-- 여기 저장하는 것: 아이디(username), 로그인 이력, 모의수익률.
-- ─────────────────────────────────────────────────────────────

-- 회원별 추적 요약 (아이디 기준 denormalized)
create table if not exists public.user_tracking (
  username     text primary key,
  first_seen   timestamptz not null default now(),
  last_login   timestamptz,
  login_count  integer not null default 0,
  roi          numeric not null default 0,     -- 모의 수익률(%)
  equity       numeric not null default 0,     -- 가상 평가자산(USDT)
  updated_at   timestamptz not null default now()
);

-- 로그인 이력 (누가 언제 로그인했는지)
create table if not exists public.login_events (
  id         bigint generated always as identity primary key,
  username   text not null,
  at         timestamptz not null default now()
);

-- login_count 자동 증가 트리거
create or replace function public.bump_login_count() returns trigger as $$
begin
  insert into public.user_tracking(username, last_login, login_count)
  values (new.username, new.at, 1)
  on conflict (username) do update
    set last_login = excluded.last_login,
        login_count = public.user_tracking.login_count + 1;
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists trg_login_bump on public.login_events;
create trigger trg_login_bump after insert on public.login_events
  for each row execute function public.bump_login_count();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.user_tracking enable row level security;
alter table public.login_events  enable row level security;

-- 로그인한 사용자는 자기 이벤트/요약만 기록(upsert) 가능
create policy "insert own login" on public.login_events
  for insert to authenticated with check (true);
create policy "upsert own tracking" on public.user_tracking
  for all to authenticated using (true) with check (true);

-- 관리자만 전체 조회: auth.users.raw_app_meta_data->>'role' = 'admin' 인 계정
create policy "admin reads tracking" on public.user_tracking
  for select to authenticated
  using ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );
create policy "admin reads events" on public.login_events
  for select to authenticated
  using ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- 참고: 관리자 지정은 대시보드에서 해당 유저의 app_metadata.role='admin' 설정.
-- 비밀번호는 auth.users 에 해시로만 존재하며 이 스키마 어디에도 노출되지 않는다.
