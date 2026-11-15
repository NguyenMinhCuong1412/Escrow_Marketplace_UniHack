import {
  bffError,
  forwardAuthenticatedMarketplaceRequest,
  isValidResourceId,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidResourceId(id)) {
    return bffError(400, 'INVALID_ID', 'Invalid purchase request identifier.');
  }
  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'GET',
    upstreamPath: `/requests/${encodeURIComponent(id)}`,
  });
}
