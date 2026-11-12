'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useTrade } from '@/hooks/useTrade';
import { getAgentStatus, listingMessage, registerUri, type AgentStatus } from '@/lib/backend';
import { chainId, escrowAddress } from '@/lib/contracts';
import { getStoredListingUri, setStoredListingUri } from '@/lib/ipfs';
import { Bot, CheckCircle2, Loader2, AlertTriangle, Clock, ChevronDown, FileCheck } from 'lucide-react';
import { toast } from 'sonner';

interface AgentStatusCardProps {
  tradeId: bigint;
  /** Gọi một lần khi agent đã attest xong → trang cha đọc lại trade từ chain. */
  onAttested?: () => void;
  /** Khối "chạy thủ công" (VerifyProgress) — luôn có sẵn làm phương án dự phòng. */
  fallback: React.ReactNode;
}

const POLL_MS = 3000;

const ANALYZE_STEPS = [
  'Tải bằng chứng từ IPFS & đối chiếu mã băm on-chain',
  'Quét ảnh tái sử dụng (pHash)',
  'Khớp ngoại quan vật phẩm (ORB + RANSAC)',
  'Đọc mã Nonce bằng OCR',
  'Tính điểm rủi ro',
  'Ký giao dịch attest() lên Smart Contract',
];

const ROLE_LABEL: Record<string, string> = {
  listing: 'ảnh niêm yết',
  seller: 'bằng chứng người bán',
  buyer: 'bằng chứng người mua',
};

/**
 * Thẻ trạng thái AI Agent tự động: agent chạy nền trong backend tự quan sát contract và
 * tự verify + attest khi đủ bằng chứng. Thẻ này chỉ HIỂN THỊ tiến trình (poll mỗi 3 giây).
 * Khi agent tắt / không kết nối được, thẻ nhường chỗ cho khối chạy thủ công.
 */
