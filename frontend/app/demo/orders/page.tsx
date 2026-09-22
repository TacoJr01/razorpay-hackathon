'use client';

import { useEffect, useState } from 'react';
import { fetchBuyerOrders, getSessionId } from '../../../lib/api';
import type { Order } from '@b2b-agent/shared';

export default function DemoOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    fetchBuyerOrders(getSessionId()).then(setOrders);
  }, []);

  return (
    <div className="merchant-body">
      <h2 className="merchant-section-title">Your orders</h2>

      {orders?.length === 0 ? (
        <p className="merchant-empty">No orders yet — place one from the chat to see it here.</p>
      ) : (
        <div className="merchant-table-card">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Order</th>
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
                  <td>{o.items.map((it) => `${it.productName} ×${it.quantity}`).join(', ')}</td>
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
