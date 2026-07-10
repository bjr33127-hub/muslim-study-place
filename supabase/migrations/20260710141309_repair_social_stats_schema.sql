-- The remote project recorded an unrelated migration with a later timestamp,
-- which caused this older local schema update to be skipped. Keep the repair
-- idempotent so it can safely align already-partial social deployments.
alter table public.user_social_stats
  add column if not exists week_revision_daily_average numeric(6, 2) not null default 0 check (week_revision_daily_average >= 0),
  add column if not exists total_stars integer not null default 0 check (total_stars >= 0),
  add column if not exists best_streak integer not null default 0 check (best_streak >= 0),
  add column if not exists best_run integer not null default 0 check (best_run >= 0),
  add column if not exists flame_stages text[] not null default '{}'::text[],
  add column if not exists flame_quests text[] not null default '{}'::text[],
  add column if not exists selected_flame_effect text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_social_stats_flame_stages_valid') then
    alter table public.user_social_stats
      add constraint user_social_stats_flame_stages_valid
      check (flame_stages <@ array['solar', 'eclipse', 'nebula', 'apogee']::text[]);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_social_stats_flame_quests_valid') then
    alter table public.user_social_stats
      add constraint user_social_stats_flame_quests_valid
      check (flame_quests <@ array['perfect-week', 'four-perfect-weeks', 'twelve-focus-day', 'hundred-stars', 'ten-run', 'deep-task', 'twenty-five-tasks']::text[]);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_social_stats_selected_flame_effect_valid') then
    alter table public.user_social_stats
      add constraint user_social_stats_selected_flame_effect_valid
      check (selected_flame_effect is null or selected_flame_effect in ('seven-lights', 'prismatic-halo', 'comet-trail', 'constellation', 'twin-rings', 'crystal-core', 'runic-sparks'));
  end if;
end $$;

alter table public.user_social_stats enable row level security;
grant select, insert, update on public.user_social_stats to authenticated;

-- Return the full social payload expected by the current client. Dropping only
-- these no-argument RPCs is required because Postgres cannot alter a function's
-- return type in place.
drop function if exists public.get_my_friend_code();
drop function if exists public.get_friend_list();
drop function if exists public.get_friend_leaderboard();

create function public.get_my_friend_code()
returns table (user_id uuid, display_name text, avatar_url text, friend_code text, week_stars integer, current_streak integer, week_revisions_done integer, week_revision_daily_average numeric, total_stars integer, best_streak integer, best_run integer, flame_stages text[], flame_quests text[], selected_flame_effect text)
language plpgsql security definer set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  profile public.profiles;
  week_anchor date := date_trunc('week', now())::date;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  select * into profile from public.profiles where id = current_user_id for update;
  if profile.id is null then raise exception 'profile_not_found'; end if;
  if profile.friend_code is null or trim(profile.friend_code) = '' then
    update public.profiles set friend_code = public.msp_generate_friend_code(), updated_at = now()
    where id = current_user_id returning * into profile;
  end if;
  return query select profile.id, coalesce(nullif(profile.display_name, ''), profile.email, 'Ami'), coalesce(profile.avatar_url, ''), profile.friend_code,
    coalesce(stats.week_stars, 0), coalesce(stats.current_streak, 0), coalesce(stats.week_revisions_done, 0), coalesce(stats.week_revision_daily_average, 0), coalesce(stats.total_stars, 0), coalesce(stats.best_streak, 0), coalesce(stats.best_run, 0), coalesce(stats.flame_stages, '{}'::text[]), coalesce(stats.flame_quests, '{}'::text[]), stats.selected_flame_effect
  from (select 1) anchor left join public.user_social_stats stats on stats.user_id = profile.id and stats.week_start = week_anchor;
end;
$$;

create function public.get_friend_list()
returns table (user_id uuid, display_name text, avatar_url text, friend_code text, week_stars integer, current_streak integer, week_revisions_done integer, week_revision_daily_average numeric, total_stars integer, best_streak integer, best_run integer, flame_stages text[], flame_quests text[], selected_flame_effect text)
language sql security definer set search_path = public, auth
as $$
  with friend_ids as (
    select case when invite.sender_id = auth.uid() then invite.recipient_id else invite.sender_id end as user_id
    from public.friend_invites invite
    where invite.status = 'accepted' and (invite.sender_id = auth.uid() or invite.recipient_id = auth.uid()) and invite.recipient_id is not null
  ), week_anchor as (select date_trunc('week', now())::date as week_start)
  select profile.id, coalesce(nullif(profile.display_name, ''), profile.email, 'Ami'), coalesce(profile.avatar_url, ''), profile.friend_code,
    coalesce(stats.week_stars, 0), coalesce(stats.current_streak, 0), coalesce(stats.week_revisions_done, 0), coalesce(stats.week_revision_daily_average, 0), coalesce(stats.total_stars, 0), coalesce(stats.best_streak, 0), coalesce(stats.best_run, 0), coalesce(stats.flame_stages, '{}'::text[]), coalesce(stats.flame_quests, '{}'::text[]), stats.selected_flame_effect
  from friend_ids join public.profiles profile on profile.id = friend_ids.user_id cross join week_anchor
  left join public.user_social_stats stats on stats.user_id = profile.id and stats.week_start = week_anchor.week_start
  order by display_name asc;
$$;

create function public.get_friend_leaderboard()
returns table (user_id uuid, display_name text, avatar_url text, week_start date, week_stars integer, current_streak integer, week_revisions_done integer, week_revision_daily_average numeric, total_stars integer, best_streak integer, best_run integer, flame_stages text[], flame_quests text[], selected_flame_effect text)
language sql security definer set search_path = public, auth
as $$
  with current_profile as (select auth.uid() as id), week_anchor as (select date_trunc('week', now())::date as week_start), friend_ids as (
    select id as user_id from current_profile where id is not null
    union
    select case when invite.sender_id = (select id from current_profile) then invite.recipient_id else invite.sender_id end
    from public.friend_invites invite
    where invite.status = 'accepted' and (invite.sender_id = (select id from current_profile) or invite.recipient_id = (select id from current_profile)) and invite.recipient_id is not null
  )
  select profile.id, coalesce(nullif(profile.display_name, ''), profile.email, 'Ami'), coalesce(profile.avatar_url, ''), coalesce(stats.week_start, week_anchor.week_start),
    coalesce(stats.week_stars, 0), coalesce(stats.current_streak, 0), coalesce(stats.week_revisions_done, 0), coalesce(stats.week_revision_daily_average, 0), coalesce(stats.total_stars, 0), coalesce(stats.best_streak, 0), coalesce(stats.best_run, 0), coalesce(stats.flame_stages, '{}'::text[]), coalesce(stats.flame_quests, '{}'::text[]), stats.selected_flame_effect
  from friend_ids join public.profiles profile on profile.id = friend_ids.user_id cross join week_anchor
  left join public.user_social_stats stats on stats.user_id = profile.id and stats.week_start = week_anchor.week_start
  order by coalesce(stats.total_stars, 0) desc, coalesce(stats.week_stars, 0) desc, coalesce(stats.current_streak, 0) desc, coalesce(stats.week_revision_daily_average, 0) desc, profile.display_name asc;
$$;

revoke all on function public.get_my_friend_code() from public;
revoke all on function public.get_friend_list() from public;
revoke all on function public.get_friend_leaderboard() from public;
grant execute on function public.get_my_friend_code() to authenticated;
grant execute on function public.get_friend_list() to authenticated;
grant execute on function public.get_friend_leaderboard() to authenticated;

notify pgrst, 'reload schema';