export const AgentStatusCard: React.FC<AgentStatusCardProps> = ({ tradeId, onAttested, fallback }) => {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [step, setStep] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const notified = useRef(false);

  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { trade } = useTrade(tradeId);
  const isSeller = Boolean(address && trade && trade.seller.toLowerCase() === address.toLowerCase());

  const [customListingUri, setCustomListingUri] = useState('');
  const [isSigningListing, setIsSigningListing] = useState(false);

  useEffect(() => {
    const stored = getStoredListingUri(tradeId);
    if (stored) setCustomListingUri(stored);
  }, [tradeId]);

  const handleSignListing = async () => {
    const uriToSign = (customListingUri || getStoredListingUri(tradeId) || '').trim();
    if (!uriToSign || !uriToSign.startsWith('ipfs://')) {
      toast.error('Vui lòng nhập đường dẫn IPFS hợp lệ (ipfs://...) của ảnh niêm yết.');
      return;
    }
    setIsSigningListing(true);
    const toastId = toast.loading('Đang ký xác nhận ảnh niêm yết bằng ví...');
    try {
      const msg = listingMessage(chainId, escrowAddress, tradeId.toString(), uriToSign);
      const signature = await signMessageAsync({ message: msg });
      await registerUri({
        trade_id: Number(tradeId),
        role: 'listing',
        uri: uriToSign,
        signature,
      });
      setStoredListingUri(tradeId, uriToSign);
      toast.success('Đã ký và đăng ký ảnh niêm yết thành công!', { id: toastId });
      const updated = await getAgentStatus(tradeId);
      setStatus(updated);
    } catch (err: any) {
      console.error('Sign listing failed:', err);
      toast.error(`Ký xác nhận thất bại: ${err?.message || 'Lỗi ký'}`, { id: toastId });
    } finally {
      setIsSigningListing(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s = await getAgentStatus(tradeId);
        if (!alive) return;
        setStatus(s);
        setUnreachable(false);
        if (s.phase === 'attested' && !notified.current) {
          notified.current = true;
          onAttested?.();
        }
      } catch {
        if (alive) setUnreachable(true);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  const analyzing = status?.phase === 'analyzing';
  useEffect(() => {
    if (!analyzing) {
      setStep(0);
      return;
    }
    const timer = setInterval(() => setStep((p) => (p < ANALYZE_STEPS.length - 1 ? p + 1 : p)), 3500);
    return () => clearInterval(timer);
  }, [analyzing]);

  // Agent tắt hoặc backend không trả lời → dùng thẳng luồng thủ công như trước.
  if (unreachable || (status && !status.enabled)) return <>{fallback}</>;
  if (!status) return null;

  const { phase } = status;
  const needsManual = phase === 'failed' || phase === 'waiting_uris';

  let icon = <Clock className="w-4 h-4 text-slate-400" />;
  let title = '';
  let body: React.ReactNode = null;
  let tone = 'border-slate-700 bg-slate-950/70 text-slate-300';

  if (phase === 'waiting_evidence') {
    title = 'Đang chờ hai bên nộp bằng chứng';
    body = 'Ngay khi cả Người bán và Người mua nộp xong, AI Agent sẽ tự bắt đầu phân tích — không cần ai bấm nút.';
  } else if (phase === 'waiting_uris') {
    icon = <AlertTriangle className="w-4 h-4 text-amber-400" />;
    tone = 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    title = 'Đã đủ bằng chứng on-chain, agent chưa nhận được đường dẫn file';
    const isMissingListing = status.missing_uris.includes('listing');
    body = (
      <div className="space-y-3">
        <p>
          Còn thiếu: {status.missing_uris.map((r) => ROLE_LABEL[r] || r).join(', ')}.
        </p>
        {isMissingListing && (
          isSeller ? (
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <FileCheck className="w-4 h-4 text-amber-400" />
                <span>Ký xác nhận ảnh niêm yết (Người bán)</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Để bảo vệ an toàn, AI Agent chỉ xác thực ảnh niêm yết do chính Người bán ký xác nhận bằng ví (EIP-191, không tốn gas).
              </p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={customListingUri}
                  onChange={(e) => setCustomListingUri(e.target.value)}
                  placeholder="ipfs://Qm... (dán URI ảnh niêm yết)"
                  disabled={isSigningListing}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleSignListing}
                  disabled={isSigningListing || !customListingUri.trim()}
                  className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  {isSigningListing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
                  <span>Ký xác nhận ảnh niêm yết</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Chờ người bán ký xác nhận ảnh niêm yết</span>
            </div>
          )
        )}
      </div>
    );
  } else if (phase === 'queued') {
    icon = <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />;
    tone = 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200';
    title = 'Đã đủ bằng chứng — AI Agent sắp bắt đầu';
    body = 'Agent quét blockchain vài giây một lần và sẽ tự nhận giao dịch này.';
  } else if (phase === 'analyzing' || phase === 'retrying') {
    icon = <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />;
    tone = 'border-indigo-500/40 bg-slate-950/90 text-indigo-200';
    title = phase === 'analyzing' ? 'AI Agent đang phân tích bằng chứng…' : `Lần thử ${status.attempts}/${status.max_attempts} chưa thành công — agent sẽ tự thử lại`;
    body =
      phase === 'analyzing' ? (
        <div className="space-y-2 pt-1">
          {ANALYZE_STEPS.map((label, idx) => (
            <div key={label} className="flex items-center gap-2.5">
              {step > idx ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : step === idx ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-700 flex-shrink-0" />
              )}
              <span className={step === idx ? 'text-white font-medium' : step > idx ? 'text-slate-400' : 'text-slate-600'}>
                {label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        status.detail
      );
  } else if (phase === 'failed') {
    icon = <AlertTriangle className="w-4 h-4 text-rose-400" />;
    tone = 'border-rose-500/30 bg-rose-500/10 text-rose-200';
    title = 'AI Agent không xử lý được giao dịch này';
    body = `${status.detail || 'Lỗi không xác định.'} Bạn có thể chạy thủ công bên dưới.`;
  } else if (phase === 'attested') {
    icon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    tone = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    title = 'AI Agent đã xác thực và ghi kết quả lên blockchain';
    body = 'Đang cập nhật trạng thái giao dịch…';
  } else {
    return null;
  }

  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 p-6 space-y-4 shadow-2xl">
      <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-400" />
          <h4 className="text-sm font-bold text-white tracking-tight">AI Agent tự động</h4>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Đang theo dõi blockchain
        </span>
      </div>

      <div className={`p-4 rounded-xl border text-xs space-y-2 ${tone}`} role="status" aria-live="polite">
        <div className="flex items-center gap-2 font-semibold">
          {icon}
          <span>{title}</span>
        </div>
        {body && <div className="text-[11px] leading-relaxed opacity-90">{body}</div>}
      </div>

      {(needsManual || phase === 'queued') && (
        <div>
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="text-[11px] text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-1"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManual ? 'rotate-180' : ''}`} />
            {showManual ? 'Ẩn phần chạy thủ công' : 'Chạy thủ công (phương án dự phòng)'}
          </button>
          {showManual && <div className="pt-3">{fallback}</div>}
        </div>
      )}
    </div>
  );
};

export default AgentStatusCard;
