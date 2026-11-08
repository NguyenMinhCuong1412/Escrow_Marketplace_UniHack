import React from 'react';
import { getStateInfo } from '@/lib/format';
import { clsx } from 'clsx';

interface StateBadgeProps {
  state: number;
  flagged?: boolean;
  className?: string;
}

export const StateBadge: React.FC<StateBadgeProps> = ({ state, flagged, className }) => {
  const info = getStateInfo(state, flagged);
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors',
        info.bgClass,
        info.textClass,
        info.borderClass,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-70" />
      {info.label}
    </span>
  );
};

export default StateBadge;
