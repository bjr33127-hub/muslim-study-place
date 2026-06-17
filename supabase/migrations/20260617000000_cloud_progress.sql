create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current integer not null default 0 check (current >= 0),
  best integer not null default 0 check (best >= 0),
  last_active_date date,
  today_count integer not null default 0 check (today_count >= 0),
  daily_goal integer not null default 1 check (daily_goal between 1 and 12),
  history jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_app_state enable row level security;
alter table public.user_streaks enable row level security;

drop policy if exists "profiles are owned by users" on public.profiles;
create policy "profiles are owned by users"
on public.profiles
for all
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "app state is owned by users" on public.user_app_state;
create policy "app state is owned by users"
on public.user_app_state
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "streaks are owned by users" on public.user_streaks;
create policy "streaks are owned by users"
on public.user_streaks
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.msp_clamp_daily_goal(value integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(greatest(coalesce(value, 1), 1), 12);
$$;

create or replace function public.msp_date_key(value date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(value, 'YYYY-MM-DD');
$$;

create or replace function public.msp_source_rank(value text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case value
    when 'manual' then 3
    when 'activity' then 2
    else 1
  end;
$$;

create or replace function public.msp_day_record(
  target_day date,
  activity_count integer,
  daily_goal integer,
  checked_in boolean,
  source text
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'date', public.msp_date_key(target_day),
    'count', greatest(coalesce(activity_count, 0), 0),
    'goal', public.msp_clamp_daily_goal(daily_goal),
    'checkedIn', coalesce(checked_in, false),
    'completed', greatest(coalesce(activity_count, 0), 0) >= public.msp_clamp_daily_goal(daily_goal),
    'source', case source when 'manual' then 'manual' when 'activity' then 'activity' else 'check-in' end
  );
$$;

create or replace function public.msp_merge_streak_day(
  history jsonb,
  target_day date,
  activity_count integer,
  daily_goal integer,
  checked_in boolean,
  source text
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  target_key text := public.msp_date_key(target_day);
  existing_source text := coalesce(history -> target_key ->> 'source', 'check-in');
  merged_source text := case
    when public.msp_source_rank(source) >= public.msp_source_rank(existing_source)
      then source
    else existing_source
  end;
begin
  return jsonb_set(
    coalesce(history, '{}'::jsonb),
    array[target_key],
    public.msp_day_record(
      target_day,
      activity_count,
      daily_goal,
      checked_in,
      merged_source
    ),
    true
  );
end;
$$;

create or replace function public.msp_streak_json(streak public.user_streaks)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'current', streak.current,
    'best', streak.best,
    'lastActiveDate', case
      when streak.last_active_date is null then null
      else public.msp_date_key(streak.last_active_date)
    end,
    'todayCount', streak.today_count,
    'dailyGoal', streak.daily_goal,
    'history', streak.history
  );
$$;

create or replace function public.save_app_state(
  p_snapshot jsonb,
  p_expected_revision bigint default null
)
returns public.user_app_state
language plpgsql
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing public.user_app_state;
  saved public.user_app_state;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if coalesce(p_snapshot ->> 'app', '') <> 'muslim-study-place'
    or coalesce((p_snapshot ->> 'version')::integer, 0) <> 1 then
    raise exception 'invalid_snapshot';
  end if;

  select *
  into existing
  from public.user_app_state
  where user_id = current_user_id
  for update;

  if p_expected_revision is not null
    and (existing.user_id is null or existing.revision <> p_expected_revision) then
    raise exception 'revision_conflict';
  end if;

  insert into public.user_app_state (
    user_id,
    snapshot,
    schema_version,
    revision,
    updated_at
  )
  values (
    current_user_id,
    p_snapshot,
    1,
    1,
    now()
  )
  on conflict (user_id) do update
  set
    snapshot = excluded.snapshot,
    schema_version = excluded.schema_version,
    revision = public.user_app_state.revision + 1,
    updated_at = now()
  returning * into saved;

  return saved;
end;
$$;

create or replace function public.record_daily_check_in(
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  safe_timezone text := coalesce(nullif(p_timezone, ''), 'Europe/Paris');
  today date := (now() at time zone safe_timezone)::date;
  yesterday date := today - 1;
  streak public.user_streaks;
  saved public.user_streaks;
  next_current integer;
  next_count integer;
  next_history jsonb;
  safe_goal integer;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into streak
  from public.user_streaks
  where user_id = current_user_id
  for update;

  if streak.user_id is null then
    next_history := public.msp_merge_streak_day(
      '{}'::jsonb,
      today,
      1,
      1,
      true,
      'check-in'
    );

    insert into public.user_streaks (
      user_id,
      current,
      best,
      last_active_date,
      today_count,
      daily_goal,
      history,
      updated_at
    )
    values (
      current_user_id,
      1,
      1,
      today,
      1,
      1,
      next_history,
      now()
    )
    returning * into saved;

    return public.msp_streak_json(saved);
  end if;

  safe_goal := public.msp_clamp_daily_goal(streak.daily_goal);

  if streak.last_active_date = today then
    next_count := greatest(streak.today_count, 1);
    next_history := public.msp_merge_streak_day(
      streak.history,
      today,
      next_count,
      safe_goal,
      true,
      'check-in'
    );

    update public.user_streaks
    set
      today_count = next_count,
      daily_goal = safe_goal,
      history = next_history,
      updated_at = now()
    where user_id = current_user_id
    returning * into saved;

    return public.msp_streak_json(saved);
  end if;

  next_current := case
    when streak.last_active_date = yesterday then streak.current + 1
    else 1
  end;
  next_history := public.msp_merge_streak_day(
    streak.history,
    today,
    1,
    safe_goal,
    true,
    'check-in'
  );

  update public.user_streaks
  set
    current = next_current,
    best = greatest(streak.best, next_current),
    last_active_date = today,
    today_count = 1,
    daily_goal = safe_goal,
    history = next_history,
    updated_at = now()
  where user_id = current_user_id
  returning * into saved;

  return public.msp_streak_json(saved);
end;
$$;

create or replace function public.record_streak_activity(
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  safe_timezone text := coalesce(nullif(p_timezone, ''), 'Europe/Paris');
  today date := (now() at time zone safe_timezone)::date;
  yesterday date := today - 1;
  streak public.user_streaks;
  saved public.user_streaks;
  next_current integer;
  next_count integer;
  next_history jsonb;
  safe_goal integer;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into streak
  from public.user_streaks
  where user_id = current_user_id
  for update;

  if streak.user_id is null then
    return public.record_daily_check_in(safe_timezone);
  end if;

  safe_goal := public.msp_clamp_daily_goal(streak.daily_goal);

  if streak.last_active_date is distinct from today then
    next_current := case
      when streak.last_active_date = yesterday then streak.current + 1
      else 1
    end;
    next_history := public.msp_merge_streak_day(
      streak.history,
      today,
      1,
      safe_goal,
      true,
      'check-in'
    );

    update public.user_streaks
    set
      current = next_current,
      best = greatest(streak.best, next_current),
      last_active_date = today,
      today_count = 1,
      daily_goal = safe_goal,
      history = next_history,
      updated_at = now()
    where user_id = current_user_id
    returning * into saved;

    return public.msp_streak_json(saved);
  end if;

  next_count := streak.today_count + 1;
  next_history := public.msp_merge_streak_day(
    streak.history,
    today,
    next_count,
    safe_goal,
    true,
    'activity'
  );

  update public.user_streaks
  set
    today_count = next_count,
    daily_goal = safe_goal,
    history = next_history,
    updated_at = now()
  where user_id = current_user_id
  returning * into saved;

  return public.msp_streak_json(saved);
end;
$$;

create or replace function public.set_daily_goal(
  p_daily_goal integer,
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  safe_timezone text := coalesce(nullif(p_timezone, ''), 'Europe/Paris');
  today date := (now() at time zone safe_timezone)::date;
  safe_goal integer := public.msp_clamp_daily_goal(p_daily_goal);
  streak public.user_streaks;
  saved public.user_streaks;
  today_key text := public.msp_date_key(today);
  next_history jsonb;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into streak
  from public.user_streaks
  where user_id = current_user_id
  for update;

  if streak.user_id is null then
    insert into public.user_streaks (
      user_id,
      daily_goal,
      updated_at
    )
    values (
      current_user_id,
      safe_goal,
      now()
    )
    returning * into saved;

    return public.msp_streak_json(saved);
  end if;

  next_history := streak.history;

  if streak.history ? today_key then
    next_history := public.msp_merge_streak_day(
      streak.history,
      today,
      greatest(streak.today_count, 0),
      safe_goal,
      true,
      coalesce(streak.history -> today_key ->> 'source', 'check-in')
    );
  end if;

  update public.user_streaks
  set
    daily_goal = safe_goal,
    history = next_history,
    updated_at = now()
  where user_id = current_user_id
  returning * into saved;

  return public.msp_streak_json(saved);
end;
$$;

grant execute on function public.save_app_state(jsonb, bigint) to authenticated;
grant execute on function public.record_daily_check_in(text) to authenticated;
grant execute on function public.record_streak_activity(text) to authenticated;
grant execute on function public.set_daily_goal(integer, text) to authenticated;
