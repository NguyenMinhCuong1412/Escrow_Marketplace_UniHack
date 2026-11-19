import { isAddress } from 'viem';
import {
  bffError,
  extractAllowedQuery,
  forwardAuthenticatedMarketplaceRequest,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRADE_INDEX_QUERY_PARAMS = ['wallet', 'filter', 'offset', 'limit'] as const;
const VALID_FILTERS = new Set(['all', 'disputed', 'flagged', 'active']);

function isRuntimeTradeIndexEnabled(): boolean {
  const raw = (process.env.TRADE_INDEX_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'no' && raw !== 'off';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = extractAllowedQuery(url, TRADE_INDEX_QUERY_PARAMS);

  const wallet = query.get('wallet');
  if (wallet !== null && !isAddress(wallet)) {
    return bffError(400, 'INVALID_WALLET', 'Địa chỉ ví truy vấn trade index không hợp lệ.');
  }

  const filter = query.get('filter');
  if (filter !== null && !VALID_FILTERS.has(filter.trim().toLowerCase())) {
    return bffError(400, 'INVALID_FILTER', 'Tham số filter trade index không hợp lệ.');
  }

  const offset = query.get('offset');
  if (offset !== null && (!/^\d+$/.test(offset) || Number(offset) < 0)) {
    return bffError(400, 'INVALID_OFFSET', 'Tham số offset phải là số nguyên không âm.');
  }

  const limit = query.get('limit');
  if (
    limit !== null &&
    (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)
  ) {
    return bffError(400, 'INVALID_LIMIT', 'Tham số limit phải nằm trong khoảng 1..100.');
  }

  if (!isRuntimeTradeIndexEnabled()) {
    return bffError(
      503,
      'TRADE_INDEX_DISABLED',
      'Trade index đang tạm tắt ở cấu hình runtime; sử dụng direct RPC fallback.',
      { fallback: 'direct_rpc' }
    );
  }

  return forwardAuthenticatedMarketplaceRequest(request, {
    method: 'GET',
    upstreamPath: '/trades/index',
    query,
  });
}
