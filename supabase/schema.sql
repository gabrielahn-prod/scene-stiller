-- ============================================================================
-- Scene Stealer-prod: 영상 업로드 -> 포즈 추출 -> 이상행동 탐지 -> 유저별 보고서
-- Supabase 스키마 (테이블 + RLS + Storage 정책)
--
-- 실행 방법: Supabase 프로젝트의 SQL Editor에 이 파일 전체를 붙여넣고 실행.
-- (CLI를 쓴다면: supabase db push 또는 psql -f supabase/schema.sql)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 마이그레이션: 이미 테이블이 존재하는 기존 프로젝트에도 반영되도록
-- (아래 create table ... if not exists 는 새 프로젝트에서만 동작하므로 별도 처리)
-- ----------------------------------------------------------------------------
alter table if exists public.videos
  add column if not exists progress integer not null default 0;

alter table if exists public.videos
  drop constraint if exists videos_progress_check;
alter table if exists public.videos
  add constraint videos_progress_check check (progress between 0 and 100);

alter table if exists public.ai_reports
  drop constraint if exists ai_reports_video_id_key;

alter table if exists public.videos
  add column if not exists camera_location text;

alter table if exists public.ai_reports
  add column if not exists report_type text not null default 'text';
alter table if exists public.ai_reports
  drop constraint if exists ai_reports_report_type_check;
alter table if exists public.ai_reports
  add constraint ai_reports_report_type_check check (report_type in ('text', 'photo'));

-- ----------------------------------------------------------------------------
-- 0. owner_profiles: 회원가입 시 입력하는 사장님/매장 정보 + 구독 플랜
-- ----------------------------------------------------------------------------
create table if not exists public.owner_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  login_id         text not null,
  owner_name       text not null,
  owner_age        integer not null,
  store_count      integer not null,
  business_name    text not null,
  business_address text,
  plan             text not null default 'pro' check (plan in ('pro', 'premium')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table if exists public.owner_profiles
  add column if not exists plan text not null default 'pro';
alter table if exists public.owner_profiles
  add column if not exists business_address text;
alter table if exists public.owner_profiles
  drop constraint if exists owner_profiles_plan_check;
alter table if exists public.owner_profiles
  add constraint owner_profiles_plan_check check (plan in ('pro', 'premium'));

alter table public.owner_profiles enable row level security;

drop policy if exists "owner_profiles_select_own" on public.owner_profiles;
create policy "owner_profiles_select_own"
  on public.owner_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "owner_profiles_upsert_own" on public.owner_profiles;
create policy "owner_profiles_upsert_own"
  on public.owner_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "owner_profiles_update_own" on public.owner_profiles;
create policy "owner_profiles_update_own"
  on public.owner_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 1. videos: 유저가 업로드한 원본 영상 + 처리 상태
-- ----------------------------------------------------------------------------
create table if not exists public.videos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  filename       text not null,
  storage_path   text not null,                 -- storage 버킷 'videos' 내 경로: {user_id}/{video_id}/{filename}
  status         text not null default 'uploaded'
                   check (status in ('uploaded', 'processing', 'done', 'failed')),
  progress       integer not null default 0 check (progress between 0 and 100),
  error_message  text,
  duration_sec   double precision,
  fps            double precision,
  frame_width    integer,
  frame_height   integer,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);

create index if not exists videos_user_id_idx on public.videos(user_id);
create index if not exists videos_status_idx on public.videos(status);

