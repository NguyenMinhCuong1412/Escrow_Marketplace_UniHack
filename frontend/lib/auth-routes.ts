/**
 * Quy tắc phân quyền route phía client cho Marketplace (MKT-004):
 * - Guest chưa đăng nhập được duyệt `/` và `/listings/[id]`, cùng trang `/auth*`.
 * - Các trang riêng tư (`/sell`, `/trades`, `/trade/*`, `/admin`, `/profile/*`) yêu cầu xác thực ví.
 */

export function isPublicMarketplaceRoute(pathname?: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/' || pathname === '/auth' || pathname.startsWith('/auth/')) {
    return true;
  }
  if (pathname.startsWith('/listings/')) {
    return true;
  }
  return false;
}

export function sanitizeReturnUrl(rawReturnUrl?: string | null): string {
  if (!rawReturnUrl) return '/';
  const trimmed = rawReturnUrl.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/auth')
  ) {
    return '/';
  }
  return trimmed;
}

export function buildAuthRedirectUrl(pathname: string, search?: string): string {
  const cleanSearch = search ? search.replace(/^\?/, '') : '';
  const fullPath = cleanSearch ? `${pathname}?${cleanSearch}` : pathname;
  const safeTarget = sanitizeReturnUrl(fullPath);
  if (safeTarget === '/') return '/auth';
  return `/auth?returnUrl=${encodeURIComponent(safeTarget)}`;
}
