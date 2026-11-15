import {
  extractAllowedQuery,
  forwardAuthenticatedMarketplaceRequest,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIST_REQUESTS_QUERY_PARAMS = ['role', 'status', 'page', 'limit'] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = extractAllowedQuery(url, LIST_REQUESTS_QUERY_PARAMS);
  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'GET',
    upstreamPath: '/requests',
    query,
  });
}
