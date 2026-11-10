import { keccak256, toBytes } from 'viem';

export interface VerifyReportDetails {
  embedding_backend?: string;
  expected_nonce_short?: string;
  nonce_seller?: {
    expected: string;
    found: boolean;
    best_candidate?: string;
    edit_distance?: number;
  };
  nonce_buyer?: {
    expected: string;
    found: boolean;
    best_candidate?: string;
    edit_distance?: number;
  };
  inliers_listing_seller?: number;
  inliers_listing_buyer?: number;
  buyer_evidence_kind?: 'image' | 'video';
  buyer_frames_checked?: number;
  buyer_best_frame_index?: number;
  phash_seller?: string;
  phash_buyer?: string;
  listing_reused_as_packing?: boolean;
  seller_reputation?: number;
  buyer_reputation?: number;
  item_value_wei?: string;
  listing_hash?: string;
}

export interface VerifyReport {
  trade_id: number;
  version: number;
  risk_score: number;
  flagged: boolean;
  phash_reused: boolean;
  phash_match_idx: number | null;
  embedding_similarity: number;
  identity_match_inliers: number;
  nonce_ok_seller: boolean;
  nonce_ok_buyer: boolean;
  notes: string[];
  details: VerifyReportDetails;
  listing_hash?: string;
}

export interface VerifyResponse {
  trade_id: number;
  report: VerifyReport;
  report_hash: string;
  report_json: string;
  attested: boolean;
  tx_hash: string | null;
  match_visual_png_b64: string | null;
  duration_ms: number;
  listing_hash?: string;
  evidence?: {
    listing_image_url: string;
    seller_evidence_url: string;
    buyer_evidence_url: string;
  };
}

export interface HealthResponse {
  ok: boolean;
  embedding_backend?: string;
  known_hashes?: number;
  tesseract?: boolean;
  chain_id?: number;
  escrow?: string;
  agent?: string;
  agent_balance_wei?: string;
  agent_matches_contract?: boolean;
  error?: string;
}

export function backendBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
  return url.replace(/\/+$/, '');
}

/** Gọi verify-evidence thông qua proxy server /api/verify để bảo vệ ATTEST_API_KEY. */
export async function verifyEvidence(params: {
  trade_id: number;
  listing_image_url: string;
  seller_evidence_url: string;
  buyer_evidence_url: string;
}): Promise<VerifyResponse> {
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail || `AI verification failed (HTTP ${res.status})`;
    throw new Error(detail);
  }

  return data as VerifyResponse;
}

/** Lấy report đã lưu từ backend GET /report/{id}. */
export async function getReport(tradeId: number | bigint): Promise<VerifyResponse> {
  const res = await fetch(`${backendBaseUrl()}/report/${tradeId.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || `Không tìm thấy report cho trade #${tradeId.toString()}`);
  }
  return res.json();
}

/** Kiểm tra health của backend. */
export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${backendBaseUrl()}/health`, {
    cache: 'no-store',
  });
  return res.json();
}

/**
 * AC-06: Verify on-chain.
 * Tính keccak256(toBytes(report_json)) và đối chiếu với reportHash on-chain.
 */
export function verifyReportOnChain(
  reportJson: string,
  reportHashOnChain: string
): { matches: boolean; computedHash: string; expectedHash: string } {
  try {
    const computedHash = keccak256(toBytes(reportJson)).toLowerCase();
    const expectedHash = (reportHashOnChain || '').toLowerCase();
    const matches = Boolean(expectedHash && computedHash === expectedHash);
    return { matches, computedHash, expectedHash };
  } catch {
    return { matches: false, computedHash: '', expectedHash: reportHashOnChain || '' };
  }
}
