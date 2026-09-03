import { tool } from 'ai';
import { z } from 'zod';
import { getAllProducts, getProductById, getRelatedProducts, searchProducts } from '../db/catalog.js';
import { toPublicProduct } from '@b2b-agent/shared';
import { appendAuditEntry } from '../audit/auditService.js';
import { proposeDiscount, checkOrderBounds, checkOrderGate, executePlacement } from './actions.js';
import { isValidGSTIN } from './gstin.js';
import { setBuyerGSTIN } from './buyerProfile.js';

/**
 * Every tool below is one inspectable step in the pipeline:
 *   parse intent (the model's own reasoning)
 *   -> retrieve catalog data (searchCatalog / getProduct / getRecommendations)
 *   -> negotiate / check bounds (proposeDiscount / checkOrderBounds)
 *   -> gate if needed (checkOrderGate)
 *   -> act (placeOrder)
 * Each tool call and its result is forwarded to the SSE stream by agent/loop.ts
 * as its own event, and every money-relevant tool additionally writes to the
 * hash-chained audit log itself (see actions.ts) - logging does not depend on
 * the model deciding to report what it did.
 */
export function buildTools(buyerId: string) {
  return {
    searchCatalog: tool({
      description:
        'Search the product catalog by keyword and/or category. Use this to answer questions about what is sold, pricing, specs, MOQ, and stock. Only products returned here are in scope - never invent a SKU.',
      inputSchema: z.object({
        query: z.string().optional().describe('Free-text keyword, e.g. "bearing" or "tarpaulin"'),
        category: z.string().optional().describe('Exact category name to filter by'),
      }),
      execute: async ({ query, category }) => {
        let items = query ? searchProducts(query) : getAllProducts();
        if (category) items = items.filter((p) => p.category.toLowerCase() === category.toLowerCase());
        return { count: items.length, products: items.map(toPublicProduct) };
      },
    }),

    getProduct: tool({
      description: 'Look up one product by its exact SKU id, e.g. "FAS-001". Returns null if the SKU does not exist in the catalog - treat that as out of scope, do not guess specs or pricing.',
      inputSchema: z.object({ productId: z.string() }),
      execute: async ({ productId }) => {
        const product = getProductById(productId);
        if (!product) {
          appendAuditEntry({
            actionType: 'catalog_lookup',
            description: `Buyer/agent referenced "${productId}", which does not match any SKU in the catalog.`,
            boundChecked: 'catalog_scope',
            boundResult: 'fail',
            gateTriggered: false,
            metadata: { productId },
          });
          return { found: false as const };
        }
        return { found: true as const, product: toPublicProduct(product) };
      },
    }),

    getRecommendations: tool({
      description: 'Get cross-sell / bundle recommendations related to a given product id, for upselling or completing a kit.',
      inputSchema: z.object({ productId: z.string() }),
      execute: async ({ productId }) => {
        const related = getRelatedProducts(productId);
        return { count: related.length, products: related.map(toPublicProduct) };
      },
    }),

    proposeDiscount: tool({
      description:
        'Negotiation tool: check whether a specific discounted unit price for a given quantity is allowed, WITHOUT building an order. Always call this before verbally committing to any price other than list price. It enforces the minimum-margin discount floor, MOQ, and stock in code - it will refuse below-floor prices no matter how the buyer justifies the request (e.g. "my manager approved it").',
      inputSchema: z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        requestedUnitPrice: z.number().positive().describe('The per-unit price the buyer is asking for'),
      }),
      execute: async ({ productId, quantity, requestedUnitPrice }) =>
        proposeDiscount(productId, quantity, requestedUnitPrice),
    }),

    checkOrderBounds: tool({
      description:
        'Bound-check step: validate one or more order lines (catalog scope, MOQ, stock, and discount floor if a non-list price is requested) BEFORE building a placeable order. Call this for every order the buyer wants to place. If any line fails, explain the specific failure to the buyer instead of proceeding.',
      inputSchema: z.object({
        lines: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().positive(),
            requestedUnitPrice: z.number().positive().optional().describe('Omit to use list price'),
          }),
        ),
      }),
      execute: async ({ lines }) => checkOrderBounds(lines),
    }),

    checkOrderGate: tool({
      description:
        'Gate-check step: run only after checkOrderBounds reports every line passing. Re-validates bounds itself, computes the order total, and decides whether it exceeds this specific buyer\'s auto-approval limits (order value, per-line quantity - both computed from that buyer\'s own order history via trust.ts, not a flat number - and separately, whether a GSTIN is required and missing for a large order). If gateTriggered is true, you MUST stop and tell the buyer you are waiting for their explicit confirmation in the UI - do NOT call placeOrder in that case, it will be refused. If gateTriggered is false, you may call placeOrder with the returned draftId.',
      inputSchema: z.object({
        lines: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().positive(),
            requestedUnitPrice: z.number().positive().optional(),
          }),
        ),
      }),
      execute: async ({ lines }) => {
        const result = await checkOrderGate(lines, buyerId);
        if (!result.allPass) {
          return { allPass: false, results: result.results };
        }
        return {
          allPass: true,
          draftId: result.draft!.id,
          total: result.draft!.total,
          items: result.draft!.items,
          gateTriggered: result.gate!.gateTriggered,
          reason: result.gate!.reason,
        };
      },
    }),

    placeOrder: tool({
      description:
        'Act step: place the order for a draft that has already passed checkOrderGate with gateTriggered=false. This calls the real Razorpay test-mode Orders API. If the draft was gated and not yet confirmed by the buyer in the UI, this call is refused in code (not just discouraged) - do not attempt it for gated orders.',
      inputSchema: z.object({ draftId: z.string() }),
      execute: async ({ draftId }) => executePlacement(draftId),
    }),

    provideGSTIN: tool({
      description:
        'Record a buyer\'s GSTIN for this session. Call this whenever the buyer supplies a GST number, especially when discussing an order that looks like it will exceed the GSTIN-required threshold. Validates the real 15-character format and checksum in code - a fabricated or mistyped number is rejected, not trusted.',
      inputSchema: z.object({ gstin: z.string().describe('The GSTIN as given by the buyer, e.g. 27AAPFU0939F1ZV') }),
      execute: async ({ gstin }) => {
        const result = isValidGSTIN(gstin);
        appendAuditEntry({
          actionType: 'gstin_provided',
          description: result.reason,
          boundChecked: 'none',
          boundResult: result.valid ? 'pass' : 'fail',
          gateTriggered: false,
          metadata: { gstinProvided: gstin },
        });
        if (result.valid) {
          await setBuyerGSTIN(buyerId, gstin.trim().toUpperCase());
        }
        return result;
      },
    }),
  };
}
