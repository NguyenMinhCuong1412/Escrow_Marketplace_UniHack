import { formatEther } from 'viem';

export function shortAddr(address?: string | null): string {
  if (!address) return '';
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatAvax(amountWei?: bigint | string | number | null): string {
  if (amountWei === undefined || amountWei === null) return '0';
  try {
    const weiBigInt = typeof amountWei === 'bigint' ? amountWei : BigInt(amountWei.toString());
    const etherStr = formatEther(weiBigInt);
    const num = parseFloat(etherStr);
    return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
  } catch {
    return '0';
  }
}

export interface StateInfo {
  name: string;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const STATE_MAP: Record<number, StateInfo> = {
  0: {
    name: 'Created',
    label: 'Chờ nạp cọc',
    bgClass: 'bg-[#F7F8FA]',
    textClass: 'text-[#525866]',
    borderClass: 'border-[#E5E7EB]',
  },
  1: {
    name: 'AwaitingEvidence',
    label: 'Chờ bằng chứng',
    bgClass: 'bg-blue-50',
    textClass: 'text-[#3458D4]',
    borderClass: 'border-blue-200',
  },
  2: {
    name: 'Attested',
    label: 'AI đã xác thực',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
  },
  3: {
    name: 'Disputed',
    label: 'Đang tranh chấp',
    bgClass: 'bg-red-50',
    textClass: 'text-red-700',
    borderClass: 'border-red-200',
  },
  4: {
    name: 'Resolved',
    label: 'Hoàn tất',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-800',
    borderClass: 'border-emerald-200',
  },
  5: {
    name: 'Cancelled',
    label: 'Đã huỷ',
    bgClass: 'bg-gray-100',
    textClass: 'text-gray-600',
    borderClass: 'border-gray-200',
  },
};

export function getStateInfo(state: number, flagged?: boolean): StateInfo {
  if (state === 2 && flagged) {
    return {
      name: 'Attested (Flagged)',
      label: 'AI cảnh báo rủi ro',
      bgClass: 'bg-[#F0B44D]/20',
      textClass: 'text-[#8A5A00]',
      borderClass: 'border-[#F0B44D]/50',
    };
  }
  return STATE_MAP[state] || STATE_MAP[0];
}

export function formatCountdown(deadlineSeconds?: bigint | number | null): {
  text: string;
  isExpired: boolean;
  secondsRemaining: number;
} {
  if (!deadlineSeconds) {
    return { text: '--', isExpired: false, secondsRemaining: 0 };
  }

  const deadline = typeof deadlineSeconds === 'bigint' ? Number(deadlineSeconds) : deadlineSeconds;
  if (deadline <= 0) {
    return { text: '--', isExpired: false, secondsRemaining: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;

  if (diff <= 0) {
    return { text: 'Hết hạn', isExpired: true, secondsRemaining: 0 };
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (days > 0) {
    return { text: `${days}d ${hours}h ${minutes}m`, isExpired: false, secondsRemaining: diff };
  }
  if (hours > 0) {
    return { text: `${hours}h ${minutes}m ${seconds}s`, isExpired: false, secondsRemaining: diff };
  }
  return { text: `${minutes}m ${seconds}s`, isExpired: false, secondsRemaining: diff };
}

export function formatNonceShort(nonce?: string | null): string {
  if (!nonce || nonce.length < 10) return '';
  return nonce.slice(2, 10).toLowerCase();
}

export function formatDateTime(timestampSeconds?: bigint | number | null): string {
  if (!timestampSeconds) return '--';
  const ts = typeof timestampSeconds === 'bigint' ? Number(timestampSeconds) : timestampSeconds;
  if (ts <= 0) return '--';
  return new Date(ts * 1000).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

