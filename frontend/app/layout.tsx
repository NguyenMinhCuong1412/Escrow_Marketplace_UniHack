import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/Navbar';
import { WrongChainBanner } from '@/components/WrongChainBanner';
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
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        <Providers>
          <WrongChainBanner />
          <Navbar />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="border-t border-slate-800/80 bg-slate-900/40 py-6 text-center text-xs text-slate-500">
            <p>Escrow Marketplace &copy; 2026 — AI-Assisted Smart Contract Escrow Platform on Avalanche Fuji.</p>
          </footer>
          <Toaster position="bottom-right" richColors theme="dark" />
        </Providers>
      </body>
    </html>
  );
}
