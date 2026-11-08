'use client';

import React from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { targetChain } from '@/lib/wagmi';
import { AlertTriangle, ArrowRightLeft } from 'lucide-react';

export const WrongChainBanner: React.FC = () => {
  const { isConnected, chain } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || !chain) return null;

  const isWrongChain = chain.id !== targetChain.id;

  if (!isWrongChain) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-3 text-sm shadow-md animate-in slide-in-from-top">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-bounce" />
          <span>
            <strong>Sai mạng kết nối:</strong> Ví của bạn đang ở <strong>{chain.name}</strong> (Chain ID: {chain.id}). Ứng dụng yêu cầu mạng <strong>{targetChain.name}</strong> (Chain ID: {targetChain.id}).
          </span>
        </div>
        <button
          type="button"
          onClick={() => switchChain({ chainId: targetChain.id })}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-red-700 font-semibold text-xs hover:bg-red-50 active:scale-95 transition-all shadow disabled:opacity-50 flex-shrink-0"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          {isPending ? 'Đang chuyển...' : `Chuyển sang ${targetChain.name}`}
        </button>
      </div>
    </div>
  );
};

export default WrongChainBanner;
