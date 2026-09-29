'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/components/wallet/wallet-provider';
import { getScores, type PeopleCounts } from '@/lib/reputation';
import {
  getPeopleCounts,
  fetchVouchersOf,
  fetchBackedBy,
  mutualNeighbours,
  timeAgo,
  type VoucherStar,
} from '@/lib/constellation';
import { resolveHandle, getMeta, type OnChainMeta } from '@/lib/registry';
import { fetchReputationEvents, EVENT_LEDGER_WINDOW } from '@/lib/events';
import { reverseHandles } from '@/lib/registry';
import { useTranslations } from '@/lib/i18n';
import { Crest } from '@/components/brand/crest';
import { Avatar } from '@/components/Avatar';
import { Frame } from '@/components/fx/frame';
import { Stamp } from '@/components/fx/stamp';
import { ShareRow } from '@/components/fx/share-row';
import { BadgeGallery } from '@/components/BadgeGallery';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { shortAddr } from '@alvinmunk/shared';
import { cn } from '@/lib/utils';
import { readNetworkFor, withReadNetwork } from '@/lib/read-network';
import { ReadOnlyBanner } from '@/components/read-only-banner';

/**
 * Public profile. The handle is resolved ON-CHAIN via the registry, so ANY claimed
 * @handle renders for anyone (the share-link target). Falls back to an honest "unclaimed"
 * state for free handles. `?network=testnet` on a mainnet deployment shows the testnet
 * profile, read-only (lib/read-network).
 */
