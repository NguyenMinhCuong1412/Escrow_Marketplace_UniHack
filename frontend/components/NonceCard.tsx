'use client';

import React, { useState } from 'react';
import { Copy, Check, ShieldAlert, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface NonceCardProps {
  nonce?: string | null;
  state: number;
}

export const NonceCard: React.FC<NonceCardProps> = ({ nonce, state }) => {
  const [copied, setCopied] = useState(false);

  // AC-04: Chỉ hiển thị khi state >= AwaitingEvidence (state >= 1)
  if (state < 1 || !nonce || nonce === '0x' || nonce === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    return null;
  }

  // 8 ký tự hex đầu sau 0x theo FRONTEND_SPEC mục 3.2
  const shortNonce = nonce.length >= 10 ? nonce.slice(2, 10).toLowerCase() : nonce;

  const handleCopy = () => {
    navigator.clipboard.writeText(shortNonce);
    setCopied(true);
    toast.success(`Đã sao chép mã nonce: ${shortNonce}`);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-white tracking-tight">
            Mã Nonce Xác Thực Bằng Chứng
          </h3>
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
          Chống giả mạo
        </span>
      </div>

      <div className="py-6 text-center space-y-3">
        <p className="text-xs text-slate-400">
          Mã xác thực duy nhất do hợp đồng thông minh sinh ra cho giao dịch này:
        </p>

        {/* AC-04: Font mono cỡ to rõ (>= 24px: text-3xl hoặc text-4xl) */}
        <div className="inline-flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-slate-950/80 border border-amber-500/40 shadow-inner group">
          <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-[0.25em] text-amber-300 select-all">
            {shortNonce}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all shadow-sm active:scale-95"
            title="Sao chép mã nonce"
          >
            {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>

        <div className="text-[11px] font-mono text-slate-500 truncate max-w-md mx-auto">
          Full 32-byte hash: {nonce}
        </div>
      </div>

      <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 text-xs text-slate-300 space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-amber-400">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>Hướng dẫn bắt buộc để AI xác thực hợp lệ:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-400 leading-relaxed pl-1">
          <li>
            Viết <strong>8 ký tự trên ({shortNonce})</strong> bằng bút đen rõ ràng lên một tờ giấy trắng.
          </li>
          <li>
            Đặt tờ giấy <strong>cạnh món hàng sưu tầm</strong> trong cùng một khung hình.
          </li>
          <li>
            Chụp ảnh đóng gói (Người bán) hoặc quay video/ảnh mở hộp (Người mua) đủ ánh sáng, không bị bóng mờ hay che khuất mã.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default NonceCard;
