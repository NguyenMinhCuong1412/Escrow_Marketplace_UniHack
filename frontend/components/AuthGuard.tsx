'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useSwitchChain } from 'wagmi';
import { ShieldCheck, RefreshCw, AlertTriangle, ArrowRightLeft, Lock } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const {
    isAuthenticated,
    isReconnecting,
    isCheckingSession,
    isWalletConnected,
    isCorrectNetwork,
    isLocalWallet,
    isLocalWalletUnlocked,
    chain,
    targetChain,
  } = useAuthSession();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuthRoute = pathname === '/auth' || pathname?.startsWith('/auth/');
  const isBusyChecking = !mounted || isReconnecting || (isWalletConnected && isCheckingSession);

  // Handle automatic redirection for protected Marketplace routes
  useEffect(() => {
    if (!mounted) return;

    // If on Marketplace protected route and not authenticated (after reconnecting & session check complete)
    if (!isAuthRoute && !isBusyChecking && !isAuthenticated) {
      // If connected on wrong network, let the network mismatch banner/screen below handle switching without bouncing to /auth
      if (isWalletConnected && !isCorrectNetwork) {
        return;
      }
      const fullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
      const authUrl = `/auth?returnUrl=${encodeURIComponent(fullPath)}`;
      router.replace(authUrl);
    }
  }, [
    mounted,
    isAuthRoute,
    isAuthenticated,
    isBusyChecking,
    isWalletConnected,
    isCorrectNetwork,
    pathname,
    searchParams,
    router,
  ]);

  // If on /auth or /auth/local: render the auth page directly
  if (isAuthRoute) {
    return <>{children}</>;
  }

  // If on protected Marketplace route:
  // State 1: Reconnecting to extension or verifying server session on page reload
  if (isBusyChecking) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-lg">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-white">Đang kiểm tra kết nối và phiên xác thực...</p>
        <p className="text-xs text-slate-400">Vui lòng đợi trong giây lát.</p>
      </div>
    );
  }

  // State 2: Connected but on wrong network (Network Mismatch)
  if (isWalletConnected && !isCorrectNetwork) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-5 animate-in fade-in">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shadow-lg">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h2 className="text-lg font-bold text-white">Mạng kết nối không hợp lệ</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ví của bạn đang kết nối vào mạng <strong className="text-red-400">{chain?.name || 'Không xác định'}</strong>.
            Escrow Marketplace yêu cầu mạng <strong className="text-emerald-400">{targetChain.name} (Chain ID: {targetChain.id})</strong> để tương tác hợp đồng ký quỹ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => switchChain({ chainId: targetChain.id })}
          disabled={isSwitching}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-lg shadow-red-600/20 transition-all cursor-pointer disabled:opacity-50"
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>{isSwitching ? 'Đang chuyển mạng...' : `Chuyển mạng sang ${targetChain.name}`}</span>
        </button>
      </div>
    );
  }

  // State 3: Local wallet is locked
  if (isLocalWallet && !isLocalWalletUnlocked) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-lg">
          <Lock className="w-6 h-6 animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-white">Ví thiết bị đang bị khóa</p>
        <p className="text-xs text-slate-400">Đang chuyển về Cổng xác thực để mở khóa bằng mật khẩu...</p>
      </div>
    );
  }

  // State 4: Not authenticated - redirecting to /auth
  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shadow-lg">
          <ShieldCheck className="w-6 h-6 animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-white">Yêu cầu xác thực ví để truy cập Marketplace</p>
        <p className="text-xs text-slate-400">Đang chuyển tiếp về Cổng xác thực...</p>
      </div>
    );
  }

  // State 5: Authenticated - render protected marketplace route
  return <>{children}</>;
}
