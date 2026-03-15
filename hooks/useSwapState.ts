import { useReducer, useCallback, useEffect } from 'react';
import { LifiQuoteResult } from '@/lib/lifi';
import { SodaxQuote } from '@/lib/sodax';
import { saveSwap, clearSwap, shouldPersist, PersistedSwap } from '@/lib/swapStorage';

export type SwapStatus =
  | 'IDLE'
  | 'LEG1_PENDING'
  | 'LEG1_COMPLETE'
  | 'LEG2_PENDING'
  | 'LEG2_RETRY'
  | 'COMPLETE'
  | 'CANCELLED';

export interface SwapState {
  status: SwapStatus;
  btcAmount: string;
  sodaxQuote: SodaxQuote | null;
  lifiQuote: LifiQuoteResult | null;
  leg1TxHash: string | null;
  leg2RetryAttempt: number;
  leg2NextRetryAt: number | null;
  intermediateEth: string | null;
  error: string | null;
}

type SwapAction =
  | { type: 'SET_AMOUNT'; payload: string }
  | { type: 'SET_QUOTES'; sodaxQuote: SodaxQuote; lifiQuote: LifiQuoteResult }
  | { type: 'LEG1_START' }
  | { type: 'LEG1_COMPLETE'; txHash: string }
  | { type: 'LEG2_START' }
  | { type: 'LEG2_RETRY'; attempt: number; nextRetryAt: number }
  | { type: 'LEG2_COMPLETE' }
  | { type: 'CANCEL'; intermediateEth: string }
  | { type: 'ERROR'; message: string }
  | { type: 'RESTORE'; state: SwapState }
  | { type: 'RESET' };

export const initialState: SwapState = {
  status: 'IDLE',
  btcAmount: '',
  sodaxQuote: null,
  lifiQuote: null,
  leg1TxHash: null,
  leg2RetryAttempt: 0,
  leg2NextRetryAt: null,
  intermediateEth: null,
  error: null,
};

function swapReducer(state: SwapState, action: SwapAction): SwapState {
  switch (action.type) {
    case 'SET_AMOUNT':
      return { ...state, btcAmount: action.payload, error: null };

    case 'SET_QUOTES':
      return { ...state, sodaxQuote: action.sodaxQuote, lifiQuote: action.lifiQuote, error: null };

    case 'LEG1_START':
      return { ...state, status: 'LEG1_PENDING', error: null };

    case 'LEG1_COMPLETE':
      return { ...state, status: 'LEG1_COMPLETE', leg1TxHash: action.txHash };

    case 'LEG2_START':
      return { ...state, status: 'LEG2_PENDING' };

    case 'LEG2_RETRY':
      return {
        ...state,
        status: 'LEG2_RETRY',
        leg2RetryAttempt: action.attempt,
        leg2NextRetryAt: action.nextRetryAt,
      };

    case 'LEG2_COMPLETE':
      return { ...state, status: 'COMPLETE' };

    case 'CANCEL':
      return { ...state, status: 'CANCELLED', intermediateEth: action.intermediateEth };

    case 'ERROR':
      return { ...state, error: action.message };

    case 'RESTORE':
      return action.state;

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

interface UseSwapStateOptions {
  /** Called when a persisted in-flight swap is found on mount. */
  onRestore?: (persisted: PersistedSwap) => void;
  /** Context for persistence (token + wallet addresses). */
  persistContext?: {
    selectedToken: import('@/lib/lifi').LifiToken | null;
    evmAddress: string | null;
    btcAddress: string | null;
  };
}

export function useSwapState(opts: UseSwapStateOptions = {}) {
  const [state, dispatch] = useReducer(swapReducer, initialState);

  // ── Persist on every state change ──────────────────────────────────────
  useEffect(() => {
    const ctx = opts.persistContext;
    if (!ctx) return;

    if (shouldPersist(state.status) && ctx.selectedToken && ctx.evmAddress && ctx.btcAddress) {
      saveSwap({
        state,
        selectedToken: ctx.selectedToken,
        evmAddress: ctx.evmAddress,
        btcAddress: ctx.btcAddress,
        savedAt: Date.now(),
      });
    } else if (state.status === 'COMPLETE' || state.status === 'CANCELLED') {
      clearSwap();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ── Actions ────────────────────────────────────────────────────────────

  const setAmount = useCallback((amount: string) =>
    dispatch({ type: 'SET_AMOUNT', payload: amount }), []);

  const setQuotes = useCallback((sodaxQuote: SodaxQuote, lifiQuote: LifiQuoteResult) =>
    dispatch({ type: 'SET_QUOTES', sodaxQuote, lifiQuote }), []);

  const startLeg1 = useCallback(() => dispatch({ type: 'LEG1_START' }), []);
  const completeLeg1 = useCallback((txHash: string) =>
    dispatch({ type: 'LEG1_COMPLETE', txHash }), []);
  const startLeg2 = useCallback(() => dispatch({ type: 'LEG2_START' }), []);

  const retryLeg2 = useCallback((attempt: number, nextRetryAt: number) =>
    dispatch({ type: 'LEG2_RETRY', attempt, nextRetryAt }), []);

  const completeLeg2 = useCallback(() => dispatch({ type: 'LEG2_COMPLETE' }), []);

  const cancel = useCallback((intermediateEth: string) =>
    dispatch({ type: 'CANCEL', intermediateEth }), []);

  const setError = useCallback((message: string) =>
    dispatch({ type: 'ERROR', message }), []);

  const restore = useCallback((savedState: SwapState) =>
    dispatch({ type: 'RESTORE', state: savedState }), []);

  const reset = useCallback(() => {
    clearSwap();
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    setAmount,
    setQuotes,
    startLeg1,
    completeLeg1,
    startLeg2,
    retryLeg2,
    completeLeg2,
    cancel,
    setError,
    restore,
    reset,
  };
}
