import {
  BarChart3,
  Check,
  Copy,
  Crown,
  Flame,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { AppCopy } from '../../lib/i18n'
import {
  FLAME_QUEST_EFFECTS,
  FLAME_QUEST_IDS,
} from '../../lib/flameEvolution'
import type {
  AuthUserProfile,
  FlameQuestId,
  FriendCodeLookup,
  FriendInvite,
  FriendProfile,
  LeaderboardEntry,
  SocialPageTab,
} from '../../types/app'

type SocialStatsProfile = {
  userId: string
  displayName: string
  avatarUrl: string
  friendCode?: string
  weekStars: number
  currentStreak: number
  weekRevisionsDone: number
  weekRevisionDailyAverage: number
  totalStars: number
  bestStreak: number
  bestRun: number
  flameStages: FriendProfile['flameStages']
  flameQuests: FriendProfile['flameQuests']
  selectedFlameEffect: FriendProfile['selectedFlameEffect']
  isSelf: boolean
  rank?: number
}

type FriendsPageProps = {
  copy: AppCopy['friends']
  flameCopy: AppCopy['streak']
  user: AuthUserProfile | null
  profile: FriendProfile | null
  friends: FriendProfile[]
  invites: FriendInvite[]
  leaderboard: LeaderboardEntry[]
  lookup: FriendCodeLookup | null
  loading: boolean
  message: string
  onClose: () => void
  onRefresh: () => void
  onSearchCode: (code: string) => void
  onSendInviteByCode: (code: string) => void
  onRegenerateCode: () => void
  onAcceptInvite: (id: string) => void
  onDeclineInvite: (id: string) => void
  onCancelInvite: (id: string) => void
  onClearLookup: () => void
}

function Avatar({
  src,
  label,
  size = 44,
}: {
  src: string
  label: string
  size?: number
}) {
  return src ? (
    <img
      className="friends-avatar"
      src={src}
      alt=""
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="friends-avatar is-placeholder"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      {label.slice(0, 1).toLocaleUpperCase()}
    </span>
  )
}

function statTags(
  copy: AppCopy['friends'],
  values: {
    stars: number
    streak: number
    revisionAverage: number
  },
) {
  return (
    <div className="friends-stat-tags">
      <span>
        <Star size={13} strokeWidth={2} />
        {copy.stars(values.stars)}
      </span>
      <span>{copy.streak(values.streak)}</span>
      <span>{copy.revisionAverage(values.revisionAverage)}</span>
    </div>
  )
}

function relationText(copy: AppCopy['friends'], lookup: FriendCodeLookup) {
  switch (lookup.relation) {
    case 'self':
      return copy.relationSelf
    case 'friend':
      return copy.relationFriend
    case 'pending-sent':
      return copy.relationPendingSent
    case 'pending-received':
      return copy.relationPendingReceived
    default:
      return copy.lookupReady
  }
}

function selectedQuestFromEffect(profile: SocialStatsProfile): FlameQuestId | null {
  if (!profile.selectedFlameEffect) {
    return null
  }

  return (
    FLAME_QUEST_IDS.find(
      (quest) => FLAME_QUEST_EFFECTS[quest] === profile.selectedFlameEffect,
    ) ?? null
  )
}

function FriendStatsPanel({
  copy,
  flameCopy,
  profile,
  onClose,
}: {
  copy: AppCopy['friends']
  flameCopy: AppCopy['streak']
  profile: SocialStatsProfile
  onClose: () => void
}) {
  const selectedQuest = selectedQuestFromEffect(profile)
  const rows = [
    [copy.detailWeekStars, copy.stars(profile.weekStars)],
    [copy.detailTotalStars, copy.stars(profile.totalStars)],
    [copy.detailCurrentStreak, copy.streak(profile.currentStreak)],
    [copy.detailBestStreak, copy.streak(profile.bestStreak)],
    [copy.detailBestRun, copy.bestRun(profile.bestRun)],
    [copy.detailRevisionAverage, copy.revisionAverage(profile.weekRevisionDailyAverage)],
    [copy.detailWeekRevisions, copy.revisions(profile.weekRevisionsDone)],
  ]

  return (
    <div className="friend-stats-overlay" role="dialog" aria-modal="true">
      <article className="friend-stats-panel">
        <header className="friend-stats-header">
          <Avatar src={profile.avatarUrl} label={profile.displayName} size={62} />
          <div>
            <span>{profile.isSelf ? copy.you : copy.friendProfile}</span>
            <strong>{profile.displayName}</strong>
            {profile.rank ? <em>{copy.rank(profile.rank)}</em> : null}
          </div>
          <button
            className="icon-button close-button"
            type="button"
            aria-label={copy.closeDetails}
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </header>

        <table className="friend-stats-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="friend-flame-details">
          <div className="friend-flame-section">
            <span>
              <Flame size={15} strokeWidth={1.8} />
              {copy.detailAscensions}
            </span>
            <div>
              {profile.flameStages.length ? (
                profile.flameStages.map((stage) => (
                  <em className={`friend-flame-chip stage-${stage}`} key={stage}>
                    {flameCopy.stageNames[stage]}
                  </em>
                ))
              ) : (
                <small>{copy.detailNoAscension}</small>
              )}
            </div>
          </div>

          <div className="friend-flame-section">
            <span>
              <Sparkles size={15} strokeWidth={1.8} />
              {copy.detailQuests}
            </span>
            <div>
              {profile.flameQuests.length ? (
                profile.flameQuests.map((quest) => (
                  <em className="friend-flame-chip is-quest" key={quest}>
                    {flameCopy.questNames[quest]}
                  </em>
                ))
              ) : (
                <small>{copy.detailNoQuest}</small>
              )}
            </div>
          </div>

          <div className="friend-flame-section">
            <span>
              <BarChart3 size={15} strokeWidth={1.8} />
              {copy.detailActiveEffect}
            </span>
            <div>
              <em className="friend-flame-chip is-effect">
                {selectedQuest
                  ? flameCopy.questNames[selectedQuest]
                  : flameCopy.noSecretEffect}
              </em>
            </div>
          </div>
        </section>
      </article>
    </div>
  )
}

export function FriendsPage({
  copy: copyText,
  flameCopy,
  user,
  profile,
  friends,
  invites,
  leaderboard,
  lookup,
  loading,
  message,
  onClose,
  onRefresh,
  onSearchCode,
  onSendInviteByCode,
  onRegenerateCode,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onClearLookup,
}: FriendsPageProps) {
  const [tab, setTab] = useState<SocialPageTab>('leaderboard')
  const [friendCode, setFriendCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null)
  const friendSearchRef = useRef<HTMLInputElement | null>(null)
  const received = useMemo(
    () =>
      invites.filter(
        (invite) =>
          invite.status === 'pending' &&
          invite.recipientId === user?.id,
      ),
    [invites, user],
  )
  const sent = useMemo(
    () =>
      invites.filter(
        (invite) => invite.status === 'pending' && invite.senderId === user?.id,
      ),
    [invites, user],
  )
  const topThree = leaderboard.slice(0, 3)
  const rest = leaderboard.slice(3)
  const maxStars = Math.max(1, ...leaderboard.map((entry) => entry.totalStars))
  const messageText = message ? copyText.message(message) : ''
  const friendCodeAvailable = Boolean(profile?.friendCode)
  const friendSearchAvailable = Boolean(user) && friendCodeAvailable
  const selfDetails = useMemo<SocialStatsProfile | null>(() => {
    const leaderboardSelf = leaderboard.find((entry) => entry.isSelf)

    return leaderboardSelf ?? profile
  }, [leaderboard, profile])
  const detailProfiles = useMemo(() => {
    const profiles = new Map<string, SocialStatsProfile>()

    if (profile) {
      profiles.set(profile.userId, profile)
    }

    friends.forEach((friend) => profiles.set(friend.userId, friend))
    leaderboard.forEach((entry) => profiles.set(entry.userId, entry))

    return profiles
  }, [friends, leaderboard, profile])
  const detailProfile = detailProfileId
    ? detailProfiles.get(detailProfileId) ?? null
    : null

  const copyCode = () => {
    const code = profile?.friendCode ?? ''

    if (!code) {
      return
    }

    void navigator.clipboard?.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const regenerateCode = () => {
    if (window.confirm(copyText.regenerateConfirm)) {
      onRegenerateCode()
    }
  }

  const focusFriendSearch = () => {
    friendSearchRef.current?.focus()
    friendSearchRef.current?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    })
  }

  return (
    <section className="friends-page" aria-label={copyText.title}>
      <div className="friends-page-shell">
        <header className="friends-page-header">
          <div className="friends-page-title">
            <span className="friends-page-emblem">
              <Users size={23} strokeWidth={1.9} />
            </span>
            <div>
              <h2>{copyText.title}</h2>
              <p>{copyText.pageSubtitle}</p>
            </div>
          </div>

          <div className="friends-page-tabs" role="tablist">
            {[
              ['leaderboard', copyText.tabLeaderboard],
              ['friends', copyText.tabFriends],
              ['requests', copyText.tabRequests],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'is-selected' : ''}
                onClick={() => setTab(id as SocialPageTab)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            className="icon-button close-button"
            type="button"
            aria-label={copyText.close}
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </header>

        {!user ? (
          <div className="friends-page-empty">
            <UserRound size={34} strokeWidth={1.8} />
            <strong>{copyText.title}</strong>
            <span>{copyText.signedOut}</span>
          </div>
        ) : (
          <div className="friends-page-content">
            <aside className="friends-profile-panel">
              <div className="friends-profile-card">
                <button
                  className="friends-profile-identity"
                  type="button"
                  onClick={() => {
                    if (selfDetails) {
                      setDetailProfileId(selfDetails.userId)
                    }
                  }}
                >
                  <Avatar
                    src={profile?.avatarUrl || user.avatarUrl}
                    label={profile?.displayName || user.displayName}
                    size={58}
                  />
                  <span>
                    <small>{copyText.you}</small>
                    <strong>{profile?.displayName || user.displayName}</strong>
                  </span>
                </button>
                <button
                  className="quiet-icon"
                  type="button"
                  aria-label={copyText.refresh}
                  onClick={onRefresh}
                  disabled={loading}
                >
                  <RefreshCcw size={15} strokeWidth={1.9} />
                </button>
              </div>

              <div className="friends-code-card">
                <span>{copyText.myCode}</span>
                <strong
                  className={friendCodeAvailable ? undefined : 'is-unavailable'}
                >
                  {friendCodeAvailable
                    ? profile?.friendCode
                    : copyText.friendCodeUnavailable}
                </strong>
                <div>
                  <button
                    className="ghost-action small"
                    type="button"
                    onClick={copyCode}
                    disabled={!friendCodeAvailable}
                  >
                    <Copy size={13} strokeWidth={2} />
                    {copied ? copyText.copied : copyText.copyCode}
                  </button>
                  <button
                    className="ghost-action small"
                    type="button"
                    onClick={regenerateCode}
                    disabled={loading || !friendCodeAvailable}
                  >
                    <RotateCcw size={13} strokeWidth={2} />
                    {copyText.regenerateCode}
                  </button>
                </div>
              </div>

              <form
                className="friends-code-search"
                onSubmit={(event) => {
                  event.preventDefault()
                  const value = friendCode.trim()

                  if (value && friendSearchAvailable) {
                    onSearchCode(value)
                  }
                }}
              >
                <label>
                  <span>{copyText.searchTitle}</span>
                  <input
                    ref={friendSearchRef}
                    value={friendCode}
                    placeholder={copyText.searchPlaceholder}
                    disabled={!friendSearchAvailable}
                    onChange={(event) => {
                      setFriendCode(event.target.value)
                      onClearLookup()
                    }}
                  />
                </label>
                <button
                  className="gold-action small"
                  type="submit"
                  disabled={loading || !friendSearchAvailable}
                >
                  <Search size={13} strokeWidth={2} />
                  {copyText.searchAction}
                </button>
              </form>

              {lookup ? (
                <article className={`friends-lookup relation-${lookup.relation}`}>
                  <Avatar src={lookup.avatarUrl} label={lookup.displayName} />
                  <div>
                    <strong>{lookup.displayName}</strong>
                    <span>{relationText(copyText, lookup)}</span>
                  </div>
                  {lookup.relation === 'none' ? (
                    <button
                      className="gold-action small"
                      type="button"
                      disabled={loading}
                      onClick={() => onSendInviteByCode(lookup.friendCode)}
                    >
                      <Send size={13} strokeWidth={2} />
                      {copyText.sendInvite}
                    </button>
                  ) : null}
                </article>
              ) : null}

              {messageText ? (
                <div className="friends-page-message">
                  <span>{messageText}</span>
                  <button className="quiet-icon" type="button" onClick={onRefresh}>
                    <RefreshCcw size={14} strokeWidth={1.9} />
                  </button>
                </div>
              ) : null}
            </aside>

            <main className="friends-main-panel">
              {tab === 'leaderboard' ? (
                <div className="friends-leaderboard-view">
                  <div className="friends-leaderboard-hero">
                    <div>
                      <span>{copyText.leaderboard}</span>
                      <strong>{copyText.leaderboardHero}</strong>
                    </div>
                    <Trophy size={38} strokeWidth={1.6} />
                  </div>

                  {leaderboard.length ? (
                    <>
                      <div className="friends-podium">
                        {topThree.map((entry) => (
                          <button
                            type="button"
                            key={entry.userId}
                            className={`friends-podium-card rank-${entry.rank}${entry.isSelf ? ' is-self' : ''}`}
                            onClick={() => setDetailProfileId(entry.userId)}
                          >
                            <span className="friends-rank-badge">
                              {entry.rank === 1 ? (
                                <Crown size={16} strokeWidth={2} />
                              ) : (
                                copyText.rank(entry.rank)
                              )}
                            </span>
                            <Avatar
                              src={entry.avatarUrl}
                              label={entry.displayName}
                              size={56}
                            />
                            <strong>{entry.displayName}</strong>
                            {entry.isSelf ? <em>{copyText.you}</em> : null}
                            {statTags(copyText, {
                              stars: entry.totalStars,
                              streak: entry.currentStreak,
                              revisionAverage: entry.weekRevisionDailyAverage,
                            })}
                          </button>
                        ))}
                      </div>

                      <div className="friends-ranking-list">
                        {rest.map((entry) => (
                          <button
                            type="button"
                            key={entry.userId}
                            className={`friends-ranking-row${entry.isSelf ? ' is-self' : ''}`}
                            onClick={() => setDetailProfileId(entry.userId)}
                          >
                            <span className="friends-row-rank">
                              {copyText.rank(entry.rank)}
                            </span>
                            <Avatar
                              src={entry.avatarUrl}
                              label={entry.displayName}
                              size={42}
                            />
                            <div className="friends-row-main">
                              <strong>
                                {entry.displayName}
                                {entry.isSelf ? <em>{copyText.you}</em> : null}
                              </strong>
                              <div className="friends-progress-track">
                                <span
                                  style={{
                                    width: `${Math.max(
                                      8,
                                      (entry.totalStars / maxStars) * 100,
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                            {statTags(copyText, {
                              stars: entry.totalStars,
                              streak: entry.currentStreak,
                              revisionAverage: entry.weekRevisionDailyAverage,
                            })}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="friends-empty-card">
                      <Sparkles size={24} strokeWidth={1.8} />
                      <strong>{copyText.emptyLeaderboard}</strong>
                      <span>{copyText.emptyLeaderboardHint}</span>
                      <div className="friends-empty-actions">
                        <button
                          className="gold-action small"
                          type="button"
                          onClick={copyCode}
                          disabled={!friendCodeAvailable}
                        >
                          <Copy size={13} strokeWidth={2} />
                          {copied ? copyText.copied : copyText.copyCode}
                        </button>
                        <button
                          className="ghost-action small"
                          type="button"
                          onClick={focusFriendSearch}
                          disabled={!friendSearchAvailable}
                        >
                          <Search size={13} strokeWidth={2} />
                          {copyText.searchAction}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {tab === 'friends' ? (
                <div className="friends-list-view">
                  <div className="friends-section-heading">
                    <strong>{copyText.friendsCount(friends.length)}</strong>
                    <span>{copyText.subtitle}</span>
                  </div>
                  {friends.length ? (
                    friends.map((friend) => (
                      <button
                        type="button"
                        key={friend.userId}
                        className="friends-card-row"
                        onClick={() => setDetailProfileId(friend.userId)}
                      >
                        <Avatar src={friend.avatarUrl} label={friend.displayName} />
                        <div>
                          <strong>{friend.displayName}</strong>
                          <span>{friend.friendCode}</span>
                        </div>
                        {statTags(copyText, {
                          stars: friend.totalStars,
                          streak: friend.currentStreak,
                          revisionAverage: friend.weekRevisionDailyAverage,
                        })}
                      </button>
                    ))
                  ) : (
                    <div className="friends-empty-card">
                      <Users size={24} strokeWidth={1.8} />
                      <strong>{copyText.emptyFriends}</strong>
                      <span>{copyText.emptyFriendsHint}</span>
                      <div className="friends-empty-actions">
                        <button
                          className="gold-action small"
                          type="button"
                          onClick={copyCode}
                          disabled={!friendCodeAvailable}
                        >
                          <Copy size={13} strokeWidth={2} />
                          {copied ? copyText.copied : copyText.copyCode}
                        </button>
                        <button
                          className="ghost-action small"
                          type="button"
                          onClick={focusFriendSearch}
                          disabled={!friendSearchAvailable}
                        >
                          <Search size={13} strokeWidth={2} />
                          {copyText.searchAction}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {tab === 'requests' ? (
                <div className="friends-requests-view">
                  <section>
                    <h3>{copyText.pendingReceived}</h3>
                    {received.length ? (
                      received.map((invite) => (
                        <article key={invite.id} className="friends-request-row">
                          <Avatar
                            src={invite.senderAvatarUrl}
                            label={invite.senderDisplayName}
                          />
                          <strong>{invite.senderDisplayName}</strong>
                          <div>
                            <button
                              className="gold-action small"
                              type="button"
                              onClick={() => onAcceptInvite(invite.id)}
                              disabled={loading}
                            >
                              <Check size={13} strokeWidth={2} />
                              {copyText.accept}
                            </button>
                            <button
                              className="ghost-action small"
                              type="button"
                              onClick={() => onDeclineInvite(invite.id)}
                              disabled={loading}
                            >
                              <X size={13} strokeWidth={2} />
                              {copyText.decline}
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="friends-empty-card is-compact">
                        {copyText.emptyReceivedRequests}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3>{copyText.pendingSent}</h3>
                    {sent.length ? (
                      sent.map((invite) => (
                        <article key={invite.id} className="friends-request-row">
                          <Avatar
                            src={invite.recipientAvatarUrl}
                            label={invite.recipientDisplayName}
                          />
                          <strong>{invite.recipientDisplayName}</strong>
                          <button
                            className="ghost-action small"
                            type="button"
                            onClick={() => onCancelInvite(invite.id)}
                            disabled={loading}
                          >
                            <X size={13} strokeWidth={2} />
                            {copyText.cancel}
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="friends-empty-card is-compact">
                        {copyText.emptySentRequests}
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
            </main>

            {detailProfile ? (
              <FriendStatsPanel
                copy={copyText}
                flameCopy={flameCopy}
                profile={detailProfile}
                onClose={() => setDetailProfileId(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
