'use client';

import { useEffect, useState } from 'react';
import { SwapState } from '@/hooks/useSwapState';

interface StatusCardProps {
  state: SwapState;
  onCancel: () => void;
  evmAddress: string | null;
}

function Countdown({ targetMs }: { targetMs: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, targetMs - Date.now()));

  useEffect(() => {
    const tick = setInterval(() => {
      const left = Math.max(0, targetMs - Date.now());
      setRemaining(left);
      if (left === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [targetMs]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return (
    <span className="font-mono tabular-nums">
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

const statusLabel: Record<string, string> = {
  IDLE: '',
  LEG1_PENDING: 'Leg 1: Sending BTC → ETH via SODAX…',
  LEG1_COMPLETE: 'Leg 1 complete ✓',
  LEG2_PENDING: 'Leg 2: Swapping ETH → token via LiFi…',
  LEG2_RETRY: 'Leg 2 failed, retrying…',
  COMPLETE: 'Swap complete! 🎉',
  CANCELLED: 'Swap cancelled.',
};

export default function StatusCard({ state, onCancel, evmAddress }: StatusCardProps) {
  const { status } = state;

  if (status === 'IDLE') return null;

  const isActive = !['COMPLETE', 'CANCELLED'].includes(status);
  const canCancel = ['LEG2_PENDING', 'LEG2_RETRY'].includes(status);

  return (
    <div className="mt-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
      {/* Leg 1 */}
      <div className="flex items-center gap-3">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
            status === 'LEG1_PENDING'
              ? 'bg-yellow-500/20 text-yellow-400 animate-pulse'
              : ['LEG1_COMPLETE', 'LEG2_PENDING', 'LEG2_RETRY', 'COMPLETE', 'CANCELLED'].includes(status)
              ? 'bg-green-500/20 text-green-400'
              : 'bg-zinc-800 text-zinc-500'
          }`}
        >
          {status === 'LEG1_PENDING' ? '⏳' : '✓'}
        </div>
        <div>
          <div className="text-sm font-medium text-white">Leg 1 — BTC → ETH</div>
          <div className="text-xs text-zinc-400">via SODAX</div>
        </div>
        {state.leg1TxHash && (
          <div className="ml-auto text-xs text-zinc-500 font-mono truncate max-w-[120px]">
            {state.leg1TxHash.slice(0, 10)}…
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Leg 2 */}
      <div className="flex items-center gap-3">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
            status === 'LEG2_PENDING'
              ? 'bg-yellow-500/20 text-yellow-400 animate-pulse'
              : status === 'LEG2_RETRY'
              ? 'bg-orange-500/20 text-orange-400'
              : status === 'COMPLETE'
              ? 'bg-green-500/20 text-green-400'
              : status === 'CANCELLED'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-zinc-800 text-zinc-500'
          }`}
        >
          {status === 'LEG2_PENDING' && '⏳'}
          {status === 'LEG2_RETRY' && '🔄'}
          {status === 'COMPLETE' && '✓'}
          {status === 'CANCELLED' && '✕'}
          {['IDLE', 'LEG1_PENDING', 'LEG1_COMPLETE'].includes(status) && '–'}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-white">Leg 2 — ETH → Token</div>
          <div className="text-xs text-zinc-400">via LiFi</div>
        </div>
      </div>

      {/* Retry info */}
      {status === 'LEG2_RETRY' && state.leg2NextRetryAt && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
          <div className="text-sm text-orange-300">
            Leg 2 failed — retrying in{' '}
            <Countdown targetMs={state.leg2NextRetryAt} />
          </div>
          <div className="text-xs text-orange-400/70 mt-1">
            Attempt #{state.leg2RetryAttempt + 1} · Waiting for better slippage / gas
          </div>
        </div>
      )}

      {/* Cancelled state */}
      {status === 'CANCELLED' && state.intermediateEth && (
        <div className="bg-zinc-800 rounded-xl px-4 py-3 space-y-2">
          <div className="text-sm text-white">
            You are holding{' '}
            <span className="font-semibold text-blue-300">{state.intermediateEth} ETH</span> on Ethereum.
          </div>
          {evmAddress && (
            <a
              href={`https://etherscan.io/address/${evmAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline"
            >
              View on Etherscan →
            </a>
          )}
          <div className="text-xs text-zinc-500">
            You can manually complete the swap on any DEX (e.g. Uniswap).
          </div>
        </div>
      )}

      {/* Complete state */}
      {status === 'COMPLETE' && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm text-green-300">
          Swap completed successfully 🎉
        </div>
      )}

      {/* Cancel button */}
      {canCancel && (
        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
        >
          Cancel — keep ETH
        </button>
      )}

      {/* Loading spinner for active states */}
      {isActive && !canCancel && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="w-3 h-3 border border-zinc-500 border-t-white rounded-full animate-spin" />
          {statusLabel[status]}
        </div>
      )}
    </div>
  );
}
