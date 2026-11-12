'use client';

import React from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { PendingWithdrawalBanner } from '@/components/PendingWithdrawalBanner';
import { ShieldCheck, PlusCircle, ShieldAlert } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { address } = useAccount();

  const { data: rawOwner } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: 'owner',
    query: {
      enabled: escrowAddress !== '0x0000000000000000000000000000000000000000',
      staleTime: 60000,
    },
  });

  const isOwner = Boolean(
    address && rawOwner && address.toLowerCase() === String(rawOwner).toLowerCase()
  );

  return (
    <>
      <PendingWithdrawalBanner />
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-50 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-rose-400 flex items-center justify-center text-white shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base leading-tight tracking-tight text-slate-900 dark:text-white">
                  Escrow Marketplace
                </span>
                <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">
                  AI Attested · Avalanche
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-400">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Trang chủ
              </Link>
              <Link
                href="/trade/new"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <PlusCircle className="w-4 h-4 text-red-500" />
                Tạo giao dịch
              </Link>
              {isOwner && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors border border-amber-500/20 font-semibold"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Trọng tài Admin
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus={{
                smallScreen: 'avatar',
                largeScreen: 'address',
              }}
            />
          </div>
        </div>
      </header>
    </>
  );
};

export default Navbar;
