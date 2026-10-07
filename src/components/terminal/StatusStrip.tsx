import { TERM, TERM_FONT_MONO } from './terminalTheme';

interface StatusStripProps {
  dailySwipes: number;
  dailyLimit: number;
  lastUpdated: number | null;
  view: string;
}

/** Thin terminal status line — system information, not decoration. */
export default function StatusStrip({ dailySwipes, dailyLimit, lastUpdated, view }: StatusStripProps) {
  const time = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';
  const items: [string, string][] = [
    ['SWIPE', `${dailySwipes}/${dailyLimit}`],
    ['VIEW', view.toUpperCase()],
    ['PORTFOLIO', lastUpdated ? `SYNCED ${time}` : 'SYNCED'],
    ['ORDER', 'READY'],
    ['ACTIVITY', 'LIVE'],
  ];
  return (
    <footer
      className="hidden h-[28px] shrink-0 items-center gap-5 overflow-hidden border-t px-4 lg:flex"
      style={{ background: TERM.panel, borderColor: TERM.borderSubtle, fontFamily: TERM_FONT_MONO }}
      aria-label="Terminal status"
    >
      {items.map(([k, v]) => (
        <span key={k} className="whitespace-nowrap text-[10px] tracking-[0.08em]">
          <span style={{ color: TERM.disabled }}>{k} // </span>
          <span style={{ color: k === 'ACTIVITY' ? TERM.blue : TERM.muted }}>{v}</span>
        </span>
      ))}
      <span className="ml-auto whitespace-nowrap text-[10px]" style={{ color: TERM.disabled }}>
        CRYINDER TERMINAL · CP ONLY · NO CRYPTO REWARDS
      </span>
    </footer>
  );
}
