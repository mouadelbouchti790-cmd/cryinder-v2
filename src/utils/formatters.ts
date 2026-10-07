function trimFixed(value: number, decimals: number): string {
  return value
    .toFixed(decimals)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '$0';
  if (price === 0) return '$0';

  const abs = Math.abs(price);
  const sign = price < 0 ? '-' : '';

  if (abs < 0.000001) {
    // Ultra-small prices (e.g. 6.75e-7): scale decimals to keep the
    // first significant digits — never scientific notation, never "$0".
    const decimals = Math.min(12, Math.max(9, Math.ceil(-Math.log10(abs)) + 2));
    return `${sign}$${trimFixed(abs, decimals)}`;
  }
  if (abs < 0.0001) return `${sign}$${trimFixed(abs, 8)}`;
  if (abs < 0.01) return `${sign}$${trimFixed(abs, 6)}`;
  if (abs < 1) return `${sign}$${trimFixed(abs, 4)}`;
  if (abs < 1000) return `${sign}$${trimFixed(abs, 2)}`;
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatBalance(balance: number): string {
  if (!Number.isFinite(balance)) return '0';
  if (balance === 0) return '0';
  if (balance >= 1_000_000) {
    return balance.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return balance.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function formatMarketCap(mcap: number): string {
  if (!Number.isFinite(mcap) || mcap === 0) return '-';
  if (mcap >= 1e9) return `$${(mcap / 1e9).toFixed(2)}B`;
  if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(2)}M`;
  if (mcap >= 1e3) return `$${(mcap / 1e3).toFixed(2)}K`;
  return `$${mcap.toFixed(2)}`;
}

export function formatChange(pct: number): string {
  if (!Number.isFinite(pct)) return '0.00%';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatVolume(vol: number): string {
  return formatMarketCap(vol);
}

export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';

  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;

  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo`;

  const year = Math.floor(month / 12);
  return `${year}y`;
}
