'use client';

import React, { Suspense, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useReadContract, useSwitchChain } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { PendingWithdrawalBanner } from '@/components/PendingWithdrawalBanner';
import { buildAuthRedirectUrl } from '@/lib/auth-routes';
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
  Search,
  Store,
  ClipboardList,
  Menu,
  X,
} from 'lucide-react';
import { LocalWalletManagerModal } from '@/components/LocalWalletManagerModal';
import { useWalletModal } from '@/components/ConnectWalletModal';
import { useAuthSession } from '@/hooks/useAuthSession';

const NavbarSearchBar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = pathname === '/' ? searchParams?.get('q') || '' : '';
  const [query, setQuery] = useState(urlQuery);

  useEffect(() => {
    if (pathname === '/') {
      setQuery(searchParams?.get('q') || '');
    }
  }, [pathname, searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    const params = new URLSearchParams(
      pathname === '/' ? searchParams?.toString() || '' : ''
    );
    if (trimmed) {
      params.set('q', trimmed);
    } else {
      params.delete('q');
    }
    params.delete('page');
    const nextSearch = params.toString();
    router.push(nextSearch ? `/?${nextSearch}` : '/');
  };

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label="Tìm kiếm đồ sưu tầm trên Escrow Marketplace"
      className="relative flex-1 min-w-0"
    >
      <label htmlFor="navbar-marketplace-search" className="sr-only">
        Tìm kiếm sản phẩm sưu tầm theo tên, SKU hoặc mô tả
      </label>
      <div className="flex items-center rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] focus-within:bg-[#FFFFFF] focus-within:border-[#3458D4] focus-within:ring-2 focus-within:ring-[#3458D4]/20 transition">
        <Search className="w-4 h-4 text-[#525866] ml-3 shrink-0" aria-hidden="true" />
        <input
          id="navbar-marketplace-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm LEGO, mô hình, figure, thẻ bài, xu hoặc SKU..."
          className="w-full min-w-0 bg-transparent px-2.5 py-2 text-xs sm:text-sm text-[#17191F] placeholder:text-[#525866] focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Tìm kiếm"
          className="m-1 px-3 py-1.5 rounded-lg bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold shrink-0 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-1"
        >
          Tìm
        </button>
      </div>
    </form>
  );
};

