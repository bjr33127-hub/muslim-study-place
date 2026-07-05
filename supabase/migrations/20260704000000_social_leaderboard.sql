create extension if not exists pgcrypto;

create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  sender_display_name text not null default '',
  sender_avatar_url text not null default '',
  recipient_id uuid references auth.users(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.user_social_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  week_start date not null,
  week_stars integer not null default 0 check (week_stars >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  week_revisions_done integer not null default 0 check (week_revisions_done >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists friend_invites_sender_idx
  on public.friend_invites(sender_id, status);

create index if not exists friend_invites_recipient_idx
  on public.friend_invites(recipient_id, status);

create index if not exists friend_invites_recipient_email_idx
  on public.friend_invites(lower(recipient_email), status);

alter table public.friend_invites enable row level security;
alter table public.user_social_stats enable row level security;

grant select, insert, update, delete on public.friend_invites to authenticated;
grant select, insert, update on public.user_social_stats to authenticated;

drop policy if exists "friend invites visible to participants" on public.friend_invites;
create policy "friend invites visible to participants"
on public.friend_invites
for select
to authenticated
using (
  (select auth.uid()) = sender_id
  or (select auth.uid()) = recipient_id
  or lower(recipient_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

drop policy if exists "friend invites participant updates" on public.friend_invites;
create policy "friend invites participant updates"
on public.friend_invites
for update
to authenticated
using (
  (select auth.uid()) = sender_id
  or (select auth.uid()) = recipient_id
  or lower(recipient_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
)
with check (
  (select auth.uid()) = sender_id
  or (select auth.uid()) = recipient_id
  or lower(recipient_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

drop policy if exists "social stats are visible to friends" on public.user_social_stats;
create policy "social stats are visible to friends"
on public.user_social_stats
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.friend_invites invite
    where invite.status = 'accepted'
      and (
        (invite.sender_id = (select auth.uid()) and invite.recipient_id = user_social_stats.user_id)
        or (invite.recipient_id = (select auth.uid()) and invite.sender_id = user_social_stats.user_id)
      )
  )
);

drop policy if exists "social stats are owned by users" on public.user_social_stats;
create policy "social stats are owned by users"
on public.user_social_stats
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.send_friend_invite(p_recipient_email text)
returns public.friend_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  recipient_email_normalized text := lower(trim(coalesce(p_recipient_email, '')));
  sender_profile public.profiles;
  recipient_profile public.profiles;
  existing public.friend_invites;
  saved public.friend_invites;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if current_email = '' then
    raise exception 'missing_sender_email';
  end if;

  if recipient_email_normalized = '' or position('@' in recipient_email_normalized) <= 1 then
    raise exception 'invalid_recipient_email';
  end if;

  if recipient_email_normalized = current_email then
    raise exception 'cannot_invite_self';
  end if;

  select *
  into sender_profile
  from public.profiles
  where id = current_user_id;

  select *
  into recipient_profile
  from public.profiles
  where lower(email) = recipient_email_normalized
  limit 1;

  select *
  into existing
  from public.friend_invites
  where status in ('pending', 'accepted')
    and sender_id = current_user_id
    and lower(recipient_email) = recipient_email_normalized
  order by created_at desc
  limit 1;

  if existing.id is not null then
    return existing;
  end if;

  insert into public.friend_invites (
    sender_id,
    sender_email,
    sender_display_name,
    sender_avatar_url,
    recipient_id,
    recipient_email
  )
  values (
    current_user_id,
    current_email,
    coalesce(nullif(sender_profile.display_name, ''), current_email),
    coalesce(sender_profile.avatar_url, ''),
    recipient_profile.id,
    recipient_email_normalized
  )
  returning * into saved;

  return saved;
end;
$$;

create or replace function public.respond_friend_invite(
  p_invite_id uuid,
  p_action text
)
returns public.friend_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invite public.friend_invites;
  saved public.friend_invites;
  next_status text;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  next_status := case p_action
    when 'accept' then 'accepted'
    when 'decline' then 'declined'
    else null
  end;

  if next_status is null then
    raise exception 'invalid_invite_action';
  end if;

  select *
  into invite
  from public.friend_invites
  where id = p_invite_id
    and status = 'pending'
    and (
      recipient_id = current_user_id
      or lower(recipient_email) = current_email
    )
  for update;

  if invite.id is null then
    raise exception 'invite_not_found';
  end if;

  update public.friend_invites
  set
    recipient_id = coalesce(recipient_id, current_user_id),
    status = next_status,
    updated_at = now(),
    responded_at = now()
  where id = p_invite_id
  returning * into saved;

  return saved;
end;
$$;

create or replace function public.cancel_friend_invite(p_invite_id uuid)
returns public.friend_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  saved public.friend_invites;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.friend_invites
  set
    status = 'cancelled',
    updated_at = now()
  where id = p_invite_id
    and sender_id = current_user_id
    and status = 'pending'
  returning * into saved;

  if saved.id is null then
    raise exception 'invite_not_found';
  end if;

  return saved;
end;
$$;

create or replace function public.get_friend_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  week_start date,
  week_stars integer,
  current_streak integer,
  week_revisions_done integer
)
language sql
security definer
set search_path = public, auth
as $$
  with current_profile as (
    select auth.uid() as id
  ),
  week_anchor as (
    select date_trunc('week', now())::date as week_start
  ),
  friend_ids as (
    select id as user_id
    from current_profile
    where id is not null
    union
    select case
      when invite.sender_id = (select id from current_profile) then invite.recipient_id
      else invite.sender_id
    end as user_id
    from public.friend_invites invite
    where invite.status = 'accepted'
      and (
        invite.sender_id = (select id from current_profile)
        or invite.recipient_id = (select id from current_profile)
      )
      and invite.recipient_id is not null
  )
  select
    profile.id as user_id,
    coalesce(nullif(profile.display_name, ''), profile.email, 'Friend') as display_name,
    coalesce(profile.avatar_url, '') as avatar_url,
    coalesce(stats.week_start, week_anchor.week_start) as week_start,
    coalesce(stats.week_stars, 0) as week_stars,
    coalesce(stats.current_streak, 0) as current_streak,
    coalesce(stats.week_revisions_done, 0) as week_revisions_done
  from friend_ids
  join public.profiles profile on profile.id = friend_ids.user_id
  cross join week_anchor
  left join public.user_social_stats stats
    on stats.user_id = profile.id
    and stats.week_start = week_anchor.week_start
  order by
    coalesce(stats.week_stars, 0) desc,
    coalesce(stats.current_streak, 0) desc,
    coalesce(stats.week_revisions_done, 0) desc,
    profile.display_name asc;
$$;

revoke all on function public.send_friend_invite(text) from public;
revoke all on function public.respond_friend_invite(uuid, text) from public;
revoke all on function public.cancel_friend_invite(uuid) from public;
revoke all on function public.get_friend_leaderboard() from public;

grant execute on function public.send_friend_invite(text) to authenticated;
grant execute on function public.respond_friend_invite(uuid, text) to authenticated;
grant execute on function public.cancel_friend_invite(uuid) to authenticated;
grant execute on function public.get_friend_leaderboard() to authenticated;
