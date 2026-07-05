create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists friend_code text;

alter table public.friend_invites
  add column if not exists recipient_display_name text not null default '',
  add column if not exists recipient_avatar_url text not null default '';

create or replace function public.msp_normalize_friend_code(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g');
$$;

create or replace function public.msp_format_friend_code(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(public.msp_normalize_friend_code(value)) >= 10 then
      'MSP-' ||
      substr(public.msp_normalize_friend_code(value), 4, 4) ||
      '-' ||
      substr(public.msp_normalize_friend_code(value), 8, 4)
    else upper(coalesce(value, ''))
  end;
$$;

create or replace function public.msp_generate_friend_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  candidate text;
  token text;
begin
  loop
    token := upper(replace(gen_random_uuid()::text, '-', ''));
    candidate :=
      'MSP-' ||
      substr(token, 1, 4) ||
      '-' ||
      substr(token, 5, 4);

    exit when not exists (
      select 1
      from public.profiles
      where public.msp_normalize_friend_code(friend_code) =
        public.msp_normalize_friend_code(candidate)
    );
  end loop;

  return candidate;
end;
$$;

update public.profiles
set friend_code = public.msp_generate_friend_code()
where friend_code is null or trim(friend_code) = '';

alter table public.profiles
  alter column friend_code set default public.msp_generate_friend_code(),
  alter column friend_code set not null;

create unique index if not exists profiles_friend_code_key
  on public.profiles (public.msp_normalize_friend_code(friend_code));

grant select, insert, update on public.profiles to authenticated;

create or replace function public.get_my_friend_code()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  friend_code text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  profile public.profiles;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into profile
  from public.profiles
  where id = current_user_id
  for update;

  if profile.id is null then
    raise exception 'profile_not_found';
  end if;

  if profile.friend_code is null or trim(profile.friend_code) = '' then
    update public.profiles
    set
      friend_code = public.msp_generate_friend_code(),
      updated_at = now()
    where id = current_user_id
    returning * into profile;
  end if;

  return query
  select
    profile.id,
    coalesce(nullif(profile.display_name, ''), profile.email, 'Ami'),
    coalesce(profile.avatar_url, ''),
    profile.friend_code;
end;
$$;

create or replace function public.regenerate_friend_code()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  friend_code text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  profile public.profiles;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
  set
    friend_code = public.msp_generate_friend_code(),
    updated_at = now()
  where id = current_user_id
  returning * into profile;

  if profile.id is null then
    raise exception 'profile_not_found';
  end if;

  return query
  select
    profile.id,
    coalesce(nullif(profile.display_name, ''), profile.email, 'Ami'),
    coalesce(profile.avatar_url, ''),
    profile.friend_code;
end;
$$;

create or replace function public.find_profile_by_friend_code(p_friend_code text)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  friend_code text,
  relation text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := public.msp_normalize_friend_code(p_friend_code);
  target_profile public.profiles;
  existing public.friend_invites;
  current_relation text := 'none';
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if normalized_code = '' then
    raise exception 'missing_friend_code';
  end if;

  select *
  into target_profile
  from public.profiles
  where public.msp_normalize_friend_code(friend_code) = normalized_code
  limit 1;

  if target_profile.id is null then
    raise exception 'friend_code_not_found';
  end if;

  if target_profile.id = current_user_id then
    current_relation := 'self';
  else
    select *
    into existing
    from public.friend_invites
    where status in ('pending', 'accepted')
      and (
        (sender_id = current_user_id and recipient_id = target_profile.id)
        or (sender_id = target_profile.id and recipient_id = current_user_id)
      )
    order by created_at desc
    limit 1;

    current_relation := case
      when existing.status = 'accepted' then 'friend'
      when existing.status = 'pending' and existing.sender_id = current_user_id then 'pending-sent'
      when existing.status = 'pending' and existing.recipient_id = current_user_id then 'pending-received'
      else 'none'
    end;
  end if;

  return query
  select
    target_profile.id,
    coalesce(nullif(target_profile.display_name, ''), target_profile.email, 'Ami'),
    coalesce(target_profile.avatar_url, ''),
    target_profile.friend_code,
    current_relation;
end;
$$;

create or replace function public.send_friend_invite_by_code(p_friend_code text)
returns public.friend_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  normalized_code text := public.msp_normalize_friend_code(p_friend_code);
  sender_profile public.profiles;
  recipient_profile public.profiles;
  existing public.friend_invites;
  saved public.friend_invites;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if normalized_code = '' then
    raise exception 'missing_friend_code';
  end if;

  select *
  into sender_profile
  from public.profiles
  where id = current_user_id;

  select *
  into recipient_profile
  from public.profiles
  where public.msp_normalize_friend_code(friend_code) = normalized_code
  limit 1;

  if recipient_profile.id is null then
    raise exception 'friend_code_not_found';
  end if;

  if recipient_profile.id = current_user_id then
    raise exception 'cannot_invite_self';
  end if;

  select *
  into existing
  from public.friend_invites
  where status in ('pending', 'accepted')
    and (
      (sender_id = current_user_id and recipient_id = recipient_profile.id)
      or (sender_id = recipient_profile.id and recipient_id = current_user_id)
    )
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
    recipient_email,
    recipient_display_name,
    recipient_avatar_url
  )
  values (
    current_user_id,
    current_email,
    coalesce(nullif(sender_profile.display_name, ''), current_email, 'Ami'),
    coalesce(sender_profile.avatar_url, ''),
    recipient_profile.id,
    coalesce(recipient_profile.email, ''),
    coalesce(nullif(recipient_profile.display_name, ''), recipient_profile.email, 'Ami'),
    coalesce(recipient_profile.avatar_url, '')
  )
  returning * into saved;

  return saved;
end;
$$;

create or replace function public.get_friend_invites()
returns table (
  id uuid,
  sender_id uuid,
  sender_display_name text,
  sender_avatar_url text,
  recipient_id uuid,
  recipient_display_name text,
  recipient_avatar_url text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  responded_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    invite.id,
    invite.sender_id,
    coalesce(nullif(sender.display_name, ''), invite.sender_display_name, sender.email, 'Ami') as sender_display_name,
    coalesce(sender.avatar_url, invite.sender_avatar_url, '') as sender_avatar_url,
    invite.recipient_id,
    coalesce(nullif(recipient.display_name, ''), invite.recipient_display_name, recipient.email, 'Ami') as recipient_display_name,
    coalesce(recipient.avatar_url, invite.recipient_avatar_url, '') as recipient_avatar_url,
    invite.status,
    invite.created_at,
    invite.updated_at,
    invite.responded_at
  from public.friend_invites invite
  left join public.profiles sender on sender.id = invite.sender_id
  left join public.profiles recipient on recipient.id = invite.recipient_id
  where invite.status in ('pending', 'accepted')
    and (
      invite.sender_id = auth.uid()
      or invite.recipient_id = auth.uid()
    )
  order by invite.created_at desc;
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
    and recipient_id = current_user_id
  for update;

  if invite.id is null then
    raise exception 'invite_not_found';
  end if;

  update public.friend_invites
  set
    status = next_status,
    updated_at = now(),
    responded_at = now()
  where id = p_invite_id
  returning * into saved;

  return saved;
end;
$$;

create or replace function public.get_friend_list()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  friend_code text,
  week_stars integer,
  current_streak integer,
  week_revisions_done integer
)
language sql
security definer
set search_path = public, auth
as $$
  with friend_ids as (
    select case
      when invite.sender_id = auth.uid() then invite.recipient_id
      else invite.sender_id
    end as user_id
    from public.friend_invites invite
    where invite.status = 'accepted'
      and (
        invite.sender_id = auth.uid()
        or invite.recipient_id = auth.uid()
      )
      and invite.recipient_id is not null
  ),
  week_anchor as (
    select date_trunc('week', now())::date as week_start
  )
  select
    profile.id,
    coalesce(nullif(profile.display_name, ''), profile.email, 'Ami') as display_name,
    coalesce(profile.avatar_url, '') as avatar_url,
    profile.friend_code,
    coalesce(stats.week_stars, 0) as week_stars,
    coalesce(stats.current_streak, 0) as current_streak,
    coalesce(stats.week_revisions_done, 0) as week_revisions_done
  from friend_ids
  join public.profiles profile on profile.id = friend_ids.user_id
  cross join week_anchor
  left join public.user_social_stats stats
    on stats.user_id = profile.id
    and stats.week_start = week_anchor.week_start
  order by display_name asc;
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
    coalesce(nullif(profile.display_name, ''), profile.email, 'Ami') as display_name,
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

revoke all on function public.get_my_friend_code() from public;
revoke all on function public.regenerate_friend_code() from public;
revoke all on function public.find_profile_by_friend_code(text) from public;
revoke all on function public.send_friend_invite_by_code(text) from public;
revoke all on function public.get_friend_invites() from public;
revoke all on function public.get_friend_list() from public;
revoke all on function public.respond_friend_invite(uuid, text) from public;
revoke all on function public.cancel_friend_invite(uuid) from public;
revoke all on function public.get_friend_leaderboard() from public;

grant execute on function public.get_my_friend_code() to authenticated;
grant execute on function public.regenerate_friend_code() to authenticated;
grant execute on function public.find_profile_by_friend_code(text) to authenticated;
grant execute on function public.send_friend_invite_by_code(text) to authenticated;
grant execute on function public.get_friend_invites() to authenticated;
grant execute on function public.get_friend_list() to authenticated;
grant execute on function public.respond_friend_invite(uuid, text) to authenticated;
grant execute on function public.cancel_friend_invite(uuid) to authenticated;
grant execute on function public.get_friend_leaderboard() to authenticated;
