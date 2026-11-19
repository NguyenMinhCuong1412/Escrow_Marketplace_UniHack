'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { escrowAddress, escrowAbi, chainId as configuredChainId } from '@/lib/contracts';
import {
  createNonOverlappingPollController,
  isAbortError,
  type NonOverlappingPollController,
} from '@/lib/marketplace';
import {
  createPublicClientTradeAdapter,
  discoverWalletTrades,
  type MinimalPublicClient,
} from '@/lib/trade-discovery';
import { useAuthSession } from '@/hooks/useAuthSession';
import { TradeData } from '@/types/trade';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_BACKOFF_MS = 30000;

interface ScopedTradesState {
  scopeKey: string;
  trades: TradeData[];
  totalCreated: number;
  hasLoadedOnce: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useMyTrades(targetAddress?: string | null) {
  const { address: connectedAddress } = useAccount();
  const activeChainId = useChainId() || configuredChainId;
  const publicClient = usePublicClient();
  const { isAuthenticated } = useAuthSession();

  const filterAddress = useMemo(
    () => (targetAddress || connectedAddress || '').trim().toLowerCase(),
    [targetAddress, connectedAddress]
  );

  const hasValidContract =
    escrowAddress.toLowerCase() !== ZERO_ADDRESS && Boolean(publicClient);
  const hasScopeTarget = Boolean(filterAddress);

  const scopeKey = useMemo(
    () =>
      `${activeChainId}:${escrowAddress.toLowerCase()}:${filterAddress}:${
        isAuthenticated ? '1' : '0'
      }`,
    [activeChainId, filterAddress, isAuthenticated]
  );

  const [state, setState] = useState<ScopedTradesState>(() => ({
    scopeKey,
    trades: [],
    totalCreated: 0,
    hasLoadedOnce: false,
    isLoading: Boolean(hasValidContract && hasScopeTarget),
    isError: false,
    error: null,
  }));

  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;
  const controllerRef = useRef<NonOverlappingPollController | null>(null);
  const activeRunRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!hasValidContract || !hasScopeTarget || !publicClient) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      activeRunRef.current = null;
      setState({
        scopeKey,
        trades: [],
        totalCreated: 0,
        hasLoadedOnce: true,
        isLoading: false,
        isError: false,
        error: null,
      });
      return;
    }

    const capturedScope = scopeKey;
    const capturedFilter = filterAddress;
    const capturedAuth = isAuthenticated;
    const adapter = createPublicClientTradeAdapter({
      chainId: activeChainId,
      escrowAddress,
      escrowAbi,
      publicClient: publicClient as unknown as MinimalPublicClient,
    });

    setState((prev) => ({
      scopeKey: capturedScope,
      trades: prev.scopeKey === capturedScope ? prev.trades : [],
      totalCreated: prev.scopeKey === capturedScope ? prev.totalCreated : 0,
      hasLoadedOnce: prev.scopeKey === capturedScope ? prev.hasLoadedOnce : false,
      isLoading: prev.scopeKey === capturedScope ? !prev.hasLoadedOnce : true,
      isError: false,
      error: null,
    }));

    const controller = createNonOverlappingPollController({
      baseIntervalMs: POLL_INTERVAL_MS,
      maxBackoffMs: POLL_MAX_BACKOFF_MS,
      isVisible: () =>
        typeof document === 'undefined' ||
        document.visibilityState === 'visible',
      canPoll: () => scopeKeyRef.current === capturedScope && hasScopeTarget,
      runTask: async ({ signal, isCurrent }) => {
        try {
          const result = await discoverWalletTrades(adapter, {
            filterAddress: capturedFilter,
            isAuthenticated: capturedAuth,
            signal,
          });
          if (!isCurrent() || scopeKeyRef.current !== capturedScope) {
            return;
          }
          setState({
            scopeKey: capturedScope,
            trades: result.trades,
            totalCreated: result.totalCreated,
            hasLoadedOnce: true,
            isLoading: false,
            isError: false,
            error: null,
          });
        } catch (err) {
          if (
            isAbortError(err, signal) ||
            !isCurrent() ||
            scopeKeyRef.current !== capturedScope
          ) {
            return;
          }
          const normalizedErr =
            err instanceof Error ? err : new Error(String(err || 'RPC read error'));
          setState((prev) => {
            const sameScope = prev.scopeKey === capturedScope;
            return {
              scopeKey: capturedScope,
              trades: sameScope ? prev.trades : [],
              totalCreated: sameScope ? prev.totalCreated : 0,
              hasLoadedOnce: sameScope ? prev.hasLoadedOnce : false,
              isLoading: false,
              isError: true,
              error: normalizedErr,
            };
          });
          throw normalizedErr;
        }
      },
    });

    controllerRef.current = controller;
    const initialRun = controller.trigger({ silent: false }).finally(() => {
      if (activeRunRef.current === initialRun) {
        activeRunRef.current = null;
      }
    });
    activeRunRef.current = initialRun;

    const handleVisibility = () => {
      controller.onVisibilityOrStateChange();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      activeRunRef.current = null;
    };
  }, [
    scopeKey,
    hasValidContract,
    hasScopeTarget,
    publicClient,
    activeChainId,
    filterAddress,
    isAuthenticated,
  ]);

  const refetch = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return Promise.resolve();
    if (ctrl.getState().inFlight && activeRunRef.current) {
      return activeRunRef.current;
    }
    const run = ctrl.trigger({ silent: false }).finally(() => {
      if (activeRunRef.current === run) {
        activeRunRef.current = null;
      }
    });
    activeRunRef.current = run;
    return run;
  }, []);

  // Strict synchronous scope isolation so switching wallet/chain never renders previous scope's trades
  const isScopeSynced = state.scopeKey === scopeKey;

  return {
    trades: isScopeSynced ? state.trades : [],
    totalCreated: isScopeSynced ? state.totalCreated : 0,
    isLoading:
      !hasScopeTarget || !hasValidContract
        ? false
        : isScopeSynced
        ? state.isLoading
        : true,
    isError: isScopeSynced ? state.isError : false,
    error: isScopeSynced ? state.error : null,
    refetch,
  };
}
