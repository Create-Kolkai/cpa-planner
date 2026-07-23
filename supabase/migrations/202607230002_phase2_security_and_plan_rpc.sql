create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_assigned_rep(rep uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = rep
      and (
        p.id = auth.uid()
        or p.manager_id = auth.uid()
        or public.current_role() = 'admin'
      )
  )
$$;

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
for update
using (id = auth.uid() or public.current_role() = 'admin')
with check (
  public.current_role() = 'admin'
  or (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and manager_id is not distinct from (select manager_id from public.profiles where id = auth.uid())
    and active is not distinct from (select active from public.profiles where id = auth.uid())
  )
);

drop policy if exists "blocked_dates_rep_or_manager_write" on public.blocked_dates;
create policy "blocked_dates_rep_or_manager_write" on public.blocked_dates
for all
using (
  rep_id = auth.uid()
  or public.current_role() = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = blocked_dates.rep_id
      and p.manager_id = auth.uid()
  )
)
with check (
  rep_id = auth.uid()
  or public.current_role() = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = blocked_dates.rep_id
      and p.manager_id = auth.uid()
  )
);

revoke all on function public.search_pharmacy_directory(text) from public;
grant execute on function public.search_pharmacy_directory(text) to authenticated;

create or replace function public.save_monthly_plan(
  plan_month date,
  plan_status public.plan_status,
  generation_mode text,
  settings_snapshot jsonb,
  required_visit_count integer,
  scheduled_visit_count integer,
  unresolved_visit_count integer,
  available_capacity integer,
  days_payload jsonb,
  visits_payload jsonb,
  change_reason text default 'save plan'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_rep uuid := auth.uid();
  next_version integer;
  plan_record public.monthly_plans%rowtype;
  day_item jsonb;
  visit_item jsonb;
  day_id uuid;
begin
  if active_rep is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.monthly_plans
  where rep_id = active_rep and month = plan_month;

  insert into public.monthly_plans (
    rep_id,
    month,
    status,
    version,
    generation_mode,
    settings_snapshot,
    required_visit_count,
    scheduled_visit_count,
    unresolved_visit_count,
    available_capacity,
    generated_at
  )
  values (
    active_rep,
    plan_month,
    plan_status,
    next_version,
    generation_mode,
    settings_snapshot,
    required_visit_count,
    scheduled_visit_count,
    unresolved_visit_count,
    available_capacity,
    now()
  )
  returning * into plan_record;

  insert into public.plan_versions (plan_id, version, snapshot, reason, created_by)
  values (
    plan_record.id,
    next_version,
    jsonb_build_object('days', days_payload, 'visits', visits_payload, 'settings', settings_snapshot),
    change_reason,
    active_rep
  );

  for day_item in select * from jsonb_array_elements(days_payload)
  loop
    insert into public.plan_days (
      plan_id,
      date,
      locked,
      manually_modified,
      primary_area,
      visit_count,
      route_mode
    )
    values (
      plan_record.id,
      (day_item->>'date')::date,
      coalesce((day_item->>'locked')::boolean, false),
      coalesce((day_item->>'manually_modified')::boolean, false),
      day_item->>'primary_area',
      coalesce((day_item->>'visit_count')::integer, 0),
      coalesce(day_item->>'route_mode', 'approximate')
    );
  end loop;

  for visit_item in select * from jsonb_array_elements(visits_payload)
  loop
    select id into day_id
    from public.plan_days
    where plan_id = plan_record.id
      and date = (visit_item->>'date')::date;

    insert into public.plan_visits (
      plan_id,
      plan_day_id,
      rep_pharmacy_id,
      occurrence_number,
      stop_order,
      status,
      manually_moved,
      original_date,
      planning_notes
    )
    values (
      plan_record.id,
      day_id,
      (visit_item->>'rep_pharmacy_id')::uuid,
      (visit_item->>'occurrence_number')::integer,
      nullif(visit_item->>'stop_order', '')::integer,
      coalesce((visit_item->>'status')::public.visit_status, 'scheduled'),
      coalesce((visit_item->>'manually_moved')::boolean, false),
      nullif(visit_item->>'original_date', '')::date,
      visit_item->>'planning_notes'
    );
  end loop;

  insert into public.plan_change_log (plan_id, user_id, action, after_data)
  values (plan_record.id, active_rep, change_reason, jsonb_build_object('plan_id', plan_record.id, 'version', next_version));

  return plan_record.id;
end;
$$;

grant execute on function public.save_monthly_plan(date, public.plan_status, text, jsonb, integer, integer, integer, integer, jsonb, jsonb, text) to authenticated;