export default function ProfilePage({
  params,
  searchParams,
}: {
  params: { handle: string };
  searchParams?: { network?: string | string[] };
}) {
  const handle = params.handle.toLowerCase();
  // A shared singleton (or null), so it is a stable effect dependency.
  const net = readNetworkFor(searchParams?.network);
  const { profile } = useWallet();
  const [address, setAddress] = useState<string | null | undefined>(undefined); // undefined = loading
  const [scores, setScores] = useState<{ social: number; earned: number } | null>(null);
  const [people, setPeople] = useState<PeopleCounts | null>(null);
  const [meta, setMeta] = useState<OnChainMeta | null>(null);
  // The vouch network behind the numbers: null = still reading (never rendered as empty).
  const [vouchers, setVouchers] = useState<VoucherStar[] | null>(null);
  const [backed, setBacked] = useState<VoucherStar[] | null>(null);
  const [mutual, setMutual] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    setAddress(undefined);
    setScores(null);
    setPeople(null);
    setMeta(null);
    setVouchers(null);
    setBacked(null);
    setMutual(null);
    resolveHandle(handle)
    resolveHandle(handle, net)
      .then(async (addr) => {
        if (!alive) return;
        setAddress(addr);
        if (!addr) return;
        // One shared event scan feeds the stacks AND the mutual row; every other read is
        // already shared in-flight with the widgets mounted around this page.
        const eventsPromise = fetchReputationEvents();
        // `fetchBackedBy` shares the scan the vouchers call just warmed.
        const backedPromise = eventsPromise.then(() => fetchBackedBy(addr)).catch(() => []);
        // The viewer's own neighbours — only needed for the mutual row, and only when
        // someone else is looking: on your own profile the two sets are the same.
        const mutualPromise =
          profile?.address && profile.address !== addr
            ? eventsPromise.then((events) => mutualNeighbours(profile.address!, addr, events))
            : Promise.resolve([] as string[]);
        const [s, p, m, mine, v, b] = await Promise.all([
          getScores(addr).catch(() => ({ social: 0, earned: 0 })),
          getPeopleCounts(addr).catch(() => ({ vouchedBy: 0, backed: 0 })),
          getMeta(addr), // null (default face, no bio) when unset or the registry predates it
          mutualPromise,
          // The stacks render from the SAME event fold the counts come from, so the faces
          // never disagree with the numbers above them. A read failure resolves [] only
          // after the null→set state has shown; null keeps the skeleton, never "empty".
          fetchVouchersOf(addr).catch(() => [] as VoucherStar[]),
          backedPromise,
        const [s, p, m] = await Promise.all([
          getScores(addr, net).catch(() => ({ social: 0, earned: 0 })),
          getPeopleCounts(addr, net).catch(() => ({ vouchedBy: 0, backed: 0 })),
          getMeta(addr, net), // null (default face, no bio) when unset or the registry predates it
        ]);
        if (!alive) return;
        setScores(s);
        setPeople(p);
        setMeta(m);
        setMutual(mine);
        setVouchers(v);
        setBacked(b);
      })
      .catch(() => alive && setAddress(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `profile` identity changes on every wallet event; key the reads on the address
  }, [handle, profile?.address]);
  }, [handle, net]);

  // The signed-in profile lives on the deployment's network, never the override's.
  const isMe = !net && !!address && profile?.address === address;
  // The published face/bio for everyone; on your own profile the local copy (updated the
  // moment you pick, before the tx lands) wins.
  const avatar = (isMe ? profile?.avatar : undefined) ?? meta?.avatar;
  const bio = (isMe ? profile?.bio : undefined) ?? meta?.bio;

  if (address === undefined) {
    return (
      <div className="container max-w-2xl py-14">
        <Frame label={`profile // @${handle}`} index="…">
          <div className="flex items-center gap-6 p-8">
            <Skeleton className="size-32 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        </Frame>
      </div>
    );
  }

  if (address === null) {
    return (
      <div className="container max-w-md py-24">
        {net && <ReadOnlyBanner network={net.network} />}
        <Frame label={`profile // @${handle}`} index="FREE">
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <Crest address={`unclaimed-${handle}`} size={120} points={5} />
            <h1 className="font-display text-2xl font-semibold">@{handle}</h1>
            {net ? (
              <p className="text-sm text-muted-foreground text-balance">
                Nobody held this handle on {net.network}.
              </p>
            ) : (
              <>
                <p className="font-mono text-xs uppercase tracking-wider text-secondary">available</p>
                <p className="text-sm text-muted-foreground text-balance">
                  This handle isn&apos;t claimed yet. Open the app, pick it, and it stamps to chain as
                  your profile ID.
                </p>
                <Link href="/app" className={cn(buttonVariants({ variant: 'flow' }))}>
                  Claim @{handle}
                </Link>
              </>
            )}
          </div>
        </Frame>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-14">
      {net && <ReadOnlyBanner network={net.network} />}
      <Frame label={`profile // @${handle}`} index={net ? net.network.toUpperCase() : 'ID'} tilt>
        <div className="grid gap-6 p-7 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
          <Avatar address={address} avatar={avatar} handle={handle} size={140} />
          <div>
            <h1 className="font-display text-3xl font-semibold">@{handle}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{shortAddr(address)}</p>
            {bio && <p className="mt-2 break-words text-sm text-foreground/80">{bio}</p>}
            <div className="mt-3">
              <Stamp accent="secondary">✦ LIT ON STELLAR</Stamp>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60">
          <Field label="VOUCHED_BY" value={people?.vouchedBy} accent="primary" />
          <Field label="BACKED" value={people?.backed} accent="tertiary" />
          <Field label="EARNED_XP" value={scores?.earned} accent="secondary" />
        </div>
      </Frame>

      {/* Milestone badges — earned + next-to-earn, on every public profile. They read the
          quest and rewards contracts too, which the override doesn't cover. */}
      {!net && (
        <div className="mt-5">
          <BadgeGallery address={address} />
        </div>
      )}

      {/* The vouch network behind the numbers — who vouched, whom they backed, who you share */}
      <VouchNetwork
        address={address}
        handle={handle}
        isMe={isMe}
        vouchedByCount={people?.vouchedBy}
        backedCount={people?.backed}
        vouchers={vouchers}
        backed={backed}
        mutual={mutual}
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Read-only on the override: no vouch (or any other write) from here. */}
        {!net && (
          <Link href="/app" className={cn(buttonVariants({ variant: 'flow' }))}>
            {isMe ? 'Vouch someone' : `Vouch @${handle}`}
          </Link>
        )}
        <Link
          href={withReadNetwork('/leaderboard', net)}
          className={cn(buttonVariants({ variant: 'outline' }), 'glass')}
        >
          Leaderboard
        </Link>
        <ShareRow
          path={withReadNetwork(`/u/${handle}`, net)}
          text={
            isMe
              ? 'My constellation on alvinmunk — collect people, not points.'
              : `@${handle} on alvinmunk — collect people, not points.`
          }
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value?: number;
  accent: 'primary' | 'secondary' | 'tertiary';
}) {
  const c =
    accent === 'primary'
      ? 'text-primary'
      : accent === 'secondary'
        ? 'text-secondary'
        : 'text-tertiary';
  return (
    <div className="p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className={cn('mt-2 font-display text-3xl font-semibold', c)}>{value}</p>
      )}
    </div>
  );
}

// ── The vouch network ─────────────────────────────────────────────────────────

/** Faces shown per stack before an overflow chip takes over. */
const STACK_MAX = 8;

/**
 * The people behind the stat row: who vouched for this profile, whom they backed, and —
 * when the viewer holds a profile and the sets intersect — who they both know. Handles are
 * batch-resolved once for every face on the page and each face links to its own profile.
 * `null` lists are still reading (skeleton); `[]` really is nobody, and says so honestly.
 */
