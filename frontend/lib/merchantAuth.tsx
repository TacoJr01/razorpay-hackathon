'use client';

import { createContext, useContext } from 'react';
import type { MerchantAuth } from './api';

/**
 * Shared merchant auth state, owned by app/merchant/layout.tsx. Every page
 * under /merchant reads `auth` from here instead of re-implementing the
 * username/password/Google-token sign-in flow itself.
 */
export const MerchantAuthContext = createContext<MerchantAuth | null>(null);

export function useMerchantAuth(): MerchantAuth {
  const auth = useContext(MerchantAuthContext);
  if (!auth) {
    throw new Error('useMerchantAuth() called outside the merchant layout - auth is not available yet.');
  }
  return auth;
}
