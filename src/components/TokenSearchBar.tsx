import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, X, TrendingUp, TrendingDown } from 'lucide-react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatPrice } from '../utils/formatters';
import type { AdSlot } from '../types/adSlots';

export interface TokenSearchResult {
  mintAddress: string;
  name: string;
  symbol: string;
  priceUsd: number | null;
  priceChange24h: number | null;
  pairAddress: string;
  dexId: string;
  imageUrl: string | null;
  /** Set when this token has an active sponsored slot. */
  sponsoredSlot?: AdSlot | null;
}

interface TokenSearchBarProps {
  onTokenSelect: (token: TokenSearchResult) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Lookup a sponsored slot by mint address; returns null when not sponsored. */
  sponsoredByMint?: (mint: string) => AdSlot | null;
}

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

interface DexPair {
  chainId: string;
  pairAddress: string;
  dexId: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  info?: { imageUrl?: string };
}

function formatChange(change: number | null): string {
  if (change === null) return '-';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export default function TokenSearchBar({
  onTokenSelect,
  placeholder = 'Search by name, ticker, or mint address',
  className = '',
  autoFocus = false,
  sponsoredByMint,
}: TokenSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 350);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    abortRef.current?.abort();

    if (debouncedQuery.length < 2) {
      setStatus('idle');
      setResults([]);
      setErrorMessage(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setErrorMessage(null);

    (async () => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(debouncedQuery)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        const pairs: DexPair[] = (data.pairs ?? []).filter((p) => p.chainId === 'solana');

        const byMint = new Map<string, DexPair>();
        for (const p of pairs) {
          const existing = byMint.get(p.baseToken.address);
          if (!existing || (p.volume?.h24 ?? 0) > (existing.volume?.h24 ?? 0)) {
            byMint.set(p.baseToken.address, p);
          }
        }

        const normalized: TokenSearchResult[] = Array.from(byMint.values())
          .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
          .slice(0, 8)
          .map((p) => ({
            mintAddress: p.baseToken.address,
            name: p.baseToken.name,
            symbol: p.baseToken.symbol,
            priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
            priceChange24h: typeof p.priceChange?.h24 === 'number' ? p.priceChange.h24 : null,
            pairAddress: p.pairAddress,
            dexId: p.dexId,
            imageUrl: p.info?.imageUrl ?? null,
            sponsoredSlot: sponsoredByMint?.(p.baseToken.address) ?? null,
          }));

        // Sponsored results surface first
        normalized.sort((a, b) => (b.sponsoredSlot ? 1 : 0) - (a.sponsoredSlot ? 1 : 0));

        setResults(normalized);
        setStatus(normalized.length > 0 ? 'success' : 'empty');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorMessage('Search is unavailable. Try again shortly.');
        setStatus('error');
      }
    })();

    return () => controller.abort();
  }, [debouncedQuery, sponsoredByMint]);

  const handleSelect = useCallback(
    (token: TokenSearchResult) => {
      onTokenSelect(token);
      setQuery('');
      setResults([]);
      setStatus('idle');
      setIsFocused(false);
    },
    [onTokenSelect],
  );

  const showDropdown =
    isFocused && (status === 'loading' || status === 'success' || status === 'empty' || status === 'error');

  const showHelper = query.trim().length > 0 && query.trim().length < 2;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div
        className={`flex items-center gap-3 rounded-2xl border bg-white/[0.03] px-4 py-3 backdrop-blur-md transition-colors ${
          isFocused ? 'border-white/[0.12]' : 'border-white/[0.05]'
        }`}
      >
        {status === 'loading' ? (
          <Loader2 size={18} className="shrink-0 animate-spin text-white/40" />
        ) : (
          <Search size={18} className="shrink-0 text-white/30" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          autoFocus={autoFocus}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-transparent text-sm font-medium text-white/90 placeholder:text-white/25 outline-none"
        />
        {query.length > 0 && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setStatus('idle');
              setErrorMessage(null);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/70"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {showHelper && (
        <p className="mt-1.5 px-1 text-[11px] text-white/25">Keep typing. 2+ characters needed.</p>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0c] shadow-2xl">
          {status === 'loading' && (
            <div className="flex items-center justify-center gap-2 px-4 py-6">
              <Loader2 size={16} className="animate-spin text-white/30" />
              <span className="text-xs font-medium text-white/30">Searching Solana tokens...</span>
            </div>
          )}
          {status === 'error' && (
            <div className="px-4 py-5 text-center text-xs font-medium text-white/40">{errorMessage}</div>
          )}
          {status === 'empty' && (
            <div className="px-4 py-6 text-center">
              <p className="text-xs font-medium text-white/40">
                No Solana tokens found for &ldquo;{debouncedQuery}&rdquo;
              </p>
              <p className="mt-1 text-[11px] text-white/20">Check the ticker, name, or mint address.</p>
            </div>
          )}
          {status === 'success' && (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((token) => {
                return (
                  <li key={`${token.pairAddress}-${token.mintAddress}`}>
                    <button
                      onClick={() => handleSelect(token)}
                      className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {token.imageUrl ? (
                          <img
                            src={token.imageUrl}
                            alt={token.symbol}
                            className="h-7 w-7 shrink-0 rounded-full object-cover grayscale transition-all group-hover:grayscale-0"
                          />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white/40">
                            {token.symbol.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white/85">
                            {token.symbol}
                          </p>
                          <p className="truncate text-[11px] text-white/30">{token.name}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-sm font-medium text-white/80">
                          {token.priceUsd !== null ? formatPrice(token.priceUsd) : '-'}
                        </span>
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          token.priceChange24h === null
                            ? 'text-white/25'
                            : 'text-white/65'
                        }`}>
                          {token.priceChange24h !== null &&
                            ((token.priceChange24h ?? 0) >= 0 ? (
                              <TrendingUp size={11} />
                            ) : (
                              <TrendingDown size={11} />
                            ))}
                          {formatChange(token.priceChange24h)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
