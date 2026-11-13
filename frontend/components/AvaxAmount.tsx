import React from 'react';
import { formatAvax } from '@/lib/format';
import { Coins } from 'lucide-react';
import { clsx } from 'clsx';

interface AvaxAmountProps {
  amountWei?: bigint | string | number | null;
  showIcon?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const AvaxAmount: React.FC<AvaxAmountProps> = ({
  amountWei,
  showIcon = true,
  className,
  size = 'md',
}) => {
  const formatted = formatAvax(amountWei);

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm font-semibold',
    lg: 'text-lg font-bold',
  };

  return (
    <span className={clsx('inline-flex items-center gap-1 text-[#17191F]', sizeClasses[size], className)}>
      {showIcon && <Coins className={clsx('text-[#B47814]', size === 'lg' ? 'w-5 h-5' : 'w-4 h-4')} />}
      <span>{formatted}</span>
      <span className="font-medium text-xs text-[#525866]">AVAX</span>
    </span>
  );
};

export default AvaxAmount;
