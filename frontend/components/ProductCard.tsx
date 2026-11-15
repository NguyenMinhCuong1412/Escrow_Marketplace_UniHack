'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Package, ShieldCheck, Star } from 'lucide-react';
import { weiToAvaxString, type ListingDto } from '@/lib/marketplace';
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  LISTING_STATUS_BADGES,
} from '@/lib/marketplace-ui';
import { ipfsToGatewayUrl, isMockUri } from '@/lib/ipfs';
import { shortAddr } from '@/lib/format';

interface ProductCardProps {
  listing: ListingDto;
}

export const ProductCard: React.FC<ProductCardProps> = ({ listing }) => {
  const [imgError, setImgError] = useState(false);

  const imageSrc = listing.primary_image_uri
    ? ipfsToGatewayUrl(listing.primary_image_uri)
    : '';
  const isMockImage = listing.primary_image_uri
    ? isMockUri(listing.primary_image_uri)
    : false;
  const statusBadge = LISTING_STATUS_BADGES[listing.status];

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex flex-col rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] overflow-hidden shadow-sm hover:shadow-md hover:border-[#3458D4]/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-2"
    >
      {/* Product Image */}
      <div className="relative aspect-[4/3] w-full bg-[#F7F8FA] overflow-hidden border-b border-[#E5E7EB]">
        {imageSrc && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={listing.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-[#525866] gap-1.5 px-3 text-center">
            <Package className="w-8 h-8 text-[#525866]" aria-hidden="true" />
            <span className="text-[11px] font-medium">Chưa có ảnh xem trước</span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-1.5 pointer-events-none">
          <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-[#FFFFFF]/95 border border-[#E5E7EB] text-[11px] font-semibold text-[#17191F] shadow-sm">
            {CATEGORY_LABELS[listing.category]}
          </span>
          {listing.status !== 'ACTIVE' && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-semibold shadow-sm ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          )}
        </div>

        {/* Bottom Badges */}
        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-1.5 pointer-events-none">
          {isMockImage && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[10px] font-medium">
              Demo IPFS cục bộ
            </span>
          )}
          {listing.images.length > 1 && (
            <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900/75 text-white text-[10px] font-medium">
              {listing.images.length} ảnh
            </span>
          )}
        </div>
      </div>

      {/* Product Body */}
      <div className="flex flex-col flex-1 p-3.5 gap-2">
        <div className="flex items-center justify-between gap-2 text-[11px] text-[#525866]">
          <span className="font-mono font-medium truncate" title={`SKU: ${listing.sku}`}>
            SKU: {listing.sku}
          </span>
          <span className="shrink-0 font-medium text-[#17191F] bg-[#F7F8FA] px-2 py-0.5 rounded-md border border-[#E5E7EB]">
            {CONDITION_LABELS[listing.condition]}
          </span>
        </div>

        <h3 className="text-sm font-semibold text-[#17191F] line-clamp-2 min-h-[2.5rem] group-hover:text-[#2947B5] transition-colors">
          {listing.title}
        </h3>

        {/* Price & 30% Reference Deposit */}
        <div className="mt-auto pt-2 border-t border-[#E5E7EB] space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-[#525866]">Giá niêm yết</span>
            <span className="text-base font-bold text-[#2947B5] tabular-nums">
              {weiToAvaxString(listing.price_wei, 4)} AVAX
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[#525866]">Cọc 30% / bên</span>
            <span className="font-semibold text-[#17191F] tabular-nums">
              {weiToAvaxString(listing.deposit_required_wei, 4)} AVAX
            </span>
          </div>
        </div>

        {/* Stock & Seller */}
        <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between gap-2 text-[11px] text-[#525866]">
          <span
            className={`font-semibold ${
              listing.quantity_available > 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {listing.quantity_available > 0
              ? `Còn ${listing.quantity_available}/${listing.quantity_total}`
              : 'Tạm hết giữ chỗ'}
          </span>

          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldCheck className="w-3.5 h-3.5 text-[#3458D4] shrink-0" aria-hidden="true" />
            <span className="font-mono truncate">{shortAddr(listing.seller_wallet)}</span>
            {listing.seller_reputation !== null && listing.seller_reputation !== undefined && (
              <span
                className="inline-flex items-center gap-0.5 text-[#7A4B00] font-semibold shrink-0"
                title="Điểm uy tín on-chain"
              >
                <Star className="w-3 h-3 fill-[#F0B44D] text-[#7A4B00]" aria-hidden="true" />
                {listing.seller_reputation}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;
