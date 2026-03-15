import { getLifiQuote, executeLifiRoute, estimateGasForRoute, LifiQuoteResult } from './lifi';

export const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface RetryOptions {
  toTokenAddress: string;
  ethAmountWei: string;
  fromAddress: string;
  originalQuote: LifiQuoteResult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signer: any;
  onRetryStart: (attemptNumber: number, nextRetryAt: number) => void;
  onSuccess: () => void;
  onCancelled: (intermediateEthFormatted: string) => void;
}

/**
 * Determines if this route involves a bridge (cross-chain hop).
 */
function isBridgeRoute(quote: LifiQuoteResult): boolean {
  // 'cross' and 'lifi' step types indicate a bridge hop
  return quote.route.steps.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (step) => (step as any).type === 'cross' || (step as any).type === 'lifi'
  );
}

/**
 * Start the leg 2 retry loop.
 * Returns a cancel function — call it to stop retrying and surface the intermediate ETH.
 */
export function startRetryLoop(opts: RetryOptions): () => void {
  let cancelled = false;
  let attempt = 0;
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const { ethAmountWei, toTokenAddress, fromAddress, originalQuote, signer } = opts;

  // Format ETH for display
  const ethFormatted = (Number(BigInt(ethAmountWei)) / 1e18).toFixed(6);

  async function tryExecute() {
    if (cancelled) return;

    attempt++;
    console.log(`[Retry] Leg 2 attempt #${attempt}`);

    try {
      const isBridge = isBridgeRoute(originalQuote);

      if (isBridge) {
        // Bridge: fetch fresh quote and check output >= 99% of original
        const freshQuote = await getLifiQuote(toTokenAddress, ethAmountWei, fromAddress);
        const originalMin = BigInt(originalQuote.expectedOutput);
        const freshMin = BigInt(freshQuote.expectedOutput);
        const threshold = (originalMin * 99n) / 100n;

        if (freshMin >= threshold) {
          await executeLifiRoute(freshQuote.route, signer);
          if (!cancelled) opts.onSuccess();
          return;
        } else {
          console.log(`[Retry] Bridge output too low: ${freshMin} < ${threshold}`);
        }
      } else {
        // Same-chain: estimate gas — if OK, execute
        const gasOk = await estimateGasForRoute(originalQuote.route);
        if (gasOk) {
          await executeLifiRoute(originalQuote.route, signer);
          if (!cancelled) opts.onSuccess();
          return;
        } else {
          console.log('[Retry] Gas estimation failed, will retry');
        }
      }
    } catch (err) {
      console.error('[Retry] Attempt failed:', err);
    }

    if (!cancelled) {
      const nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
      opts.onRetryStart(attempt, nextRetryAt);
      timeoutHandle = setTimeout(tryExecute, RETRY_INTERVAL_MS);
    }
  }

  // Kick off immediately
  const nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
  opts.onRetryStart(0, nextRetryAt);
  timeoutHandle = setTimeout(tryExecute, RETRY_INTERVAL_MS);

  // Run first attempt immediately
  tryExecute();

  return function cancel() {
    cancelled = true;
    clearTimeout(timeoutHandle);
    opts.onCancelled(ethFormatted);
  };
}