function VouchNetwork({
  address,
  handle,
  isMe,
  vouchedByCount,
  backedCount,
  vouchers,
  backed,
  mutual,
}: {
  address: string;
  handle: string;
  isMe: boolean;
  vouchedByCount?: number;
  backedCount?: number;
  vouchers: VoucherStar[] | null;
  backed: VoucherStar[] | null;
  mutual: string[] | null;
}) {
  const t = useTranslations();
  const [handles, setHandles] = useState<Record<string, string | null>>({});

  // One batched `reverse_many` for every address any row might name — the ActivityFeed
  // pattern — and never re-asked for an address already looked up.
  useEffect(() => {
    const wanted = [...(vouchers ?? []), ...(backed ?? []), ...(mutual ?? [])].map((p) =>
      typeof p === 'string' ? p : p.from,
    );
    const addrs = [...new Set(wanted)].filter((a) => a && !(a in handles));
    if (addrs.length === 0) return;
    let alive = true;
    reverseHandles(addrs).then((map) => alive && setHandles((h) => ({ ...h, ...map })));
    return () => {
      alive = false;
    };
  }, [vouchers, backed, mutual, handles]);

  const name = (a: string) => handles[a] || shortAddr(a);

  return (
    <Frame label={`network // @${handle}`} index="◍" className="mt-5">
      <div className="divide-y divide-border/50">
        <FaceRow
          label={
            isMe
              ? t('vouchNetwork.vouchedBy.me')
              : t('vouchNetwork.vouchedBy.them', { handle: `@${handle}` })
          }
          count={vouchedByCount}
          people={vouchers}
          accent="text-primary"
          name={name}
          handles={handles}
        />
        <FaceRow
          label={
            isMe
              ? t('vouchNetwork.backed.me')
              : t('vouchNetwork.backed.them', { handle: `@${handle}` })
          }
          count={backedCount}
          people={backed}
          accent="text-tertiary"
          name={name}
          handles={handles}
        />
        {/* Mutual: only when the viewer has a profile and the sets intersect — the same
            condition the spec asks for, checked before the row exists at all. */}
        {mutual !== null && mutual.length > 0 && (
          <div className="p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('vouchNetwork.mutual.label')}
            </p>
            <p className="mt-2 text-sm text-foreground/90">
              {t('vouchNetwork.mutual.body')}{' '}
              <span className="font-mono text-secondary">
                {mutual.map((a) => `@${name(a)}`).join(' ')}
              </span>
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {mutual.map((a) => (
                <FaceLink
                  key={a}
                  address={a}
                  label={name(a)}
                  handle={handles[a] ?? null}
                  size={26}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {/* The event source is the RPC window — say so, and never overclaim. */}
      <p className="border-t border-border/50 px-5 py-3 text-[11px] text-muted-foreground">
        {t('vouchNetwork.windowNote')}
      </p>
    </Frame>
  );
}

/** One labelled row: an avatar stack of faces with handles, and the durable count. */
function FaceRow({
  label,
  count,
  people,
  accent,
  name,
  handles,
}: {
  label: string;
  count?: number;
  people: VoucherStar[] | null;
  accent: string;
  name: (a: string) => string;
  handles: Record<string, string | null>;
}) {
  const t = useTranslations();
  return (
    <div className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        {count !== undefined && (
          <p className={cn('font-display text-sm font-semibold', accent)} aria-hidden>
            {count}
          </p>
        )}
      </div>
      {people === null ? (
        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="size-8 rounded-full" />
          ))}
        </div>
      ) : people.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('vouchNetwork.empty')}</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {people.slice(0, STACK_MAX).map((p) => (
              <li key={`${p.from}-${p.vouchId}`}>
                <FaceLink
                  address={p.from}
                  label={name(p.from)}
                  handle={handles[p.from] ?? null}
                  size={32}
                  note={p.note}
                  when={timeAgo(p.created)}
                />
              </li>
            ))}
          </ul>
          {people.length > STACK_MAX && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              +{people.length - STACK_MAX} {t('vouchNetwork.more')}
            </p>
          )}
          <ul className="mt-2 space-y-0.5">
            {people.slice(0, STACK_MAX).map((p) => (
              <li
                key={`n-${p.from}-${p.vouchId}`}
                className="truncate font-mono text-[11px] text-muted-foreground"
              >
                <span className="text-foreground/80">@{name(p.from)}</span>
                {p.note ? ` — “${p.note}”` : ''}
                {p.created ? ` · ${timeAgo(p.created)}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A face that links to its profile when the handle is claimed; tooltip carries note + when. */
function FaceLink({
  address,
  label,
  handle,
  size,
  note,
  when,
}: {
  address: string;
  label: string;
  /** The claimed @handle, or null — an unclaimed address has no /u route to link to. */
  handle: string | null;
  size: number;
  note?: string;
  when?: string;
}) {
  const title = [label, note ? `— “${note}”` : '', when].filter(Boolean).join(' ');
  const face = <Avatar address={address} handle={handle ?? undefined} size={size} />;
  if (!handle) {
    return (
      <span title={title} className="block cursor-default rounded-full">
        {face}
      </span>
    );
  }
  return (
    <Link
      href={`/u/${handle}`}
      title={title}
      aria-label={title}
      className="block rounded-full transition-transform hover:scale-110"
    >
      {face}
    </Link>
  );
}
