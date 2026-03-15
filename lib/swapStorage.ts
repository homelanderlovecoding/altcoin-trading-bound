/**
 * Persists in-flight swap state to localStorage so the retry loop
 * can survive page refreshes.
 */

import { SwapState } from '@/hooks/useSwapState';
import { LifiToken } from '@/lib/lifi';

const STORAGE_KEY = 'bound:pending_swap';

export interface PersistedSwap {
  state: SwapState;
  selectedToken: LifiToken;
  evmAddress: string;
  btcAddress: string;
  savedAt: number;
}

/** Save current swap to localStorage. */
export function saveSwap(data: PersistedSwap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...data,
      // bigints don't serialize — convert to strings
      state: {
        ...data.state,
        sodaxQuote: data.state.sodaxQuote
          ? {
              ...data.state.sodaxQuote,
              quotedAmount: data.state.sodaxQuote.quotedAmount.toString(),
            }
          : null,
        lifiQuote: data.state.lifiQuote
          ? {
              ...data.state.lifiQuote,
              expectedOutput: data.state.lifiQuote.expectedOutput.toString(),
            }
          : null,
      },
    }));
  } catch (e) {
    console.warn('[SwapStorage] Failed to save:', e);
  }
}

/** Load persisted swap from localStorage. Returns null if nothing saved or stale (>30min). */
export function loadSwap(): PersistedSwap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedSwap & { savedAt: number };

    // Discard if older than 30 minutes
    if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
      clearSwap();
      return null;
    }

    // Rehydrate bigints
    if (parsed.state.sodaxQuote) {
      parsed.state.sodaxQuote = {
        ...parsed.state.sodaxQuote,
        quotedAmount: BigInt(parsed.state.sodaxQuote.quotedAmount as unknown as string),
      };
    }
    if (parsed.state.lifiQuote) {
      parsed.state.lifiQuote = {
        ...parsed.state.lifiQuote,
        expectedOutput: (parsed.state.lifiQuote.expectedOutput as unknown as string),
      };
    }

    return parsed;
  } catch (e) {
    console.warn('[SwapStorage] Failed to load:', e);
    return null;
  }
}

/** Clear persisted swap. Call on COMPLETE or CANCELLED. */
export function clearSwap(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** States that should be persisted. */
export function shouldPersist(status: SwapState['status']): boolean {
  return ['LEG1_PENDING', 'LEG1_COMPLETE', 'LEG2_PENDING', 'LEG2_RETRY'].includes(status);
}
