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
    bgClass: 'bg-slate-100 dark:bg-slate-800',
    textClass: 'text-slate-700 dark:text-slate-300',
    borderClass: 'border-slate-300 dark:border-slate-600',
  },
  1: {
    name: 'AwaitingEvidence',
    label: 'Chờ bằng chứng',
    bgClass: 'bg-blue-50 dark:bg-blue-950/60',
    textClass: 'text-blue-700 dark:text-blue-300',
    borderClass: 'border-blue-300 dark:border-blue-800',
  },
  2: {
    name: 'Attested',
    label: 'AI đã xác thực',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/60',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-emerald-300 dark:border-emerald-800',
  },
  3: {
    name: 'Disputed',
    label: 'Đang tranh chấp',
    bgClass: 'bg-red-50 dark:bg-red-950/60',
    textClass: 'text-red-700 dark:text-red-300',
    borderClass: 'border-red-300 dark:border-red-800',
  },
  4: {
    name: 'Resolved',
    label: 'Hoàn tất',
    bgClass: 'bg-teal-50 dark:bg-teal-950/60',
    textClass: 'text-teal-700 dark:text-teal-300',
    borderClass: 'border-teal-300 dark:border-teal-800',
  },
  5: {
    name: 'Cancelled',
    label: 'Đã huỷ',
    bgClass: 'bg-gray-100 dark:bg-gray-800',
    textClass: 'text-gray-600 dark:text-gray-400',
    borderClass: 'border-gray-300 dark:border-gray-700',
  },
};

export function getStateInfo(state: number, flagged?: boolean): StateInfo {
  if (state === 2 && flagged) {
    return {
      name: 'Attested (Flagged)',
      label: 'AI cảnh báo rủi ro',
      bgClass: 'bg-amber-50 dark:bg-amber-950/60',
      textClass: 'text-amber-700 dark:text-amber-300',
      borderClass: 'border-amber-300 dark:border-amber-800',
    };
  }
  return STATE_MAP[state] || STATE_MAP[0];
}
