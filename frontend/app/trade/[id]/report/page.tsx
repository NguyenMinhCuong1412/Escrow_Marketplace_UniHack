'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTrade } from '@/hooks/useTrade';
import { getReport, verifyReportOnChain, VerifyResponse } from '@/lib/backend';
import { formatAvax } from '@/lib/format';
import {
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ZoomIn,
  X,
  FileCheck2,
  Cpu,
  Clock,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  FileCode,
  Loader2,
  Coins,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';

export default function EvidenceReportPage() {
  const params = useParams();
  const tradeIdStr = (params?.id as string) || '0';
  const tradeId = BigInt(tradeIdStr);

  const { trade, isLoading: isLoadingTrade } = useTrade(tradeId);

  const [reportData, setReportData] = useState<VerifyResponse | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal zoom for visual match image
  const [isZoomed, setIsZoomed] = useState(false);

  // On-chain verification state
  const [verifyResult, setVerifyResult] = useState<{
    tested: boolean;
    matches: boolean;
    computedHash: string;
    expectedHash: string;
  } | null>(null);

  // Show raw JSON toggle
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoadingReport(true);
    setFetchError(null);

    getReport(tradeId)
      .then((data) => {
        if (mounted) setReportData(data);
      })
      .catch((err) => {
        if (mounted) setFetchError(err?.message || 'Chưa có report cho giao dịch này.');
      })
      .finally(() => {
        if (mounted) setIsLoadingReport(false);
      });

    return () => {
      mounted = false;
    };
  }, [tradeId]);

  const handleVerifyOnChain = () => {
    if (!reportData || !trade) {
      toast.error('Thiếu dữ liệu report hoặc dữ liệu on-chain để đối chiếu.');
      return;
    }

    const { matches, computedHash, expectedHash } = verifyReportOnChain(
      reportData.report_json,
      trade.reportHash
    );

    setVerifyResult({ tested: true, matches, computedHash, expectedHash });

    if (matches) {
      toast.success('Mã băm khớp 100% với reportHash trên Smart Contract!');
    } else {
      toast.error('Mã băm không khớp với reportHash trên Smart Contract.');
    }
  };

  if (isLoadingReport || isLoadingTrade) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto" />
        <p className="text-sm text-slate-400">Đang tải Explainable Evidence Report từ AI Agent...</p>
      </div>
    );
  }

  if (fetchError || !reportData) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center mx-auto">
          <FileCheck2 className="w-7 h-7 text-amber-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Chưa có Báo Cáo AI Cho Giao Dịch #{tradeIdStr}</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            {fetchError || 'Giao dịch này chưa thực hiện bước xác thực AI hoặc đang chờ cả hai bên nộp bằng chứng.'}
          </p>
        </div>
        <Link
          href={`/trade/${tradeIdStr}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại trang chi tiết giao dịch
        </Link>
      </div>
    );
  }

  const { report } = reportData;
  const details = report.details || {};
  const isFlagged = report.flagged;
  const score = report.risk_score;

  // Gauge colors
  const gaugeColor = score < 40 ? 'text-emerald-500' : score < 70 ? 'text-amber-500' : 'text-red-500';
  const badgeColor =
    score < 40
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : score < 70
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      : 'bg-red-500/10 text-red-400 border-red-500/20';

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-8">
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          href={`/trade/${tradeIdStr}`}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Quay lại chi tiết giao dịch #{tradeIdStr}
        </Link>

        {reportData.tx_hash && (
          <span className="text-[11px] font-mono text-slate-400">
            Attest TX: {reportData.tx_hash.slice(0, 10)}...{reportData.tx_hash.slice(-8)}
          </span>
        )}
      </div>

      {/* Header & Risk Gauge Card */}
      <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Attestation · Explainable Evidence Report</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Báo Cáo Giải Trình Xác Thực #{tradeIdStr}
            </h1>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              Kết quả phân tích thị giác máy tính đối chiếu giữa ảnh niêm yết gốc và bằng chứng mở hộp / đóng gói kèm mã Nonce duy nhất.
            </p>
          </div>

          {/* Risk Gauge Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-5 sm:min-w-[260px] flex-shrink-0">
            <div className="relative w-20 h-20 flex items-center justify-center flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={gaugeColor}
                  strokeDasharray={`${score}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-mono text-xl font-extrabold text-white">{score}</span>
                <span className="text-[9px] uppercase tracking-wider text-slate-500">Risk</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className={clsx('text-xs font-bold px-2.5 py-0.5 rounded-full border inline-block', badgeColor)}>
                {isFlagged ? 'Gắn Cờ Rủi Ro' : 'Bằng Chứng Sạch'}
              </span>
              <div className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Xử lý: {(reportData.duration_ms / 1000).toFixed(2)}s</span>
              </div>
            </div>
          </div>
        </div>

        {/* AC-06: Verify On-chain Banner & Button */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Xác Thực Tính Toàn Vẹn On-Chain (Verify on-chain)
              </span>
              <p className="text-[11px] text-slate-400">
                Tính toán mã băm keccak256 của toàn bộ dữ liệu JSON báo cáo và so sánh với reportHash đã neo trên Smart Contract.
              </p>
            </div>

            <button
              type="button"
              onClick={handleVerifyOnChain}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Verify On-chain</span>
            </button>
          </div>

          {verifyResult && (
            <div
              className={clsx(
                'p-3.5 rounded-xl border text-xs font-mono space-y-1',
                verifyResult.matches
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              )}
            >
              <div className="font-sans font-bold flex items-center gap-1.5">
                {verifyResult.matches ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>✓ XÁC THỰC THÀNH CÔNG: Report này đúng là bản gốc đã neo on-chain! Không ai có thể sửa đổi!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span>✗ CẢNH BÁO: Mã băm không khớp với reportHash trên blockchain!</span>
                  </>
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Computed Hash: {verifyResult.computedHash}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                On-chain Hash: {verifyResult.expectedHash}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AC-05: Checklist 4 dòng kiểm tra chi tiết */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          Chi Tiết 4 Hạng Mục Kiểm Tra Thị Giác
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Check 1: Nonce Seller */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">1. Mã Nonce trong ảnh Người bán (QR / OCR)</span>
              {report.nonce_ok_seller ? (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Khớp mã
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Sai mã
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-slate-400 space-y-1 pt-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Expected Nonce:</span>
                <span className="text-white font-bold">{details.nonce_seller?.expected || details.expected_nonce_short || '--'}</span>
              </div>
              <div className="flex justify-between">
                <span>Cách đọc:</span>
                <span className="text-slate-200">
                  {details.nonce_seller?.method === 'qr' ? 'Mã QR' : details.nonce_seller?.method === 'ocr' ? 'Chữ viết tay (OCR)' : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Mã đọc được:</span>
                <span className={report.nonce_ok_seller ? 'text-emerald-400' : 'text-red-400'}>
                  {details.nonce_seller?.best_candidate || 'Không nhận diện được'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Khoảng cách ký tự (Edit distance):</span>
                <span>{details.nonce_seller?.edit_distance ?? '--'}</span>
              </div>
            </div>
          </div>

          {/* Check 2: Nonce Buyer */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                2. Mã Nonce trong bằng chứng Người mua ({details.buyer_evidence_kind === 'video' ? 'Video' : 'Ảnh'})
              </span>
              {report.nonce_ok_buyer ? (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Khớp mã
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Sai mã
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-slate-400 space-y-1 pt-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Expected Nonce:</span>
                <span className="text-white font-bold">{details.nonce_buyer?.expected || details.expected_nonce_short || '--'}</span>
              </div>
              <div className="flex justify-between">
                <span>Cách đọc:</span>
                <span className="text-slate-200">
                  {details.nonce_buyer?.method === 'qr' ? 'Mã QR' : details.nonce_buyer?.method === 'ocr' ? 'Chữ viết tay (OCR)' : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Mã đọc được:</span>
                <span className={report.nonce_ok_buyer ? 'text-emerald-400' : 'text-red-400'}>
                  {details.nonce_buyer?.best_candidate || 'Không nhận diện được'}
                </span>
              </div>
              {details.buyer_evidence_kind === 'video' && (
                <div className="flex justify-between text-indigo-300">
                  <span>Khung hình đã quét:</span>
                  <span>{details.buyer_frames_checked || 1} frames</span>
                </div>
              )}
            </div>
          </div>

          {/* Check 3: pHash Reuse Check */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">3. Quét tái sử dụng ảnh (pHash)</span>
              {!report.phash_reused ? (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ảnh độc bản
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Trùng ảnh cũ
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-slate-400 space-y-1 pt-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Trùng ảnh kho dữ liệu:</span>
                <span className={report.phash_reused ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                  {report.phash_reused ? `Có (Khớp ID #${report.phash_match_idx})` : 'Không phát hiện trùng lặp'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Dùng lại ảnh listing đóng gói:</span>
                <span>{details.listing_reused_as_packing ? 'Phát hiện tái dùng' : 'Không'}</span>
              </div>
            </div>
          </div>

          {/* Check 4: Inliers Keypoint Match */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">4. Độ tương đồng ngoại quan (ORB + RANSAC)</span>
              {report.identity_match_inliers >= 15 ? (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Khớp vật thể ({report.identity_match_inliers})
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Điểm khớp thấp ({report.identity_match_inliers})
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-slate-400 space-y-1 pt-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span>Inliers Listing ↔ Seller:</span>
                <span className="text-white font-bold">{details.inliers_listing_seller ?? report.identity_match_inliers}</span>
              </div>
              <div className="flex justify-between">
                <span>Inliers Listing ↔ Buyer:</span>
                <span className="text-white font-bold">{details.inliers_listing_buyer ?? '--'}</span>
              </div>
              <div className="flex justify-between">
                <span>Ngưỡng tối thiểu (Threshold):</span>
                <span>15 inliers</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Match Image (Keypoint match visualization) */}
      {reportData.match_visual_png_b64 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Ảnh Trực Quan Khớp Điểm Đặc Trưng (Keypoint Inliers Visualization)
              </h3>
              <p className="text-xs text-slate-400">
                Ảnh niêm yết (Trái) đối chiếu với ảnh đóng gói người bán (Phải). Các đường màu xanh là các điểm đặc trưng inlier khớp nhau.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsZoomed(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 border border-slate-700"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Phóng to</span>
            </button>
          </div>

          <div
            onClick={() => setIsZoomed(true)}
            className="cursor-pointer rounded-xl overflow-hidden border border-slate-800 bg-black max-h-[380px] flex items-center justify-center group relative"
          >
            <img
              src={`data:image/png;base64,${reportData.match_visual_png_b64}`}
              alt="Visual Keypoint Match"
              className="max-h-[380px] w-auto object-contain group-hover:scale-[1.01] transition-transform"
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-2">
              <ZoomIn className="w-5 h-5" /> Nhấp để xem kích thước lớn
            </div>
          </div>
        </div>
      )}

      {/* Modal Zoom */}
      {isZoomed && reportData.match_visual_png_b64 && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-50 bg-black/90 p-4 sm:p-8 flex items-center justify-center animate-in fade-in"
        >
          <div className="relative max-w-6xl max-h-full">
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute -top-10 right-0 p-1.5 rounded-full bg-slate-800 text-white hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={`data:image/png;base64,${reportData.match_visual_png_b64}`}
              alt="Keypoint zoom"
              className="max-h-[90vh] max-w-full object-contain rounded-xl border border-slate-800"
            />
          </div>
        </div>
      )}

      {/* Transparent Formula Breakdown */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          Minh Bạch Công Thức Tính Điểm Rủi Ro (Transparent Risk Formula)
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Công thức toán học độc lập, có thể kiểm chứng, không phụ thuộc vào hộp đen (black-box model):
        </p>

        <div className="p-4 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 border border-slate-800 space-y-2">
          <div className="text-amber-400">
            Risk = 0.4 × (100 − Rep_tb) + 0.4 × (100 − 2×min(Inliers, 50)) + 0.2 × (5×min(Value_AVAX, 10))
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-[11px] text-slate-400 border-t border-slate-800">
            <div>• Rep trung bình: {((Number(details.seller_reputation || 50) + Number(details.buyer_reputation || 50)) / 2).toFixed(1)}/100</div>
            <div>• Inliers khớp: {report.identity_match_inliers} điểm</div>
            <div>• Giá trị món hàng: {formatAvax(details.item_value_wei || '0')} AVAX</div>
          </div>
        </div>

        {report.notes && report.notes.length > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
            <span className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Ghi chú từ hệ thống AI:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/90 pl-1">
              {report.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Raw JSON Accordion */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <button
          type="button"
          onClick={() => setShowRawJson(!showRawJson)}
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-indigo-400" />
            Xem Dữ Liệu Canonical JSON Báo Cáo
          </span>
          {showRawJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showRawJson && (
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-96">
            {reportData.report_json}
          </pre>
        )}
      </div>
    </div>
  );
}
