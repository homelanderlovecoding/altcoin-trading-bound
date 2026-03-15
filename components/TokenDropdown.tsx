'use client';

import { useState, useEffect, useRef } from 'react';
import { LifiToken, fetchLifiTokens } from '@/lib/lifi';

interface TokenDropdownProps {
  selectedToken: LifiToken | null;
  onSelect: (token: LifiToken) => void;
}

const DEFAULT_TOKEN_SYMBOL = 'AAVE';

export default function TokenDropdown({ selectedToken, onSelect }: TokenDropdownProps) {
  const [tokens, setTokens] = useState<LifiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLifiTokens()
      .then((list) => {
        // Filter out native ETH from destination
        const filtered = list.filter(
          (t) => t.address !== '0x0000000000000000000000000000000000000000'
        );
        setTokens(filtered);

        // Auto-select AAVE as default
        if (!selectedToken) {
          const aave = filtered.find((t) => t.symbol === DEFAULT_TOKEN_SYMBOL);
          if (aave) onSelect(aave);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white font-medium hover:bg-zinc-700 transition-colors min-w-[140px] justify-between"
      >
        {loading ? (
          <span className="text-zinc-400 text-sm">Loading…</span>
        ) : selectedToken ? (
          <span className="flex items-center gap-2">
            {selectedToken.logoURI && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedToken.logoURI} alt="" className="w-5 h-5 rounded-full" />
            )}
            <span>{selectedToken.symbol}</span>
          </span>
        ) : (
          <span className="text-zinc-400">Select token</span>
        )}
        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl">
          <div className="p-2 border-b border-zinc-800">
            <input
              type="text"
              placeholder="Search tokens…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-zinc-500"
              autoFocus
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.slice(0, 100).map((token) => (
              <li key={token.address}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(token);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-zinc-800 transition-colors text-left ${
                    selectedToken?.address === token.address ? 'bg-zinc-800 text-white' : 'text-zinc-300'
                  }`}
                >
                  {token.logoURI ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={token.logoURI} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex-shrink-0" />
                  )}
                  <div>
                    <div className="font-medium">{token.symbol}</div>
                    <div className="text-xs text-zinc-500 truncate">{token.name}</div>
                  </div>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-zinc-500 text-sm">No tokens found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
