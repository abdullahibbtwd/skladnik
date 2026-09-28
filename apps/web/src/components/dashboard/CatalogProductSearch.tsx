import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProductRecord } from '../../lib/workspace-api';
import { useProductsQuery } from '../../lib/workspace-session';

const SEARCH_LIMIT = 8;

/** Search the whole catalog (not just what is in stock) by name, code or barcode. */
export const CatalogProductSearch: React.FC<{
  onPick: (product: ProductRecord) => void;
  placeholder: string;
  disabled?: boolean;
  excludeIds?: ReadonlySet<string>;
}> = ({ onPick, placeholder, disabled, excludeIds }) => {
  const { t } = useTranslation();
  const productsQuery = useProductsQuery();
  const [search, setSearch] = useState('');
  const products = useMemo(
    () =>
      (productsQuery.data?.products ?? []).filter(
        (product) => product.status !== 'ARCHIVED' && !excludeIds?.has(product.id),
      ),
    [productsQuery.data, excludeIds],
  );

  const query = search.trim().toLowerCase();
  const matches = query
    ? products
        .filter(
          (product) =>
            product.name.toLowerCase().includes(query) ||
            product.code.toLowerCase().includes(query) ||
            product.barcodes.some((row) => row.barcode.includes(query)),
        )
        .slice(0, SEARCH_LIMIT)
    : [];

  return (
    <div>
      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pr-3 pl-10 font-sans text-[0.9rem] text-ops-ink outline-none focus:border-ops-teal/50"
        />
      </label>
      {query && (
        <ul className="mt-2 overflow-hidden rounded-xl border border-slate-200">
          {matches.length === 0 ? (
            <li className="px-3 py-3 font-sans text-[0.8rem] text-slate-500">
              {productsQuery.isLoading ? t('stock.loading') : t('catalogSearch.noMatches')}
            </li>
          ) : (
            matches.map((product) => (
              <li key={product.id} className="border-b border-slate-100 last:border-0">
                <button
                  type="button"
                  onClick={() => {
                    onPick(product);
                    setSearch('');
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-indigo-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[0.84rem] text-ops-ink">{product.name}</span>
                    <span className="block truncate font-mono text-[0.66rem] text-slate-400">
                      {product.code}
                      {product.batchTracking ? ` · ${t('catalogSearch.batchTracked')}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.72rem] text-slate-500">{t(`labels.unit.${product.unit}`)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
