'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import { useWalletModal } from '@/components/ConnectWalletModal';
import { targetChain } from '@/lib/wagmi';
import { LOCAL_WALLET_CONNECTOR_ID } from '@/lib/local-wallet/connector';
import { useAuthSession } from '@/hooks/useAuthSession';
import { CollectiblesCarousel } from '@/components/CollectiblesCarousel';

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnUrl = searchParams.get('returnUrl') || '/';
  const returnUrl =
    rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//') && !rawReturnUrl.startsWith('/auth')
      ? rawReturnUrl
      : '/';
  const localPageHref =
    returnUrl && returnUrl !== '/'
      ? `/auth/local?returnUrl=${encodeURIComponent(returnUrl)}`
      : '/auth/local';

  const { address, isConnected, status, connector, chain } = useAccount();
  const { error: connectError, isPending, reset } = useConnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { isOpen: isConnectModalOpen, openConnectModal } = useWalletModal();
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
    mounted && isConnectModalOpen && (isPending || status === 'connecting')
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
      <div className="min-h-full w-full flex items-center justify-center px-5 py-8 sm:px-8 sm:py-12 lg:px-12 lg:py-16">
        <main className="w-full max-w-[540px] lg:max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[45fr_55fr] items-center gap-10 lg:gap-14 text-left">
          {/* Left Column (45%): Auth Content */}
          <section className="flex flex-col justify-center gap-8 sm:gap-9 lg:pr-2">
            {/* Brand Header */}
            <header className="flex items-center gap-3.5 sm:gap-4">
              <div
                aria-hidden="true"
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#3458D4] text-white flex items-center justify-center text-xl sm:text-2xl font-extrabold shadow-sm select-none shrink-0"
              >
                E
              </div>
              <span className="text-2xl sm:text-[26px] lg:text-[28px] font-bold tracking-tight text-[#17191F]">
                Escrow Marketplace
              </span>
            </header>

            {/* Bold Hero Headline */}
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] xl:text-[44px] font-extrabold tracking-tight leading-[1.12] text-[#17191F]">
                Mua bán đồ sưu tầm
              </h1>
            </div>

            {/* Main Content: Disconnected vs Connected */}
            {!showConnectedCard ? (
              <div className="space-y-6">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      openConnectModal();
                    }}
                    disabled={showConnectingBanner}
                    className="w-full min-h-[56px] py-4 px-6 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white font-semibold text-base sm:text-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-2"
                  >
                    {showConnectingBanner ? 'Đang kết nối ví...' : 'Kết nối ví'}
                  </button>
                </div>

                {showConnectError && connectError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs sm:text-sm text-red-900 space-y-1.5 shadow-sm"
                  >
                    <p className="font-medium text-red-700">
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
                      className="text-xs sm:text-sm font-medium text-[#3458D4] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded"
                    >
                      Thử lại
                    </button>
                  </div>
                )}

                <div className="pt-2">
                  <p className="text-base text-[#525866]">
                    Chưa có ví?{' '}
                    <Link
                      href={localPageHref}
                      className="font-semibold text-[#3458D4] hover:text-[#2947B5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded"
                    >
                      Tạo ví ngay trên trình duyệt
                    </Link>
                  </p>
                </div>
              </div>
            ) : (
            <div className="space-y-5">
              {/* Connected Wallet Summary Surface */}
              <div className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] shadow-sm space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#525866]">Địa chỉ ví</span>
                  <span
                    style={{ fontFamily: 'var(--font-mono)' }}
                    className="font-semibold text-[#17191F]"
                    title={address}
                  >
                    {address?.slice(0, 8)}...{address?.slice(-6)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E5E7EB]">
                  <span className="text-[#525866]">Phương thức</span>
                  <span className="font-medium text-[#17191F]">
                    {isLocalConnected ? 'Ví trên trình duyệt' : connector?.name || 'Ví Web3'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E5E7EB]">
                  <span className="text-[#525866]">Mạng</span>
                  {isCorrectNetwork ? (
                    <span className="font-medium text-[#17191F]">
                      {chain?.name || targetChain.name} ({chain?.id || targetChain.id})
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => switchChainAsync({ chainId: targetChain.id }).catch(() => {})}
                      disabled={isSwitchingChain}
                      className="font-semibold text-[#3458D4] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded"
                    >
                      {isSwitchingChain
                        ? 'Đang chuyển mạng...'
                        : `Chuyển sang ${targetChain.name}`}
                    </button>
                  )}
                </div>

                {!isLocalConnected && (
                  <div className="pt-2 border-t border-[#E5E7EB] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#525866]">
                        Tài khoản ({availableAccounts.length})
                      </span>
                      <button
                        type="button"
                        onClick={handlePromptAccountFromExtension}
                        disabled={isSwitchingAccount}
                        className="text-xs font-medium text-[#3458D4] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded"
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
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] ${
                                isSelected
                                  ? 'bg-[#3458D4]/5 border-[#3458D4] text-[#17191F] font-semibold'
                                  : 'bg-[#F7F8FA] border-[#E5E7EB] text-[#525866] hover:text-[#17191F]'
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
                  className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs flex items-start justify-between gap-2 shadow-sm"
                >
                  <span className="text-red-700">{authError}</span>
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="text-[#525866] hover:text-[#17191F] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded px-1"
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
                  className="w-full min-h-[56px] py-4 px-6 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white font-semibold text-base sm:text-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-2"
                >
                  {isSigningIn ? 'Đang chờ ký xác nhận trên ví...' : 'Ký xác nhận & Vào sàn'}
                </button>
              ) : (
                <Link
                  href={returnUrl}
                  className="flex items-center justify-center w-full min-h-[56px] py-4 px-6 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white font-semibold text-base sm:text-lg text-center shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-2"
                >
                  Vào sàn giao dịch →
                </Link>
              )}

              {/* Secondary links */}
              <div className="flex items-center justify-between text-sm text-[#525866] pt-1">
                {isLocalConnected ? (
                  <Link
                    href={localPageHref}
                    className="font-medium text-[#3458D4] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded"
                  >
                    Quản lý ví trình duyệt →
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => openConnectModal()}
                    className="hover:text-[#17191F] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded"
                  >
                    Đổi ví khác
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => logout()}
                  className="hover:text-red-600 underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded"
                >
                  Ngắt kết nối
                </button>
              </div>
            </div>
          )}

            {/* Footer Honest Note */}
            <footer className="pt-6 border-t border-[#E5E7EB]">
              <p className="text-sm sm:text-[15px] text-[#525866] leading-relaxed">
                Chúng tôi không bao giờ hỏi cụm từ khôi phục của bạn.
              </p>
            </footer>
          </section>

          {/* Right Column (55%): Collectibles Carousel */}
          <section className="w-full">
            <CollectiblesCarousel />
          </section>
        </main>
      </div>
    </div>
  );
}
