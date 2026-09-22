'use client';

import { useEffect, useState } from 'react';
import { useMerchantAuth } from '../../../lib/merchantAuth';
import { fetchMerchantOrders } from '../../../lib/api';
import type { Order } from '@b2b-agent/shared';

export default function MerchantOrders() {
  const auth = useMerchantAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMerchantOrders(auth).then((result) => {
      if (!result.ok) {
        setError(`Request failed (${result.status}).`);
        return;
      }
      setOrders(result.data);
    });
  }, [auth]);

  return (
    <div className="merchant-body">
      <h2 className="merchant-section-title">Orders</h2>
      {error && <div className="merchant-error">{error}</div>}

      {orders?.length === 0 ? (
        <p className="merchant-empty">No orders placed yet across any buyer.</p>
      ) : (
        <div className="merchant-table-card">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Buyer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Razorpay order</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders?.map((o) => (
                <tr key={o.id}>
                  <td className="merchant-buyer-id">{o.id}</td>
                  <td className="merchant-buyer-id">{o.buyerId}</td>
                  <td>
                    {o.items.map((it) => `${it.productName} ×${it.quantity}`).join(', ')}
                  </td>
                  <td>₹{o.total.toLocaleString('en-IN')}</td>
                  <td className="merchant-buyer-id">{o.razorpayOrderId ?? '—'}</td>
                  <td>{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
