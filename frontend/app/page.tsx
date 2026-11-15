'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Store,
  ClipboardList,
  SlidersHorizontal,
  RefreshCw,
  PackageOpen,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  avaxInputToWeiString,
  browseListings,
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  type ListingCategory,
  type ListingCondition,
  type ListingDto,
  type ListingsQuery,
} from '@/lib/marketplace';
import {
  CATEGORY_TABS,
  CONDITION_LABELS,
  SORT_OPTIONS,
} from '@/lib/marketplace-ui';
import { ProductCard } from '@/components/ProductCard';

const PAGE_LIMIT = 12;

function isListingCategory(val: string | null): val is ListingCategory {
  return Boolean(val && (LISTING_CATEGORIES as readonly string[]).includes(val));
}

function isListingCondition(val: string | null): val is ListingCondition {
  return Boolean(val && (LISTING_CONDITIONS as readonly string[]).includes(val));
}

function isSortOption(val: string | null): val is 'newest' | 'price_asc' | 'price_desc' {
  return val === 'newest' || val === 'price_asc' || val === 'price_desc';
}

const HomeGridSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {Array.from({ length: 8 }).map((_, idx) => (
      <div
        key={idx}
        className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] overflow-hidden animate-pulse"
      >
        <div className="aspect-[4/3] bg-[#F7F8FA]" />
        <div className="p-3.5 space-y-2.5">
          <div className="h-3 w-2/3 bg-[#E5E7EB] rounded" />
          <div className="h-4 w-full bg-[#E5E7EB] rounded" />
          <div className="h-4 w-3/4 bg-[#E5E7EB] rounded" />
          <div className="pt-2 border-t border-[#E5E7EB] flex justify-between">
            <div className="h-4 w-1/3 bg-[#E5E7EB] rounded" />
            <div className="h-4 w-1/3 bg-[#E5E7EB] rounded" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const MarketplaceHomeContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams?.get('q') || '';
  const urlCategoryRaw = searchParams?.get('category') || null;
  const urlCategory: 'ALL' | ListingCategory = isListingCategory(urlCategoryRaw)
    ? urlCategoryRaw
    : 'ALL';
  const urlConditionRaw = searchParams?.get('condition') || null;
  const urlCondition: '' | ListingCondition = isListingCondition(urlConditionRaw)
    ? urlConditionRaw
    : '';
  const urlSortRaw = searchParams?.get('sort') || null;
  const urlSort: 'newest' | 'price_asc' | 'price_desc' = isSortOption(urlSortRaw)
    ? urlSortRaw
    : 'newest';
  const urlInStock = searchParams?.get('in_stock_only') !== '0';
  const urlMinAvax = searchParams?.get('min_avax') || '';
  const urlMaxAvax = searchParams?.get('max_avax') || '';
  const rawPage = Number(searchParams?.get('page') || '1');
  const urlPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [minAvaxDraft, setMinAvaxDraft] = useState(urlMinAvax);
  const [maxAvaxDraft, setMaxAvaxDraft] = useState(urlMaxAvax);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [items, setItems] = useState<ListingDto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    setMinAvaxDraft(urlMinAvax);
    setMaxAvaxDraft(urlMaxAvax);
  }, [urlMinAvax, urlMaxAvax]);

  const updateUrlParams = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(searchParams?.toString() || '');
      for (const [key, val] of Object.entries(patch)) {
        if (val === null || val === '') {
          next.delete(key);
        } else {
          next.set(key, val);
        }
      }
      if (resetPage) {
        next.delete('page');
      }
      const str = next.toString();
      router.replace(str ? `/?${str}` : '/', { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setFetchError(null);

    const query: ListingsQuery = {
      status: 'ACTIVE',
      sort: urlSort,
      page: urlPage,
      limit: PAGE_LIMIT,
      in_stock_only: urlInStock,
    };

    if (urlQuery.trim()) query.q = urlQuery.trim();
    if (urlCategory !== 'ALL') query.category = urlCategory;
    if (urlCondition) query.condition = urlCondition;

    let minWei: string | undefined;
    let maxWei: string | undefined;
    try {
      if (urlMinAvax.trim()) {
        minWei = avaxInputToWeiString(urlMinAvax.trim());
        query.min_price_wei = minWei;
      }
      if (urlMaxAvax.trim()) {
        maxWei = avaxInputToWeiString(urlMaxAvax.trim());
        query.max_price_wei = maxWei;
      }
      if (minWei && maxWei && BigInt(minWei) > BigInt(maxWei)) {
        setPriceError('Giá tối thiểu không được lớn hơn giá tối đa.');
        setIsLoading(false);
        return;
      }
      setPriceError(null);
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Khoảng giá AVAX không hợp lệ.');
      setIsLoading(false);
      return;
    }

    browseListings(query)
      .then((res) => {
        if (!active) return;
        setItems(res.items || []);
        setTotal(res.total || 0);
        setTotalPages(Math.max(1, res.total_pages || 1));
      })
      .catch((err) => {
        if (!active) return;
        setFetchError(
          err instanceof Error
            ? err.message
            : 'Không thể tải danh sách sản phẩm từ Marketplace BFF.'
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    urlQuery,
    urlCategory,
    urlCondition,
    urlSort,
    urlInStock,
    urlMinAvax,
    urlMaxAvax,
    urlPage,
    reloadNonce,
  ]);

  const handleApplyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    setPriceError(null);

    const minTrimmed = minAvaxDraft.trim();
    const maxTrimmed = maxAvaxDraft.trim();
    try {
      const minWei = minTrimmed ? avaxInputToWeiString(minTrimmed) : undefined;
      const maxWei = maxTrimmed ? avaxInputToWeiString(maxTrimmed) : undefined;
      if (minWei && maxWei && BigInt(minWei) > BigInt(maxWei)) {
        setPriceError('Giá tối thiểu không được lớn hơn giá tối đa.');
        return;
      }
      updateUrlParams({
        min_avax: minTrimmed || null,
        max_avax: maxTrimmed || null,
      });
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Khoảng giá AVAX không hợp lệ.');
    }
  };

  const handleResetFilters = () => {
    setMinAvaxDraft('');
    setMaxAvaxDraft('');
    setPriceError(null);
    router.replace('/', { scroll: false });
  };

  const hasActiveFilter = Boolean(
    urlQuery.trim() ||
      urlCategory !== 'ALL' ||
      urlCondition ||
      urlMinAvax.trim() ||
      urlMaxAvax.trim() ||
      !urlInStock ||
      urlSort !== 'newest'
  );

  return (
    <div className="space-y-5">
      {/* Compact Marketplace Banner */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] px-4 py-4 sm:px-6 sm:py-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#3458D4]/10 border border-[#3458D4]/25 text-[#2947B5] text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Ký quỹ bảo vệ 30% AVAX · CDU kế toán 1:1 · Avalanche Fuji</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#17191F] tracking-tight">
            Chợ đồ sưu tầm Escrow Marketplace
          </h1>
          <p className="text-xs sm:text-sm text-[#525866]">
            Khám phá LEGO, mô hình, figure, thẻ bài và xu sưu tầm từ cộng đồng. Tiền hàng thanh toán trực tiếp khi giao dịch hoàn tất; hợp đồng Escrow giữ cọc bảo vệ hai bên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href="/sell"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs sm:text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-1"
          >
            <Store className="w-4 h-4" aria-hidden="true" />
            <span>Đăng bán sản phẩm</span>
          </Link>
          <Link
            href="/trades"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] hover:bg-[#FFFFFF] text-[#17191F] text-xs sm:text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
          >
            <ClipboardList className="w-4 h-4 text-[#3458D4]" aria-hidden="true" />
            <span>Giao dịch của tôi</span>
          </Link>
        </div>
      </section>

      {/* Shopee-style Category Tabs */}
      <section aria-label="Danh mục đồ sưu tầm" className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-3 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_TABS.map((cat) => {
            const active = urlCategory === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  updateUrlParams({ category: cat.value === 'ALL' ? null : cat.value })
                }
                className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] ${
                  active
                    ? 'bg-[#3458D4] border-[#3458D4] text-white shadow-sm'
                    : 'bg-[#F7F8FA] border-[#E5E7EB] text-[#17191F] hover:border-[#3458D4]/50 hover:text-[#2947B5]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Filter & Sort Controls */}
        <div className="pt-3 border-t border-[#E5E7EB] flex flex-col xl:flex-row xl:items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Condition Select */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="filter-condition"
                className="text-[11px] font-semibold text-[#525866] flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
                <span>Tình trạng</span>
              </label>
              <select
                id="filter-condition"
                value={urlCondition}
                onChange={(e) =>
                  updateUrlParams({ condition: e.target.value || null })
                }
                className="rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1.5 text-xs sm:text-sm text-[#17191F] focus:outline-none focus:border-[#3458D4] focus:ring-2 focus:ring-[#3458D4]/20"
              >
                <option value="">Tất cả tình trạng</option>
                {LISTING_CONDITIONS.map((cond) => (
                  <option key={cond} value={cond}>
                    {CONDITION_LABELS[cond]}
                  </option>
                ))}
              </select>
            </div>

            {/* Price Range Form */}
            <form onSubmit={handleApplyPrice} className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="filter-min-avax"
                  className="text-[11px] font-semibold text-[#525866]"
                >
                  Giá từ (AVAX)
                </label>
                <input
                  id="filter-min-avax"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.1"
                  value={minAvaxDraft}
                  onChange={(e) => setMinAvaxDraft(e.target.value)}
                  className="w-24 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-1.5 text-xs sm:text-sm text-[#17191F] placeholder:text-[#525866] focus:outline-none focus:border-[#3458D4]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="filter-max-avax"
                  className="text-[11px] font-semibold text-[#525866]"
                >
                  Đến (AVAX)
                </label>
                <input
                  id="filter-max-avax"
                  type="text"
                  inputMode="decimal"
                  placeholder="50"
                  value={maxAvaxDraft}
                  onChange={(e) => setMaxAvaxDraft(e.target.value)}
                  className="w-24 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-1.5 text-xs sm:text-sm text-[#17191F] placeholder:text-[#525866] focus:outline-none focus:border-[#3458D4]"
                />
              </div>

              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl border border-[#3458D4]/40 bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-[#2947B5] text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
              >
                Lọc giá
              </button>
            </form>

            {/* In Stock Only Toggle */}
            <label
              htmlFor="filter-in-stock"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] text-xs sm:text-sm text-[#17191F] font-medium cursor-pointer select-none"
            >
              <input
                id="filter-in-stock"
                type="checkbox"
                checked={urlInStock}
                onChange={(e) =>
                  updateUrlParams({
                    in_stock_only: e.target.checked ? null : '0',
                  })
                }
                className="rounded border-[#E5E7EB] text-[#3458D4] focus:ring-[#3458D4]"
              />
              <span>Chỉ hiện còn hàng</span>
            </label>
          </div>

          {/* Sort & Clear */}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="sort-listings" className="text-xs font-semibold text-[#525866]">
              Sắp xếp:
            </label>
            <select
              id="sort-listings"
              value={urlSort}
              onChange={(e) =>
                updateUrlParams({
                  sort: e.target.value === 'newest' ? null : e.target.value,
                })
              }
              className="rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1.5 text-xs sm:text-sm text-[#17191F] focus:outline-none focus:border-[#3458D4]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F7F8FA] text-[#17191F] text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Xóa bộ lọc</span>
              </button>
            )}
          </div>
        </div>

        {priceError && (
          <p role="alert" className="text-xs text-red-700 font-medium">
            {priceError}
          </p>
        )}
      </section>

      {/* Active Query Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-[#525866]">
        <div>
          {urlQuery.trim() ? (
            <span>
              Kết quả tìm kiếm cho{' '}
              <strong className="text-[#17191F]">&ldquo;{urlQuery.trim()}&rdquo;</strong>:{' '}
            </span>
          ) : (
            <span>Sản phẩm đang mở bán: </span>
          )}
          <strong className="text-[#17191F]">{total}</strong> tin đăng
        </div>
        <span>
          Trang {urlPage} / {totalPages}
        </span>
      </div>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Không thể tải dữ liệu chợ sản phẩm</p>
              <p className="text-xs mt-0.5">{fetchError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Thử tải lại</span>
          </button>
        </div>
      )}

      {/* Product Grid / Loading / Empty States */}
      {isLoading ? (
        <HomeGridSkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] px-6 py-14 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F7F8FA] border border-[#E5E7EB] flex items-center justify-center text-[#525866]">
            <PackageOpen className="w-6 h-6" aria-hidden="true" />
          </div>
          {hasActiveFilter ? (
            <>
              <h2 className="text-base sm:text-lg font-bold text-[#17191F]">
                Không tìm thấy sản phẩm phù hợp
              </h2>
              <p className="text-xs sm:text-sm text-[#525866] max-w-md mx-auto">
                Hãy thử bỏ bớt điều kiện lọc hoặc tìm kiếm bằng từ khóa và mã SKU khác.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  <span>Đặt lại bộ lọc</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base sm:text-lg font-bold text-[#17191F]">
                Chưa có sản phẩm nào được đăng bán
              </h2>
              <p className="text-xs sm:text-sm text-[#525866] max-w-md mx-auto">
                Sàn hiện chưa có tin đăng thật trong cơ sở dữ liệu. Hãy kết nối ví và đăng bán món đồ sưu tầm đầu tiên của bạn.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                <Link
                  href="/sell"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs sm:text-sm font-semibold transition"
                >
                  <Store className="w-4 h-4" aria-hidden="true" />
                  <span>Đăng bán sản phẩm đầu tiên</span>
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((listing) => (
            <ProductCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Phân trang danh sách sản phẩm"
          className="flex items-center justify-center gap-2 pt-2"
        >
          <button
            type="button"
            disabled={urlPage <= 1}
            onClick={() =>
              updateUrlParams({ page: String(Math.max(1, urlPage - 1)) }, false)
            }
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] text-xs font-semibold text-[#17191F] hover:bg-[#F7F8FA] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            <span>Trang trước</span>
          </button>

          <span className="px-3 py-2 text-xs font-semibold text-[#17191F]">
            Trang {urlPage} / {totalPages}
          </span>

          <button
            type="button"
            disabled={urlPage >= totalPages}
            onClick={() =>
              updateUrlParams({ page: String(Math.min(totalPages, urlPage + 1)) }, false)
            }
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] text-xs font-semibold text-[#17191F] hover:bg-[#F7F8FA] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>Trang sau</span>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
};

export default function MarketplaceHomePage() {
  return (
    <Suspense fallback={<HomeGridSkeleton />}>
      <MarketplaceHomeContent />
    </Suspense>
  );
}
