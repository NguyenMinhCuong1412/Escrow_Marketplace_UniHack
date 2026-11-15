import {
  bffError,
  forwardAuthenticatedMarketplaceRequest,
  forwardPublicMarketplaceGet,
  isValidResourceId,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPDATE_LISTING_FIELDS = [
  'sku',
  'category',
  'title',
  'description',
  'price_wei',
  'condition',
  'quantity_total',
  'images',
  'status',
] as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidResourceId(id)) {
    return bffError(400, 'INVALID_ID', 'Invalid listing identifier.');
  }
  return forwardPublicMarketplaceGet(request, `/listings/${encodeURIComponent(id)}`);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidResourceId(id)) {
    return bffError(400, 'INVALID_ID', 'Invalid listing identifier.');
  }
  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'PATCH',
    upstreamPath: `/listings/${encodeURIComponent(id)}`,
    allowedBodyFields: UPDATE_LISTING_FIELDS,
  });
}
