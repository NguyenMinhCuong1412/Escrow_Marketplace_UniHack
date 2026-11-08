'use client';

import React from 'react';
import { UploadCloud, FileImage, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface EvidencePlaceholderProps {
  role: 'seller' | 'buyer' | 'viewer';
  hasSubmitted?: boolean;
}

export const EvidencePlaceholder: React.FC<EvidencePlaceholderProps> = ({
  role,
  hasSubmitted,
}) => {
  if (role === 'viewer') return null;

  const roleText = role === 'seller' ? 'Người bán (Ảnh đóng gói)' : 'Người mua (Video/ảnh mở hộp)';

  const handlePlaceholderClick = () => {
    toast.info('Tính năng tải ảnh lên IPFS Pinata và ký hash on-chain sẽ được kích hoạt ở Phase 4C.');
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-indigo-400" />
          <h4 className="text-sm font-semibold text-white">
            Nộp bằng chứng ngoại quan — {roleText}
          </h4>
        </div>
        {hasSubmitted ? (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Đã nộp bằng chứng
          </span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Phase 4C Integration
          </span>
        )}
      </div>

      <div
        onClick={handlePlaceholderClick}
        className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-950/40 group space-y-3"
      >
        <div className="w-12 h-12 rounded-xl bg-slate-800/80 text-indigo-400 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
          <FileImage className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-300">
            Kéo thả hoặc nhấn để chọn ảnh/video bằng chứng (chứa mã nonce)
          </p>
          <p className="text-[11px] text-slate-500">
            Hỗ trợ PNG, JPG, WEBP hoặc MP4 (Tối đa 50MB)
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handlePlaceholderClick}
          disabled={hasSubmitted}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-all disabled:opacity-50"
        >
          {hasSubmitted ? '✓ Đã ghi nhận trên hợp đồng' : 'Nộp bằng chứng (Sẵn sàng ở Phase 4C)'}
        </button>
      </div>
    </div>
  );
};

export default EvidencePlaceholder;
