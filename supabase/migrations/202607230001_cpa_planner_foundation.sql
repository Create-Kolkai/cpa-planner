create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$ begin
  create type public.user_role as enum ('sales_rep', 'manager', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.location_quality as enum ('exact', 'address', 'place', 'suburb', 'area_estimate', 'unresolved');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.plan_status as enum ('draft', 'generating', 'review', 'complete', 'submitted', 'unresolved', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.visit_status as enum ('scheduled', 'unresolved', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.blocked_date_type as enum ('training', 'meeting', 'leave', 'conference', 'public_holiday', 'other');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  role public.user_role not null default 'sales_rep',
  manager_id uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacy_directory (
  id uuid primary key default gen_random_uuid(),
  practice_number text,
  practice_name text not null,
  normalised_name text not null,
  town text,
  suburb text,
  city text,
  province text,
  physical_address text,
  normalised_address text,
  telephone text,
  latitude double precision,
  longitude double precision,
  location_quality public.location_quality not null default 'unresolved',
  geocode_source text,
  geocode_status text,
  source_name text,
  source_updated_at date,
  source_record_hash text not null,
  verification_status text not null default 'needs_review',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_record_hash)
);

create table if not exists public.rep_pharmacies (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  directory_pharmacy_id uuid references public.pharmacy_directory(id),
  practice_number text,
  pharmacy_name text not null,
  address text,
  suburb text,
  town text,
  province text,
  telephone text,
  latitude double precision,
  longitude double precision,
  location_quality public.location_quality not null default 'unresolved',
  grade text not null default 'C',
  required_visits_override integer,
  visit_duration_minutes integer not null default 20,
  priority integer not null default 0,
  notes text,
  active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rep_id, directory_pharmacy_id),
  unique(rep_id, practice_number)
);

create table if not exists public.planning_defaults (
  rep_id uuid primary key references public.profiles(id) on delete cascade,
  grade_a_visits integer not null default 2,
  grade_b_visits integer not null default 1,
  grade_c_visits integer not null default 0,
  min_visits_per_day integer not null default 4,
  max_visits_per_day integer not null default 8,
  working_weekdays integer[] not null default array[1,2,3,4,5],
  default_visit_duration_minutes integer not null default 20,
  minimum_repeat_visit_gap_days integer not null default 10,
  home_address text,
  home_latitude double precision,
  home_longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  type public.blocked_date_type not null,
  reason text not null,
  created_by uuid references public.profiles(id),
  source text not null default 'rep',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rep_id, date)
);

create table if not exists public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,
  status public.plan_status not null default 'draft',
  version integer not null default 1,
  generation_mode text not null default 'approximate',
  settings_snapshot jsonb not null default '{}'::jsonb,
  required_visit_count integer not null default 0,
  scheduled_visit_count integer not null default 0,
  unresolved_visit_count integer not null default 0,
  available_capacity integer not null default 0,
  generated_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rep_id, month, version)
);

create table if not exists public.plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  date date not null,
  locked boolean not null default false,
  manually_modified boolean not null default false,
  primary_area text,
  visit_count integer not null default 0,
  route_mode text not null default 'approximate',
  route_distance_meters integer,
  route_duration_seconds integer,
  route_geometry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, date)
);

create table if not exists public.plan_visits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  plan_day_id uuid references public.plan_days(id) on delete set null,
  rep_pharmacy_id uuid not null references public.rep_pharmacies(id),
  occurrence_number integer not null,
  stop_order integer,
  status public.visit_status not null default 'scheduled',
  manually_moved boolean not null default false,
  original_date date,
  planning_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, rep_pharmacy_id, occurrence_number)
);

