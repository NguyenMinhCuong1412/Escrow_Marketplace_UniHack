import { decodeEventLog } from 'viem';
import {
  avaxInputToWeiString,
  computeDepositWeiString,
  weiToAvaxString,
  type ListingCategory,
  type ListingCondition,
  type ListingStatus,
  type RequestStatus,
} from '@/lib/marketplace';

export const CATEGORY_TABS: ReadonlyArray<{
  value: 'ALL' | ListingCategory;
  label: string;
}> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'LEGO', label: 'LEGO' },
  { value: 'MODEL_KIT', label: 'Mô hình' },
  { value: 'FIGURE', label: 'Figure' },
  { value: 'TRADING_CARD', label: 'Thẻ bài' },
  { value: 'COIN', label: 'Xu sưu tầm' },
  { value: 'OTHER', label: 'Khác' },
];

export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  LEGO: 'LEGO',
  MODEL_KIT: 'Mô hình',
  FIGURE: 'Figure',
  TRADING_CARD: 'Thẻ bài',
  COIN: 'Xu sưu tầm',
  OTHER: 'Khác',
};

export const CONDITION_LABELS: Record<ListingCondition, string> = {
  SEALED_NEW: 'Nguyên seal',
  LIKE_NEW: 'Như mới',
  USED_GOOD: 'Đã dùng · Đẹp',
  USED_FAIR: 'Đã dùng · Khá',
  GRADED: 'Đã chấm điểm (Graded)',
};

export const SORT_OPTIONS: ReadonlyArray<{
  value: 'newest' | 'price_asc' | 'price_desc';
  label: string;
}> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá tăng dần' },
  { value: 'price_desc', label: 'Giá giảm dần' },
];

export interface BadgeMeta {
  label: string;
  className: string;
}

export const LISTING_STATUS_BADGES: Record<ListingStatus, BadgeMeta> = {
  ACTIVE: {
    label: 'Đang bán',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  RESERVED: {
    label: 'Đang giữ chỗ',
    className: 'bg-[#F0B44D]/20 text-[#8A5A00] border-[#F0B44D]/50',
  },
  SOLD: {
    label: 'Đã bán',
    className: 'bg-[#F7F8FA] text-[#525866] border-[#E5E7EB]',
  },
  PAUSED: {
    label: 'Tạm ẩn',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  CANCELLED: {
    label: 'Đã hủy',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
};

export const REQUEST_STATUS_BADGES: Record<RequestStatus, BadgeMeta> = {
  PENDING: {
    label: 'Chờ xác nhận',
    className: 'bg-[#3458D4]/10 text-[#3458D4] border-[#3458D4]/25',
  },
  ACCEPTED: {
    label: 'Đã giữ chỗ · Chờ tạo Escrow',
    className: 'bg-[#F0B44D]/20 text-[#8A5A00] border-[#F0B44D]/50',
  },
  REJECTED: {
    label: 'Đã từ chối',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  CANCELLED: {
    label: 'Đã hủy',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  EXPIRED: {
    label: 'Hết hạn giữ chỗ',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  ESCROW_CREATED: {
    label: 'Đã tạo Escrow',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  COMPLETED: {
    label: 'Hoàn tất',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  TRADE_CANCELLED: {
    label: 'Escrow đã hủy',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};

export interface AvaxPreviewResult {
  valid: boolean;
  wei?: string;
  depositWei?: string;
  depositAvax?: string;
  error?: string;
}

/** Tính toán giá wei và tiền cọc 30% hoàn toàn bằng BigInt/string (không dùng float). */
export function buildSellableAvaxPreview(rawAvax: string): AvaxPreviewResult {
  const trimmed = rawAvax.trim();
  if (!trimmed) {
    return { valid: false };
  }
  try {
    const wei = avaxInputToWeiString(trimmed);
    const depositWei = computeDepositWeiString(wei);
    if (BigInt(depositWei) <= 0n) {
      return {
        valid: false,
        error: 'Giá trị quá nhỏ: tiền cọc 30% trên Escrow phải lớn hơn 0 wei.',
      };
    }
    return {
      valid: true,
      wei,
      depositWei,
      depositAvax: weiToAvaxString(depositWei, 6),
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Giá AVAX không hợp lệ.',
    };
  }
}

export interface ReceiptLogLike {
  address?: string;
  data: `0x${string}`;
  topics: readonly `0x${string}`[] | [`0x${string}`, ...`0x${string}`[]] | [];
}

/**
 * Trích xuất `tradeId` từ event `TradeCreated` trong transaction receipt.
 * Ưu tiên decode đúng ABI từ đúng địa chỉ contract Escrow.
 */
export function extractTradeCreatedIdFromReceipt(
  logs: readonly ReceiptLogLike[],
  escrowAddr: string,
  abi: readonly unknown[]
): number | null {
  const normalizedEscrow = escrowAddr.toLowerCase();

  for (const entry of logs) {
    if (entry.address && entry.address.toLowerCase() !== normalizedEscrow) {
      continue;
    }
    if (entry.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({
        abi: abi as any,
        data: entry.data,
        topics: entry.topics as [`0x${string}`, ...`0x${string}`[]],
      }) as { eventName?: string; args?: { tradeId?: bigint } | readonly unknown[] };

      if (decoded.eventName === 'TradeCreated' && decoded.args) {
        const rawTradeId =
          (decoded.args as { tradeId?: bigint }).tradeId ??
          (Array.isArray(decoded.args) ? decoded.args[0] : undefined);
        if (rawTradeId !== undefined) {
          const num = Number(rawTradeId);
          if (Number.isSafeInteger(num) && num > 0) return num;
        }
      }
    } catch {
      // Thử fallback bên dưới nếu ABI log khác event
    }
  }

  // Fallback tối giản khi log thiếu ABI phụ nhưng topic[1] mang tradeId dương
  for (const entry of logs) {
    if (entry.address && entry.address.toLowerCase() !== normalizedEscrow) {
      continue;
    }
    if (entry.topics.length >= 2 && entry.topics[1]) {
      try {
        const n = Number(BigInt(entry.topics[1]));
        if (Number.isSafeInteger(n) && n > 0) return n;
      } catch {
        // continue
      }
    }
  }

  return null;
}

export interface PendingBindTradeRecord {
  txHash: `0x${string}`;
  tradeId?: number;
  buyerWallet: string;
  totalValueWei: string;
  savedAt: number;
}

function pendingBindStorageKey(activeChainId: number, requestId: string): string {
  return `mkt:pending-bind:${activeChainId}:${requestId}`;
}

export function getPendingBindTrade(
  activeChainId: number,
  requestId: string
): PendingBindTradeRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(pendingBindStorageKey(activeChainId, requestId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingBindTradeRecord>;
    if (
      typeof parsed?.txHash === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(parsed.txHash) &&
      typeof parsed.buyerWallet === 'string' &&
      typeof parsed.totalValueWei === 'string'
    ) {
      return {
        txHash: parsed.txHash as `0x${string}`,
        tradeId: typeof parsed.tradeId === 'number' ? parsed.tradeId : undefined,
        buyerWallet: parsed.buyerWallet,
        totalValueWei: parsed.totalValueWei,
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function setPendingBindTrade(
  activeChainId: number,
  requestId: string,
  record: PendingBindTradeRecord
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      pendingBindStorageKey(activeChainId, requestId),
      JSON.stringify(record)
    );
  } catch {
    // Bỏ qua nếu trình duyệt hạn chế storage
  }
}

export function clearPendingBindTrade(activeChainId: number, requestId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(pendingBindStorageKey(activeChainId, requestId));
  } catch {
    // ignore
  }
}
