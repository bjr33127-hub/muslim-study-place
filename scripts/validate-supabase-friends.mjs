const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim()
const projectUrl = process.env.VITE_SUPABASE_URL?.trim()

if (!accessToken || !projectUrl) {
  throw new Error('SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL are required.')
}

const projectRef = new URL(projectUrl).hostname.split('.')[0]
const sourceCode = 'MSP-F0FD-FCFB'
const targetCode = 'MSP-B6C7-1738'
const query = `
begin;

create temporary table msp_friend_flow_test as
select
  source.id as source_id,
  source.email as source_email,
  target.id as target_id,
  false as created_invite,
  null::uuid as invite_id
from public.profiles source
cross join public.profiles target
where public.msp_normalize_friend_code(source.friend_code) = public.msp_normalize_friend_code('${sourceCode}')
  and public.msp_normalize_friend_code(target.friend_code) = public.msp_normalize_friend_code('${targetCode}');

do $$
begin
  if (select count(*) from msp_friend_flow_test) <> 1 then
    raise exception 'friend_test_profiles_not_found';
  end if;

  if exists (select 1 from msp_friend_flow_test where source_id = target_id) then
    raise exception 'friend_test_requires_two_profiles';
  end if;
end $$;

grant all on msp_friend_flow_test to authenticated;

select set_config('request.jwt.claim.sub', source_id::text, true)
from msp_friend_flow_test;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', source_id, 'email', source_email, 'role', 'authenticated')::text,
  true
)
from msp_friend_flow_test;

set local role authenticated;

insert into public.user_social_stats (
  user_id,
  week_start,
  week_stars,
  current_streak,
  week_revisions_done,
  week_revision_daily_average,
  total_stars,
  best_streak,
  best_run,
  flame_stages,
  flame_quests,
  selected_flame_effect,
  updated_at
)
select
  source_id,
  date_trunc('week', now())::date,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  '{}'::text[],
  '{}'::text[],
  null,
  now()
from msp_friend_flow_test
on conflict (user_id) do update set updated_at = excluded.updated_at;

do $$
declare
  lookup record;
  saved public.friend_invites;
  had_active_invite boolean;
begin
  select * into lookup
  from public.find_profile_by_friend_code('${targetCode}');

  if lookup.user_id <> (select target_id from msp_friend_flow_test) then
    raise exception 'friend_lookup_returned_wrong_profile';
  end if;

  select exists (
    select 1
    from public.friend_invites invite
    join msp_friend_flow_test context
      on (invite.sender_id = context.source_id and invite.recipient_id = context.target_id)
      or (invite.sender_id = context.target_id and invite.recipient_id = context.source_id)
    where invite.status in ('pending', 'accepted')
  ) into had_active_invite;

  if lookup.relation = 'none' then
    select * into saved
    from public.send_friend_invite_by_code('${targetCode}');

    update msp_friend_flow_test
    set created_invite = not had_active_invite, invite_id = saved.id;

    select * into lookup
    from public.find_profile_by_friend_code('${targetCode}');

    if lookup.relation <> 'pending-sent' then
      raise exception 'friend_invite_relation_not_updated: %', lookup.relation;
    end if;

    if not exists (
      select 1 from public.get_friend_invites() invite where invite.id = saved.id
    ) then
      raise exception 'friend_invite_missing_from_requests';
    end if;
  elsif lookup.relation not in ('pending-sent', 'pending-received', 'friend') then
    raise exception 'friend_lookup_invalid_relation: %', lookup.relation;
  end if;
end $$;

reset role;

delete from public.friend_invites
where id = (select invite_id from msp_friend_flow_test where created_invite);

rollback;

select '${sourceCode}' as source_code, '${targetCode}' as target_code, 'passed' as status;
`

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  },
)

const body = await response.text()

if (!response.ok) {
  throw new Error(`Supabase friends validation ${response.status}: ${body}`)
}

const result = JSON.parse(body)
const rows = Array.isArray(result) ? result : result?.result
const passed = Array.isArray(rows)
  ? rows.some((row) => row?.status === 'passed')
  : false

if (!passed) {
  throw new Error(`Unexpected Supabase friends validation response: ${body}`)
}

console.log(`Friends flow passed: ${sourceCode} -> ${targetCode}`)
