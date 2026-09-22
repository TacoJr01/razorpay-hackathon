'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMerchantAuth } from '../../../lib/merchantAuth';
import { fetchProducts, updateMerchantProduct } from '../../../lib/api';
import type { PublicProduct } from '@b2b-agent/shared';

export default function MerchantCatalogPage() {
  const auth = useMerchantAuth();
  const [products, setProducts] = useState<PublicProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { unitPrice: string; stockQty: string; moq: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await fetchProducts();
    setProducts(list);
    const nextDrafts: Record<string, { unitPrice: string; stockQty: string; moq: string }> = {};
    for (const p of list) {
      nextDrafts[p.id] = { unitPrice: String(p.unitPrice), stockQty: String(p.stockQty), moq: String(p.moq) };
    }
    setDrafts(nextDrafts);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(productId: string) {
    const draft = drafts[productId];
    setSavingId(productId);
    const result = await updateMerchantProduct(auth, productId, {
      unitPrice: Number(draft.unitPrice),
      stockQty: Number(draft.stockQty),
      moq: Number(draft.moq),
    });
    if (result.ok) {
      await load();
    } else {
      setError(`Save failed (${result.status}).`);
    }
    setSavingId(null);
  }

  return (
    <div className="merchant-body">
      <h2 className="merchant-section-title">Catalog</h2>
      {error && <div className="merchant-error">{error}</div>}

      <div className="merchant-table-card">
        <table className="merchant-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price (₹)</th>
              <th>Stock</th>
              <th>MOQ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products?.map((p) => (
              <tr key={p.id}>
                <td className="merchant-buyer-id">{p.name}</td>
                <td>{p.category}</td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={drafts[p.id]?.unitPrice ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], unitPrice: e.target.value } }))}
                    className="merchant-input"
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={drafts[p.id]?.stockQty ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], stockQty: e.target.value } }))}
                    className="merchant-input"
                    style={{ width: 100 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={drafts[p.id]?.moq ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], moq: e.target.value } }))}
                    className="merchant-input"
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <button
                    className="btn primary merchant-save-btn"
                    disabled={savingId === p.id}
                    onClick={() => handleSave(p.id)}
                  >
                    {savingId === p.id ? 'Saving…' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
