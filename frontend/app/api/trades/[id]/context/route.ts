import {
  bffError,
  forwardPublicMarketplaceGet,
  isValidPositiveIntId,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidPositiveIntId(id)) {
    return bffError(400, 'INVALID_TRADE_ID', 'Invalid trade identifier.');
  }
  return forwardPublicMarketplaceGet(
    request,
    `/trades/${encodeURIComponent(id)}/context`
  );
}
