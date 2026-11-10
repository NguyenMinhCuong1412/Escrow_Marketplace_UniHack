'use client';

import React, { useState } from 'react';
import { useWriteContract, usePublicClient } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import {
  uploadToIpfs,
  evidenceHashOf,
  validateEvidenceFile,
  setStoredEvidenceUri,
  getStoredEvidenceUri,
  ipfsToGatewayUrl,
} from '@/lib/ipfs';
import { getReadableError } from '@/lib/errors';
import {
  UploadCloud,
  FileCheck,
  CheckCircle2,
  Loader2,
  X,
  ShieldCheck,
  ExternalLink,
  Film,
  Camera,
} from 'lucide-react';
import { toast } from 'sonner';

interface EvidenceUploaderProps {
  tradeId: bigint;
  role: 'seller' | 'buyer' | 'viewer';
  hasSubmitted?: boolean;
  isEvidenceExpired?: boolean;
  isActionDisabled?: boolean;
  onSuccess?: () => void;
}

export const EvidenceUploader: React.FC<EvidenceUploaderProps> = ({
  tradeId,
  role,
  hasSubmitted,
  isEvidenceExpired,
  isActionDisabled,
  onSuccess,
}) => {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  if (role === 'viewer') return null;

  const allowVideo = role === 'buyer';
  const roleTitle = role === 'seller' ? 'Người bán (Ảnh đóng gói)' : 'Người mua (Video/ảnh mở hộp)';
  const storedUri = getStoredEvidenceUri(tradeId, role);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const err = validateEvidenceFile(selected, { allowVideo });
    if (err) {
      toast.error(err);
      return;
    }
    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
  };

  const removeFile = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handleSubmitEvidence = async () => {
    if (!file) {
      toast.error('Vui lòng chọn file bằng chứng trước.');
      return;
    }
    if (isEvidenceExpired) {
      toast.error('Đã quá thời hạn nộp bằng chứng.');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading('1/3: Đang upload bằng chứng lên IPFS...');

    try {
      // 1. Upload IPFS
      const pinResult = await uploadToIpfs(file);
      const uri = pinResult.uri;

      if (pinResult.mock) {
        toast.info('Đang dùng IPFS mô phỏng (chưa cấu hình PINATA_JWT).', { duration: 4000 });
      }

      // 2. Tính hash keccak256(utf8(uri))
      toast.loading('2/3: Đang tính hash bằng chứng & chuẩn bị ký transaction...', { id: toastId });
      const evidenceHash = evidenceHashOf(uri);

      // 3. Gửi submitEvidence(tradeId, hash) on-chain
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'submitEvidence',
        args: [tradeId, evidenceHash],
      } as any);

      toast.loading('3/3: Đang chờ xác nhận trên blockchain...', { id: toastId });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error('Transaction submitEvidence bị revert.');
        }
      }

      // 4. Lưu lại URI vào localStorage
      setStoredEvidenceUri(tradeId, role, uri);

      toast.success('Đã nộp bằng chứng on-chain thành công!', { id: toastId });
      removeFile();
      onSuccess?.();
    } catch (err: any) {
      console.error('Submit evidence failed:', err);
      toast.error(`Nộp bằng chứng thất bại: ${getReadableError(err)}`, { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 shadow-xl">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {role === 'seller' ? (
            <Camera className="w-5 h-5 text-indigo-400" />
          ) : (
            <Film className="w-5 h-5 text-purple-400" />
          )}
          <h4 className="text-sm font-semibold text-white">
            Nộp bằng chứng — {roleTitle}
          </h4>
        </div>
        {hasSubmitted ? (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Đã nộp bằng chứng
          </span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {role === 'seller' ? 'Ảnh JPG/PNG/WEBP ≤ 10MB' : 'Ảnh hoặc Video MP4 ≤ 50MB'}
          </span>
        )}
      </div>

      {hasSubmitted ? (
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
          <p className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            Bằng chứng của bạn đã được neo hash an toàn trên hợp đồng thông minh.
          </p>
          {storedUri && (
            <div className="flex items-center justify-between gap-2 pt-1 font-mono text-[11px] text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="truncate">URI: {storedUri}</span>
              <a
                href={ipfsToGatewayUrl(storedUri)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 flex-shrink-0"
              >
                Xem IPFS <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {previewUrl ? (
            <div className="relative rounded-xl border border-slate-700 bg-slate-950/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white truncate max-w-xs">{file?.name}</span>
                <button
                  type="button"
                  onClick={removeFile}
                  disabled={isUploading}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="rounded-lg overflow-hidden max-h-60 bg-black flex items-center justify-center">
                {file?.type.startsWith('video/') ? (
                  <video src={previewUrl} controls className="max-h-60 w-auto" />
                ) : (
                  <img src={previewUrl} alt="Evidence preview" className="max-h-60 w-auto object-contain" />
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>Dung lượng: {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : ''}</span>
                <span className="text-amber-400">Đảm bảo ảnh/video đã chứa mã Nonce rõ ràng!</span>
              </div>
            </div>
          ) : (
            <label className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-950/40 block group space-y-2">
              <UploadCloud className="w-10 h-10 text-slate-500 group-hover:text-indigo-400 mx-auto transition-colors" />
              <div className="text-xs text-slate-200 font-medium">
                Kéo thả hoặc <span className="text-indigo-400 underline">chọn file bằng chứng</span>
              </div>
              <p className="text-[11px] text-slate-500">
                {role === 'seller'
                  ? 'Chụp ảnh món hàng được đóng gói, đặt kèm tờ giấy viết mã nonce'
                  : 'Quay video hoặc chụp ảnh quá trình mở hộp nguyên vẹn, kèm mã nonce'}
              </p>
              <input
                type="file"
                accept={allowVideo ? 'image/jpeg,image/png,image/webp,video/mp4' : 'image/jpeg,image/png,image/webp'}
                onChange={handleFileChange}
                disabled={isUploading || isEvidenceExpired || isActionDisabled}
                className="hidden"
              />
            </label>
          )}

          {file && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmitEvidence}
                disabled={isUploading || isEvidenceExpired || isActionDisabled}
                className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs shadow-md active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang nộp bằng chứng...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    <span>Ký &amp; Nộp Bằng Chứng On-chain</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EvidenceUploader;
