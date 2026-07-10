-- Qualify the profile column: friend_code is also an OUT parameter of this
-- RETURNS TABLE function, so an unqualified reference fails at runtime.
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

  select target.*
  into target_profile
  from public.profiles target
  where public.msp_normalize_friend_code(target.friend_code) = normalized_code
  limit 1;

  if target_profile.id is null then
    raise exception 'friend_code_not_found';
  end if;

  if target_profile.id = current_user_id then
    current_relation := 'self';
  else
    select invite.*
    into existing
    from public.friend_invites invite
    where invite.status in ('pending', 'accepted')
      and (
        (invite.sender_id = current_user_id and invite.recipient_id = target_profile.id)
        or (invite.sender_id = target_profile.id and invite.recipient_id = current_user_id)
      )
    order by invite.created_at desc
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

revoke all on function public.find_profile_by_friend_code(text) from public;
grant execute on function public.find_profile_by_friend_code(text) to authenticated;

notify pgrst, 'reload schema';
