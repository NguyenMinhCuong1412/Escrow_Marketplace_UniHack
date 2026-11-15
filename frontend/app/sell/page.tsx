'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatEther } from 'viem';
import { usePublicClient, useSignMessage, useSwitchChain, useWriteContract } from 'wagmi';
import { toast } from 'sonner';
import {
  Store,
  PlusCircle,
  Package,
  Inbox,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Edit3,
  PauseCircle,
  PlayCircle,
  XCircle,
  CheckCircle2,
  ShieldCheck,
  Clock,
  ExternalLink,
  RefreshCw,
  ArrowRightLeft,
  Wrench,
} from 'lucide-react';
import {
  bindRequestTrade,
  createListing,
  decidePurchaseRequest,
  getMyListings,
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  listPurchaseRequests,
  updateListing,
  weiToAvaxString,
  type ListingCategory,
  type ListingCondition,
  type ListingDto,
  type ListingStatus,
  type PurchaseRequestDto,
} from '@/lib/marketplace';
import {
  buildSellableAvaxPreview,
  CATEGORY_LABELS,
  clearPendingBindTrade,
  CONDITION_LABELS,
  extractTradeCreatedIdFromReceipt,
  getPendingBindTrade,
  LISTING_STATUS_BADGES,
  REQUEST_STATUS_BADGES,
  setPendingBindTrade,
  type PendingBindTradeRecord,
} from '@/lib/marketplace-ui';
import { escrowAbi, escrowAddress, chainId as configuredChainId } from '@/lib/contracts';
import { listingMessage, registerUri } from '@/lib/backend';
import { ipfsToGatewayUrl, setStoredListingUri } from '@/lib/ipfs';
import { notifyWalletActionError } from '@/lib/wallet-toast';
import { formatDateTime, shortAddr } from '@/lib/format';
import { useAuthSession } from '@/hooks/useAuthSession';
import { MultiImageUploader, type UploadedImageItem } from '@/components/MultiImageUploader';

type SellTab = 'create' | 'listings' | 'requests';

function formatRemainingTtl(expiresAtSec: number | null, nowSec: number): string {
  if (!expiresAtSec) return 'Không giới hạn';
  const diff = Math.floor(expiresAtSec - nowSec);
  if (diff <= 0) return 'Đã hết hạn giữ chỗ (30 phút)';
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `Còn ${mins}p ${secs < 10 ? '0' : ''}${secs}s`;
}

const SellerStudioContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabRaw = searchParams?.get('tab');
  const activeTab: SellTab =
    initialTabRaw === 'listings' || initialTabRaw === 'requests' || initialTabRaw === 'create'
      ? initialTabRaw
      : 'listings';

  const setActiveTab = (tab: SellTab) => {
    const next = new URLSearchParams(searchParams?.toString() || '');
    next.set('tab', tab);
    router.replace(`/sell?${next.toString()}`, { scroll: false });
  };

  const {
    address,
    isCorrectNetwork,
    targetChain,
    serverSessionActive,
    isSigningIn,
    authenticateWithServer,
  } = useAuthSession();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const { switchChain } = useSwitchChain();

  // Data state
  const [myListings, setMyListings] = useState<ListingDto[]>([]);
  const [sellerRequests, setSellerRequests] = useState<PurchaseRequestDto[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  // Create form state
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<ListingCategory>('LEGO');
  const [condition, setCondition] = useState<ListingCondition>('SEALED_NEW');
  const [title, setTitle] = useState('');
  const [priceAvax, setPriceAvax] = useState('');
  const [quantityTotal, setQuantityTotal] = useState(1);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<UploadedImageItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Manage listings filter & edit state
  const [statusFilter, setStatusFilter] = useState<'ALL' | ListingStatus>('ALL');
  const [editingListing, setEditingListing] = useState<ListingDto | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editCategory, setEditCategory] = useState<ListingCategory>('LEGO');
  const [editCondition, setEditCondition] = useState<ListingCondition>('SEALED_NEW');
  const [editPriceAvax, setEditPriceAvax] = useState('');
  const [editQtyTotal, setEditQtyTotal] = useState(1);
  const [editDescription, setEditDescription] = useState('');
  const [editImages, setEditImages] = useState<UploadedImageItem[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [mutatingListingId, setMutatingListingId] = useState<string | null>(null);

  // Incoming purchase request action state
  const [sellerNotes, setSellerNotes] = useState<Record<string, string>>({});
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);
  const [pendingBindMap, setPendingBindMap] = useState<
    Record<string, PendingBindTradeRecord | null>
  >({});
  const [manualTxOpenMap, setManualTxOpenMap] = useState<Record<string, boolean>>({});
  const [manualTxHashMap, setManualTxHashMap] = useState<Record<string, string>>({});
  const [requestStepStatus, setRequestStepStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    const id = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const refreshPendingBinds = useCallback((reqs: PurchaseRequestDto[]) => {
    const map: Record<string, PendingBindTradeRecord | null> = {};
    for (const r of reqs) {
      map[r.id] = getPendingBindTrade(configuredChainId, r.id);
    }
    setPendingBindMap(map);
  }, []);

  const loadSellerData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const [listingsRes, reqsRes] = await Promise.all([
        getMyListings({ limit: 50, sort: 'newest' }),
        listPurchaseRequests({ role: 'seller', limit: 50 }),
      ]);
      setMyListings(listingsRes.items || []);
      const reqItems = reqsRes.items || [];
      setSellerRequests(reqItems);
      refreshPendingBinds(reqItems);
    } catch (err) {
      setDataError(
        err instanceof Error
          ? err.message
          : 'Không thể tải dữ liệu Kênh người bán.'
      );
    } finally {
      setIsLoadingData(false);
    }
  }, [refreshPendingBinds]);

  useEffect(() => {
    loadSellerData();
  }, [loadSellerData, address]);

  const pricePreview = buildSellableAvaxPreview(priceAvax);
  const editPricePreview = buildSellableAvaxPreview(editPriceAvax);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const normalizedSku = sku.trim().toUpperCase();
    if (!/^[A-Z0-9._-]{2,64}$/.test(normalizedSku)) {
      setCreateError('SKU dài 2-64 ký tự, chỉ gồm chữ in hoa, số và . _ -');
      return;
    }
    if (title.trim().length < 3 || title.trim().length > 160) {
      setCreateError('Tên sản phẩm phải từ 3 đến 160 ký tự.');
      return;
    }
    if (!pricePreview.valid || !pricePreview.wei) {
      setCreateError(pricePreview.error || 'Vui lòng nhập giá AVAX hợp lệ.');
      return;
    }
    if (quantityTotal < 1 || quantityTotal > 10000) {
      setCreateError('Số lượng mở bán phải từ 1 đến 10.000.');
      return;
    }
    if (images.length === 0) {
      setCreateError('Vui lòng tải lên ít nhất 1 ảnh sản phẩm trên IPFS.');
      return;
    }

    setIsCreating(true);
    try {
      const created = await createListing({
        sku: normalizedSku,
        category,
        title: title.trim(),
        description: description.trim(),
        price_wei: pricePreview.wei,
        condition,
        quantity_total: quantityTotal,
        images: images.map((img) => ({ uri: img.uri, is_primary: img.is_primary })),
      });

      toast.success(`Đã đăng bán thành công sản phẩm "${created.title}"!`);
      if (created.warnings && created.warnings.length > 0) {
        toast.warning(
          `Lưu ý: ${created.warnings[0].message}`,
          { duration: 6000 }
        );
      }

      setSku('');
      setTitle('');
      setPriceAvax('');
      setQuantityTotal(1);
      setDescription('');
      setImages([]);
      await loadSellerData();
      setActiveTab('listings');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Không thể tạo tin đăng mới.';
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const openEditModal = (listing: ListingDto) => {
    setEditingListing(listing);
    setEditTitle(listing.title);
    setEditSku(listing.sku);
    setEditCategory(listing.category);
    setEditCondition(listing.condition);
    setEditPriceAvax(formatEther(BigInt(listing.price_wei)));
    setEditQtyTotal(listing.quantity_total);
    setEditDescription(listing.description || '');
    setEditImages(
      listing.images.map((img) => ({
        uri: img.uri,
        is_primary: img.is_primary,
      }))
    );
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListing) return;

    const normalizedSku = editSku.trim().toUpperCase();
    if (!/^[A-Z0-9._-]{2,64}$/.test(normalizedSku)) {
      toast.error('SKU dài 2-64 ký tự, chỉ gồm chữ in hoa, số và . _ -');
      return;
    }
    if (editTitle.trim().length < 3 || editTitle.trim().length > 160) {
      toast.error('Tên sản phẩm phải từ 3 đến 160 ký tự.');
      return;
    }
    if (!editPricePreview.valid || !editPricePreview.wei) {
      toast.error(editPricePreview.error || 'Giá AVAX không hợp lệ.');
      return;
    }
    if (editImages.length === 0) {
      toast.error('Cần giữ ít nhất 1 ảnh sản phẩm.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateListing(editingListing.id, {
        sku: normalizedSku,
        category: editCategory,
        condition: editCondition,
        title: editTitle.trim(),
        description: editDescription.trim(),
        price_wei: editPricePreview.wei,
        quantity_total: editQtyTotal,
        images: editImages.map((img) => ({ uri: img.uri, is_primary: img.is_primary })),
      });
      toast.success('Đã cập nhật tin đăng.');
      setEditingListing(null);
      await loadSellerData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cập nhật thất bại.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleListingStatusChange = async (
    listing: ListingDto,
    nextStatus: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
  ) => {
    if (
      nextStatus === 'CANCELLED' &&
      typeof window !== 'undefined' &&
      !window.confirm(`Xác nhận hủy vĩnh viễn tin đăng "${listing.title}" (${listing.sku})?`)
    ) {
      return;
    }
    setMutatingListingId(listing.id);
    try {
      await updateListing(listing.id, { status: nextStatus });
      toast.success(
        nextStatus === 'PAUSED'
          ? 'Đã tạm ẩn tin đăng khỏi chợ.'
          : nextStatus === 'ACTIVE'
            ? 'Đã mở bán lại tin đăng.'
            : 'Đã hủy tin đăng.'
      );
      await loadSellerData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể đổi trạng thái tin đăng.');
    } finally {
      setMutatingListingId(null);
    }
  };

  const handleDecision = async (reqId: string, action: 'accept' | 'reject') => {
    setProcessingReqId(reqId);
    try {
      await decidePurchaseRequest(reqId, {
        action,
        seller_note: sellerNotes[reqId]?.trim() || undefined,
      });
      toast.success(
        action === 'accept'
          ? 'Đã xác nhận và giữ chỗ sản phẩm (30 phút) để tạo Escrow!'
          : 'Đã từ chối yêu cầu mua.'
      );
      await loadSellerData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xử lý yêu cầu.');
    } finally {
      setProcessingReqId(null);
    }
  };

  const resolvePrimaryImageUri = (req: PurchaseRequestDto): string => {
    if (req.listing?.primary_image_uri) return req.listing.primary_image_uri;
    const matched = myListings.find((l) => l.id === req.listing_id);
    return matched?.primary_image_uri || '';
  };

  const finalizeBoundTradeAiRegistration = async (
    req: PurchaseRequestDto,
    boundTradeId: number
  ) => {
    const primaryUri = resolvePrimaryImageUri(req);
    const titleText = req.listing?.title || `Vật phẩm sưu tầm #${boundTradeId}`;
    try {
      localStorage.setItem(
        `meta:${configuredChainId}:${boundTradeId}`,
        JSON.stringify({
          title: titleText,
          description: '',
          listingUri: primaryUri,
          listingId: req.listing_id,
          sku: req.listing?.sku,
          createdAt: Date.now(),
        })
      );
      if (primaryUri) {
        setStoredListingUri(String(boundTradeId), primaryUri);
      }
    } catch {
      // ignore storage error
    }

    if (!primaryUri) return;

    try {
      setRequestStepStatus((prev) => ({
        ...prev,
        [req.id]: `Ký xác nhận ảnh chính AI cho giao dịch #${boundTradeId}...`,
      }));
      const signature = await signMessageAsync({
        message: listingMessage(configuredChainId, escrowAddress, boundTradeId, primaryUri),
      });
      await registerUri({
        trade_id: boundTradeId,
        role: 'listing',
        uri: primaryUri,
        signature,
      });
      toast.success(`Đã đăng ký ảnh niêm yết có chữ ký cho AI trên trade #${boundTradeId}!`);
    } catch (regErr) {
      console.warn('Register listing URI failed:', regErr);
      toast.warning(
        `Escrow #${boundTradeId} đã liên kết thành công, nhưng chưa ký xác nhận ảnh AI — bạn có thể ký lại trong trang chi tiết giao dịch.`,
        { duration: 6000 }
      );
    }
  };

  const performBindAndRegister = async (
    req: PurchaseRequestDto,
    txHash: `0x${string}`,
    knownTradeId?: number
  ) => {
    let extractedTradeId = knownTradeId;
    if (!extractedTradeId && publicClient) {
      try {
        setRequestStepStatus((prev) => ({
          ...prev,
          [req.id]: 'Đang chờ xác nhận giao dịch trên Avalanche...',
        }));
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') {
          clearPendingBindTrade(configuredChainId, req.id);
          setPendingBindMap((prev) => ({ ...prev, [req.id]: null }));
          throw new Error('Giao dịch tạo Escrow bị revert trên blockchain.');
        }
        const parsedId = extractTradeCreatedIdFromReceipt(
          receipt.logs,
          escrowAddress,
          escrowAbi
        );
        if (parsedId) {
          extractedTradeId = parsedId;
          setPendingBindTrade(configuredChainId, req.id, {
            txHash,
            tradeId: parsedId,
            buyerWallet: req.buyer_wallet,
            totalValueWei: req.total_value_wei,
            savedAt: Date.now(),
          });
        }
      } catch (receiptErr) {
        // Nếu waitForTransactionReceipt timeout/lỗi mạng, vẫn cho phép backend tự tra receipt theo txHash
        const errMsg = receiptErr instanceof Error ? receiptErr.message : '';
        if (errMsg.includes('revert')) {
          throw receiptErr;
        }
      }
    }

    setRequestStepStatus((prev) => ({
      ...prev,
      [req.id]: 'Đang xác minh on-chain & liên kết đơn hàng...',
    }));
    const bound = await bindRequestTrade(req.id, {
      tx_hash: txHash,
      trade_id: extractedTradeId,
    });

    clearPendingBindTrade(configuredChainId, req.id);
    setPendingBindMap((prev) => ({ ...prev, [req.id]: null }));

    if (bound.trade_id) {
      await finalizeBoundTradeAiRegistration(req, bound.trade_id);
      toast.success(
        `Đã liên kết thành công giao dịch Escrow #${bound.trade_id}!`
      );
    }
    await loadSellerData();
  };

  const handleCreateOnChainAndBind = async (req: PurchaseRequestDto) => {
    // Tuyệt đối không tạo trade thứ 2 nếu đã có pendingBindTrade!
    const existingPending = getPendingBindTrade(configuredChainId, req.id);
    if (existingPending) {
      await handleRetryBind(req, existingPending.txHash, existingPending.tradeId);
      return;
    }

    if (!address) {
      toast.error('Vui lòng kết nối ví trước khi tạo giao dịch.');
      return;
    }
    if (!isCorrectNetwork) {
      toast.error(`Vui lòng chuyển ví sang mạng ${targetChain.name}.`);
      return;
    }
    if (!publicClient) {
      toast.error('Public client chưa sẵn sàng để kiểm tra giao dịch.');
      return;
    }

    setProcessingReqId(req.id);
    try {
      const valueWei = BigInt(req.total_value_wei);
      const buyer = req.buyer_wallet as `0x${string}`;

      setRequestStepStatus((prev) => ({
        ...prev,
        [req.id]: 'Đang mô phỏng giao dịch createTrade...',
      }));
      await publicClient.simulateContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'createTrade',
        args: [buyer, valueWei],
        account: address as `0x${string}`,
      });

      setRequestStepStatus((prev) => ({
        ...prev,
        [req.id]: 'Vui lòng xác nhận giao dịch trong ví...',
      }));
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'createTrade',
        args: [buyer, valueWei],
      });

      // Lưu txHash NGAY LẬP TỨC trước khi chờ receipt / gọi API bind-trade
      const pendingRecord: PendingBindTradeRecord = {
        txHash,
        buyerWallet: req.buyer_wallet,
        totalValueWei: req.total_value_wei,
        savedAt: Date.now(),
      };
      setPendingBindTrade(configuredChainId, req.id, pendingRecord);
      setPendingBindMap((prev) => ({ ...prev, [req.id]: pendingRecord }));

      await performBindAndRegister(req, txHash);
    } catch (err) {
      notifyWalletActionError(err, 'Lỗi tạo/liên kết Escrow', {
        duration: 7000,
        context: 'CreateEscrowAndBind',
      });
    } finally {
      setProcessingReqId(null);
      setRequestStepStatus((prev) => {
        const copy = { ...prev };
        delete copy[req.id];
        return copy;
      });
    }
  };

  const handleRetryBind = async (
    req: PurchaseRequestDto,
    txHashRaw: string,
    knownTradeId?: number
  ) => {
    const trimmed = txHashRaw.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
      toast.error('Mã giao dịch (tx_hash) phải bắt đầu bằng 0x và đủ 64 ký tự hex.');
      return;
    }
    const txHash = trimmed as `0x${string}`;
    const existing = getPendingBindTrade(configuredChainId, req.id);
    if (!existing || existing.txHash.toLowerCase() !== txHash.toLowerCase()) {
      const rec: PendingBindTradeRecord = {
        txHash,
        tradeId: knownTradeId,
        buyerWallet: req.buyer_wallet,
        totalValueWei: req.total_value_wei,
        savedAt: Date.now(),
      };
      setPendingBindTrade(configuredChainId, req.id, rec);
      setPendingBindMap((prev) => ({ ...prev, [req.id]: rec }));
    }

    setProcessingReqId(req.id);
    try {
      await performBindAndRegister(req, txHash, knownTradeId ?? existing?.tradeId);
    } catch (err) {
      notifyWalletActionError(err, 'Chưa thể liên kết lại giao dịch', {
        duration: 7000,
        context: 'RetryBindTrade',
      });
    } finally {
      setProcessingReqId(null);
      setRequestStepStatus((prev) => {
        const copy = { ...prev };
        delete copy[req.id];
        return copy;
      });
    }
  };

  const pendingReqCount = sellerRequests.filter(
    (r) => r.status === 'PENDING' || r.status === 'ACCEPTED'
  ).length;

  const filteredListings =
    statusFilter === 'ALL'
      ? myListings
      : myListings.filter((item) => item.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2947B5]">
            <Store className="w-4 h-4" aria-hidden="true" />
            <span>Kênh Người Bán · Seller Studio</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#17191F]">
            Đăng bán & Quản lý yêu cầu Escrow
          </h1>
          <p className="text-xs sm:text-sm text-[#525866]">
            Đăng tin đồ sưu tầm lên IPFS, xác nhận đơn mua và khởi tạo hợp đồng Escrow an toàn trên Avalanche Fuji.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadSellerData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] hover:bg-[#FFFFFF] text-xs font-semibold text-[#17191F] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            <span>Đăng sản phẩm mới</span>
          </button>
        </div>
      </section>

      {/* Network & Session Warnings */}
      {!isCorrectNetwork && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs sm:text-sm text-red-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Ví đang ở sai mạng. Hãy chuyển sang <strong>{targetChain.name}</strong> trước khi tạo giao dịch Escrow on-chain.
            </span>
          </div>
          <button
            type="button"
            onClick={() => switchChain({ chainId: targetChain.id })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-700 text-white text-xs font-semibold cursor-pointer self-start"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Đổi sang {targetChain.name}</span>
          </button>
        </div>
      )}

      {!serverSessionActive && (
        <div className="rounded-2xl border border-[#F0B44D]/60 bg-[#F0B44D]/15 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs sm:text-sm text-[#7A4B00]">
          <span>
            Phiên xác thực HTTP cookie chưa hoạt động. Bạn cần ký xác thực ví để tải tin và tạo yêu cầu bán hàng.
          </span>
          <button
            type="button"
            disabled={isSigningIn}
            onClick={() => authenticateWithServer()}
            className="px-3.5 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold cursor-pointer self-start"
          >
            {isSigningIn ? 'Đang ký...' : 'Ký xác thực phiên ví'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Phân khu Kênh người bán"
        className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'listings'}
          onClick={() => setActiveTab('listings')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'listings'
              ? 'bg-[#3458D4] text-white shadow-sm'
              : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#17191F] hover:bg-[#F7F8FA]'
          }`}
        >
          <Package className="w-4 h-4" aria-hidden="true" />
          <span>Quản lý tin đăng ({myListings.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'requests'}
          onClick={() => setActiveTab('requests')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'requests'
              ? 'bg-[#3458D4] text-white shadow-sm'
              : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#17191F] hover:bg-[#F7F8FA]'
          }`}
        >
          <Inbox className="w-4 h-4" aria-hidden="true" />
          <span>
            Yêu cầu mua đến ({sellerRequests.length})
            {pendingReqCount > 0 ? ` · ${pendingReqCount} cần xử lý` : ''}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'create'}
          onClick={() => setActiveTab('create')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'create'
              ? 'bg-[#3458D4] text-white shadow-sm'
              : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#17191F] hover:bg-[#F7F8FA]'
          }`}
        >
          <PlusCircle className="w-4 h-4" aria-hidden="true" />
          <span>Đăng sản phẩm mới</span>
        </button>
      </div>

      {dataError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3 text-xs sm:text-sm text-red-700"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{dataError}</span>
          </div>
          <button
            type="button"
            onClick={loadSellerData}
            className="px-3 py-1.5 rounded-xl bg-red-700 text-white text-xs font-semibold cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* TAB: CREATE LISTING */}
      {activeTab === 'create' && (
        <section className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#17191F] mb-1">
            Đăng bán đồ sưu tầm mới
          </h2>
          <p className="text-xs sm:text-sm text-[#525866] mb-5">
            Cung cấp SKU rõ ràng, giá AVAX chính xác và ảnh gốc lên IPFS. Ảnh chính bạn chọn sẽ làm chuẩn đối chiếu AI khi giao hàng.
          </p>

          <form onSubmit={handleCreateSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-sku"
                  className="block text-xs font-semibold text-[#17191F]"
                >
                  Mã SKU * (chữ in hoa, số, . _ -)
                </label>
                <input
                  id="create-sku"
                  type="text"
                  required
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="LEGO-10305-SEAL"
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] focus:bg-[#FFFFFF] px-3 py-2 text-sm font-mono text-[#17191F] focus:outline-none focus:border-[#3458D4]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-category"
                  className="block text-xs font-semibold text-[#17191F]"
                >
                  Danh mục *
                </label>
                <select
                  id="create-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ListingCategory)}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-sm text-[#17191F] focus:outline-none focus:border-[#3458D4]"
                >
                  {LISTING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-condition"
                  className="block text-xs font-semibold text-[#17191F]"
                >
                  Tình trạng *
                </label>
                <select
                  id="create-condition"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as ListingCondition)}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-sm text-[#17191F] focus:outline-none focus:border-[#3458D4]"
                >
                  {LISTING_CONDITIONS.map((cond) => (
                    <option key={cond} value={cond}>
                      {CONDITION_LABELS[cond]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-title"
                className="block text-xs font-semibold text-[#17191F]"
              >
                Tên sản phẩm sưu tầm * (3–160 ký tự)
              </label>
              <input
                id="create-title"
                type="text"
                required
                minLength={3}
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="LEGO Icons 10305 Lion Knights' Castle — Bản EU Nguyên Seal"
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] focus:bg-[#FFFFFF] px-3 py-2 text-sm text-[#17191F] focus:outline-none focus:border-[#3458D4]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-price-avax"
                  className="block text-xs font-semibold text-[#17191F]"
                >
                  Đơn giá niêm yết (AVAX) *
                </label>
                <input
                  id="create-price-avax"
                  type="text"
                  inputMode="decimal"
                  required
                  value={priceAvax}
                  onChange={(e) => setPriceAvax(e.target.value)}
                  placeholder="2.5"
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] focus:bg-[#FFFFFF] px-3 py-2 text-sm font-mono text-[#17191F] focus:outline-none focus:border-[#3458D4]"
                />
                {pricePreview.valid && pricePreview.depositAvax && (
                  <p className="text-xs text-[#2947B5] font-semibold">
                    Cọc 30% Escrow mỗi bên: {pricePreview.depositAvax} AVAX
                  </p>
                )}
                {pricePreview.error && (
                  <p className="text-xs text-red-700 font-medium">{pricePreview.error}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-quantity"
                  className="block text-xs font-semibold text-[#17191F]"
                >
                  Số lượng mở bán *
                </label>
                <input
                  id="create-quantity"
                  type="number"
                  min={1}
                  max={10000}
                  required
                  value={quantityTotal}
                  onChange={(e) =>
                    setQuantityTotal(Math.max(1, Math.trunc(Number(e.target.value) || 1)))
                  }
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] focus:bg-[#FFFFFF] px-3 py-2 text-sm font-semibold text-[#17191F] focus:outline-none focus:border-[#3458D4]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-description"
                className="block text-xs font-semibold text-[#17191F]"
              >
                Mô tả chi tiết tình trạng, seal, hộp, xuất xứ
              </label>
              <textarea
                id="create-description"
                rows={4}
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả góc hộp, tem hãng, độ hiếm hoặc cách đóng gói khi giao..."
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] focus:bg-[#FFFFFF] px-3 py-2 text-sm text-[#17191F] focus:outline-none focus:border-[#3458D4]"
              />
            </div>

            <MultiImageUploader
              images={images}
              onChange={setImages}
              disabled={isCreating}
            />

            {createError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 font-medium"
              >
                {createError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setActiveTab('listings')}
                className="px-4 py-2.5 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] hover:bg-[#FFFFFF] text-xs sm:text-sm font-semibold text-[#17191F] cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PlusCircle className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{isCreating ? 'Đang đăng tin...' : 'Đăng bán lên chợ'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB: MANAGE MY LISTINGS */}
      {activeTab === 'listings' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'ACTIVE', 'RESERVED', 'PAUSED', 'SOLD', 'CANCELLED'] as const).map(
              (st) => {
                const active = statusFilter === st;
                const label =
                  st === 'ALL' ? 'Tất cả' : LISTING_STATUS_BADGES[st].label;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                      active
                        ? 'bg-[#3458D4] border-[#3458D4] text-white'
                        : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#17191F] hover:bg-[#F7F8FA]'
                    }`}
                  >
                    {label}
                  </button>
                );
              }
            )}
          </div>

          {isLoadingData ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-8 text-center text-sm text-[#525866]">
              Đang tải tin đăng của bạn...
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-10 text-center space-y-3">
              <Package className="w-8 h-8 mx-auto text-[#525866]" aria-hidden="true" />
              <p className="text-base font-bold text-[#17191F]">
                Chưa có tin đăng nào trong mục này
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" aria-hidden="true" />
                <span>Đăng sản phẩm mới</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredListings.map((item) => {
                const badge = LISTING_STATUS_BADGES[item.status];
                const busy = mutatingListingId === item.id;
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-20 h-20 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] overflow-hidden shrink-0">
                        {item.primary_image_uri ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ipfsToGatewayUrl(item.primary_image_uri)}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#525866]">
                            <Package className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded-md border font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          <span className="font-mono text-[#525866]">
                            SKU: {item.sku}
                          </span>
                          <span className="text-[#525866]">
                            {CATEGORY_LABELS[item.category]} ·{' '}
                            {CONDITION_LABELS[item.condition]}
                          </span>
                        </div>

                        <Link
                          href={`/listings/${item.id}`}
                          className="block text-sm sm:text-base font-bold text-[#17191F] hover:text-[#2947B5] truncate"
                        >
                          {item.title}
                        </Link>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#525866]">
                          <span>
                            Giá:{' '}
                            <strong className="text-[#2947B5]">
                              {weiToAvaxString(item.price_wei, 4)} AVAX
                            </strong>
                          </span>
                          <span>
                            Cọc 30%:{' '}
                            <strong className="text-[#17191F]">
                              {weiToAvaxString(item.deposit_required_wei, 4)} AVAX
                            </strong>
                          </span>
                          <span>
                            Tồn: <strong>{item.quantity_available}</strong> khả dụng /{' '}
                            {item.quantity_reserved} giữ chỗ / {item.quantity_sold} đã khóa /{' '}
                            {item.quantity_total} tổng
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Link
                        href={`/listings/${item.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] hover:bg-[#FFFFFF] text-xs font-semibold text-[#17191F]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Xem</span>
                      </Link>

                      {item.status !== 'CANCELLED' && item.status !== 'SOLD' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openEditModal(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#3458D4]/30 bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-xs font-semibold text-[#2947B5] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Sửa</span>
                        </button>
                      )}

                      {item.status === 'ACTIVE' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleListingStatusChange(item, 'PAUSED')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F7F8FA] text-xs font-semibold text-[#17191F] cursor-pointer"
                        >
                          <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Tạm ẩn</span>
                        </button>
                      )}

                      {item.status === 'PAUSED' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleListingStatusChange(item, 'ACTIVE')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 cursor-pointer"
                        >
                          <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Mở bán lại</span>
                        </button>
                      )}

                      {(item.status === 'ACTIVE' || item.status === 'PAUSED') && (
                        <button
                          type="button"
                          disabled={busy || item.quantity_reserved > 0}
                          onClick={() => handleListingStatusChange(item, 'CANCELLED')}
                          title={
                            item.quantity_reserved > 0
                              ? 'Không thể hủy khi đang có yêu cầu giữ chỗ'
                              : 'Hủy tin đăng'
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-45 text-xs font-semibold text-red-700 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Hủy tin</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB: INCOMING PURCHASE REQUESTS */}
      {activeTab === 'requests' && (
        <section className="space-y-4">
          {isLoadingData ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-8 text-center text-sm text-[#525866]">
              Đang tải yêu cầu mua hàng...
            </div>
          ) : sellerRequests.length === 0 ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-10 text-center space-y-2">
              <Inbox className="w-8 h-8 mx-auto text-[#525866]" aria-hidden="true" />
              <p className="text-base font-bold text-[#17191F]">
                Chưa có yêu cầu mua nào từ người mua
              </p>
              <p className="text-xs text-[#525866]">
                Khi người mua gửi yêu cầu ở trang chi tiết sản phẩm, đơn sẽ xuất hiện tại đây để bạn xác nhận và tạo Escrow.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sellerRequests.map((req) => {
                const badge = REQUEST_STATUS_BADGES[req.status];
                const isBusy = processingReqId === req.id;
                const pendingBind = pendingBindMap[req.id];
                const stepMsg = requestStepStatus[req.id];
                const manualOpen = Boolean(manualTxOpenMap[req.id]);

                return (
                  <div
                    key={req.id}
                    className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4 sm:p-5 shadow-sm space-y-3.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg border font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          <span className="font-mono text-[#525866]">
                            Yêu cầu #{req.id.slice(0, 8)}
                          </span>
                          <span className="text-[#525866]">
                            {formatDateTime(req.created_at)}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-[#17191F]">
                          {req.listing?.title || `Listing ${req.listing_id.slice(0, 8)}`}{' '}
                          {req.listing?.sku && (
                            <span className="text-xs font-mono text-[#525866]">
                              ({req.listing.sku})
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-[#525866]">
                          Người mua:{' '}
                          <span className="font-mono font-semibold text-[#17191F]">
                            {req.buyer_wallet}
                          </span>
                        </p>
                      </div>

                      <div className="text-left sm:text-right text-xs space-y-0.5 shrink-0">
                        <p className="text-[#525866]">
                          Số lượng: <strong className="text-[#17191F]">{req.quantity}</strong>
                        </p>
                        <p className="text-[#525866]">
                          Tổng giá trị:{' '}
                          <strong className="text-[#2947B5]">
                            {weiToAvaxString(req.total_value_wei, 6)} AVAX
                          </strong>
                        </p>
                        <p className="text-[#525866]">
                          Cọc 30% mỗi bên:{' '}
                          <strong className="text-[#7A4B00]">
                            {weiToAvaxString(req.deposit_required_wei, 6)} AVAX
                          </strong>
                        </p>
                      </div>
                    </div>

                    {req.buyer_note && (
                      <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#17191F]">
                        <span className="font-semibold text-[#525866]">Ghi chú người mua: </span>
                        {req.buyer_note}
                      </div>
                    )}

                    {/* PENDING ACTIONS */}
                    {req.status === 'PENDING' && (
                      <div className="pt-2 border-t border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center gap-2.5">
                        <label htmlFor={`seller-note-${req.id}`} className="sr-only">
                          Ghi chú phản hồi người mua
                        </label>
                        <input
                          id={`seller-note-${req.id}`}
                          type="text"
                          maxLength={1000}
                          placeholder="Ghi chú cho người mua (tùy chọn)..."
                          value={sellerNotes[req.id] || ''}
                          onChange={(e) =>
                            setSellerNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          className="flex-1 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#17191F] focus:outline-none focus:border-[#3458D4]"
                        />
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDecision(req.id, 'accept')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                            <span>Xác nhận & Giữ chỗ (30p)</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDecision(req.id, 'reject')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" aria-hidden="true" />
                            <span>Từ chối</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ACCEPTED -> CREATE ESCROW ON-CHAIN & BIND / RETRY BIND */}
                    {req.status === 'ACCEPTED' && (
                      <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#7A4B00]">
                            <Clock className="w-4 h-4" aria-hidden="true" />
                            <span>{formatRemainingTtl(req.reservation_expires_at, nowSec)}</span>
                          </span>
                          {stepMsg && (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-[#2947B5]">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              <span>{stepMsg}</span>
                            </span>
                          )}
                        </div>

                        {pendingBind ? (
                          <div className="rounded-xl border border-[#F0B44D]/60 bg-[#F0B44D]/15 p-3.5 space-y-2.5">
                            <p className="text-xs font-bold text-[#7A4B00]">
                              Đã phát hiện giao dịch on-chain đang chờ liên kết (không tạo giao dịch thứ 2 để tránh trùng Escrow)
                            </p>
                            <p className="text-xs font-mono text-[#17191F] break-all">
                              tx_hash: {pendingBind.txHash}
                              {pendingBind.tradeId ? ` · tradeId: #${pendingBind.tradeId}` : ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  handleRetryBind(
                                    req,
                                    pendingBind.txHash,
                                    pendingBind.tradeId
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>
                                  {isBusy ? 'Đang thử liên kết lại...' : 'Thử liên kết lại (Retry Bind)'}
                                </span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              disabled={isBusy || !isCorrectNetwork}
                              onClick={() => handleCreateOnChainAndBind(req)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
                            >
                              {isBusy ? (
                                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                              )}
                              <span>Tạo Escrow on-chain & Liên kết</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setManualTxOpenMap((prev) => ({
                                  ...prev,
                                  [req.id]: !prev[req.id],
                                }))
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] hover:bg-[#FFFFFF] text-xs font-semibold text-[#525866] cursor-pointer"
                            >
                              <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Khôi phục bằng tx_hash có sẵn</span>
                            </button>
                          </div>
                        )}

                        {manualOpen && !pendingBind && (
                          <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 flex flex-col sm:flex-row gap-2">
                            <label htmlFor={`manual-tx-${req.id}`} className="sr-only">
                              Nhập transaction hash tạo Escrow
                            </label>
                            <input
                              id={`manual-tx-${req.id}`}
                              type="text"
                              placeholder="0x... (mã giao dịch createTrade đã gửi trên blockchain)"
                              value={manualTxHashMap[req.id] || ''}
                              onChange={(e) =>
                                setManualTxHashMap((prev) => ({
                                  ...prev,
                                  [req.id]: e.target.value,
                                }))
                              }
                              className="flex-1 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-2 text-xs font-mono text-[#17191F]"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleRetryBind(req, manualTxHashMap[req.id] || '')
                              }
                              className="px-3.5 py-2 rounded-xl bg-[#3458D4] text-white text-xs font-semibold cursor-pointer shrink-0"
                            >
                              Liên kết tx_hash này
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* BOUND TRADE INFO */}
                    {req.trade_id && (
                      <div className="pt-2 border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="text-[#17191F]">
                          Escrow <strong className="font-mono">#{req.trade_id}</strong> · Trạng thái đồng bộ:{' '}
                          <strong>{req.synced_state || 'Đã liên kết'}</strong>
                        </div>
                        <Link
                          href={`/trade/${req.trade_id}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                        >
                          <span>Mở chi tiết Escrow #{req.trade_id}</span>
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* EDIT LISTING MODAL */}
      {editingListing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-listing-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h2 id="edit-listing-title" className="text-lg font-bold text-[#17191F]">
                Chỉnh sửa tin đăng ({editingListing.sku})
              </h2>
              <button
                type="button"
                onClick={() => setEditingListing(null)}
                aria-label="Đóng hộp thoại chỉnh sửa"
                className="p-1.5 rounded-lg hover:bg-[#F7F8FA] text-[#525866] cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label htmlFor="edit-sku" className="block text-xs font-semibold text-[#17191F]">
                    SKU *
                  </label>
                  <input
                    id="edit-sku"
                    type="text"
                    required
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs font-mono text-[#17191F]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-cat" className="block text-xs font-semibold text-[#17191F]">
                    Danh mục
                  </label>
                  <select
                    id="edit-cat"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as ListingCategory)}
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#17191F]"
                  >
                    {LISTING_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-cond" className="block text-xs font-semibold text-[#17191F]">
                    Tình trạng
                  </label>
                  <select
                    id="edit-cond"
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value as ListingCondition)}
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#17191F]"
                  >
                    {LISTING_CONDITIONS.map((cond) => (
                      <option key={cond} value={cond}>
                        {CONDITION_LABELS[cond]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="edit-title" className="block text-xs font-semibold text-[#17191F]">
                  Tên sản phẩm *
                </label>
                <input
                  id="edit-title"
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-sm text-[#17191F]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="edit-price" className="block text-xs font-semibold text-[#17191F]">
                    Giá (AVAX) *
                  </label>
                  <input
                    id="edit-price"
                    type="text"
                    inputMode="decimal"
                    required
                    value={editPriceAvax}
                    onChange={(e) => setEditPriceAvax(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-sm font-mono text-[#17191F]"
                  />
                  {editPricePreview.valid && editPricePreview.depositAvax && (
                    <p className="text-[11px] text-[#2947B5] font-semibold">
                      Cọc 30% mỗi bên: {editPricePreview.depositAvax} AVAX
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-qty" className="block text-xs font-semibold text-[#17191F]">
                    Tổng số lượng (tối thiểu {Math.max(1, editingListing.quantity_reserved + editingListing.quantity_sold)})
                  </label>
                  <input
                    id="edit-qty"
                    type="number"
                    min={Math.max(1, editingListing.quantity_reserved + editingListing.quantity_sold)}
                    max={10000}
                    required
                    value={editQtyTotal}
                    onChange={(e) => setEditQtyTotal(Number(e.target.value) || 1)}
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-sm text-[#17191F]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="edit-desc" className="block text-xs font-semibold text-[#17191F]">
                  Mô tả
                </label>
                <textarea
                  id="edit-desc"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#17191F]"
                />
              </div>

              <MultiImageUploader
                images={editImages}
                onChange={setEditImages}
                disabled={isSavingEdit}
              />

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setEditingListing(null)}
                  className="px-4 py-2 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] text-xs font-semibold text-[#17191F] cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold cursor-pointer"
                >
                  {isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default function SellPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-8 text-center text-sm text-[#525866]">
          Đang tải Kênh người bán...
        </div>
      }
    >
      <SellerStudioContent />
    </Suspense>
  );
}
