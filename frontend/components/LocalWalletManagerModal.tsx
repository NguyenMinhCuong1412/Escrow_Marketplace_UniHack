'use client';

import React, { useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  Shield,
  Lock,
  Download,
  KeyRound,
  Trash2,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';
import { AddressDisplay } from './AddressDisplay';
import {
  getActiveKeystore,
} from '@/lib/local-wallet/session';
import {
  decryptKeystore,
} from '@/lib/local-wallet/crypto';
import {
  exportKeystoreBackup,
  removeKeystoreFromStorage,
} from '@/lib/local-wallet/storage';

interface LocalWalletManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LocalWalletManagerModal({ isOpen, onClose }: LocalWalletManagerModalProps) {
  const { address } = useAccount();
  const { logout } = useAuthSession();
  const { data: balance } = useBalance({ address });

  const [activeTab, setActiveTab] = useState<'overview' | 'backup' | 'danger'>('overview');

  // Password confirmation state to reveal backup phrase
  const [revealPassword, setRevealPassword] = useState('');
  const [revealedMnemonic, setRevealedMnemonic] = useState<string | null>(null);
  const [revealedPrivateKey, setRevealedPrivateKey] = useState<string | null>(null);
  const [revealError, setRevealError] = useState('');
  const [isRevealing, setIsRevealing] = useState(false);
  const [copiedMnemonic, setCopiedMnemonic] = useState(false);

  // Danger zone confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isOpen || !address) return null;

  const keystore = getActiveKeystore();

  const handleLockWallet = async () => {
    await logout();
    onClose();
  };

  const handleDownloadBackup = () => {
    if (keystore) {
      exportKeystoreBackup(keystore);
    }
  };

  const handleRevealSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revealPassword) {
      setRevealError('Vui lòng nhập mật khẩu.');
      return;
    }
    if (!keystore) {
      setRevealError('Không tìm thấy dữ liệu keystore.');
      return;
    }

    try {
      setIsRevealing(true);
      setRevealError('');
      const payload = await decryptKeystore(keystore, revealPassword);
      setRevealedPrivateKey(payload.privateKey);
      if (payload.mnemonic) {
        setRevealedMnemonic(payload.mnemonic);
      }
    } catch (err: any) {
      setRevealError(err.message || 'Mật khẩu không đúng.');
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopyMnemonic = () => {
    if (revealedMnemonic) {
      navigator.clipboard.writeText(revealedMnemonic);
      setCopiedMnemonic(true);
      setTimeout(() => setCopiedMnemonic(false), 2000);
    }
  };

  const handleDeleteWallet = async () => {
    removeKeystoreFromStorage();
    await logout();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl shadow-2xl p-6 text-[#17191F] flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#3458D4]/10 text-[#3458D4] border border-[#3458D4]/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#17191F]">Quản lý ví thiết bị (Local Wallet)</h3>
              <p className="text-xs text-[#525866]">Avalanche Fuji Testnet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#525866] hover:text-[#17191F] hover:bg-[#F7F8FA] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex rounded-xl bg-[#F7F8FA] p-1 border border-[#E5E7EB] text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
              activeTab === 'overview' ? 'bg-[#3458D4] text-white shadow-sm' : 'text-[#525866] hover:text-[#17191F]'
            }`}
          >
            Tổng quan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
              activeTab === 'backup' ? 'bg-[#3458D4] text-white shadow-sm' : 'text-[#525866] hover:text-[#17191F]'
            }`}
          >
            Sao lưu an toàn
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('danger')}
            className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
              activeTab === 'danger' ? 'bg-red-600 text-white shadow-sm' : 'text-[#525866] hover:text-[#17191F]'
            }`}
          >
            Xóa ví
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#525866]">Địa chỉ ví:</span>
                <AddressDisplay address={address} />
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#525866]">Số dư Fuji AVAX:</span>
                <span className="text-[#3458D4] font-semibold font-mono">
                  {balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : '...'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#525866]">Trạng thái khóa:</span>
                <span className="text-emerald-700 flex items-center gap-1 font-medium">
                  <Check className="w-3.5 h-3.5" /> Đã mở khóa trong phiên
                </span>
              </div>
            </div>

            <div className="bg-[#F0B44D]/15 border border-[#F0B44D]/40 rounded-xl p-3 flex items-start gap-2 text-xs text-[#8A5A00]">
              <AlertTriangle className="w-4 h-4 text-[#8A5A00] shrink-0 mt-0.5" />
              <span>
                Ví được lưu trữ mã hóa trực tiếp trên trình duyệt của bạn. Khi không sử dụng, hãy bấm <strong>Khóa ví</strong> để xóa khóa khỏi bộ nhớ RAM.
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleLockWallet}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F7F8FA] text-[#17191F] text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Lock className="w-4 h-4 text-[#8A5A00]" />
                Khóa ví ngay
              </button>
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4" />
                Tải file sao lưu (.json)
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Backup */}
        {activeTab === 'backup' && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="bg-[#3458D4]/10 border border-[#3458D4]/20 rounded-xl p-3 flex items-start gap-2 text-xs text-[#3458D4]">
              <Shield className="w-4 h-4 text-[#3458D4] shrink-0 mt-0.5" />
              <span>
                Cung cấp 12 từ khóa khôi phục và file sao lưu JSON. Hãy lưu trữ ngoại tuyến ở nơi an toàn. Tuyệt đối không chia sẻ cho bất kỳ ai!
              </span>
            </div>

            {!revealedMnemonic && !revealedPrivateKey ? (
              <form onSubmit={handleRevealSecret} className="flex flex-col gap-3">
                <label className="text-xs text-[#525866]">
                  Nhập mật khẩu mở khóa ví để hiển thị cụm từ khôi phục:
                </label>
                <input
                  type="password"
                  value={revealPassword}
                  onChange={(e) => setRevealPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl text-sm text-[#17191F] placeholder-[#6B7280] focus:border-[#3458D4] focus:outline-none"
                />
                {revealError && <p className="text-xs text-red-600">{revealError}</p>}
                <button
                  type="submit"
                  disabled={isRevealing}
                  className="w-full py-2.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {isRevealing ? 'Đang giải mã...' : 'Xác nhận & Hiển thị cụm từ khôi phục'}
                </button>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                {revealedMnemonic ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#525866]">12 từ khóa khôi phục (BIP-39):</span>
                      <button
                        type="button"
                        onClick={handleCopyMnemonic}
                        className="text-xs text-[#3458D4] hover:text-[#2947B5] flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {copiedMnemonic ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedMnemonic ? 'Đã sao chép' : 'Sao chép'}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 bg-[#F7F8FA] p-3 rounded-xl border border-[#E5E7EB] select-all font-mono text-xs text-[#17191F]">
                      {revealedMnemonic.split(' ').map((word, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-[#FFFFFF] px-2 py-1.5 rounded-lg border border-[#E5E7EB] shadow-sm">
                          <span className="text-[#525866] text-[10px] w-4">{i + 1}.</span>
                          <span className="font-medium text-[#3458D4]">{word}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-[#525866]">Khóa riêng tư (Private Key):</span>
                    <div className="bg-[#F7F8FA] p-2.5 rounded-xl border border-[#E5E7EB] text-xs font-mono text-[#17191F] break-all select-all">
                      {revealedPrivateKey}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setRevealedMnemonic(null);
                    setRevealedPrivateKey(null);
                    setRevealPassword('');
                  }}
                  className="py-2 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F7F8FA] text-[#525866] text-xs font-medium transition cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  Ẩn thông tin bảo mật
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Danger Zone */}
        {activeTab === 'danger' && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>
                Thao tác này sẽ xóa hoàn toàn dữ liệu keystore đã mã hóa khỏi bộ nhớ của trình duyệt này. Nếu chưa sao lưu, bạn sẽ <strong>mất toàn bộ tiền cọc và quyền sở hữu mãi mãi</strong>.
              </span>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#525866] cursor-pointer">
              <input
                type="checkbox"
                checked={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.checked)}
                className="rounded border-[#E5E7EB] bg-[#FFFFFF] text-red-600 focus:ring-red-500"
              />
              <span>Tôi hiểu rõ rủi ro và xác nhận muốn xóa ví này khỏi thiết bị.</span>
            </label>

            <button
              type="button"
              disabled={!confirmDelete}
              onClick={handleDeleteWallet}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              Xác nhận xóa ví khỏi thiết bị
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
