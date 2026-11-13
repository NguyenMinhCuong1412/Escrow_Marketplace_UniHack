'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { targetChain } from '@/lib/wagmi';
import {
  getActiveLocalAccount,
  lockLocalWallet,
  subscribeLocalWalletSession,
} from '@/lib/local-wallet/session';
import { LOCAL_WALLET_CONNECTOR_ID } from '@/lib/local-wallet/connector';
import { buildAuthChallengeMessage } from '@/lib/auth-challenge';
import {
  getKnownWalletAccounts,
  orderAccountsWithSelected,
  requestWalletAccountSelection,
  selectWalletAccount,
} from '@/lib/wallet-providers';
import type { Address } from 'viem';

export interface AuthSessionState {
  isWalletConnected: boolean;
  isCorrectNetwork: boolean;
  isLocalWallet: boolean;
  isLocalWalletUnlocked: boolean;
  isAuthenticated: boolean;
  isReconnecting: boolean;
  isCheckingSession: boolean;
  address?: Address;
  availableAccounts: Address[];
  chainId?: number;
  serverSessionActive: boolean;
  isSigningIn: boolean;
  authError: string | null;
}

type AuthSessionContextValue = ReturnType<typeof useAuthSessionController>;

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const value = useAuthSessionController();
  return React.createElement(AuthSessionContext.Provider, { value }, children);
}

export function useAuthSession(): AuthSessionContextValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within an AuthSessionProvider');
  }
  return ctx;
}

