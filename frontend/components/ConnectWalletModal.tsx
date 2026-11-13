'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import {
  initEip6963Discovery,
  requestWalletAccountSelection,
  resolveWalletProvider,
  WALLET_OPTIONS,
  type BrowserWalletId,
  type WalletOptionMeta,
} from '@/lib/wallet-providers';
import { create as createQrGrid } from 'cuer/QrCode';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react';

interface WalletModalContextValue {
  isOpen: boolean;
  openConnectModal: () => void;
  closeConnectModal: () => void;
}

const WalletModalContext = createContext<WalletModalContextValue>({
  isOpen: false,
  openConnectModal: () => {},
  closeConnectModal: () => {},
});

export function useWalletModal(): WalletModalContextValue {
  return useContext(WalletModalContext);
}

type ModalView = 'list' | 'connecting' | 'not-installed' | 'error' | 'walletconnect';

function SafeQrCode({ uri }: { uri: string }) {
  try {
    const qr = createQrGrid(uri, { errorCorrection: 'medium' });
    const size = qr.edgeLength;
    return (
      <div className="p-3 bg-white rounded-xl inline-block border border-[var(--border)]">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={200}
          height={200}
          shapeRendering="crispEdges"
          aria-label="WalletConnect QR Code"
        >
          {qr.grid.map((row: boolean[], y: number) =>
            row.map((cell: boolean, x: number) =>
              cell ? (
                <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#111113" />
              ) : null
            )
          )}
        </svg>
      </div>
    );
  } catch {
    return (
      <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-muted)]">
        Sử dụng nút sao chép liên kết bên dưới để kết nối trong ứng dụng ví của bạn.
      </div>
    );
  }
}

