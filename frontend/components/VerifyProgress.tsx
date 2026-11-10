'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEvidence } from '@/lib/backend';
import {
  getStoredListingUri,
  getStoredEvidenceUri,
  setStoredListingUri,
  setStoredEvidenceUri,
} from '@/lib/ipfs';
import {
  Cpu,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

interface VerifyProgressProps {
  tradeId: bigint;
  canVerify: boolean;
  onSuccess?: () => void;
}

const VERIFY_STEPS = [
  'Tải bằng chứng từ IPFS & đối chiếu mã băm on-chain',
  'Quét phát hiện ảnh tái sử dụng trong kho dữ liệu (pHash)',
  'Khớp ngoại quan và đặc trưng vật thể sưu tầm (ORB + RANSAC)',
  'Nhận diện mã Nonce trên giấy bằng thị giác máy tính (OCR)',
  'Tính điểm rủi ro & phân loại giao dịch (Risk Score)',
  'AI Agent ký giao dịch attest() on-chain lên Smart Contract',
];

export const VerifyProgress: React.FC<VerifyProgressProps> = ({
  tradeId,
  canVerify,
  onSuccess,
}) => {
  const router = useRouter();

  const [listingUri, setListingUri] = useState('');
  const [sellerUri, setSellerUri] = useState('');
  const [buyerUri, setBuyerUri] = useState('');
  const [showUriInputs, setShowUriInputs] = useState(false);

  const [isVerifying, setIsVerifying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const l = getStoredListingUri(tradeId) || '';
    const s = getStoredEvidenceUri(tradeId, 'seller') || '';
    const b = getStoredEvidenceUri(tradeId, 'buyer') || '';
    setListingUri(l);
    setSellerUri(s);
    setBuyerUri(b);
  }, [tradeId]);

  // Step ticker during verification
  useEffect(() => {
    if (!isVerifying) return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev < VERIFY_STEPS.length - 1 ? prev + 1 : prev));
    }, 2200);
    return () => clearInterval(interval);
  }, [isVerifying]);

  const handleRunVerify = async () => {
    if (!listingUri || !sellerUri || !buyerUri) {
      setShowUriInputs(true);
      toast.error('Thiếu đường dẫn IPFS của một trong 3 ảnh. Vui lòng kiểm tra lại bên dưới.');
      return;
    }

    setIsVerifying(true);
    setCurrentStep(0);
    const toastId = toast.loading('AI Agent đang phân tích thị giác máy tính...');

    try {
      // Save any manual edits
      setStoredListingUri(tradeId, listingUri.trim());
      setStoredEvidenceUri(tradeId, 'seller', sellerUri.trim());
      setStoredEvidenceUri(tradeId, 'buyer', buyerUri.trim());

      const res = await verifyEvidence({
        trade_id: Number(tradeId),
        listing_image_url: listingUri.trim(),
        seller_evidence_url: sellerUri.trim(),
        buyer_evidence_url: buyerUri.trim(),
      });

      toast.success(
        `AI xác thực hoàn tất! Risk Score: ${res.report.risk_score}/100 ${
          res.report.flagged ? '(Cảnh báo rủi ro)' : '(Hợp lệ)'
        }`,
        { id: toastId }
      );

      onSuccess?.();
      router.push(`/trade/${tradeId.toString()}/report`);
    } catch (err: any) {
      console.error('Verify failed:', err);
      toast.error(`Xác thực AI thất bại: ${err?.message || 'Lỗi server'}`, { id: toastId });
    } finally {
      setIsVerifying(false);
    }
  };

  if (!canVerify) return null;

  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 p-6 space-y-5 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <h4 className="text-sm font-bold text-white tracking-tight">
            Xác Thực Bằng Chứng Bằng AI (AI Attestation)
          </h4>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" />
          Sẵn sàng chạy
        </span>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed">
        Cả Người bán và Người mua đều đã hoàn tất nộp bằng chứng on-chain. Bạn có thể kích hoạt mô hình AI để kiểm tra mã Nonce, đối chiếu ảnh niêm yết và tự động ký xác thực `attest()` lên blockchain.
      </p>

      {/* Optional URI inputs (if user is reviewing on different browser / device) */}
      {showUriInputs && (
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Đường dẫn IPFS URI bằng chứng:
          </span>
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Listing Image URI (ipfs://...):</label>
              <input
                type="text"
                value={listingUri}
                onChange={(e) => setListingUri(e.target.value)}
                placeholder="ipfs://Qm...listing"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Seller Packing URI (ipfs://...):</label>
              <input
                type="text"
                value={sellerUri}
                onChange={(e) => setSellerUri(e.target.value)}
                placeholder="ipfs://Qm...seller"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Buyer Unbox URI (ipfs://...):</label>
              <input
                type="text"
                value={buyerUri}
                onChange={(e) => setBuyerUri(e.target.value)}
                placeholder="ipfs://Qm...buyer"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200"
              />
            </div>
          </div>
        </div>
      )}

      {/* Progress Stepper when verifying */}
      {isVerifying ? (
        <div className="p-5 rounded-xl bg-slate-950/90 border border-indigo-500/40 space-y-4">
          <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Đang thực hiện quy trình kiểm tra thị giác máy tính:</span>
          </div>

          <div className="space-y-2 text-xs">
            {VERIFY_STEPS.map((step, idx) => {
              const isPast = currentStep > idx;
              const isCurrent = currentStep === idx;
              return (
                <div key={step} className="flex items-center gap-2.5">
                  {isPast ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400 flex-shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-700 flex-shrink-0" />
                  )}
                  <span className={isCurrent ? 'text-white font-medium' : isPast ? 'text-slate-400' : 'text-slate-600'}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => setShowUriInputs(!showUriInputs)}
            className="text-[11px] text-slate-400 hover:text-indigo-400 transition-colors underline"
          >
            {showUriInputs ? 'Ẩn cấu hình IPFS' : 'Chỉnh sửa / Kiểm tra IPFS URI'}
          </button>

          <button
            type="button"
            onClick={handleRunVerify}
            className="py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 active:scale-95 transition-all flex items-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            <span>Chạy AI Xác Thực Bằng Chứng</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default VerifyProgress;
