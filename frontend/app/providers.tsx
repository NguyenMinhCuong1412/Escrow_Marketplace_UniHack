'use client';

import React, { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/lib/wagmi';
import { LocalWalletConfirmModal } from '@/components/LocalWalletConfirmModal';
import { WalletModalProvider } from '@/components/ConnectWalletModal';
import { AuthSessionProvider } from '@/hooks/useAuthSession';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 5000,
          },
        },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthSessionProvider>
          <WalletModalProvider>
            {children}
            <LocalWalletConfirmModal />
          </WalletModalProvider>
        </AuthSessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
