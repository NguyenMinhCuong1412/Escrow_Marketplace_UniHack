import {
  bffError,
  forwardAuthenticatedMarketplaceRequest,
  isValidResourceId,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CREATE_REQUEST_FIELDS = ['quantity', 'buyer_note'] as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidResourceId(id)) {
    return bffError(400, 'INVALID_ID', 'Invalid listing identifier.');
  }
  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'POST',
    upstreamPath: `/listings/${encodeURIComponent(id)}/requests`,
    allowedBodyFields: CREATE_REQUEST_FIELDS,
    forwardIdempotencyKey: true,
  });
}
