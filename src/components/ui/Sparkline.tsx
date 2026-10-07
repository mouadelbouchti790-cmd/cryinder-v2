import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { COLORS } from '../../utils/constants';

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export default function Sparkline({
  data,
  color = '#E2E8F0',
  width = 300,
  height = 80,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const padX = 6;
  const padY = 6;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const getX = (i: number) => (i / (data.length - 1)) * (width - 2 * padX) + padX;
  const getY = (v: number) => height - ((v - min) / range) * (height - 2 * padY) - padY;

  const linePoints = data.map((v, i) => `${getX(i)} ${getY(v)}`).join(' L ');
  const lastX = getX(data.length - 1);
  const lastY = getY(data[data.length - 1]);

  // Stable gradient id per color+data (not per render) — a Math.random
  // id changed every render and caused SVG flicker on re-renders.
  const gradId = `sparkGrad-${color.replace('#', '')}-${data.length}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M ${getX(0)} ${height} L ${linePoints} L ${getX(data.length - 1)} ${height} Z`}
        fill={`url(#${gradId})`}
      />
      <path
        d={`M ${linePoints}`}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}
