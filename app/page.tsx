'use client';

import { useState, useRef } from 'react';
import WalletConnect from '@/components/WalletConnect';
import TokenDropdown from '@/components/TokenDropdown';
import StatusCard from '@/components/StatusCard';
import { useSwapState } from '@/hooks/useSwapState';
import { LifiToken, getLifiQuote } from '@/lib/lifi';
import { getSodaxQuote, executeSodaxSwap, waitForSodaxSettlement } from '@/lib/sodax';
import { startRetryLoop } from '@/lib/retryLeg2';

export default function Home() {
  const [btcAddress, setBtcAddress] = useState<string | null>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<LifiToken | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const cancelRetryRef = useRef<(() => void) | null>(null);

  const {
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
    reset,
  } = useSwapState();

  const walletsConnected = btcAddress && evmAddress;

  // Fetch quotes when amount or token changes
  const handleAmountChange = async (value: string) => {
    setAmount(value);
    if (!value || !selectedToken || parseFloat(value) <= 0) return;

    setQuoteLoading(true);
    try {
      const [sodaxQ, lifiQ] = await Promise.all([
        getSodaxQuote(value),
        getLifiQuote(selectedToken.address, '0', evmAddress ?? '0x0000000000000000000000000000000000000000'),
      ]);
      // Get proper lifi quote using SODAX ETH out amount
      const lifiQFull = await getLifiQuote(
        selectedToken.address,
        sodaxQ.ethOut,
        evmAddress ?? '0x0000000000000000000000000000000000000000'
      );
      setQuotes(sodaxQ, lifiQFull);
    } catch (e) {
      console.error('Quote error:', e);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleTokenSelect = async (token: LifiToken) => {
    setSelectedToken(token);
    if (!state.btcAmount || parseFloat(state.btcAmount) <= 0) return;

    setQuoteLoading(true);
    try {
      const sodaxQ = await getSodaxQuote(state.btcAmount);
      const lifiQ = await getLifiQuote(
        token.address,
        sodaxQ.ethOut,
        evmAddress ?? '0x0000000000000000000000000000000000000000'
      );
      setQuotes(sodaxQ, lifiQ);
    } catch (e) {
      console.error('Quote error:', e);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleSwap = async () => {
    if (!walletsConnected || !state.sodaxQuote || !state.lifiQuote || !selectedToken) return;

    try {
      // Leg 1: BTC → ETH
      startLeg1();
      const { txHash } = await executeSodaxSwap(state.btcAmount, evmAddress!);
      await waitForSodaxSettlement(txHash);
      completeLeg1(txHash);

      // Leg 2: ETH → Token
      startLeg2();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signer = (window as any).ethereum;

      const cancelFn = startRetryLoop({
        toTokenAddress: selectedToken.address,
        ethAmountWei: state.sodaxQuote.ethOut,
        fromAddress: evmAddress!,
        originalQuote: state.lifiQuote,
        signer,
        onRetryStart: (attempt, nextRetryAt) => {
          retryLeg2(attempt, nextRetryAt);
        },
        onSuccess: () => {
          completeLeg2();
          cancelRetryRef.current = null;
        },
        onCancelled: (intermediateEth) => {
          cancel(intermediateEth);
          cancelRetryRef.current = null;
        },
      });

      cancelRetryRef.current = cancelFn;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed');
    }
  };

  const handleCancel = () => {
    if (cancelRetryRef.current) {
      cancelRetryRef.current();
    }
  };

  const canSwap =
    walletsConnected &&
    state.btcAmount &&
    parseFloat(state.btcAmount) > 0 &&
    selectedToken &&
    state.sodaxQuote &&
    state.lifiQuote &&
    state.status === 'IDLE';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500" />
          <span className="font-bold text-lg tracking-tight">Bound</span>
          <span className="text-xs text-zinc-500 ml-1">altcoin MVP</span>
        </div>
        <WalletConnect onEvmAddress={setEvmAddress} onBtcAddress={setBtcAddress} />
      </header>

      {/* Main */}
      <main className="flex justify-center px-4 pt-16 pb-24">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold mb-1">Swap</h1>
          <p className="text-zinc-400 text-sm mb-8">BTC → any token, two-leg execution</p>

          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-4">
            {/* You pay */}
            <div>
              <label className="text-xs text-zinc-500 mb-2 block uppercase tracking-wide">You pay</label>
              <div className="flex items-center gap-3 bg-zinc-800 rounded-xl px-4 py-3">
                <input
                  type="number"
                  placeholder="0.00"
                  value={state.btcAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-zinc-600 min-w-0"
                  disabled={state.status !== 'IDLE'}
                />
                <div className="flex items-center gap-2 bg-zinc-700 rounded-lg px-3 py-1.5 text-sm font-medium">
                  <span className="text-orange-400">₿</span>
                  <span>BTC</span>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 text-sm">
                ↓
              </div>
            </div>

            {/* You receive */}
            <div>
              <label className="text-xs text-zinc-500 mb-2 block uppercase tracking-wide">You receive</label>
              <div className="flex items-center gap-3 bg-zinc-800 rounded-xl px-4 py-3">
                <div className="flex-1">
                  {quoteLoading ? (
                    <span className="text-zinc-500 text-sm">Fetching quote…</span>
                  ) : state.lifiQuote ? (
                    <div>
                      <div className="text-xl font-semibold">
                        ~{state.lifiQuote.expectedOutputFormatted}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        via {state.sodaxQuote?.ethOutFormatted} ETH intermediate
                      </div>
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-xl font-semibold">0.00</span>
                  )}
                </div>
                <TokenDropdown selectedToken={selectedToken} onSelect={handleTokenSelect} />
              </div>
            </div>

            {/* Route info */}
            {state.sodaxQuote && state.lifiQuote && (
              <div className="text-xs text-zinc-500 space-y-1 px-1">
                <div className="flex justify-between">
                  <span>Leg 1 (SODAX)</span>
                  <span>{state.btcAmount} BTC → {state.sodaxQuote.ethOutFormatted} ETH</span>
                </div>
                <div className="flex justify-between">
                  <span>Leg 2 (LiFi)</span>
                  <span>{state.sodaxQuote.ethOutFormatted} ETH → ~{state.lifiQuote.expectedOutputFormatted} {selectedToken?.symbol}</span>
                </div>
              </div>
            )}

            {/* Error */}
            {state.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                {state.error}
              </div>
            )}

            {/* Swap button */}
            {state.status === 'IDLE' ? (
              <button
                onClick={handleSwap}
                disabled={!canSwap}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {!walletsConnected
                  ? 'Connect wallets to swap'
                  : !state.btcAmount || parseFloat(state.btcAmount) <= 0
                  ? 'Enter an amount'
                  : !selectedToken
                  ? 'Select a token'
                  : quoteLoading
                  ? 'Fetching quote…'
                  : 'Swap'}
              </button>
            ) : ['COMPLETE', 'CANCELLED'].includes(state.status) ? (
              <button
                onClick={reset}
                className="w-full py-3.5 rounded-xl bg-zinc-800 text-white font-medium hover:bg-zinc-700 transition-colors"
              >
                New swap
              </button>
            ) : null}
          </div>

          {/* Status card */}
          <StatusCard state={state} onCancel={handleCancel} evmAddress={evmAddress} />
        </div>
      </main>
    </div>
  );
}