const AuthVerifyLink: React.FC = () => {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const qs = searchParams?.toString() || '';
  const authHref = buildAuthRedirectUrl(pathname, qs ? `?${qs}` : '');

  return (
    <Link
      href={authHref}
      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#3458D4]/30 bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-[#2947B5] text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
    >
      <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Xác thực ví</span>
    </Link>
  );
};

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

  const isActive = (prefix: string) =>
    prefix === '/' ? pathname === '/' : pathname === prefix || pathname?.startsWith(`${prefix}/`);

  return (
    <>
      <PendingWithdrawalBanner />
      <header className="border-b border-[#E5E7EB] bg-[#FFFFFF]/95 backdrop-blur sticky top-0 z-50 transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-2 sm:gap-4">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-2 group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded-xl"
            >
              <div className="w-9 h-9 rounded-xl bg-[#3458D4] flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm sm:text-base leading-tight tracking-tight text-[#17191F] whitespace-nowrap">
                  Escrow Marketplace
                </span>
                <span className="hidden sm:block text-[10px] text-[#525866] font-medium tracking-wider uppercase whitespace-nowrap">
                  Chợ đồ sưu tầm · Avalanche Fuji
                </span>
              </div>
            </Link>

            {/* Desktop Search Bar */}
            <div className="hidden lg:flex flex-1 max-w-md xl:max-w-lg mx-2">
              <Suspense
                fallback={
                  <div className="w-full h-10 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA]" />
                }
              >
                <NavbarSearchBar />
              </Suspense>
            </div>

            {/* Desktop Navigation */}
            <nav
              aria-label="Điều hướng chính"
              className="hidden md:flex items-center gap-1 text-xs font-semibold text-[#525866] shrink-0"
            >
              <Link
                href="/sell"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] ${
                  isActive('/sell')
                    ? 'bg-[#3458D4]/10 text-[#2947B5]'
                    : 'text-[#17191F] hover:bg-[#F7F8FA]'
                }`}
              >
                <Store className="w-4 h-4 text-[#3458D4]" aria-hidden="true" />
                <span>Đăng bán</span>
              </Link>

              <Link
                href="/trades"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] ${
                  isActive('/trades')
                    ? 'bg-[#3458D4]/10 text-[#2947B5]'
                    : 'text-[#17191F] hover:bg-[#F7F8FA]'
                }`}
              >
                <ClipboardList className="w-4 h-4 text-[#3458D4]" aria-hidden="true" />
                <span>Giao dịch của tôi</span>
              </Link>

              <Link
                href="/trade/new"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] ${
                  isActive('/trade/new')
                    ? 'bg-[#3458D4]/10 text-[#2947B5]'
                    : 'text-[#525866] hover:text-[#17191F] hover:bg-[#F7F8FA]'
                }`}
              >
                <PlusCircle className="w-4 h-4 text-[#525866]" aria-hidden="true" />
                <span className="hidden xl:inline">Escrow P2P</span>
                <span className="xl:hidden">P2P</span>
              </Link>

              {isOwner && (
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[#7A4B00] bg-[#F0B44D]/20 hover:bg-[#F0B44D]/30 transition-colors border border-[#F0B44D]/50 font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
                >
                  <ShieldAlert className="w-4 h-4 text-[#7A4B00]" aria-hidden="true" />
                  <span className="hidden xl:inline">Trọng tài Admin</span>
                  <span className="xl:hidden">Admin</span>
                </Link>
              )}
            </nav>

            {/* Wallet / Auth Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {isLocalWallet && (
                <button
                  type="button"
                  onClick={() => setWalletModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#3458D4]/30 bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-[#2947B5] text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
                  title="Cài đặt và quản lý ví thiết bị"
                  aria-label="Quản lý ví thiết bị"
                >
                  <Lock className="w-3.5 h-3.5 text-[#2947B5]" aria-hidden="true" />
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
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Đổi sang {targetChain.name}</span>
                      </button>
                    ) : (
                      <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] text-xs font-medium text-[#17191F]">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        <span>Fuji</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setAccountMenuOpen((prev) => !prev)}
                      aria-expanded={accountMenuOpen}
                      aria-label="Mở menu tài khoản ví"
                      className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#FFFFFF] hover:bg-[#F7F8FA] border border-[#E5E7EB] text-[#17191F] text-xs font-semibold shadow-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
                    >
                      <span className="font-mono">
                        {address.slice(0, 6)}...{address.slice(-4)}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#525866]" aria-hidden="true" />
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
                          aria-label="Sao chép địa chỉ ví"
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
                                        ? 'bg-[#3458D4]/10 text-[#2947B5] font-semibold'
                                        : 'text-[#17191F] hover:bg-[#F7F8FA]'
                                    }`}
                                  >
                                    <span>
                                      Acc {i + 1}: {acc.slice(0, 6)}...{acc.slice(-4)}
                                    </span>
                                    {active && (
                                      <span className="text-[10px] font-sans text-[#2947B5]">
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

                      <Link
                        href="/trades"
                        onClick={() => setAccountMenuOpen(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#17191F] hover:bg-[#F7F8FA] transition"
                      >
                        <ClipboardList className="w-3.5 h-3.5 text-[#3458D4]" />
                        <span>Giao dịch của tôi</span>
                      </Link>

                      <Link
                        href="/sell"
                        onClick={() => setAccountMenuOpen(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#17191F] hover:bg-[#F7F8FA] transition"
                      >
                        <Store className="w-3.5 h-3.5 text-[#3458D4]" />
                        <span>Kênh người bán</span>
                      </Link>

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
                  <Suspense fallback={null}>
                    <AuthVerifyLink />
                  </Suspense>
                  <button
                    type="button"
                    onClick={() => openConnectModal()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-bold shadow-sm transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-1"
                  >
                    <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Kết nối ví</span>
                  </button>
                </div>
              )}

              {/* Mobile Nav Toggle */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
                className="md:hidden inline-flex items-center justify-center p-2 rounded-xl border border-[#E5E7EB] text-[#17191F] hover:bg-[#F7F8FA] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
              >
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Mobile / Tablet Search Row */}
          <div className="lg:hidden pb-3">
            <Suspense
              fallback={
                <div className="w-full h-10 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA]" />
              }
            >
              <NavbarSearchBar />
            </Suspense>
          </div>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <nav
              aria-label="Điều hướng di động"
              className="md:hidden pb-3 pt-1 border-t border-[#E5E7EB] grid grid-cols-2 gap-2 text-xs font-semibold"
            >
              <Link
                href="/"
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
                  isActive('/')
                    ? 'border-[#3458D4] bg-[#3458D4]/10 text-[#2947B5]'
                    : 'border-[#E5E7EB] bg-[#F7F8FA] text-[#17191F]'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-[#3458D4]" aria-hidden="true" />
                <span>Chợ sưu tầm</span>
              </Link>
              <Link
                href="/sell"
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
                  isActive('/sell')
                    ? 'border-[#3458D4] bg-[#3458D4]/10 text-[#2947B5]'
                    : 'border-[#E5E7EB] bg-[#F7F8FA] text-[#17191F]'
                }`}
              >
                <Store className="w-4 h-4 text-[#3458D4]" aria-hidden="true" />
                <span>Đăng bán</span>
              </Link>
              <Link
                href="/trades"
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
                  isActive('/trades')
                    ? 'border-[#3458D4] bg-[#3458D4]/10 text-[#2947B5]'
                    : 'border-[#E5E7EB] bg-[#F7F8FA] text-[#17191F]'
                }`}
              >
                <ClipboardList className="w-4 h-4 text-[#3458D4]" aria-hidden="true" />
                <span>Giao dịch của tôi</span>
              </Link>
              <Link
                href="/trade/new"
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
                  isActive('/trade/new')
                    ? 'border-[#3458D4] bg-[#3458D4]/10 text-[#2947B5]'
                    : 'border-[#E5E7EB] bg-[#F7F8FA] text-[#17191F]'
                }`}
              >
                <PlusCircle className="w-4 h-4 text-[#525866]" aria-hidden="true" />
                <span>Escrow P2P</span>
              </Link>
              {!isConnected && (
                <Link
                  href="/auth"
                  className="col-span-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#3458D4]/30 bg-[#3458D4]/10 text-[#2947B5]"
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  <span>Xác thực hoặc tạo ví trình duyệt</span>
                </Link>
              )}
              {isOwner && (
                <Link
                  href="/admin"
                  className="col-span-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#F0B44D]/50 bg-[#F0B44D]/20 text-[#7A4B00]"
                >
                  <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                  <span>Trọng tài Admin</span>
                </Link>
              )}
            </nav>
          )}
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
