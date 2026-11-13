'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import { useWalletModal } from '@/components/ConnectWalletModal';
import { targetChain } from '@/lib/wagmi';
import { LOCAL_WALLET_CONNECTOR_ID } from '@/lib/local-wallet/connector';
import { useAuthSession } from '@/hooks/useAuthSession';

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/';
  const localPageHref =
    returnUrl && returnUrl !== '/'
      ? `/auth/local?returnUrl=${encodeURIComponent(returnUrl)}`
      : '/auth/local';

  const { address, isConnected, status, connector, chain } = useAccount();
  const { error: connectError, isPending, reset } = useConnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { openConnectModal } = useWalletModal();
  const {
    serverSessionActive,
    isCorrectNetwork,
    availableAccounts,
    authenticateWithServer,
    switchAccount,
    requestAccountSelection,
    isSigningIn,
    authError,
    clearAuthError,
    logout,
  } = useAuthSession();

  const [mounted, setMounted] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLocalConnected = mounted && connector?.id === LOCAL_WALLET_CONNECTOR_ID;
  const showConnectedCard = Boolean(mounted && isConnected && address);
  const showConnectError = Boolean(mounted && connectError);
  const showConnectingBanner = Boolean(
    mounted && (isPending || status === 'connecting' || status === 'reconnecting')
  );

  const handlePromptAccountFromExtension = async () => {
    setIsSwitchingAccount(true);
    try {
      await requestAccountSelection();
    } finally {
      setIsSwitchingAccount(false);
    }
  };

  return (
    <div
      data-auth-theme="light"
      className="fixed inset-0 z-40 overflow-y-auto overflow-x-hidden bg-[var(--bg)] text-[var(--text)]"
    >
      <div className="min-h-full w-full max-w-[420px] mx-auto px-5 py-12 sm:py-20 flex flex-col justify-between gap-10 text-left">
        <div className="space-y-10">
          {/* Header: Flat Mark + Brand Name + Single Network Badge */}
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                aria-hidden="true"
                className="w-6 h-6 rounded-[6px] bg-[var(--primary-bg)] text-[var(--primary-fg)] flex items-center justify-center text-xs font-bold select-none"
              >
                E
              </div>
              <span className="text-sm font-semibold tracking-tight text-[var(--text)]">
                Escrow Marketplace
              </span>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--text)]">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>Fuji Testnet</span>
            </span>
          </header>

          {/* 2-Line Bold Heading */}
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight leading-snug">
              <span className="block text-[var(--text)]">Mua bán đồ sưu tầm.</span>
              <span className="block text-[var(--accent)]">Kiểm hàng bằng AI.</span>
            </h1>
          </div>

          {/* Main Content: Disconnected vs Connected */}
          {!showConnectedCard ? (
            <div className="space-y-6">
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    openConnectModal();
                  }}
                  disabled={isPending}
                  className="w-full py-3 px-4 rounded-[10px] bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  {showConnectingBanner ? 'Đang kết nối ví...' : 'Kết nối ví'}
                </button>
                <p className="text-xs text-[var(--text-muted)]">
                  Core, MetaMask, WalletConnect
                </p>
              </div>

              {showConnectError && connectError && (
                <div
                  role="alert"
                  className="p-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text)] space-y-1.5"
                >
                  <p className="font-medium text-[var(--accent)]">
                    {connectError.message.includes('User rejected')
                      ? 'Đã hủy yêu cầu kết nối ví.'
                      : connectError.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      openConnectModal();
                    }}
                    className="text-xs font-medium text-[var(--accent)] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                  >
                    Thử lại
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border)]">
                <p className="text-sm text-[var(--text-muted)]">
                  Chưa có ví?{' '}
                  <Link
                    href={localPageHref}
                    className="font-semibold text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                  >
                    Tạo ví ngay trên trình duyệt →
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Connected Wallet Summary Surface */}
              <div className="p-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)]">Địa chỉ ví</span>
                  <span
                    style={{ fontFamily: 'var(--font-mono)' }}
                    className="font-semibold text-[var(--text)]"
                    title={address}
                  >
                    {address?.slice(0, 8)}...{address?.slice(-6)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Phương thức</span>
                  <span className="font-medium text-[var(--text)]">
                    {isLocalConnected ? 'Ví trên trình duyệt' : connector?.name || 'Ví Web3'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Mạng</span>
                  {isCorrectNetwork ? (
                    <span className="font-medium text-[var(--text)]">
                      {chain?.name || targetChain.name} ({chain?.id || targetChain.id})
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => switchChainAsync({ chainId: targetChain.id }).catch(() => {})}
                      disabled={isSwitchingChain}
                      className="font-semibold text-[var(--accent)] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                    >
                      {isSwitchingChain
                        ? 'Đang chuyển mạng...'
                        : `Chuyển sang ${targetChain.name}`}
                    </button>
                  )}
                </div>

                {!isLocalConnected && (
                  <div className="pt-2 border-t border-[var(--border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">
                        Tài khoản ({availableAccounts.length})
                      </span>
                      <button
                        type="button"
                        onClick={handlePromptAccountFromExtension}
                        disabled={isSwitchingAccount}
                        className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                      >
                        {isSwitchingAccount ? 'Đang mở ví...' : 'Đổi tài khoản từ ví'}
                      </button>
                    </div>

                    {availableAccounts.length > 1 && (
                      <div className="space-y-1">
                        {availableAccounts.map((accAddr, idx) => {
                          const isSelected =
                            accAddr.toLowerCase() === address?.toLowerCase();
                          return (
                            <button
                              key={accAddr}
                              type="button"
                              onClick={() => switchAccount(accAddr)}
                              style={{ fontFamily: 'var(--font-mono)' }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[8px] text-xs border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                                isSelected
                                  ? 'bg-[var(--bg)] border-[var(--text)] text-[var(--text)] font-semibold'
                                  : 'bg-transparent border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                              }`}
                            >
                              <span>
                                #{idx + 1} {accAddr.slice(0, 8)}...{accAddr.slice(-6)}
                              </span>
                              <span className="font-sans text-[11px]">
                                {isSelected ? 'Đang chọn' : 'Chọn'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {authError && (
                <div
                  role="alert"
                  className="p-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-xs flex items-start justify-between gap-2"
                >
                  <span className="text-[var(--accent)]">{authError}</span>
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="text-[var(--text-muted)] hover:text-[var(--text)] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded px-1"
                  >
                    Đóng
                  </button>
                </div>
              )}

              {/* Primary CTA */}
              {!serverSessionActive ? (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await authenticateWithServer();
                    if (ok) router.push(returnUrl);
                  }}
                  disabled={isSigningIn}
                  className="w-full py-3 px-4 rounded-[10px] bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  {isSigningIn ? 'Đang chờ ký xác nhận trên ví...' : 'Ký xác nhận & Vào sàn'}
                </button>
              ) : (
                <Link
                  href={returnUrl}
                  className="block w-full py-3 px-4 rounded-[10px] bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-sm text-center transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  Vào sàn giao dịch →
                </Link>
              )}

              {/* Secondary links */}
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pt-1">
                {isLocalConnected ? (
                  <Link
                    href={localPageHref}
                    className="font-medium text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                  >
                    Quản lý ví trình duyệt →
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => openConnectModal()}
                    className="hover:text-[var(--text)] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                  >
                    Đổi ví khác
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => logout()}
                  className="hover:text-[var(--accent)] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                >
                  Ngắt kết nối
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Honest Note */}
        <footer className="pt-6 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Chúng tôi không bao giờ hỏi cụm từ khôi phục của bạn.
          </p>
        </footer>
      </div>
    </div>
  );
}