create table if not exists public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  reason text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.plan_change_log (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  user_id uuid references public.profiles(id),
  action text not null,
  affected_date date,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  status text not null default 'pending',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  matched_rows integer not null default 0,
  unmatched_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null,
  status text not null,
  matched_directory_id uuid references public.pharmacy_directory(id),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_manager_idx on public.profiles(manager_id) where active;
create index if not exists pharmacy_directory_name_trgm_idx on public.pharmacy_directory using gin (normalised_name gin_trgm_ops);
create index if not exists pharmacy_directory_practice_idx on public.pharmacy_directory(practice_number);
create index if not exists rep_pharmacies_rep_idx on public.rep_pharmacies(rep_id, active);
create index if not exists blocked_dates_rep_date_idx on public.blocked_dates(rep_id, date);
create index if not exists monthly_plans_rep_month_idx on public.monthly_plans(rep_id, month);
create index if not exists plan_days_plan_date_idx on public.plan_days(plan_id, date);
create index if not exists plan_visits_plan_day_idx on public.plan_visits(plan_id, plan_day_id);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger pharmacy_directory_updated_at before update on public.pharmacy_directory for each row execute function public.set_updated_at();
create trigger rep_pharmacies_updated_at before update on public.rep_pharmacies for each row execute function public.set_updated_at();
create trigger planning_defaults_updated_at before update on public.planning_defaults for each row execute function public.set_updated_at();
create trigger blocked_dates_updated_at before update on public.blocked_dates for each row execute function public.set_updated_at();
create trigger monthly_plans_updated_at before update on public.monthly_plans for each row execute function public.set_updated_at();
create trigger plan_days_updated_at before update on public.plan_days for each row execute function public.set_updated_at();
create trigger plan_visits_updated_at before update on public.plan_visits for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'sales_rep')
  on conflict (id) do nothing;

  insert into public.planning_defaults (rep_id)
  values (new.id)
  on conflict (rep_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.search_pharmacy_directory(search_text text)
returns table (
  id uuid,
  practice_number text,
  practice_name text,
  suburb text,
  town text,
  province text,
  physical_address text,
  location_quality public.location_quality
)
language sql
security definer
set search_path = public
as $$
  select d.id, d.practice_number, d.practice_name, d.suburb, d.town, d.province, d.physical_address, d.location_quality
  from public.pharmacy_directory d
  where auth.uid() is not null
    and length(trim(search_text)) >= 3
    and d.active = true
    and d.verification_status = 'verified'
    and (
      d.practice_number ilike trim(search_text) || '%'
      or d.normalised_name ilike '%' || lower(regexp_replace(search_text, '[^a-zA-Z0-9]+', ' ', 'g')) || '%'
      or d.normalised_address ilike '%' || lower(regexp_replace(search_text, '[^a-zA-Z0-9]+', ' ', 'g')) || '%'
      or d.suburb ilike '%' || trim(search_text) || '%'
      or d.town ilike '%' || trim(search_text) || '%'
    )
  order by
    case when d.practice_number = trim(search_text) then 0 else 1 end,
    similarity(d.normalised_name, lower(regexp_replace(search_text, '[^a-zA-Z0-9]+', ' ', 'g'))) desc,
    d.practice_name
  limit 20;
$$;

alter table public.profiles enable row level security;
alter table public.pharmacy_directory enable row level security;
alter table public.rep_pharmacies enable row level security;
alter table public.planning_defaults enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_visits enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_change_log enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;
alter table public.user_notifications enable row level security;

create or replace function public.current_role()
returns public.user_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_assigned_rep(rep uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = rep
      and (p.id = auth.uid() or p.manager_id = auth.uid() or public.current_role() = 'admin')
  )
$$;

create policy "profiles_self_or_manager" on public.profiles for select using (id = auth.uid() or manager_id = auth.uid() or public.current_role() = 'admin');
create policy "profiles_self_update" on public.profiles for update using (id = auth.uid() or public.current_role() = 'admin') with check (id = auth.uid() or public.current_role() = 'admin');

create policy "rep_pharmacies_owner_select" on public.rep_pharmacies for select using (public.is_assigned_rep(rep_id));
create policy "rep_pharmacies_owner_write" on public.rep_pharmacies for all using (rep_id = auth.uid() or public.current_role() = 'admin') with check (rep_id = auth.uid() or public.current_role() = 'admin');

create policy "planning_defaults_owner" on public.planning_defaults for all using (rep_id = auth.uid() or public.current_role() = 'admin') with check (rep_id = auth.uid() or public.current_role() = 'admin');

create policy "blocked_dates_team_select" on public.blocked_dates for select using (public.is_assigned_rep(rep_id));
create policy "blocked_dates_rep_or_manager_write" on public.blocked_dates for all using (rep_id = auth.uid() or public.is_assigned_rep(rep_id)) with check (rep_id = auth.uid() or public.is_assigned_rep(rep_id));

create policy "monthly_plans_team_select" on public.monthly_plans for select using (public.is_assigned_rep(rep_id));
create policy "monthly_plans_rep_write" on public.monthly_plans for all using (rep_id = auth.uid() or public.current_role() = 'admin') with check (rep_id = auth.uid() or public.current_role() = 'admin');

create policy "plan_days_by_plan" on public.plan_days for all using (exists (select 1 from public.monthly_plans p where p.id = plan_id and public.is_assigned_rep(p.rep_id))) with check (exists (select 1 from public.monthly_plans p where p.id = plan_id and (p.rep_id = auth.uid() or public.current_role() = 'admin')));
create policy "plan_visits_by_plan" on public.plan_visits for all using (exists (select 1 from public.monthly_plans p where p.id = plan_id and public.is_assigned_rep(p.rep_id))) with check (exists (select 1 from public.monthly_plans p where p.id = plan_id and (p.rep_id = auth.uid() or public.current_role() = 'admin')));
create policy "plan_versions_by_plan" on public.plan_versions for all using (exists (select 1 from public.monthly_plans p where p.id = plan_id and public.is_assigned_rep(p.rep_id))) with check (exists (select 1 from public.monthly_plans p where p.id = plan_id and (p.rep_id = auth.uid() or public.current_role() = 'admin')));
create policy "plan_change_log_by_plan" on public.plan_change_log for all using (exists (select 1 from public.monthly_plans p where p.id = plan_id and public.is_assigned_rep(p.rep_id))) with check (exists (select 1 from public.monthly_plans p where p.id = plan_id and public.is_assigned_rep(p.rep_id)));

create policy "import_jobs_owner" on public.import_jobs for all using (rep_id = auth.uid() or public.current_role() = 'admin') with check (rep_id = auth.uid() or public.current_role() = 'admin');
create policy "import_rows_owner" on public.import_rows for all using (exists (select 1 from public.import_jobs j where j.id = import_job_id and (j.rep_id = auth.uid() or public.current_role() = 'admin'))) with check (exists (select 1 from public.import_jobs j where j.id = import_job_id and (j.rep_id = auth.uid() or public.current_role() = 'admin')));
create policy "notifications_owner" on public.user_notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No broad select policy on pharmacy_directory. Representatives search through search_pharmacy_directory().
