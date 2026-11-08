'use client';

import React, { useEffect, useState } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { formatCountdown } from '@/lib/format';
import { clsx } from 'clsx';

interface CountdownTimerProps {
  deadline?: bigint | number | null;
  label?: string;
  className?: string;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  deadline,
  label = 'Thời hạn còn lại',
  className,
}) => {
  const [countdown, setCountdown] = useState(() => formatCountdown(deadline));

  useEffect(() => {
    // Initial update
    setCountdown(formatCountdown(deadline));

    // Update every second
    const timer = setInterval(() => {
      setCountdown(formatCountdown(deadline));
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  if (!deadline || Number(deadline) === 0) {
    return null;
  }

  const isUrgent = !countdown.isExpired && countdown.secondsRemaining < 3600;

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors',
        countdown.isExpired
          ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : isUrgent
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse'
          : 'bg-slate-800/80 border-slate-700 text-slate-300',
        className
      )}
    >
      {countdown.isExpired ? (
        <AlertCircle className="w-4 h-4 text-red-400" />
      ) : (
        <Clock className={clsx('w-4 h-4', isUrgent ? 'text-amber-400' : 'text-slate-400')} />
      )}
      {label && <span className="font-sans text-slate-400 font-normal">{label}:</span>}
      <span className="font-bold tracking-wider">{countdown.text}</span>
    </div>
  );
};

export default CountdownTimer;
