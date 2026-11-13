import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/Navbar';
import { WrongChainBanner } from '@/components/WrongChainBanner';
import { AuthGuard } from '@/components/AuthGuard';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Escrow Marketplace | AI-Verified Escrow Platform',
  description: 'Sàn giao dịch đồ sưu tầm bảo vệ bằng tiền cọc hai bên — AI chỉ xác thực bằng chứng và ký attest on-chain; hết hạn khiếu nại, không bị gắn cờ và không có khiếu nại thì bất kỳ ai cũng có thể kích hoạt hoàn cọc; tranh chấp do trọng tài xử lý',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="bg-[#F7F8FA] text-[#17191F] font-sans min-h-screen flex flex-col antialiased">
        <Providers>
          <WrongChainBanner />
          <Navbar />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Suspense fallback={null}>
              <AuthGuard>{children}</AuthGuard>
            </Suspense>
          </main>
          <footer className="border-t border-[#E5E7EB] bg-[#FFFFFF] py-6 text-center text-xs text-[#525866]">
            <p>Escrow Marketplace &copy; 2026 — AI-Assisted Smart Contract Escrow Platform on Avalanche Fuji.</p>
          </footer>
          <Toaster position="bottom-right" richColors theme="light" />
        </Providers>
      </body>
    </html>
  );
}
