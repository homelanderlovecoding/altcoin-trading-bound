'use client';

import { useState, useEffect } from 'react';

interface WalletConnectProps {
  onEvmAddress?: (address: string) => void;
  onBtcAddress?: (address: string) => void;
}

export default function WalletConnect({ onEvmAddress, onBtcAddress }: WalletConnectProps) {
  const [btcAddress, setBtcAddress] = useState<string | null>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);

  // Check if already connected on mount
  useEffect(() => {
    const checkEvm = async () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
          if (accounts[0]) {
            setEvmAddress(accounts[0]);
            onEvmAddress?.(accounts[0]);
          }
        } catch {}
      }
    };
    checkEvm();
  }, [onEvmAddress]);

  const connectUnisat = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unisat = (window as any).unisat;
    if (!unisat) {
      alert('Unisat wallet not found. Please install the Unisat browser extension.');
      return;
    }
    try {
      const accounts: string[] = await unisat.requestAccounts();
      if (accounts[0]) {
        setBtcAddress(accounts[0]);
        onBtcAddress?.(accounts[0]);
      }
    } catch (e) {
      console.error('Unisat connect failed:', e);
    }
  };

  const connectMetaMask = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      alert('MetaMask not found. Please install MetaMask.');
      return;
    }
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts[0]) {
        setEvmAddress(accounts[0]);
        onEvmAddress?.(accounts[0]);
      }
    } catch (e) {
      console.error('MetaMask connect failed:', e);
    }
  };

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  return (
    <div className="flex items-center gap-3">
      {/* Unisat / BTC */}
      <button
        onClick={connectUnisat}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          btcAddress
            ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
            : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
        }`}
      >
        <span>₿</span>
        <span>{btcAddress ? shortAddr(btcAddress) : 'Connect BTC'}</span>
      </button>

      {/* MetaMask / EVM */}
      <button
        onClick={connectMetaMask}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          evmAddress
            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
        }`}
      >
        <span>🦊</span>
        <span>{evmAddress ? shortAddr(evmAddress) : 'Connect ETH'}</span>
      </button>
    </div>
  );
}

// Add window.ethereum type shim
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}
