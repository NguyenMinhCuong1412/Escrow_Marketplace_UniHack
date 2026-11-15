import {
  bffError,
  forwardAuthenticatedMarketplaceRequest,
  isValidResourceId,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BIND_TRADE_FIELDS = ['tx_hash', 'trade_id'] as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidResourceId(id)) {
    return bffError(400, 'INVALID_ID', 'Invalid purchase request identifier.');
  }
  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'POST',
    upstreamPath: `/requests/${encodeURIComponent(id)}/bind-trade`,
    allowedBodyFields: BIND_TRADE_FIELDS,
    forwardIdempotencyKey: true,
  });
}
