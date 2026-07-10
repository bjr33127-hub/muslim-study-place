-- Keep every friendship pair in one active state. Older manual deployments could
-- create reciprocal pending rows before the code-based invitation RPCs existed.
with ranked_active_invites as (
  select
    id,
    row_number() over (
      partition by least(sender_id, recipient_id), greatest(sender_id, recipient_id)
      order by
        case when status = 'accepted' then 0 else 1 end,
        created_at desc,
        id
    ) as duplicate_rank
  from public.friend_invites
  where recipient_id is not null
    and status in ('pending', 'accepted')
)
update public.friend_invites invite
set
  status = 'cancelled',
  updated_at = now()
from ranked_active_invites ranked
where invite.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists friend_invites_active_pair_key
  on public.friend_invites (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id)
  )
  where recipient_id is not null
    and status in ('pending', 'accepted');

-- All mutations go through RPCs that validate auth.uid(). Direct row updates
-- previously allowed either participant to rewrite unrelated invite columns.
drop policy if exists "friend invites participant updates" on public.friend_invites;
revoke insert, update, delete on public.friend_invites from authenticated;
grant select on public.friend_invites to authenticated;

revoke all on function public.send_friend_invite_by_code(text) from public;
revoke all on function public.get_friend_invites() from public;
revoke all on function public.respond_friend_invite(uuid, text) from public;
revoke all on function public.cancel_friend_invite(uuid) from public;

grant execute on function public.send_friend_invite_by_code(text) to authenticated;
grant execute on function public.get_friend_invites() to authenticated;
grant execute on function public.respond_friend_invite(uuid, text) to authenticated;
grant execute on function public.cancel_friend_invite(uuid) to authenticated;

-- Make newly created/updated RPC signatures immediately visible to PostgREST.
notify pgrst, 'reload schema';
