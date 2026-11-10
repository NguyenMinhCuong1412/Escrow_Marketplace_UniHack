'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { isAddress, parseEther } from 'viem';
import { escrowAddress, escrowAbi, chainId } from '@/lib/contracts';
import { targetChain } from '@/lib/wagmi';
import { useReputation } from '@/hooks/useReputation';
import { getReadableError } from '@/lib/errors';
import { uploadToIpfs, validateEvidenceFile, setStoredListingUri } from '@/lib/ipfs';
import {
  ShieldCheck,
  Coins,
  User,
  FileText,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  UploadCloud,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CreateTradePage() {
  const router = useRouter();
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [buyerAddress, setBuyerAddress] = useState('');
  const [itemValue, setItemValue] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [listingFile, setListingFile] = useState<File | null>(null);
  const [listingPreview, setListingPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Read buyer reputation preview
  const isValidBuyerAddress = isAddress(buyerAddress) && (!address || buyerAddress.toLowerCase() !== address.toLowerCase());
  const { score: buyerReputation } = useReputation(isValidBuyerAddress ? buyerAddress : undefined);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateEvidenceFile(file, { allowVideo: false });
    if (err) {
      toast.error(err);
      return;
    }
    setListingFile(file);
    const url = URL.createObjectURL(file);
    setListingPreview(url);
  };

  const removeListingFile = () => {
    setListingFile(null);
    if (listingPreview) URL.revokeObjectURL(listingPreview);
    setListingPreview(null);
  };

  // Live deposit calculation (30% MAX_DEPOSIT_BPS)
  const depositPreview = (() => {
    try {
      const val = parseFloat(itemValue);
      if (!isNaN(val) && val > 0) {
        return (val * 0.3).toFixed(4);
      }
    } catch {
      // ignore
    }
    return '0.0000';
  })();

  const isWrongChain = Boolean(isConnected && chain && chain.id !== targetChain.id);
  const isSubmitDisabled =
    !isConnected ||
    isWrongChain ||
    isSubmitting ||
    !isValidBuyerAddress ||
    !itemValue ||
    parseFloat(itemValue) <= 0 ||
    !title.trim() ||
    !listingFile;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      toast.error('Vui lòng kết nối ví trước khi tạo giao dịch.');
      return;
    }

    if (isWrongChain) {
      toast.error(`Vui lòng chuyển ví sang mạng ${targetChain.name}.`);
      return;
    }

    if (!isAddress(buyerAddress)) {
      toast.error('Địa chỉ ví người mua không hợp lệ.');
      return;
    }

    if (buyerAddress.toLowerCase() === address.toLowerCase()) {
      toast.error('Địa chỉ người mua không được trùng với địa chỉ ví của bạn.');
      return;
    }

    const valNum = parseFloat(itemValue);
    if (isNaN(valNum) || valNum <= 0) {
      toast.error('Vui lòng nhập giá trị món hàng hợp lệ (> 0 AVAX).');
      return;
    }

    if (!listingFile) {
      toast.error('Vui lòng tải lên ảnh niêm yết vật phẩm sưu tầm (listing image).');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Đang upload ảnh niêm yết lên IPFS...');

    try {
      // 1. Upload ảnh niêm yết lên IPFS
      const pinResult = await uploadToIpfs(listingFile);
      const listingUri = pinResult.uri;

      if (pinResult.mock) {
        toast.info('Chưa cấu hình PINATA_JWT — sử dụng CID IPFS mô phỏng.', { duration: 4000 });
      }

      // 2. Ký giao dịch tạo Escrow on-chain
      toast.loading('Đang chuẩn bị ký giao dịch tạo escrow trên ví...', { id: toastId });
      const itemValueWei = parseEther(itemValue);

      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'createTrade',
        args: [buyerAddress as `0x${string}`, itemValueWei],
      });

      toast.loading('Giao dịch đã gửi! Đang chờ xác nhận trên blockchain...', { id: toastId });

      if (!publicClient) {
        throw new Error('Public client không khả dụng.');
      }

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status !== 'success') {
        throw new Error('Giao dịch bị revert trên blockchain.');
      }

      // Parse TradeCreated event from receipt logs
      let createdTradeId = '1';
      for (const log of receipt.logs) {
        if (log.topics[0] && log.topics[1]) {
          try {
            const rawId = BigInt(log.topics[1]);
            createdTradeId = rawId.toString();
            break;
          } catch {
            // continue
          }
        }
      }

      // Save local metadata (title, description, listingUri)
      try {
        localStorage.setItem(
          `meta:${chainId}:${createdTradeId}`,
          JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            listingUri,
            createdAt: Date.now(),
          })
        );
        setStoredListingUri(createdTradeId, listingUri);
      } catch {
        // ignore storage errors
      }

      toast.success(`Đã tạo giao dịch #${createdTradeId} thành công!`, { id: toastId });

      // AC-01: tx confirm -> redirect /trade/[id]
      router.push(`/trade/${createdTradeId}`);
    } catch (err: any) {
      console.error('Error creating trade:', err);
      const readable = getReadableError(err);
      toast.error(`Tạo giao dịch thất bại: ${readable}`, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-8">
      {/* Header */}
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Khởi tạo Hợp đồng Ký quỹ Đồ sưu tầm</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Tạo Giao Dịch Mới
        </h1>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          Người bán tạo hợp đồng ký quỹ, đặt điều kiện thanh toán và tỷ lệ cọc 30% để đảm bảo cam kết với người mua.
        </p>
      </div>

      {/* Warning banner if disconnected or wrong chain */}
      {!isConnected && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Vui lòng kết nối ví ở góc phải Navbar để bắt đầu tạo giao dịch.</span>
        </div>
      )}

      {isWrongChain && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Ví của bạn đang ở sai mạng. Vui lòng chuyển sang mạng {targetChain.name}.</span>
        </div>
      )}

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-6 shadow-xl"
      >
        {/* Item Title */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-indigo-400" />
            Tên vật phẩm sưu tầm <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Thẻ bài Pokemon Charizard 1st Edition PSA 9"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Item Description */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            Mô tả tình trạng &amp; niêm phong
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả chi tiết góc cạnh, bề mặt, số seri và phụ kiện đi kèm..."
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Listing Image Upload */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-indigo-400" />
              Ảnh niêm yết gốc (Listing Image) <span className="text-rose-500">*</span>
            </span>
            <span className="text-[11px] text-slate-500">JPG, PNG, WEBP (Tối đa 10MB)</span>
          </label>

          {listingPreview ? (
            <div className="relative rounded-xl border border-slate-700 bg-slate-950/80 p-3 flex items-center gap-4">
              <img
                src={listingPreview}
                alt="Listing preview"
                className="w-20 h-20 object-cover rounded-lg border border-slate-800"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{listingFile?.name}</p>
                <p className="text-[11px] text-slate-400">
                  {listingFile ? `${(listingFile.size / (1024 * 1024)).toFixed(2)} MB` : ''}
                </p>
                <p className="text-[11px] text-emerald-400 mt-1">✓ Sẵn sàng upload lên IPFS khi tạo hợp đồng</p>
              </div>
              <button
                type="button"
                onClick={removeListingFile}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 transition-colors"
                title="Xóa ảnh"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-950/40 block group space-y-2">
              <UploadCloud className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 mx-auto transition-colors" />
              <div className="text-xs text-slate-300 font-medium">
                Kéo thả hoặc <span className="text-indigo-400 underline">chọn ảnh niêm yết</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Ảnh này sẽ làm ảnh đối chiếu gốc cho AI khi so sánh với bằng chứng mở hộp / đóng gói
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Buyer Address */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4 text-indigo-400" />
              Địa chỉ ví Người mua (Buyer) <span className="text-rose-500">*</span>
            </span>
            {isValidBuyerAddress && (
              <span className="text-[11px] text-emerald-400 font-mono">
                Reputation: {buyerReputation}/100
              </span>
            )}
          </label>
          <input
            type="text"
            required
            value={buyerAddress}
            onChange={(e) => setBuyerAddress(e.target.value.trim())}
            placeholder="0x..."
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {buyerAddress && !isAddress(buyerAddress) && (
            <p className="text-[11px] text-rose-400">Địa chỉ ví không hợp lệ (phải bắt đầu bằng 0x...)</p>
          )}
          {buyerAddress && address && buyerAddress.toLowerCase() === address.toLowerCase() && (
            <p className="text-[11px] text-rose-400">Người mua không được là chính ví của bạn.</p>
          )}
        </div>

        {/* Item Value & Live Deposit Preview */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-amber-400" />
            Giá trị thỏa thuận (AVAX) <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              required
              value={itemValue}
              onChange={(e) => setItemValue(e.target.value)}
              placeholder="1.0"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
              AVAX
            </span>
          </div>

          {/* Deposit Rule Preview */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1">
            <div className="flex items-center justify-between text-slate-300">
              <span>Tiền cọc cam kết mỗi bên (30%):</span>
              <span className="font-mono font-bold text-amber-400">
                {depositPreview} AVAX
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Cả Người bán và Người mua đều nạp {depositPreview} AVAX vào hợp đồng. Cọc sẽ được hoàn trả tự động sau khi giao dịch hoàn tất hoặc AI xác thực sạch.
            </p>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý giao dịch...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Tạo Giao Dịch Escrow</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
