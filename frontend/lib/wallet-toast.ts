'use client';

import { toast } from 'sonner';
import { classifyContractError, type ClassifiedTxError } from '@/lib/errors';

interface WalletToastOptions {
  toastId?: string | number;
  duration?: number;
  context?: string;
}

/**
 * Classifies a wallet/contract error and displays an appropriate toast notification.
 * User signing rejections are handled silently in console (no Next.js Runtime Error overlay)
 * and shown as an informational notice without automatic retries.
 */
export function notifyWalletActionError(
  error: unknown,
  actionPrefix: string,
  options?: WalletToastOptions
): ClassifiedTxError {
  const classified = classifyContractError(error);
  const toastOpts = {
    ...(options?.toastId !== undefined ? { id: options.toastId } : {}),
    ...(options?.duration !== undefined ? { duration: options.duration } : {}),
  };

  if (classified.isUserRejected) {
    toast.info(classified.message, toastOpts);
    return classified;
  }

  const label = options?.context ? `[${options.context}]` : '[TxError]';
  console.warn(label, classified.message);

  const displayMsg = actionPrefix ? `${actionPrefix}: ${classified.message}` : classified.message;
  toast.error(displayMsg, toastOpts);
  return classified;
}
