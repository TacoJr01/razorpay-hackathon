import Razorpay from 'razorpay';

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!client) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error(
        'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. Create test-mode keys at https://dashboard.razorpay.com/app/keys and put them in backend/.env',
      );
    }
    client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return client;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Creates a real Razorpay order in TEST MODE. Amount is in the smallest
 * currency unit (paise for INR), matching Razorpay's Orders API contract.
 */
export async function createRazorpayOrder(totalInr: number, receipt: string): Promise<RazorpayOrderResult> {
  const rp = getClient();
  const order = await rp.orders.create({
    amount: Math.round(totalInr * 100),
    currency: 'INR',
    receipt,
    notes: { source: 'b2b-commerce-agent-demo' },
  });
  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    status: order.status,
  };
}