-- ----------------------------------------------------------------------------
-- 2. anomaly_events: 워커가 탐지한 이상행동 구간(클립) 단위 결과
-- ----------------------------------------------------------------------------
create table if not exists public.anomaly_events (
  id                 uuid primary key default gen_random_uuid(),
  video_id           uuid not null references public.videos(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade, -- 조회 편의를 위한 비정규화 컬럼
  track_id           integer not null,          -- ByteTrack person id
  start_frame        integer not null,
  end_frame          integer not null,
  start_time_sec     double precision not null,
  end_time_sec       double precision not null,
  anomaly_score      double precision not null, -- 오토인코더 재구성 오차 (클수록 이상)
  threshold          double precision not null, -- 탐지 당시 임계값 (score > threshold 로 플래그됨)
  clip_storage_path  text,                       -- storage 버킷 'clips' 내 경로
  thumbnail_storage_path text,                   -- storage 버킷 'clips' 내 썸네일 경로
  created_at         timestamptz not null default now()
);

create index if not exists anomaly_events_video_id_idx on public.anomaly_events(video_id);
create index if not exists anomaly_events_user_id_idx on public.anomaly_events(user_id);

-- ----------------------------------------------------------------------------
-- 3. ai_reports: 영상 분석 결과를 바탕으로 생성한 AI 보고서
-- ----------------------------------------------------------------------------
create table if not exists public.ai_reports (
  id             uuid primary key default gen_random_uuid(),
  video_id       uuid not null references public.videos(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  report_date    date not null default current_date,
  title          text not null,
  status         text not null default 'queued'
                   check (status in ('queued', 'generating', 'done', 'failed')),
  report_json    jsonb not null default '{}'::jsonb,
  report_markdown text,
  ai_model       text,
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  generated_at   timestamptz
);

create index if not exists ai_reports_user_id_idx on public.ai_reports(user_id);
create index if not exists ai_reports_report_date_idx on public.ai_reports(report_date desc);
create index if not exists ai_reports_status_idx on public.ai_reports(status);

-- ----------------------------------------------------------------------------
-- Row Level Security: 자기 데이터만 보고 쓸 수 있음
-- ----------------------------------------------------------------------------
alter table public.videos enable row level security;
alter table public.anomaly_events enable row level security;
alter table public.ai_reports enable row level security;

drop policy if exists "videos_select_own" on public.videos;
create policy "videos_select_own"
  on public.videos for select
  using (auth.uid() = user_id);

drop policy if exists "videos_insert_own" on public.videos;
create policy "videos_insert_own"
  on public.videos for insert
  with check (auth.uid() = user_id);

drop policy if exists "videos_update_own" on public.videos;
create policy "videos_update_own"
  on public.videos for update
  using (auth.uid() = user_id);

drop policy if exists "videos_delete_own" on public.videos;
create policy "videos_delete_own"
  on public.videos for delete
  using (auth.uid() = user_id);

drop policy if exists "anomaly_events_select_own" on public.anomaly_events;
create policy "anomaly_events_select_own"
  on public.anomaly_events for select
  using (auth.uid() = user_id);

drop policy if exists "ai_reports_select_own" on public.ai_reports;
create policy "ai_reports_select_own"
  on public.ai_reports for select
  using (auth.uid() = user_id);

drop policy if exists "ai_reports_insert_own" on public.ai_reports;
create policy "ai_reports_insert_own"
  on public.ai_reports for insert
  with check (auth.uid() = user_id);

drop policy if exists "ai_reports_update_own" on public.ai_reports;
create policy "ai_reports_update_own"
  on public.ai_reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- anomaly_events 의 insert/update 와 ai_reports 생성 처리는 워커(서비스 롤 키)도 수행한다.
-- 서비스 롤 키는 RLS를 우회한다.

-- ----------------------------------------------------------------------------
-- Storage 버킷: videos(원본, private) / clips(이상행동 클립+썸네일, private)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('clips', 'clips', false)
on conflict (id) do nothing;

-- 업로드 경로 컨벤션: {user_id}/{video_id}/... 형태이므로
-- 경로의 첫 세그먼트(foldername)가 자기 user_id와 같은 파일만 접근 허용.

drop policy if exists "videos_bucket_select_own" on storage.objects;
create policy "videos_bucket_select_own"
  on storage.objects for select
  using (
    bucket_id = 'videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "videos_bucket_insert_own" on storage.objects;
create policy "videos_bucket_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "videos_bucket_delete_own" on storage.objects;
create policy "videos_bucket_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "clips_bucket_select_own" on storage.objects;
create policy "clips_bucket_select_own"
  on storage.objects for select
  using (
    bucket_id = 'clips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- clips 버킷에는 워커(서비스 롤 키)만 쓴다 -> insert 정책 없음 (서비스 롤 키는 RLS 우회).

-- ----------------------------------------------------------------------------
-- Realtime (선택): 테이블 변경을 대시보드에서 구독하려면 활성화
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'videos'
  ) then
    alter publication supabase_realtime add table public.videos;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'anomaly_events'
  ) then
    alter publication supabase_realtime add table public.anomaly_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_reports'
  ) then
    alter publication supabase_realtime add table public.ai_reports;
  end if;
end $$;
