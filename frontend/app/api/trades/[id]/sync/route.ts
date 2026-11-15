import {
  bffError,
  forwardAuthenticatedMarketplaceRequest,
  isValidPositiveIntId,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidPositiveIntId(id)) {
    return bffError(400, 'INVALID_TRADE_ID', 'Invalid trade identifier.');
  }
  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'POST',
    upstreamPath: `/trades/${encodeURIComponent(id)}/sync`,
    allowedBodyFields: [],
    allowEmptyBody: true,
    forwardIdempotencyKey: true,
  });
}
