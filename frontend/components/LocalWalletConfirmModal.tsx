'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, FileText, Send, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { formatEther } from 'viem';
import { setLocalWalletConfirmationHandler } from '@/lib/local-wallet/session';
import type { ConfirmationRequest } from '@/lib/local-wallet/types';
import { AddressDisplay } from './AddressDisplay';

export function LocalWalletConfirmModal() {
  const [pendingRequest, setPendingRequest] = useState<ConfirmationRequest | null>(null);

  useEffect(() => {
    // Register the confirmation handler to intercept signing requests
    setLocalWalletConfirmationHandler(async (req) => {
      return new Promise<boolean>((resolve) => {
        setPendingRequest({
          ...req,
          resolve: (confirmed: boolean) => {
            setPendingRequest(null);
            resolve(confirmed);
          },
        });
      });
    });

    return () => {
      setLocalWalletConfirmationHandler(null);
    };
  }, []);

  if (!pendingRequest) return null;

  const handleConfirm = () => {
    if (pendingRequest) {
      pendingRequest.resolve(true);
      setPendingRequest(null);
    }
  };

  const handleReject = () => {
    if (pendingRequest) {
      pendingRequest.resolve(false);
      setPendingRequest(null);
    }
  };

  const isTx = pendingRequest.type === 'sendTransaction';
  const isMsg = pendingRequest.type === 'personal_sign';
  const isTyped = pendingRequest.type === 'signTypedData';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl shadow-2xl p-6 text-[#17191F] flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-4">
          <div className="p-2.5 rounded-xl bg-[#F0B44D]/20 text-[#8A5A00] border border-[#F0B44D]/40">
            {isTx ? <Send className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[#17191F]">
              {isTx ? 'Yêu cầu xác nhận giao dịch' : 'Yêu cầu ký thông điệp'}
            </h3>
            <p className="text-xs text-[#8A5A00] font-mono flex items-center gap-1.5 mt-0.5">
              <span>Mạng: Avalanche Fuji Testnet (43113)</span>
              <span>•</span>
              <span className="text-[#525866]">Ví thiết bị</span>
            </p>
          </div>
        </div>

        {/* Warning Badge */}
        <div className="bg-[#F0B44D]/15 border border-[#F0B44D]/40 rounded-xl p-3 flex items-start gap-2.5 text-xs text-[#8A5A00]">
          <AlertTriangle className="w-4 h-4 text-[#8A5A00] shrink-0 mt-0.5" />
          <span>
            Khóa riêng tư của bạn lưu trên thiết bị này. Vui lòng kiểm tra kỹ thông tin trước khi xác nhận. Giao dịch on-chain không thể hoàn tác sau khi gửi.
          </span>
        </div>

        {/* Request Details */}
        <div className="bg-[#F7F8FA] border border-[#E5E7EB] rounded-xl p-4 text-sm flex flex-col gap-3 font-mono">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#525866]">Địa chỉ ví ký:</span>
            <AddressDisplay address={pendingRequest.from} />
          </div>

          {isTx && (
            <>
              {pendingRequest.to && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#525866]">Tương tác hợp đồng (To):</span>
                  <AddressDisplay address={pendingRequest.to} />
                </div>
              )}

              <div className="flex justify-between items-center text-xs">
                <span className="text-[#525866]">Số tiền (Value):</span>
                <span className="text-[#3458D4] font-semibold">
                  {pendingRequest.value ? `${formatEther(pendingRequest.value)} AVAX` : '0 AVAX'}
                </span>
              </div>

              {pendingRequest.data && pendingRequest.data !== '0x' && (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-xs text-[#525866]">Dữ liệu thực thi (Calldata):</span>
                  <div className="max-h-24 overflow-y-auto bg-[#FFFFFF] p-2 rounded text-[11px] text-[#17191F] break-all select-all border border-[#E5E7EB]">
                    {pendingRequest.data}
                  </div>
                </div>
              )}
            </>
          )}

          {isMsg && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-xs text-[#525866]">Nội dung thông điệp cần ký:</span>
              <div className="max-h-32 overflow-y-auto bg-[#FFFFFF] p-2.5 rounded text-xs text-[#17191F] select-all border border-[#E5E7EB] whitespace-pre-wrap">
                {pendingRequest.message}
              </div>
            </div>
          )}

          {isTyped && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-xs text-[#525866]">Dữ liệu có cấu trúc (Typed Data):</span>
              <div className="max-h-32 overflow-y-auto bg-[#FFFFFF] p-2 rounded text-[11px] text-[#17191F] select-all border border-[#E5E7EB]">
                {JSON.stringify(pendingRequest.typedData, null, 2)}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleReject}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F7F8FA] text-[#525866] hover:text-[#17191F] text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <XCircle className="w-4 h-4 text-red-500" />
            Từ chối (Cancel)
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-sm font-semibold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            Xác nhận & Ký
          </button>
        </div>
      </div>
    </div>
  );
}
