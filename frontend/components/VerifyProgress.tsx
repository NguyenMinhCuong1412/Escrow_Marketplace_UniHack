'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEvidence, getRegisteredUris } from '@/lib/backend';
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
    const s = getStoredEvidenceUri(tradeId, 'seller') || '';
    const b = getStoredEvidenceUri(tradeId, 'buyer') || '';
    setSellerUri(s);
    setBuyerUri(b);
    // Luôn ưu tiên lấy URI ảnh niêm yết từ sổ URI backend (đã có chữ ký seller)
    getRegisteredUris(tradeId)
      .then((u) => {
        if (u.listing) setListingUri(u.listing);
        if (!s && u.seller) setSellerUri(u.seller);
        if (!b && u.buyer) setBuyerUri(u.buyer);
      })
      .catch(() => {
        const l = getStoredListingUri(tradeId) || '';
        if (l) setListingUri(l);
      });
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
      // Save manual edits for seller and buyer evidence
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
    <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-6 space-y-5 shadow-sm relative overflow-hidden">
      <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-[#3458D4]" />
          <h4 className="text-sm font-bold text-[#17191F] tracking-tight">
            Xác Thực Bằng Chứng Bằng AI (AI Attestation)
          </h4>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#3458D4]/10 text-[#3458D4] border border-[#3458D4]/25 font-semibold flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" />
          Sẵn sàng chạy
        </span>
      </div>

      <p className="text-xs text-[#525866] leading-relaxed">
        Cả Người bán và Người mua đều đã hoàn tất nộp bằng chứng on-chain. Bạn có thể kích hoạt mô hình AI để kiểm tra mã Nonce, đối chiếu ảnh niêm yết và tự động ký xác thực `attest()` lên blockchain.
      </p>

      {/* Optional URI inputs (if user is reviewing on different browser / device) */}
      {showUriInputs && (
        <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-3 text-xs">
          <span className="font-semibold text-[#17191F] flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-[#B47814]" />
            Đường dẫn IPFS URI bằng chứng:
          </span>
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-[#525866]">Listing Image URI (đã ký bởi seller - không thể sửa tay):</label>
                {listingUri && (
                  <span className="text-[10px] text-emerald-700 flex items-center gap-1 font-mono font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Đã xác thực
                  </span>
                )}
              </div>
              <input
                type="text"
                value={listingUri}
                readOnly
                placeholder="Chưa có ảnh niêm yết được seller ký xác nhận"
                className="w-full px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-mono text-[#525866] cursor-not-allowed select-all"
              />
              {!listingUri && (
                <p className="text-[10px] text-[#8A5A00] mt-1 font-medium">
                  Người bán cần ký xác nhận ảnh niêm yết ở thẻ AI Agent bên trên trước khi có thể xác thực.
                </p>
              )}
            </div>
            <div>
              <label className="block text-[11px] text-[#525866] mb-1">Seller Packing URI (ipfs://...):</label>
              <input
                type="text"
                value={sellerUri}
                onChange={(e) => setSellerUri(e.target.value)}
                placeholder="ipfs://Qm...seller"
                className="w-full px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-mono text-[#17191F]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525866] mb-1">Buyer Unbox URI (ipfs://...):</label>
              <input
                type="text"
                value={buyerUri}
                onChange={(e) => setBuyerUri(e.target.value)}
                placeholder="ipfs://Qm...buyer"
                className="w-full px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-mono text-[#17191F]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Progress Stepper when verifying */}
      {isVerifying ? (
        <div className="p-5 rounded-xl bg-[#F7F8FA] border border-[#3458D4]/30 space-y-4">
          <div className="flex items-center gap-2 text-[#3458D4] font-semibold text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-[#3458D4]" />
            <span>Đang thực hiện quy trình kiểm tra thị giác máy tính:</span>
          </div>

          <div className="space-y-2 text-xs">
            {VERIFY_STEPS.map((step, idx) => {
              const isPast = currentStep > idx;
              const isCurrent = currentStep === idx;
              return (
                <div key={step} className="flex items-center gap-2.5">
                  {isPast ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#3458D4] flex-shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-[#E5E7EB] flex-shrink-0" />
                  )}
                  <span className={isCurrent ? 'text-[#17191F] font-semibold' : isPast ? 'text-[#525866]' : 'text-[#6B7280]'}>
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
            className="text-[11px] text-[#525866] hover:text-[#3458D4] transition-colors underline"
          >
            {showUriInputs ? 'Ẩn cấu hình IPFS' : 'Chỉnh sửa / Kiểm tra IPFS URI'}
          </button>

          <button
            type="button"
            onClick={handleRunVerify}
            className="py-3 px-6 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-2"
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