function useAuthSessionController() {
  const { address, addresses, isConnected, status, chain, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();

  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [localUnlocked, setLocalUnlocked] = useState<boolean>(false);
  const [serverSessionActive, setServerSessionActive] = useState<boolean>(false);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [providerAccounts, setProviderAccounts] = useState<Address[]>([]);

  const sessionVersionRef = useRef<number>(0);
  const serverSessionActiveRef = useRef<boolean>(false);
  const sessionAddressRef = useRef<string | null>(null);

  const applySessionState = useCallback((active: boolean, addr: string | null) => {
    sessionVersionRef.current += 1;
    serverSessionActiveRef.current = active;
    sessionAddressRef.current = addr;
    setServerSessionActive(active);
    setSessionAddress(addr);
    setIsCheckingSession(false);
  }, []);

  const isLocalWallet = connector?.id === LOCAL_WALLET_CONNECTOR_ID;

  // Subscribe to local wallet session changes in volatile RAM
  useEffect(() => {
    setIsMounted(true);
    setLocalUnlocked(!!getActiveLocalAccount());
    const unsubscribe = subscribeLocalWalletSession(() => {
      setLocalUnlocked(!!getActiveLocalAccount());
    });
    return unsubscribe;
  }, []);

  // Load all authorized accounts from provider when connected to a browser wallet
  useEffect(() => {
    let cancelled = false;
    if (!isConnected || !connector || isLocalWallet) {
      setProviderAccounts([]);
      return;
    }

    (async () => {
      try {
        const provider: any = await connector.getProvider?.();
        if (provider && typeof provider.request === 'function') {
          const ethAccs = ((await provider
            .request({ method: 'eth_accounts' })
            .catch(() => [])) as string[]) || [];
          if (!cancelled) {
            const known = getKnownWalletAccounts(connector.id);
            const merged = orderAccountsWithSelected(
              [...(addresses || []), ...ethAccs, ...known],
              address
            );
            setProviderAccounts(merged);
          }
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, connector, isLocalWallet, address, addresses]);

  const availableAccounts = useMemo(() => {
    const raw = [
      ...(address ? [address] : []),
      ...(addresses || []),
      ...providerAccounts,
      ...(connector?.id ? getKnownWalletAccounts(connector.id) : []),
    ];
    return orderAccountsWithSelected(raw, address);
  }, [address, addresses, providerAccounts, connector]);

  // Check server-side session status on mount & when address changes
  useEffect(() => {
    let active = true;

    if (!address) {
      applySessionState(false, null);
      return;
    }

    // If we already verified/synced the server session for this exact address, keep it
    if (
      serverSessionActiveRef.current &&
      sessionAddressRef.current &&
      sessionAddressRef.current.toLowerCase() === address.toLowerCase()
    ) {
      setIsCheckingSession(false);
      return;
    }

    // If address switched away from the previously authenticated sessionAddress, invalidate immediately
    if (
      sessionAddressRef.current &&
      sessionAddressRef.current.toLowerCase() !== address.toLowerCase()
    ) {
      applySessionState(false, null);
      fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
      return;
    }

    const checkVersion = sessionVersionRef.current;
    setIsCheckingSession(true);
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!active || sessionVersionRef.current !== checkVersion) return;
        if (data?.authenticated && data?.address?.toLowerCase() === address.toLowerCase()) {
          applySessionState(true, address);
        } else {
          applySessionState(false, null);
          // If server had a session for a different address, clear it
          if (data?.authenticated && data?.address) {
            fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
          }
        }
      })
      .catch(() => {
        if (active && sessionVersionRef.current === checkVersion) {
          applySessionState(false, null);
        }
      })
      .finally(() => {
        if (active && sessionVersionRef.current === checkVersion) {
          setIsCheckingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, [address, applySessionState]);

  const isLocalWalletUnlocked = isLocalWallet ? localUnlocked : true;
  const isCorrectNetwork = !chain || chain.id === 43113 || chain.id === 31337;
  const isWalletConnected = status === 'connected' && !!address;
  const isReconnecting = status === 'reconnecting' || status === 'connecting';

  // Require both wallet connection + correct network + valid server session for current address
  const isAuthenticated = Boolean(
    isWalletConnected &&
      isCorrectNetwork &&
      isLocalWalletUnlocked &&
      serverSessionActive &&
      (!sessionAddress || sessionAddress.toLowerCase() === address?.toLowerCase())
  );

  /**
   * Performs full SIWE login handshake with /api/auth/session:
   * 1. Switches to Avalanche Fuji (43113) if on an unsupported chain
   * 2. Fetches one-time nonce
   * 3. Requests personal_sign from the active wallet address
   * 4. Verifies signature & establishes HttpOnly session cookie on server
   */
  const authenticateWithServer = useCallback(async (): Promise<boolean> => {
    if (!address) return false;
    setAuthError(null);

    try {
      setIsSigningIn(true);

      // Step 1: Ensure wallet is on supported network (Avalanche Fuji 43113 or Anvil 31337)
      let activeChainId = chain?.id || targetChain.id;
      if (!isLocalWallet && chain && chain.id !== 43113 && chain.id !== 31337) {
        try {
          const switched = await switchChainAsync({ chainId: targetChain.id });
          activeChainId = switched?.id || targetChain.id;
        } catch (switchErr: any) {
          const msg = String(switchErr?.shortMessage || switchErr?.message || '');
          if (switchErr?.code === 4001 || msg.toLowerCase().includes('rejected')) {
            setAuthError(`Bạn cần chuyển sang mạng ${targetChain.name} (${targetChain.id}) để tiếp tục.`);
          } else {
            setAuthError(`Không thể chuyển sang mạng ${targetChain.name}. Vui lòng đổi mạng trong ví.`);
          }
          return false;
        }
      }

      // Step 2: Get one-time nonce from server
      const getRes = await fetch('/api/auth/session', { cache: 'no-store' });
      let getData = await getRes.json();
      if (getData?.authenticated && getData?.address?.toLowerCase() === address.toLowerCase()) {
        applySessionState(true, address);
        return true;
      }
      if (getData?.authenticated) {
        await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
        const freshRes = await fetch('/api/auth/session', { cache: 'no-store' });
        getData = await freshRes.json();
      }
      const nonce = getData?.nonce;
      if (!nonce) throw new Error('Không lấy được mã xác thực (nonce) từ máy chủ.');

      // Step 3: Request user signature for active account
      const message = buildAuthChallengeMessage(address, nonce, activeChainId);
      const signature = await signMessageAsync({
        account: address,
        message,
      });

      // Step 4: Verify signature and set session cookie
      const postRes = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          chainId: activeChainId,
          nonce,
          signature,
        }),
      });

      if (!postRes.ok) {
        const errData = await postRes.json().catch(() => ({}));
        throw new Error(errData?.error || 'Xác thực chữ ký với máy chủ thất bại.');
      }

      applySessionState(true, address);
      return true;
    } catch (err: any) {
      const msg = String(err?.shortMessage || err?.message || '');
      if (
        err?.code === 4001 ||
        msg.toLowerCase().includes('rejected') ||
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('user canceled')
      ) {
        setAuthError('Bạn đã hủy yêu cầu ký xác thực trên ví.');
      } else {
        setAuthError(msg || 'Không thể hoàn tất ký xác thực phiên làm việc.');
      }
      return false;
    } finally {
      setIsSigningIn(false);
    }
  }, [address, chain, isLocalWallet, switchChainAsync, signMessageAsync, applySessionState]);

  /**
   * Switches the active account among already-authorized accounts in the wallet.
   */
  const switchAccount = useCallback(
    async (targetAddress: string): Promise<boolean> => {
      if (!connector || isLocalWallet) return false;
      setAuthError(null);
      try {
        const previousAddress = address;
        const updated = await selectWalletAccount(connector, targetAddress);
        setProviderAccounts(updated);

        if (!previousAddress || previousAddress.toLowerCase() !== targetAddress.toLowerCase()) {
          applySessionState(false, null);
          await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
        }
        return true;
      } catch (err: any) {
        setAuthError(err?.message || 'Không thể chuyển đổi tài khoản.');
        return false;
      }
    },
    [connector, isLocalWallet, address, applySessionState]
  );

  /**
   * Opens the extension's account permission picker (or cycles/refreshes accounts in Core/MetaMask).
   */
  const requestAccountSelection = useCallback(async (): Promise<Address | undefined> => {
    if (!connector || isLocalWallet) return undefined;
    setAuthError(null);
    try {
      const previousAddress = address;
      const result = await requestWalletAccountSelection(connector, address);
      if (result.accounts.length > 0) {
        setProviderAccounts(result.accounts);
      }
      if (
        result.activeAddress &&
        (!previousAddress ||
          previousAddress.toLowerCase() !== result.activeAddress.toLowerCase())
      ) {
        applySessionState(false, null);
        await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
      }
      return result.activeAddress;
    } catch (err: any) {
      const msg = String(err?.shortMessage || err?.message || '');
      if (
        err?.code === 4001 ||
        msg.toLowerCase().includes('rejected') ||
        msg.toLowerCase().includes('denied')
      ) {
        setAuthError('Đã hủy yêu cầu chọn tài khoản từ ví.');
      } else {
        setAuthError(msg || 'Không thể mở hộp thoại chọn tài khoản của ví.');
      }
      return undefined;
    }
  }, [connector, isLocalWallet, address, applySessionState]);

  /**
   * Sets server session active state directly (e.g. after local wallet signs challenge).
   */
  const syncServerSession = useCallback(
    (active: boolean, verifiedAddr?: string) => {
      applySessionState(active, active ? verifiedAddr || address || null : null);
    },
    [address, applySessionState]
  );

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  /**
   * Ends the authenticated session, locks local wallet, clears server cookie, and disconnects.
   */
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // ignore network error
    }
    applySessionState(false, null);
    setAuthError(null);
    if (isLocalWallet) {
      lockLocalWallet();
    }
    disconnect();
  }, [isLocalWallet, disconnect, applySessionState]);

  return {
    isWalletConnected,
    isCorrectNetwork,
    isLocalWallet,
    isLocalWalletUnlocked,
    isAuthenticated,
    isReconnecting,
    isCheckingSession,
    status,
    address,
    availableAccounts,
    chain,
    targetChain,
    serverSessionActive,
    isSigningIn,
    authError,
    clearAuthError,
    authenticateWithServer,
    switchAccount,
    requestAccountSelection,
    syncServerSession,
    logout,
  };
}
