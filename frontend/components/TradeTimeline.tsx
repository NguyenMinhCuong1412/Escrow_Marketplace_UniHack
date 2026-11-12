'use client';

import React from 'react';
import { clsx } from 'clsx';
import { Check, ShieldCheck, AlertTriangle, XCircle, Clock } from 'lucide-react';

interface TradeTimelineProps {
  state: number;
  flagged?: boolean;
}

export const TradeTimeline: React.FC<TradeTimelineProps> = ({ state, flagged }) => {
  const isCancelled = state === 5;
  const isDisputed = state === 3;
  const isResolved = state === 4;

  const steps = [
    { id: 0, label: 'Khởi tạo & Ký cọc' },
    { id: 1, label: 'Bằng chứng & Nonce' },
    { id: 2, label: flagged ? 'AI cảnh báo' : 'AI Xác thực' },
    { id: 4, label: 'Hoàn cọc & Hoàn tất' },
  ];

  return (
    <div className="w-full py-2">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 w-full bg-slate-800 -z-0" />

        {steps.map((step, idx) => {
          const isCompleted = state > step.id || (step.id === 4 && isResolved);
          const isCurrent = state === step.id;

          let stepClass = 'bg-slate-900 border-slate-700 text-slate-500';
          let icon = <span>{idx + 1}</span>;

          if (isCancelled && idx >= state) {
            stepClass = 'bg-slate-900 border-slate-800 text-slate-600';
          } else if (isCompleted) {
            stepClass = 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-500/20';
            icon = <Check className="w-4 h-4" />;
          } else if (isCurrent) {
            if (isDisputed && step.id === 2) {
              stepClass = 'bg-red-600 border-red-500 text-white animate-pulse';
              icon = <AlertTriangle className="w-4 h-4" />;
            } else if (flagged && step.id === 2) {
              stepClass = 'bg-amber-600 border-amber-500 text-white';
              icon = <AlertTriangle className="w-4 h-4" />;
            } else {
              stepClass = 'bg-indigo-600 border-indigo-400 text-white ring-4 ring-indigo-500/20';
              icon = <Clock className="w-4 h-4 animate-spin" />;
            }
          }

          return (
            <div key={step.id} className="flex flex-col items-center relative z-10">
              <div
                className={clsx(
                  'w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-300',
                  stepClass
                )}
              >
                {icon}
              </div>
              <span
                className={clsx(
                  'text-[11px] font-medium mt-2 text-center max-w-[80px] sm:max-w-none',
                  isCurrent ? 'text-indigo-400 font-bold' : isCompleted ? 'text-slate-300' : 'text-slate-500'
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {isCancelled && (
        <div className="mt-4 p-2.5 rounded-lg bg-gray-500/10 border border-gray-500/30 text-gray-400 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>Giao dịch này đã bị hủy. Cọc đã được xử lý theo quy định của hợp đồng.</span>
        </div>
      )}

      {isDisputed && (
        <div className="mt-4 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Giao dịch đang có tranh chấp khiếu nại. Chờ trọng tài (owner) xử lý.</span>
        </div>
      )}
    </div>
  );
};

export default TradeTimeline;
