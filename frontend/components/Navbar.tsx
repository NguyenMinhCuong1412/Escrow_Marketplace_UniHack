'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount, useReadContract, useSwitchChain } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { PendingWithdrawalBanner } from '@/components/PendingWithdrawalBanner';
import {
  ShieldCheck,
  PlusCircle,
  ShieldAlert,
  KeyRound,
  Lock,
  Wallet,
  ChevronDown,
  LogOut,
  Users,
  Copy,
  Check,
  ArrowRightLeft,
} from 'lucide-react';
import { LocalWalletManagerModal } from '@/components/LocalWalletManagerModal';
import { useWalletModal } from '@/components/ConnectWalletModal';
import { useAuthSession } from '@/hooks/useAuthSession';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const isAuthPage = pathname === '/auth' || pathname?.startsWith('/auth/');
  const { address, isConnected, connector } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useWalletModal();
  const {
    isCorrectNetwork,
    targetChain,
    availableAccounts,
    switchAccount,
    requestAccountSelection,
    logout,
  } = useAuthSession();

  const [mounted, setMounted] = useState(false);
  const isLocalWallet = mounted && connector?.id === 'local-wallet';
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: rawOwner } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: 'owner',
    query: {
      enabled: !isAuthPage && escrowAddress !== '0x0000000000000000000000000000000000000000',
      staleTime: 60000,
    },
  });

  const isOwner = Boolean(
    address && rawOwner && address.toLowerCase() === String(rawOwner).toLowerCase()
  );

  const handleCopyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (isAuthPage) {
    return null;
  }

  return (
    <>
      {!isAuthPage && <PendingWithdrawalBanner />}
      <header className="border-b border-[#E5E7EB] bg-[#FFFFFF]/90 backdrop-blur sticky top-0 z-50 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href={isAuthPage ? '/auth' : '/'} className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-xl bg-[#3458D4] flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base leading-tight tracking-tight text-[#17191F]">
                  Escrow Marketplace
                </span>
                <span className="text-[10px] text-[#525866] font-medium tracking-wider uppercase">
                  AI Attested · Avalanche
                </span>
              </div>
            </Link>

            {/* Do not show marketplace navigation on /auth page (AUTH-01 requirement 3) */}
            {!isAuthPage && (
              <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-[#525866]">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-lg hover:text-[#17191F] hover:bg-[#F7F8FA] transition-colors"
                >
                  Trang chủ
                </Link>
                <Link
                  href="/trade/new"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:text-[#17191F] hover:bg-[#F7F8FA] transition-colors"
                >
                  <PlusCircle className="w-4 h-4 text-[#3458D4]" />
                  Tạo giao dịch
                </Link>
                {isOwner && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[#8A5A00] bg-[#F0B44D]/15 hover:bg-[#F0B44D]/25 transition-colors border border-[#F0B44D]/40 font-semibold"
                  >
                    <ShieldAlert className="w-4 h-4 text-[#B47814]" />
                    Trọng tài Admin
                  </Link>
                )}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {isAuthPage ? (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#3458D4]/10 text-[#3458D4] border border-[#3458D4]/25">
                  Cổng Xác Thực
                </span>
              </div>
            ) : (
              <>
                {isLocalWallet && (
                  <button
                    type="button"
                    onClick={() => setWalletModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#3458D4]/30 bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-[#3458D4] text-xs font-semibold transition cursor-pointer"
                    title="Cài đặt và quản lý ví thiết bị"
                  >
                    <Lock className="w-3.5 h-3.5 text-[#3458D4]" />
                    <span className="hidden sm:inline">Ví thiết bị</span>
                  </button>
                )}

                {mounted && isConnected && address ? (
                  <div className="relative" ref={menuRef}>
                    <div className="flex items-center gap-2">
                      {!isCorrectNetwork ? (
                        <button
                          type="button"
                          onClick={() => switchChain({ chainId: targetChain.id })}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs font-semibold transition cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Đổi sang {targetChain.name}</span>
                        </button>
                      ) : (
                        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] text-xs font-medium text-[#17191F]">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Fuji</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setAccountMenuOpen((prev) => !prev)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FFFFFF] hover:bg-[#F7F8FA] border border-[#E5E7EB] text-[#17191F] text-xs font-semibold shadow-sm transition cursor-pointer"
                      >
                        <span className="font-mono">
                          {address.slice(0, 6)}...{address.slice(-4)}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-[#525866]" />
                      </button>
                    </div>

                    {accountMenuOpen && (
                      <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-xl p-2 z-50 space-y-1.5 text-xs">
                        <div className="px-3 py-2 border-b border-[#E5E7EB] flex items-center justify-between">
                          <div>
                            <p className="text-[11px] text-[#525866]">
                              {isLocalWallet ? 'Ví thiết bị' : connector?.name || 'Ví Web3'}
                            </p>
                            <p className="font-mono font-semibold text-[#17191F] mt-0.5">
                              {address.slice(0, 8)}...{address.slice(-6)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyAddress}
                            className="p-1.5 rounded-lg hover:bg-[#F7F8FA] text-[#525866] hover:text-[#17191F] transition cursor-pointer"
                            title="Sao chép địa chỉ ví"
                          >
                            {copied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {!isLocalWallet && (
                          <div className="py-1 border-b border-[#E5E7EB] space-y-1">
                            {availableAccounts.length > 1 && (
                              <div className="px-2 py-1 space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-[#525866] font-semibold px-1">
                                  Chuyển tài khoản
                                </p>
                                {availableAccounts.map((acc, i) => {
                                  const active = acc.toLowerCase() === address.toLowerCase();
                                  return (
                                    <button
                                      key={acc}
                                      type="button"
                                      onClick={async () => {
                                        await switchAccount(acc);
                                        setAccountMenuOpen(false);
                                      }}
                                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-mono text-left transition cursor-pointer ${
                                        active
                                          ? 'bg-[#3458D4]/10 text-[#3458D4] font-semibold'
                                          : 'text-[#17191F] hover:bg-[#F7F8FA]'
                                      }`}
                                    >
                                      <span>
                                        Acc {i + 1}: {acc.slice(0, 6)}...{acc.slice(-4)}
                                      </span>
                                      {active && (
                                        <span className="text-[10px] font-sans text-[#3458D4]">
                                          Đang dùng
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={async () => {
                                setAccountMenuOpen(false);
                                await requestAccountSelection();
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#17191F] hover:bg-[#F7F8FA] transition cursor-pointer"
                            >
                              <Users className="w-3.5 h-3.5 text-[#3458D4]" />
                              <span>Chọn / Đổi tài khoản từ ví</span>
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            openConnectModal();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#17191F] hover:bg-[#F7F8FA] transition cursor-pointer"
                        >
                          <Wallet className="w-3.5 h-3.5 text-[#3458D4]" />
                          <span>Đổi chiếc ví khác</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            setAccountMenuOpen(false);
                            await logout();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 transition cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Ngắt kết nối</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/auth"
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#3458D4]/30 bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-[#3458D4] text-xs font-semibold transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Xác thực ví</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => openConnectModal()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-bold shadow-sm transition cursor-pointer"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Kết nối một chiếc ví</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>
      <LocalWalletManagerModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </>
  );
};

export default Navbar;
