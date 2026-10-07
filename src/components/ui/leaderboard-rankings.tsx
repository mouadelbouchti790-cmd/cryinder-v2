import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  EllipsisIcon,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

export interface LeaderboardRankingItem {
  userId: string;
  userName: string | null;
  rank: number;
  value: number;
  byline?: string | null;
  avatarUrl?: string | null;
  rankChange?: number;
  displayed?: boolean;
}

interface LeaderboardRankingsProps extends React.HTMLAttributes<HTMLDivElement> {
  rankings: LeaderboardRankingItem[];
  onUserClick?: (ranking: LeaderboardRankingItem) => void;
  currentUserId?: string | null;
  showPagination?: boolean;
  defaultPageSize?: 10 | 25 | 50 | 100;
}

const crownColorMap = {
  1: 'text-yellow-400',
  2: 'text-gray-400',
  3: 'text-amber-600',
} as const;

const pageSizeOptions = [10, 25, 50, 100] as const;

type LeaderboardRow =
  | { type: 'ranking'; ranking: LeaderboardRankingItem }
  | { type: 'ellipsis'; key: string };

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

function formatLeaderboardValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

const LeaderboardRankings = React.forwardRef<
  HTMLDivElement,
  LeaderboardRankingsProps
>(({
  className,
  rankings,
  onUserClick,
  currentUserId,
  showPagination = false,
  defaultPageSize = 10,
  ...props
}, ref) => {
  const [pageSize, setPageSize] = React.useState<10 | 25 | 50 | 100>(defaultPageSize);
  const [currentPage, setCurrentPage] = React.useState(1);

  const totalPages = Math.max(1, Math.ceil(rankings.length / pageSize));

  React.useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedRankings = showPagination
    ? rankings.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : rankings;

  const rows = React.useMemo<LeaderboardRow[]>(() => {
    const nextRows: LeaderboardRow[] = [];
    let hiddenRunCount = 0;

    pagedRankings.forEach((ranking, index) => {
      const isDisplayed = ranking.displayed !== false;
      if (!isDisplayed) {
        hiddenRunCount += 1;
        return;
      }

      if (hiddenRunCount > 0) {
        nextRows.push({ type: 'ellipsis', key: `ellipsis-${index}` });
        hiddenRunCount = 0;
      }

      nextRows.push({ type: 'ranking', ranking });
    });

    if (hiddenRunCount > 0) {
      nextRows.push({ type: 'ellipsis', key: 'ellipsis-tail' });
    }

    return nextRows;
  }, [pagedRankings]);

  return (
    <div
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-white/[0.06] bg-[#050505]',
        className
      )}
      {...props}
    >
      <div
        role="list"
        aria-label="Leaderboard rankings"
        className="divide-y divide-white/[0.06]"
      >
        {rows.map((row) => {
          if (row.type === 'ellipsis') {
            return (
              <div
                key={row.key}
                role="listitem"
                aria-label="Collapsed leaderboard rows"
                className="flex items-center justify-center px-4 py-2 text-white/30"
              >
                <EllipsisIcon className="h-5 w-5" />
              </div>
            );
          }

          const ranking = row.ranking;
          const displayName =
            ranking.userName || `User ${ranking.userId.slice(0, 6)}`;
          const showCrown = ranking.rank <= 3;
          const crownColor = crownColorMap[ranking.rank as 1 | 2 | 3];
          const isCurrentUser = currentUserId === ranking.userId;

          return (
            <div
              key={ranking.userId}
              role="listitem"
              tabIndex={onUserClick ? 0 : undefined}
              onClick={() => onUserClick?.(ranking)}
              onKeyDown={
                onUserClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onUserClick(ranking);
                      }
                    }
                  : undefined
              }
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors',
                isCurrentUser &&
                  'rounded-md border-2 border-white/[0.15] bg-white/[0.04]',
                onUserClick &&
                  'hover:bg-white/[0.04] cursor-pointer transition-colors'
              )}
            >
              <div className="flex w-14 items-center justify-center gap-1">
                <span className="w-5 shrink-0 text-right text-sm font-extrabold tabular-nums text-white/75">
                  {ranking.rank}
                </span>
                {showCrown ? (
                  <Crown className={cn('h-4 w-4 shrink-0', crownColor)} aria-hidden="true" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{displayName}</p>
                {ranking.byline ? (
                  <p className="truncate text-sm text-white/30">{ranking.byline}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 text-right">
                {typeof ranking.rankChange === 'number' && ranking.rankChange !== 0 ? (
                  <p
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-medium',
                      ranking.rankChange > 0 ? 'text-green-400' : 'text-red-400'
                    )}
                  >
                    {ranking.rankChange > 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {Math.abs(ranking.rankChange)}
                  </p>
                ) : null}
                <p className="leading-none font-semibold tabular-nums text-white">
                  {formatLeaderboardValue(ranking.value)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {showPagination ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <label htmlFor="leaderboard-page-size" className="text-sm text-white/30">
              Show
            </label>
            <select
              id="leaderboard-page-size"
              value={pageSize}
              onChange={(e) =>
                setPageSize(Number(e.target.value) as 10 | 25 | 50 | 100)
              }
              className="rounded-md border border-white/[0.06] bg-[#050505] px-2 py-1 text-sm text-white/60"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="rounded-md border border-white/[0.06] p-1.5 text-white/40 hover:bg-white/[0.04] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="text-sm text-white/30">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="rounded-md border border-white/[0.06] p-1.5 text-white/40 hover:bg-white/[0.04] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

LeaderboardRankings.displayName = 'LeaderboardRankings';

export { LeaderboardRankings };
export type { LeaderboardRankingsProps };
