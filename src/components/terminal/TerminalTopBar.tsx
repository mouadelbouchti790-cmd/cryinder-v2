import { Search, Bell } from 'lucide-react';
import { TERM, TERM_FONT_MONO } from './terminalTheme';

interface TerminalTopBarProps {
  username: string | null;
  walletShort: string;
  cpBalance: number;
  onSearchClick: () => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
}

export default function TerminalTopBar({
  username, walletShort, cpBalance, onSearchClick, onOpenProfile, onOpenNotifications,
}: TerminalTopBarProps) {
  return (
    <header
      className="flex h-[52px] shrink-0 items-center gap-3 border-b px-4"
      style={{ background: TERM.panel, borderColor: TERM.borderSubtle }}
    >
      {/* Left: logo + live marker */}
      <div className="flex items-center gap-2.5">
        <span className="text-[15px] font-black tracking-[-0.02em] text-white">Cryinder</span>
        <span
          className="hidden items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] xl:flex"
          style={{ borderColor: TERM.borderSubtle, color: TERM.muted }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: TERM.blue }} />
          MARKET // LIVE
        </span>
      </div>

      {/* Center: search */}
      <div className="flex flex-1 justify-center">
        <button
          onClick={onSearchClick}
          className="flex h-9 w-full max-w-[420px] items-center gap-2 rounded-lg border px-3 text-left transition-colors hover:border-[#35536D]"
          style={{ background: TERM.main, borderColor: TERM.borderSubtle }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: TERM.muted }} aria-hidden="true" />
          <span className="flex-1 truncate text-[12px]" style={{ color: TERM.disabled }}>
            Search coins, users, collections…
          </span>
          <kbd
            className="hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:block"
            style={{ borderColor: TERM.border, color: TERM.muted, background: TERM.card }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: account */}
      <div className="flex items-center gap-2">
        <div
          className="hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 md:flex"
          style={{ background: TERM.card, borderColor: TERM.borderSubtle }}
          title="Cryinder Points balance"
        >
          <span className="font-mono text-[10px] font-bold tracking-[0.1em]" style={{ color: TERM.muted }}>CP</span>
          <span className="text-[13px] font-extrabold tabular-nums text-white">{cpBalance.toLocaleString()}</span>
        </div>
        <button
          onClick={onOpenNotifications}
          aria-label="Notifications"
          className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:border-[#35536D]"
          style={{ background: TERM.card, borderColor: TERM.borderSubtle }}
        >
          <Bell className="h-4 w-4" style={{ color: TERM.muted }} aria-hidden="true" />
        </button>
        <button
          onClick={onOpenProfile}
          className="flex h-9 items-center gap-1.5 rounded-lg border px-2.5 transition-colors hover:border-[#35536D]"
          style={{ background: TERM.card, borderColor: TERM.borderSubtle }}
          aria-label="Profile"
        >
          <span className="text-[12px] font-bold" style={{ color: TERM.text2 }}>
            {username ? `@${username}` : walletShort}
          </span>
        </button>
      </div>
      <span className="hidden" style={{ fontFamily: TERM_FONT_MONO }} />
    </header>
  );
}
