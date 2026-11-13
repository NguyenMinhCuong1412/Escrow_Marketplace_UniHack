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
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors shadow-sm',
        countdown.isExpired
          ? 'bg-red-50 border-red-200 text-red-700'
          : isUrgent
          ? 'bg-[#F0B44D]/20 border-[#F0B44D]/50 text-[#8A5A00] animate-pulse'
          : 'bg-[#F7F8FA] border-[#E5E7EB] text-[#17191F]',
        className
      )}
    >
      {countdown.isExpired ? (
        <AlertCircle className="w-4 h-4 text-red-600" />
      ) : (
        <Clock className={clsx('w-4 h-4', isUrgent ? 'text-[#B47814]' : 'text-[#525866]')} />
      )}
      {label && <span className="font-sans text-[#525866] font-normal">{label}:</span>}
      <span className="font-bold tracking-wider">{countdown.text}</span>
    </div>
  );
};

export default CountdownTimer;
