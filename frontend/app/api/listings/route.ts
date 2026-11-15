import {
  extractAllowedQuery,
  forwardAuthenticatedMarketplaceRequest,
  forwardPublicMarketplaceGet,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BROWSE_QUERY_PARAMS = [
  'q',
  'category',
  'condition',
  'status',
  'seller',
  'min_price_wei',
  'max_price_wei',
  'in_stock_only',
  'sort',
  'page',
  'limit',
] as const;

const CREATE_LISTING_FIELDS = [
  'sku',
  'category',
  'title',
  'description',
  'price_wei',
  'condition',
  'quantity_total',
  'images',
] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = extractAllowedQuery(url, BROWSE_QUERY_PARAMS);
  return forwardPublicMarketplaceGet(request, '/listings', query);
}

export async function POST(request: Request) {
  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'POST',
    upstreamPath: '/listings',
    allowedBodyFields: CREATE_LISTING_FIELDS,
    forwardIdempotencyKey: true,
  });
}
