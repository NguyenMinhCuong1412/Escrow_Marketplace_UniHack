'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useConnect } from 'wagmi';
import { privateKeyToAccount } from 'viem/accounts';
import { targetChain } from '@/lib/wagmi';
import {
  generateLocalWallet,
  importWalletFromMnemonic,
  importWalletFromPrivateKey,
  decryptKeystore,
  validatePasswordStrength,
} from '@/lib/local-wallet/crypto';
import {
  loadKeystoreFromStorage,
  saveKeystoreToStorage,
  removeKeystoreFromStorage,
  exportKeystoreBackup,
} from '@/lib/local-wallet/storage';
import {
  setActiveLocalAccount,
  getActiveLocalAccount,
  lockLocalWallet,
} from '@/lib/local-wallet/session';
import type { EncryptedKeystoreV1, KeystorePayload } from '@/lib/local-wallet/types';
import { LOCAL_WALLET_CONNECTOR_ID } from '@/lib/local-wallet/connector';
import { buildAuthChallengeMessage } from '@/lib/auth-challenge';
import { useAuthSession } from '@/hooks/useAuthSession';

type LocalTab = 'create' | 'unlock' | 'restore';
const WALLET_NAME_STORAGE_KEY = 'escrow_marketplace_local_wallet_name';

export default function LocalWalletAuthPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/';
  const backHref =
    returnUrl && returnUrl !== '/'
      ? `/auth?returnUrl=${encodeURIComponent(returnUrl)}`
      : '/auth';

  const { connectAsync, connectors } = useConnect();
  const { syncServerSession, logout } = useAuthSession();

  const [mounted, setMounted] = useState(false);
  const [savedKeystore, setSavedKeystore] = useState<EncryptedKeystoreV1 | null>(null);
  const [savedWalletName, setSavedWalletName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<LocalTab>('create');
  const [unlockedAddress, setUnlockedAddress] = useState<string | null>(null);

  // Create state
  const [walletNameInput, setWalletNameInput] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');
  const [generatedPayload, setGeneratedPayload] = useState<KeystorePayload | null>(null);
  const [generatedKeystore, setGeneratedKeystore] = useState<EncryptedKeystoreV1 | null>(null);
  const [hasBackedUp, setHasBackedUp] = useState<boolean>(false);
  const [copiedPhrase, setCopiedPhrase] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Unlock state
  const [unlockPassword, setUnlockPassword] = useState<string>('');

  // Restore state
  const [restoreSeedInput, setRestoreSeedInput] = useState<string>('');
  const [restorePassword, setRestorePassword] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    const loaded = loadKeystoreFromStorage();
    setSavedKeystore(loaded);
    const activeAcc = getActiveLocalAccount();
    setUnlockedAddress(activeAcc ? activeAcc.address : null);

    try {
      const storedName = window.localStorage.getItem(WALLET_NAME_STORAGE_KEY) || '';
      setSavedWalletName(storedName);
    } catch {
      // ignore
    }

    if (loaded) {
      setActiveTab('unlock');
    } else {
      setActiveTab('create');
    }
  }, []);

  const connectAndAuthenticateLocal = async (
    acc: ReturnType<typeof privateKeyToAccount>,
    ks: EncryptedKeystoreV1
  ) => {
    setActiveLocalAccount(acc, ks);
    setUnlockedAddress(acc.address);

    const localConnector = connectors.find((c) => c.id === LOCAL_WALLET_CONNECTOR_ID);
    if (localConnector) {
      await connectAsync({ connector: localConnector }).catch(() => {});
    }

    try {
      const getRes = await fetch('/api/auth/session', { cache: 'no-store' });
      const { nonce } = await getRes.json();
      if (nonce) {
        const message = buildAuthChallengeMessage(acc.address, nonce, targetChain.id);
        const signature = await acc.signMessage({ message });
        const postRes = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: acc.address,
            chainId: targetChain.id,
            nonce,
            signature,
          }),
        });
        if (postRes.ok) {
          syncServerSession(true, acc.address);
        }
      }
    } catch {
      // ignore background session warning
    }
  };

  const handleSelectTab = (tab: LocalTab) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setActiveTab(tab);
  };

  // Step 1 of Create: generate keypair & encrypted keystore
  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const validation = validatePasswordStrength(createPassword);
    if (!validation.valid) {
      setErrorMsg(validation.reason || 'Mật khẩu phải có tối thiểu 8 ký tự.');
      return;
    }

    try {
      setIsBusy(true);
      const result = await generateLocalWallet(createPassword);
      setGeneratedPayload(result.payload);
      setGeneratedKeystore(result.keystore);
      setHasBackedUp(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tạo ví mới.');
    } finally {
      setIsBusy(false);
    }
  };

  // Step 2 of Create: confirm backup & activate wallet
  const handleCompleteCreate = async () => {
    if (!hasBackedUp) {
      setErrorMsg('Vui lòng đánh dấu xác nhận đã lưu cụm từ khôi phục.');
      return;
    }
    if (!generatedKeystore || !generatedPayload) return;

    setErrorMsg(null);
    saveKeystoreToStorage(generatedKeystore);
    setSavedKeystore(generatedKeystore);

    const trimmedName = walletNameInput.trim();
    if (trimmedName) {
      try {
        window.localStorage.setItem(WALLET_NAME_STORAGE_KEY, trimmedName);
        setSavedWalletName(trimmedName);
      } catch {
        // ignore
      }
    }

    const acc = privateKeyToAccount(generatedPayload.privateKey);
    await connectAndAuthenticateLocal(acc, generatedKeystore);

    setGeneratedPayload(null);
    setGeneratedKeystore(null);
    setCreatePassword('');
    setActiveTab('unlock');
    setStatusMsg('Đã tạo và mở khóa ví trên trình duyệt.');
  };

  // Unlock existing keystore
  const handleUnlockWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    if (!unlockPassword.trim()) {
      setErrorMsg('Vui lòng nhập mật khẩu mở khóa ví.');
      return;
    }
    if (!savedKeystore) {
      setErrorMsg('Chưa có ví được lưu trên trình duyệt này.');
      return;
    }

    try {
      setIsBusy(true);
      const payload = await decryptKeystore(savedKeystore, unlockPassword);
      const acc = privateKeyToAccount(payload.privateKey);
      await connectAndAuthenticateLocal(acc, savedKeystore);
      setUnlockPassword('');
      setStatusMsg('Đã mở khóa ví thành công.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Mật khẩu không đúng.');
    } finally {
      setIsBusy(false);
    }
  };

  // Lock active local wallet (keeps keystore in storage so user can unlock again)
  const handleLockWallet = async () => {
    setErrorMsg(null);
    lockLocalWallet();
    setUnlockedAddress(null);
    await logout();
    setActiveTab('unlock');
    setStatusMsg('Ví đã được khóa.');
  };

  // Remove keystore from browser
  const handleRemoveKeystore = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    lockLocalWallet();
    setUnlockedAddress(null);
    removeKeystoreFromStorage();
    try {
      window.localStorage.removeItem(WALLET_NAME_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSavedKeystore(null);
    setSavedWalletName('');
    setUnlockPassword('');
    await logout();
    setActiveTab('create');
  };

  // Restore wallet from 12-word phrase or private key
  const handleRestoreWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const cleanInput = restoreSeedInput.trim();
    if (!cleanInput) {
      setErrorMsg('Vui lòng nhập cụm từ khôi phục (12 từ) hoặc khóa riêng.');
      return;
    }

    const validation = validatePasswordStrength(restorePassword);
    if (!validation.valid) {
      setErrorMsg(validation.reason || 'Mật khẩu phải có tối thiểu 8 ký tự.');
      return;
    }

    try {
      setIsBusy(true);
      let result;
      if (cleanInput.startsWith('0x') || cleanInput.length === 64) {
        result = await importWalletFromPrivateKey(
          (cleanInput.startsWith('0x') ? cleanInput : `0x${cleanInput}`) as `0x${string}`,
          restorePassword
        );
      } else {
        result = await importWalletFromMnemonic(cleanInput, restorePassword);
      }

      saveKeystoreToStorage(result.keystore);
      setSavedKeystore(result.keystore);
      const acc = privateKeyToAccount(result.payload.privateKey);
      await connectAndAuthenticateLocal(acc, result.keystore);

      setRestoreSeedInput('');
      setRestorePassword('');
      setActiveTab('unlock');
      setStatusMsg('Đã khôi phục và mở khóa ví thành công.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Cụm từ khôi phục không hợp lệ.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyPhrase = () => {
    if (generatedPayload?.mnemonic) {
      navigator.clipboard.writeText(generatedPayload.mnemonic);
      setCopiedPhrase(true);
      setTimeout(() => setCopiedPhrase(false), 2000);
    }
  };

  const visibleTabs: { id: LocalTab; label: string }[] = [
    { id: 'create', label: 'Tạo ví' },
    ...(mounted && savedKeystore ? [{ id: 'unlock' as LocalTab, label: 'Mở khóa' }] : []),
    { id: 'restore', label: 'Khôi phục' },
  ];

  return (
    <div
      data-auth-theme="light"
      className="fixed inset-0 z-40 overflow-y-auto overflow-x-hidden bg-[var(--bg)] text-[var(--text)]"
    >
      <div className="min-h-full w-full max-w-[420px] mx-auto px-5 py-12 sm:py-20 flex flex-col justify-between gap-10 text-left">
        <div className="space-y-8">
          {/* Back Link */}
          <div>
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
            >
              <span>← Quay lại</span>
            </Link>
          </div>

          {/* 2-Line Bold Heading */}
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight leading-snug">
              <span className="block text-[var(--text)]">Ví trên trình duyệt.</span>
              <span className="block text-[var(--accent)]">Không cần cài extension.</span>
            </h1>
          </div>

          {/* Underline Tabs */}
          <div
            role="tablist"
            aria-label="Tùy chọn ví trên trình duyệt"
            className="flex items-center gap-6 border-b border-[var(--border)]"
          >
            {visibleTabs.map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={isSelected}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`pb-2.5 text-sm font-semibold border-b-2 -mb-[1px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-t ${
                    isSelected
                      ? 'border-[var(--accent)] text-[var(--text)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Status / Error Feedback */}
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--accent)] font-medium"
            >
              {errorMsg}
            </div>
          )}

          {statusMsg && (
            <div
              role="status"
              className="p-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text)] font-medium"
            >
              {statusMsg}
            </div>
          )}

          {/* TAB PANEL 1: TẠO VÍ */}
          {activeTab === 'create' && (
            <div id="panel-create" role="tabpanel" aria-labelledby="tab-create" className="space-y-4">
              {!generatedPayload ? (
                <form onSubmit={handleCreateWallet} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="local-wallet-name"
                      className="block text-xs font-medium text-[var(--text)]"
                    >
                      Tên ví (chỉ lưu trên máy này)
                    </label>
                    <input
                      id="local-wallet-name"
                      type="text"
                      value={walletNameInput}
                      onChange={(e) => setWalletNameInput(e.target.value)}
                      placeholder="Tên ví (chỉ lưu trên máy này)"
                      className="w-full px-3.5 py-2.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="local-wallet-create-password"
                      className="block text-xs font-medium text-[var(--text)]"
                    >
                      Mật khẩu
                    </label>
                    <input
                      id="local-wallet-create-password"
                      type="password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Mật khẩu (tối thiểu 8 ký tự)"
                      required
                      className="w-full px-3.5 py-2.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="w-full py-3 px-4 rounded-[10px] bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  >
                    {isBusy ? 'Đang tạo ví...' : 'Tạo ví'}
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--text)]">
                        12 từ khôi phục của bạn
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyPhrase}
                        className="font-medium text-[var(--accent)] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                      >
                        {copiedPhrase ? 'Đã sao chép' : 'Sao chép 12 từ'}
                      </button>
                    </div>

                    <div
                      style={{ fontFamily: 'var(--font-mono)' }}
                      className="grid grid-cols-3 gap-1.5 text-xs"
                    >
                      {generatedPayload.mnemonic?.split(' ').map((word, idx) => (
                        <div
                          key={idx}
                          className="px-2 py-1.5 rounded-[6px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]"
                        >
                          <span className="text-[var(--text-muted)] mr-1">{idx + 1}.</span>
                          <span className="font-medium">{word}</span>
                        </div>
                      ))}
                    </div>

                    {generatedKeystore && (
                      <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
                        <span className="text-[var(--text-muted)]">Bản sao lưu (.json)</span>
                        <button
                          type="button"
                          onClick={() => exportKeystoreBackup(generatedKeystore)}
                          className="font-medium text-[var(--text)] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                        >
                          Tải xuống máy
                        </button>
                      </div>
                    )}
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasBackedUp}
                      onChange={(e) => setHasBackedUp(e.target.checked)}
                      className="mt-0.5 rounded border-[var(--border)] focus:ring-2 focus:ring-[var(--accent)]"
                    />
                    <span>
                      Tôi đã lưu lại 12 từ khôi phục này ở nơi an toàn.
                    </span>
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedPayload(null);
                        setGeneratedKeystore(null);
                      }}
                      className="py-2.5 px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-medium text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      Quay lại
                    </button>
                    <button
                      type="button"
                      disabled={!hasBackedUp}
                      onClick={handleCompleteCreate}
                      className="flex-1 py-2.5 px-4 rounded-[10px] bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      Hoàn tất & Mở khóa ví
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB PANEL 2: MỞ KHÓA (chỉ hiển thị khi có keystore) */}
          {activeTab === 'unlock' && savedKeystore && (
            <div id="panel-unlock" role="tabpanel" aria-labelledby="tab-unlock" className="space-y-4">
              <div className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] space-y-1.5 text-xs">
                {savedWalletName && (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Tên ví</span>
                    <span className="font-semibold text-[var(--text)]">{savedWalletName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Địa chỉ ví</span>
                  <span
                    style={{ fontFamily: 'var(--font-mono)' }}
                    className="font-semibold text-[var(--text)]"
                    title={savedKeystore.address}
                  >
                    {savedKeystore.address.slice(0, 8)}...{savedKeystore.address.slice(-6)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Trạng thái</span>
                  <span className="font-medium text-[var(--text)]">
                    {unlockedAddress ? 'Đang mở khóa' : 'Đang khóa'}
                  </span>
                </div>
              </div>

              {unlockedAddress ? (
                <div className="space-y-3">
                  <Link
                    href={returnUrl}
                    className="block w-full py-3 px-4 rounded-[10px] bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-sm text-center transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  >
                    Vào sàn giao dịch →
                  </Link>
                  <button
                    type="button"
                    onClick={handleLockWallet}
                    className="w-full py-2.5 px-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-medium text-xs transition-colors hover:border-[var(--text-muted)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    Khóa ví ngay
                  </button>
                </div>
              ) : (
                <form onSubmit={handleUnlockWallet} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="local-wallet-unlock-password"
                      className="block text-xs font-medium text-[var(--text)]"
                    >
                      Mật khẩu
                    </label>
                    <input
                      id="local-wallet-unlock-password"
                      type="password"
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      placeholder="Nhập mật khẩu mở khóa ví"
                      required
                      className="w-full px-3.5 py-2.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="w-full py-3 px-4 rounded-[10px] bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  >
                    {isBusy ? 'Đang mở khóa...' : 'Mở khóa'}
                  </button>

                  <div className="pt-1 text-right">
                    <button
                      type="button"
                      onClick={handleRemoveKeystore}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                    >
                      Xoá ví khỏi máy này
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB PANEL 3: KHÔI PHỤC */}
          {activeTab === 'restore' && (
            <div id="panel-restore" role="tabpanel" aria-labelledby="tab-restore">
              <form onSubmit={handleRestoreWallet} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="local-wallet-restore-seed"
                    className="block text-xs font-medium text-[var(--text)]"
                  >
                    Cụm từ khôi phục (12 từ) hoặc khóa riêng
                  </label>
                  <textarea
                    id="local-wallet-restore-seed"
                    rows={3}
                    value={restoreSeedInput}
                    onChange={(e) => setRestoreSeedInput(e.target.value)}
                    placeholder="Nhập 12 từ khôi phục cách nhau bằng khoảng trắng..."
                    required
                    style={{ fontFamily: 'var(--font-mono)' }}
                    className="w-full px-3.5 py-2.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="local-wallet-restore-password"
                    className="block text-xs font-medium text-[var(--text)]"
                  >
                    Mật khẩu mới trên máy này
                  </label>
                  <input
                    id="local-wallet-restore-password"
                    type="password"
                    value={restorePassword}
                    onChange={(e) => setRestorePassword(e.target.value)}
                    placeholder="Mật khẩu (tối thiểu 8 ký tự)"
                    required
                    className="w-full px-3.5 py-2.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full py-3 px-4 rounded-[10px] bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  {isBusy ? 'Đang khôi phục...' : 'Khôi phục ví'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer Honest Note + Collapsible Technical Details */}
        <footer className="pt-6 border-t border-[var(--border)] space-y-3">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Ví được khoá bằng mật khẩu ngay trên máy bạn. Quên mật khẩu mà chưa lưu cụm từ khôi phục thì không lấy lại được.
          </p>

          <details className="text-xs text-[var(--text-muted)]">
            <summary className="cursor-pointer font-medium hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded inline-block">
              Chi tiết kỹ thuật mã hoá
            </summary>
            <p className="mt-1.5 leading-relaxed">
              Cụm từ khôi phục sinh theo chuẩn BIP-39; dữ liệu khóa được mã hoá cục bộ bằng AES-256-GCM (dẫn xuất khoá PBKDF2 100.000 vòng lặp SHA-256).
            </p>
          </details>
        </footer>
      </div>
    </div>
  );
}
