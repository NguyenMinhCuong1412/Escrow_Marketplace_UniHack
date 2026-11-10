'use client';

import React, { useState } from 'react';
import { Copy, Check, ShieldAlert, Sparkles, QrCode, PenLine, Download } from 'lucide-react';
import { toast } from 'sonner';
import { backendBaseUrl } from '@/lib/backend';

interface NonceCardProps {
  nonce?: string | null;
  state: number;
  /** Có tradeId → hiện mã QR chứa nonce (cách khuyên dùng, AI đọc ổn định hơn chữ viết tay). */
  tradeId?: bigint | string;
}

export const NonceCard: React.FC<NonceCardProps> = ({ nonce, state, tradeId }) => {
  const [copied, setCopied] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  // AC-04: Chỉ hiển thị khi state >= AwaitingEvidence (state >= 1)
  if (state < 1 || !nonce || nonce === '0x' || nonce === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    return null;
  }

  // 8 ký tự hex đầu sau 0x theo FRONTEND_SPEC mục 3.2
  const shortNonce = nonce.length >= 10 ? nonce.slice(2, 10).toLowerCase() : nonce;
  const qrUrl = tradeId !== undefined ? `${backendBaseUrl()}/trade/${tradeId.toString()}/nonce-qr.png` : null;
  const showQr = Boolean(qrUrl) && !qrFailed;

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

      <p className="pt-4 text-xs text-slate-400 text-center">
        Mã xác thực duy nhất do hợp đồng thông minh sinh ra cho giao dịch này. Mã phải xuất hiện{' '}
        <strong className="text-slate-200">trong cùng khung hình với món hàng</strong> — chọn một trong hai cách:
      </p>

      <div className={`py-5 grid gap-4 ${showQr ? 'md:grid-cols-2' : ''}`}>
        {/* Cách 1: mã QR */}
        {showQr && qrUrl && (
          <div className="rounded-xl bg-slate-950/60 border border-emerald-500/30 p-4 flex flex-col items-center gap-3">
            <div className="w-full flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <QrCode className="w-4 h-4" />
                Cách 1 · Mã QR
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Khuyên dùng
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt={`Mã QR chứa nonce của giao dịch (${shortNonce})`}
              width={208}
              height={208}
              className="w-52 h-52 rounded-lg bg-white p-1.5"
              style={{ imageRendering: 'pixelated' }}
              onError={() => setQrFailed(true)}
            />
            <a
              href={`${qrUrl}?size=1024`}
              target="_blank"
              rel="noopener noreferrer"
              download={`nonce-qr-trade-${tradeId?.toString()}.png`}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 hover:text-emerald-300 transition-colors underline"
            >
              <Download className="w-3.5 h-3.5" />
              Mở ảnh QR cỡ lớn (để in hoặc gửi sang điện thoại)
            </a>
          </div>
        )}

        {/* Cách 2: viết tay */}
        <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 flex flex-col items-center justify-center gap-3">
          <div className="w-full flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <PenLine className="w-4 h-4" />
              {showQr ? 'Cách 2 · Viết tay' : 'Viết tay lên giấy'}
            </span>
          </div>
          {/* AC-04: Font mono cỡ to rõ (>= 24px) */}
          <div className="inline-flex items-center justify-center gap-3 px-5 py-4 rounded-xl bg-slate-950/80 border border-amber-500/40 shadow-inner">
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
          <div className="text-[11px] font-mono text-slate-500 truncate max-w-full">
            Full 32-byte hash: {nonce}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 text-xs text-slate-300 space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-amber-400">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>Hướng dẫn bắt buộc để AI xác thực hợp lệ:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-400 leading-relaxed pl-1">
          {showQr && (
            <li>
              <strong>Mã QR:</strong> mở ảnh QR trên điện thoại (hoặc in ra giấy), tăng độ sáng màn hình, đặt{' '}
              <strong>cạnh món hàng</strong> sao cho toàn bộ ô vuông QR nằm trọn trong ảnh, không bị loá hay che góc.
            </li>
          )}
          <li>
            <strong>Viết tay:</strong> viết <strong>8 ký tự ({shortNonce})</strong> bằng bút đen, nét đậm, chữ to lên giấy trắng
            rồi đặt cạnh món hàng.
          </li>
          <li>
            Chụp ảnh đóng gói (Người bán) hoặc quay video/ảnh mở hộp (Người mua) đủ ánh sáng, mã không bị bóng mờ hay che khuất.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default NonceCard;
