import { Compass, Flame, Wallet, Package, Settings } from 'lucide-react';
import type { AppMainView } from '../../types/token';
import { TERM } from './terminalTheme';

interface TerminalSidebarProps {
  view: AppMainView;
  onSelect: (view: AppMainView) => void;
  onOpenSettings: () => void;
}

const ITEMS: { id: AppMainView; label: string; Icon: typeof Compass }[] = [
  { id: 'deck', label: 'DISCOVER', Icon: Compass },
  { id: 'swipers', label: 'TOP SWIPERS', Icon: Flame },
  { id: 'portfolio', label: 'PORTFOLIO', Icon: Wallet },
  { id: 'lootbox', label: 'LOOTBOX', Icon: Package },
];

export default function TerminalSidebar({ view, onSelect, onOpenSettings }: TerminalSidebarProps) {
  return (
    <nav
      aria-label="Terminal navigation"
      className="flex w-[72px] shrink-0 flex-col items-center border-r py-4"
      style={{ background: TERM.panel, borderColor: TERM.borderSubtle }}
    >
      {/* Logo */}
      <div
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-base font-black"
        style={{ background: TERM.card, border: `1px solid ${TERM.border}`, color: TERM.blue }}
        title="Cryinder"
      >
        C
      </div>

      <div className="mb-4 h-px w-10" style={{ background: TERM.borderSubtle }} />

      <div className="flex flex-1 flex-col gap-1.5">
        {ITEMS.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              title={label}
              className="group relative flex w-[56px] flex-col items-center gap-1 rounded-lg py-2.5 transition-all duration-150"
              style={{ background: active ? 'rgba(24,191,255,0.10)' : 'transparent' }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {/* active indicator — tiny, precise */}
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: 2, height: active ? 22 : 0,
                  background: TERM.blue,
                  transition: 'height 0.15s ease',
                }}
              />
              <Icon
                className="h-5 w-5"
                style={{ color: active ? TERM.blue : '#5B6B7B' }}
                strokeWidth={active ? 2 : 1.75}
                aria-hidden="true"
              />
              <span
                className="font-mono"
                style={{
                  fontSize: 7.5, fontWeight: 700, letterSpacing: '0.06em',
                  color: active ? TERM.blue : TERM.disabled,
                }}
              >
                {label.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="my-4 h-px w-10" style={{ background: TERM.borderSubtle }} />

      <button
        onClick={onOpenSettings}
        aria-label="Settings"
        title="SETTINGS"
        className="flex w-[56px] flex-col items-center gap-1 rounded-lg py-2.5 transition-colors hover:bg-white/[0.03]"
      >
        <Settings className="h-5 w-5" style={{ color: '#5B6B7B' }} strokeWidth={1.75} aria-hidden="true" />
        <span className="font-mono" style={{ fontSize: 7.5, fontWeight: 700, color: TERM.disabled }}>SET</span>
      </button>
    </nav>
  );
}
