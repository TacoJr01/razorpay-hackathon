'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchProducts } from '../../../lib/api';
import type { PublicProduct } from '@b2b-agent/shared';

export default function DemoCatalog() {
  const [products, setProducts] = useState<PublicProduct[] | null>(null);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchProducts().then(setProducts);
  }, []);

  const categories = useMemo(() => {
    if (!products) return [];
    return [...new Set(products.map((p) => p.category))].sort();
  }, [products]);

  const filtered = useMemo(() => {
    if (!products) return null;
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.spec.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, category, search]);

  return (
    <div className="merchant-body">
      <h2 className="merchant-section-title">Catalog</h2>

      <div className="merchant-filter-row">
        <input
          type="text"
          placeholder="Search by name or spec"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="merchant-input"
          style={{ width: 260 }}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="merchant-input">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {filtered?.length === 0 ? (
        <p className="merchant-empty">No products match this filter.</p>
      ) : (
        <div className="merchant-table-card">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Spec</th>
                <th>Price (₹)</th>
                <th>MOQ</th>
                <th>In stock</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map((p) => (
                <tr key={p.id}>
                  <td className="merchant-buyer-id">{p.name}</td>
                  <td>{p.category}</td>
                  <td>{p.spec}</td>
                  <td>₹{p.unitPrice.toLocaleString('en-IN')}</td>
                  <td>{p.moq}</td>
                  <td>{p.stockQty.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
