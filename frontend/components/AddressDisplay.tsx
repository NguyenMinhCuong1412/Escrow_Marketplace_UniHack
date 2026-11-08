'use client';

import React, { useState } from 'react';
import { shortAddr } from '@/lib/format';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';

interface AddressDisplayProps {
  address?: string | null;
  copyable?: boolean;
  explorerLink?: boolean;
  className?: string;
}

export const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  copyable = true,
  explorerLink = true,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  if (!address) return <span className="text-gray-400">0x...</span>;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const snowtraceUrl = `https://testnet.snowtrace.io/address/${address}`;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-mono text-sm bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700',
        className
      )}
      title={address}
    >
      <span>{shortAddr(address)}</span>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-0.5"
          title="Sao chép địa chỉ"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      )}
      {explorerLink && (
        <a
          href={snowtraceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-blue-500 transition-colors p-0.5"
          title="Xem trên Snowtrace"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </span>
  );
};

export default AddressDisplay;
