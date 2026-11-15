import {
  extractAllowedQuery,
  forwardAuthenticatedMarketplaceRequest,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MY_LISTINGS_QUERY_PARAMS = [
  'q',
  'category',
  'condition',
  'status',
  'min_price_wei',
  'max_price_wei',
  'in_stock_only',
  'sort',
  'page',
  'limit',
] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseQuery = extractAllowedQuery(url, MY_LISTINGS_QUERY_PARAMS);

  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'GET',
    upstreamPath: '/listings',
    queryBuilder: (session) => {
      const query = new URLSearchParams(baseQuery);
      query.set('seller', session.address.toLowerCase());
      if (!query.get('status')) {
        query.set('status', 'ALL');
      }
      return query;
    },
  });
}
