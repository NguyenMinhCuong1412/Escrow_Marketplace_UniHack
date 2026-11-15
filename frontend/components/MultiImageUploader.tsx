'use client';

import React, { useRef, useState } from 'react';
import {
  ImagePlus,
  Loader2,
  Trash2,
  Star,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import {
  uploadToIpfs,
  validateEvidenceFile,
  ipfsToGatewayUrl,
  isMockUri,
} from '@/lib/ipfs';

export interface UploadedImageItem {
  uri: string;
  is_primary: boolean;
  mock?: boolean;
}

interface MultiImageUploaderProps {
  images: UploadedImageItem[];
  onChange: (next: UploadedImageItem[]) => void;
  disabled?: boolean;
  maxImages?: number;
}

export const MultiImageUploader: React.FC<MultiImageUploaderProps> = ({
  images,
  onChange,
  disabled = false,
  maxImages = 10,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizePrimary = (items: UploadedImageItem[]): UploadedImageItem[] => {
    if (items.length === 0) return [];
    const hasPrimary = items.some((item) => item.is_primary);
    if (hasPrimary) {
      let seenPrimary = false;
      return items.map((item) => {
        if (item.is_primary && !seenPrimary) {
          seenPrimary = true;
          return { ...item, is_primary: true };
        }
        return { ...item, is_primary: false };
      });
    }
    return items.map((item, idx) => ({ ...item, is_primary: idx === 0 }));
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || disabled) return;
    setErrorMessage(null);

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      setErrorMessage(`Mỗi tin đăng tối đa ${maxImages} ảnh.`);
      return;
    }

    const files = Array.from(fileList).slice(0, remainingSlots);
    for (const file of files) {
      const validationError = validateEvidenceFile(file, { allowVideo: false });
      if (validationError) {
        setErrorMessage(`${file.name}: ${validationError}`);
        return;
      }
    }

    setIsUploading(true);
    const nextList = [...images];
    try {
      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        setUploadProgress(`Đang tải ảnh ${idx + 1}/${files.length} lên IPFS...`);
        const pinned = await uploadToIpfs(file);
        if (nextList.some((existing) => existing.uri === pinned.uri)) {
          setErrorMessage(
            `Ảnh "${file.name}" trùng URI với ảnh đã có trong danh sách (${pinned.cid.slice(0, 12)}...).`
          );
          continue;
        }
        nextList.push({
          uri: pinned.uri,
          is_primary: nextList.length === 0,
          mock: pinned.mock,
        });
      }
      onChange(normalizePrimary(nextList));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tải ảnh lên IPFS.';
      setErrorMessage(msg);
      if (nextList.length > images.length) {
        onChange(normalizePrimary(nextList));
      }
    } finally {
      setIsUploading(false);
      setUploadProgress('');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const setPrimary = (targetIdx: number) => {
    onChange(
      images.map((item, idx) => ({
        ...item,
        is_primary: idx === targetIdx,
      }))
    );
  };

  const moveImage = (fromIdx: number, direction: -1 | 1) => {
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= images.length) return;
    const copy = [...images];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    onChange(normalizePrimary(copy));
  };

  const removeImage = (targetIdx: number) => {
    const filtered = images.filter((_, idx) => idx !== targetIdx);
    onChange(normalizePrimary(filtered));
  };

  const hasMockImage = images.some((item) => item.mock || isMockUri(item.uri));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#17191F]">
            Hình ảnh sản phẩm ({images.length}/{maxImages})
          </p>
          <p className="text-xs text-[#525866]">
            JPG, PNG hoặc WebP tối đa 10MB/ảnh. Chọn 1 ảnh chính làm ảnh đối chiếu AI khi kiểm tra Escrow.
          </p>
        </div>

        <input
          ref={inputRef}
          id="listing-image-upload-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || isUploading || images.length >= maxImages}
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="sr-only"
        />
        <label
          htmlFor="listing-image-upload-input"
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition ${
            disabled || isUploading || images.length >= maxImages
              ? 'border-[#E5E7EB] bg-[#F7F8FA] text-[#525866] cursor-not-allowed opacity-70'
              : 'border-[#3458D4] bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-[#2947B5] cursor-pointer'
          }`}
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{isUploading ? uploadProgress : 'Thêm ảnh IPFS'}</span>
        </label>
      </div>

      {hasMockImage && (
        <div className="rounded-xl border border-[#F0B44D]/60 bg-[#F0B44D]/15 px-3 py-2 text-xs text-[#7A4B00]">
          Phát hiện URI IPFS mô phỏng cục bộ (mock CID). Trên Fuji testnet chính thức, hãy cấu hình PINATA_JWT ở server để lưu ảnh thật.
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {images.length === 0 ? (
        <label
          htmlFor="listing-image-upload-input"
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E5E7EB] hover:border-[#3458D4]/60 bg-[#F7F8FA] px-4 py-8 text-center cursor-pointer transition"
        >
          <ImagePlus className="w-8 h-8 text-[#3458D4] mb-2" aria-hidden="true" />
          <span className="text-sm font-semibold text-[#17191F]">
            Chọn từ 1 đến {maxImages} ảnh rõ nét
          </span>
          <span className="text-xs text-[#525866] mt-1">
            Ảnh chính nên chụp toàn bộ hộp/sản phẩm, các ảnh phụ chụp chi tiết seal, tem hoặc mã SKU.
          </span>
        </label>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((item, idx) => (
            <div
              key={`${item.uri}-${idx}`}
              className={`rounded-xl border overflow-hidden bg-[#FFFFFF] flex flex-col ${
                item.is_primary
                  ? 'border-[#3458D4] ring-2 ring-[#3458D4]/20'
                  : 'border-[#E5E7EB]'
              }`}
            >
              <div className="relative aspect-square bg-[#F7F8FA] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ipfsToGatewayUrl(item.uri)}
                  alt={`Ảnh sản phẩm ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                {item.is_primary && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#3458D4] text-white text-[10px] font-bold shadow">
                    <Star className="w-3 h-3 fill-white" aria-hidden="true" />
                    Ảnh chính AI
                  </span>
                )}
                {(item.mock || isMockUri(item.uri)) && (
                  <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px]">
                    Mock
                  </span>
                )}
              </div>

              <div className="p-2 flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={disabled || item.is_primary}
                  onClick={() => setPrimary(idx)}
                  className={`w-full px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    item.is_primary
                      ? 'bg-[#3458D4]/10 text-[#2947B5] cursor-default'
                      : 'bg-[#F7F8FA] hover:bg-[#3458D4]/10 text-[#17191F] hover:text-[#2947B5]'
                  }`}
                >
                  {item.is_primary ? 'Đang là ảnh chính' : 'Đặt làm ảnh chính'}
                </button>

                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    disabled={disabled || idx === 0}
                    onClick={() => moveImage(idx, -1)}
                    aria-label={`Di chuyển ảnh ${idx + 1} sang trái`}
                    className="p-1.5 rounded-lg border border-[#E5E7EB] text-[#525866] hover:text-[#17191F] disabled:opacity-40 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={disabled || idx === images.length - 1}
                    onClick={() => moveImage(idx, 1)}
                    aria-label={`Di chuyển ảnh ${idx + 1} sang phải`}
                    className="p-1.5 rounded-lg border border-[#E5E7EB] text-[#525866] hover:text-[#17191F] disabled:opacity-40 cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeImage(idx)}
                    aria-label={`Xóa ảnh ${idx + 1}`}
                    className="p-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 cursor-pointer ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MultiImageUploader;