export function WalletModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ModalView>('list');
  const [selectedWallet, setSelectedWallet] = useState<WalletOptionMeta | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);

  const { address, isConnected, connector: activeConnector } = useAccount();
  const { connectors, connectAsync, reset } = useConnect();
  const { disconnectAsync } = useDisconnect();

  const modalRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    initEip6963Discovery();
  }, []);

  const openConnectModal = useCallback(() => {
    initEip6963Discovery();
    reset();
    setView('list');
    setSelectedWallet(null);
    setErrorMessage(null);
    setWcUri(null);
    setIsOpen(true);
  }, [reset]);

  const closeConnectModal = useCallback(() => {
    setIsOpen(false);
    setView('list');
    setSelectedWallet(null);
    setErrorMessage(null);
    setWcUri(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeConnectModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      if (view === 'list') {
        firstItemRef.current?.focus();
      }
    }, 30);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, view, closeConnectModal]);

  const handleBackToList = useCallback(() => {
    reset();
    setView('list');
    setSelectedWallet(null);
    setErrorMessage(null);
    setWcUri(null);
  }, [reset]);

  const handleSelectWallet = useCallback(
    async (wallet: WalletOptionMeta) => {
      setSelectedWallet(wallet);
      setErrorMessage(null);
      reset();

      const targetConnector = connectors.find((c) => c.id === wallet.id);
      if (!targetConnector) {
        setErrorMessage(`Không tìm thấy cấu hình kết nối cho ví ${wallet.name}.`);
        setView('error');
        return;
      }

      if (wallet.id !== 'walletConnect') {
        const provider = await resolveWalletProvider(wallet.id as BrowserWalletId);
        if (!provider) {
          setView('not-installed');
          return;
        }

        setView('connecting');
        try {
          if (isConnected && activeConnector?.id === wallet.id) {
            await requestWalletAccountSelection(activeConnector, address);
            closeConnectModal();
            return;
          }

          if (isConnected && activeConnector && activeConnector.id !== wallet.id) {
            await disconnectAsync().catch(() => {});
          }

          await connectAsync({ connector: targetConnector });
          closeConnectModal();
        } catch (err: any) {
          const msg = String(err?.shortMessage || err?.message || '');
          if (
            err?.code === 4001 ||
            msg.toLowerCase().includes('rejected') ||
            msg.toLowerCase().includes('denied') ||
            msg.toLowerCase().includes('user canceled')
          ) {
            setErrorMessage(`Đã hủy yêu cầu kết nối trên ví ${wallet.name}.`);
            setView('error');
          } else if (err?.name === 'ProviderNotFoundError' || msg.includes('Provider not found')) {
            setView('not-installed');
          } else {
            setErrorMessage(msg || `Không thể kết nối với ví ${wallet.name}. Vui lòng thử lại.`);
            setView('error');
          }
        }
        return;
      }

      setView('walletconnect');
      setWcUri(null);

      const onMessage = (event: { type: string; data?: unknown }) => {
        if (event.type === 'display_uri' && typeof event.data === 'string') {
          setWcUri(event.data);
        }
      };

      targetConnector.emitter?.on?.('message', onMessage as any);

      try {
        if (isConnected && activeConnector && activeConnector.id !== 'walletConnect') {
          await disconnectAsync().catch(() => {});
        }
        await connectAsync({ connector: targetConnector });
        closeConnectModal();
      } catch (err: any) {
        const msg = String(err?.shortMessage || err?.message || '');
        if (
          err?.code === 4001 ||
          msg.toLowerCase().includes('rejected') ||
          msg.toLowerCase().includes('user canceled')
        ) {
          setErrorMessage('Đã hủy phiên kết nối WalletConnect.');
        } else {
          setErrorMessage(msg || 'Không thể khởi tạo phiên kết nối WalletConnect.');
        }
        setView('error');
      } finally {
        targetConnector.emitter?.off?.('message', onMessage as any);
      }
    },
    [
      connectors,
      isConnected,
      activeConnector,
      address,
      reset,
      connectAsync,
      disconnectAsync,
      closeConnectModal,
    ]
  );

  const handleCopyWcUri = useCallback(() => {
    if (!wcUri) return;
    navigator.clipboard.writeText(wcUri);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2000);
  }, [wcUri]);

  return (
    <WalletModalContext.Provider value={{ isOpen, openConnectModal, closeConnectModal }}>
      {children}

      {isOpen && (
        <div
          data-auth-theme="light"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeConnectModal();
            }
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-wallet-modal-title"
            className="w-full max-w-sm rounded-xl bg-[var(--bg)] border border-[var(--border)] overflow-hidden text-[var(--text)]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                {view !== 'list' && (
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="p-1.5 -ml-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    aria-label="Quay lại danh sách ví"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <h2
                  id="connect-wallet-modal-title"
                  className="text-base font-bold text-[var(--text)] tracking-tight"
                >
                  Kết nối một chiếc ví
                </h2>
              </div>
              <button
                type="button"
                onClick={closeConnectModal}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                aria-label="Đóng hộp thoại"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* VIEW 1: Unified Single List of 5 Wallets (Only official logo + wallet name) */}
            {view === 'list' && (
              <div className="p-3 space-y-1">
                {WALLET_OPTIONS.map((wallet, idx) => (
                  <button
                    key={wallet.id}
                    ref={idx === 0 ? firstItemRef : undefined}
                    type="button"
                    onClick={() => handleSelectWallet(wallet)}
                    className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-lg bg-[var(--bg)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--border)] transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
                  >
                    <img
                      src={wallet.iconUrl}
                      alt={wallet.name}
                      className="w-7 h-7 rounded-md object-contain flex-shrink-0"
                    />
                    <span className="text-sm font-semibold text-[var(--text)]">
                      {wallet.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* VIEW 2: Connecting to Extension */}
            {view === 'connecting' && selectedWallet && (
              <div className="p-6 text-center space-y-4">
                <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
                  <img
                    src={selectedWallet.iconUrl}
                    alt={selectedWallet.name}
                    className="w-12 h-12 rounded-xl object-contain"
                  />
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center">
                    <RefreshCw className="w-3 h-3 text-[var(--accent)] animate-spin" />
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[var(--text)]">
                    Đang mở {selectedWallet.name}...
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Vui lòng chọn tài khoản và xác nhận kết nối trong cửa sổ tiện ích {selectedWallet.name}.
                  </p>
                </div>
              </div>
            )}

            {/* VIEW 3: Extension Not Installed */}
            {view === 'not-installed' && selectedWallet && (
              <div className="p-6 text-center space-y-4">
                <img
                  src={selectedWallet.iconUrl}
                  alt={selectedWallet.name}
                  className="w-12 h-12 rounded-xl object-contain mx-auto"
                />
                <div className="space-y-1.5">
                  <p className="text-sm font-bold text-[var(--text)]">
                    Chưa phát hiện ví {selectedWallet.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Tiện ích mở rộng {selectedWallet.name} chưa được cài đặt hoặc đang bị tắt trên trình duyệt này.
                  </p>
                </div>
                <div className="space-y-2 pt-1">
                  <a
                    href={selectedWallet.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-lg bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-xs transition-opacity hover:opacity-90 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <span>Cài đặt {selectedWallet.name}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleSelectWallet(selectedWallet)}
                    className="w-full py-2 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Thử lại kết nối</span>
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 4: WalletConnect QR / Pairing URI */}
            {view === 'walletconnect' && (
              <div className="p-5 text-center space-y-4">
                {wcUri ? (
                  <>
                    <SafeQrCode uri={wcUri} />
                    <p className="text-xs text-[var(--text-muted)]">
                      Quét mã QR bằng ví di động hỗ trợ WalletConnect hoặc sao chép liên kết kết nối.
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyWcUri}
                      className="w-full py-2.5 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-medium text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      {copiedUri ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Đã sao chép liên kết</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép liên kết WalletConnect</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="py-8 space-y-3">
                    <RefreshCw className="w-6 h-6 text-[var(--text-muted)] animate-spin mx-auto" />
                    <p className="text-xs text-[var(--text-muted)]">
                      Đang khởi tạo mã kết nối WalletConnect...
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 5: Error / Rejected */}
            {view === 'error' && selectedWallet && (
              <div className="p-6 text-center space-y-4">
                <div className="w-11 h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)] flex items-center justify-center mx-auto">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[var(--text)]">
                    Không thể kết nối {selectedWallet.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {errorMessage || 'Yêu cầu kết nối không thành công.'}
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="flex-1 py-2.5 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-medium text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    Chọn ví khác
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectWallet(selectedWallet)}
                    className="flex-1 py-2.5 px-3 rounded-lg bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-xs transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Thử lại</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </WalletModalContext.Provider>
  );
}
