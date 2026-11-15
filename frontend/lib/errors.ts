export type TxErrorCategory = 'user_rejected' | 'contract_revert' | 'rpc' | 'unknown';

export interface ClassifiedTxError {
  category: TxErrorCategory;
  isUserRejected: boolean;
  message: string;
}

const USER_REJECTED_PATTERNS =
  /user\s+rejected|action[\s_-]*rejected|rejected\s+the\s+request|rejected\s+by\s+user|user\s+denied|denied\s+by\s+user|user\s+declined|declined\s+by\s+user|(?:transaction|request|signature|sign)\s+(?:was\s+)?(?:rejected|declined|canceled|cancelled)|canceled\s+by\s+user|cancelled\s+by\s+user|user\s+canceled|user\s+cancelled|closed\s+by\s+user|đã từ chối|từ chối ký|từ chối giao dịch/i;

const CONTRACT_ERROR_RULES: Array<[RegExp, string]> = [
  [/invalid buyer/i, 'Địa chỉ người mua không hợp lệ (trống hoặc trùng với ví của bạn).'],
  [/itemValue too small/i, 'Giá trị món hàng quá nhỏ (cọc phải > 0).'],
  [/violator not a party/i, 'Bên bị xử phạt phải là Người bán, Người mua, hoặc địa chỉ 0.'],
  [/not a party/i, 'Ví của bạn không thuộc giao dịch này.'],
  [/wrong state/i, 'Giao dịch không ở bước cho phép thao tác này — vui lòng tải lại trang.'],
  [/wrong deposit amount/i, 'Số tiền nạp cọc không khớp với số tiền yêu cầu.'],
  [/already\s*deposited/i, 'Bạn đã nạp cọc cho giao dịch này rồi.'],
  [/zero address/i, 'Địa chỉ không được là 0x0.'],
  [/evidence window closed/i, 'Đã quá hạn nộp bằng chứng.'],
  [/empty evidence/i, 'Bằng chứng không được để trống.'],
  [/evidence already submitted/i, 'Bạn đã nộp bằng chứng rồi (mỗi bên chỉ nộp 1 lần).'],
  [/dispute window still open/i, 'Thời gian mở khiếu nại vẫn đang mở.'],
  [/dispute window closed/i, 'Đã hết thời gian mở khiếu nại.'],
  [/trade flagged, cannot auto-resolve/i, 'AI đã gắn cờ cảnh báo rủi ro — cần mở tranh chấp để trọng tài xử lý.'],
  [/caller is not owner/i, 'Chỉ có trọng tài (owner hợp đồng) mới có quyền thực hiện.'],
  [/nothing to withdraw/i, 'Không có số dư nào chờ rút.'],
];

const RPC_ERROR_PATTERNS =
  /http request failed|failed to fetch|networkerror|network error|timed out|timeout|econnrefused|enotfound|could not coalesce|missing revert data|too many requests|rate limit|status:\s*(?:429|502|503|504)/i;

interface ErrorSignals {
  codes: Set<number | string>;
  names: string[];
  texts: string[];
  primaryText: string;
}

function collectErrorSignals(error: unknown): ErrorSignals {
  const codes = new Set<number | string>();
  const names: string[] = [];
  const texts: string[] = [];
  const visited = new Set<unknown>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }];

  let primaryText = '';

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { value, depth } = current;
    if (value == null || depth > 10) continue;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        if (!primaryText) primaryText = trimmed;
        texts.push(trimmed);
      }
      continue;
    }

    if (typeof value !== 'object') {
      const str = String(value).trim();
      if (str) {
        if (!primaryText) primaryText = str;
        texts.push(str);
      }
      continue;
    }

    if (visited.has(value)) continue;
    visited.add(value);

    const record = value as Record<string, unknown>;
    if (typeof record.code === 'number' || typeof record.code === 'string') {
      codes.add(record.code);
    }
    if (typeof record.name === 'string' && record.name.trim()) {
      names.push(record.name.trim());
    }

    for (const field of ['shortMessage', 'details', 'reason', 'message'] as const) {
      const candidate = record[field];
      if (typeof candidate === 'string' && candidate.trim()) {
        const trimmed = candidate.trim();
        if (!primaryText) primaryText = trimmed;
        texts.push(trimmed);
      }
    }

    if (record.cause !== undefined) {
      queue.push({ value: record.cause, depth: depth + 1 });
    }
    if (record.data !== undefined && typeof record.data === 'object') {
      queue.push({ value: record.data, depth: depth + 1 });
    }
    if (record.info !== undefined && typeof record.info === 'object') {
      const infoObj = record.info as Record<string, unknown>;
      if (infoObj.error !== undefined) {
        queue.push({ value: infoObj.error, depth: depth + 1 });
      }
    }
  }

  return {
    codes,
    names,
    texts,
    primaryText: primaryText || String(error),
  };
}

function matchesUserRejectionSignals(signals: ErrorSignals): boolean {
  if (signals.codes.has(4001) || signals.codes.has('ACTION_REJECTED')) return true;
  if (signals.names.some((name) => /UserRejectedRequestError/i.test(name))) return true;
  return signals.texts.some((text) => USER_REJECTED_PATTERNS.test(text));
}

/**
 * Returns true if the error (including nested Viem/EIP-1193 causes) represents
 * an intentional wallet signing/transaction rejection by the user.
 */
export function isTxUserRejected(error: unknown): boolean {
  if (!error) return false;
  return matchesUserRejectionSignals(collectErrorSignals(error));
}

/**
 * Distinguishes wallet user rejections, smart contract reverts, and RPC/network failures
 * into a structured classification and user-friendly Vietnamese message.
 */
export function classifyContractError(error: unknown): ClassifiedTxError {
  if (!error) {
    return {
      category: 'unknown',
      isUserRejected: false,
      message: 'Đã có lỗi xảy ra.',
    };
  }

  const signals = collectErrorSignals(error);

  if (matchesUserRejectionSignals(signals)) {
    return {
      category: 'user_rejected',
      isUserRejected: true,
      message: 'Bạn đã từ chối ký giao dịch trên ví. Giao dịch chưa được gửi đi.',
    };
  }

  const combinedText = signals.texts.join('\n');

  for (const [pattern, friendlyMsg] of CONTRACT_ERROR_RULES) {
    if (pattern.test(combinedText)) {
      return {
        category: 'contract_revert',
        isUserRejected: false,
        message: friendlyMsg,
      };
    }
  }

  if (
    signals.codes.has(-32002) ||
    /already processing|request already pending|pending.*permission/i.test(combinedText)
  ) {
    return {
      category: 'rpc',
      isUserRejected: false,
      message: 'Ví đang có một yêu cầu chờ xác nhận. Vui lòng mở ví để kiểm tra.',
    };
  }

  if (/chain mismatch|does not match the target chain|wrong network/i.test(combinedText)) {
    return {
      category: 'rpc',
      isUserRejected: false,
      message: 'Ví đang kết nối sai mạng blockchain. Vui lòng chuyển sang đúng mạng rồi thử lại.',
    };
  }

  if (/insufficient funds|exceeds the balance|exceeds balance/i.test(combinedText)) {
    return {
      category: 'rpc',
      isUserRejected: false,
      message: 'Số dư AVAX trong ví không đủ để thực hiện giao dịch và trả phí gas.',
    };
  }

  if (/nonce too low|replacement transaction underpriced|already known/i.test(combinedText)) {
    return {
      category: 'rpc',
      isUserRejected: false,
      message: 'Xung đột thứ tự giao dịch (nonce) trên mạng RPC. Vui lòng đợi vài giây rồi thử lại.',
    };
  }

  const hasRpcTransportCause =
    signals.names.some((name) => /^(HttpRequestError|TimeoutError|RpcRequestError|RpcError)$/i.test(name)) ||
    signals.codes.has(-32603) ||
    signals.codes.has(-32000) ||
    signals.codes.has(-32005) ||
    RPC_ERROR_PATTERNS.test(combinedText);

  if (hasRpcTransportCause) {
    return {
      category: 'rpc',
      isUserRejected: false,
      message: 'Kết nối tới mạng blockchain (RPC) đang gặp sự cố hoặc quá tải. Vui lòng thử lại sau.',
    };
  }

  const hasContractRevertSignal =
    signals.names.some((name) =>
      /ContractFunctionRevertedError|ContractFunctionExecutionError|CallExecutionError/i.test(name)
    ) || /execution reverted|reverted with|giao dịch bị revert/i.test(combinedText);

  if (hasContractRevertSignal) {
    return {
      category: 'contract_revert',
      isUserRejected: false,
      message: 'Giao dịch bị Smart Contract từ chối (trạng thái hoặc tham số không hợp lệ).',
    };
  }

  return {
    category: 'unknown',
    isUserRejected: false,
    message: signals.primaryText.slice(0, 160),
  };
}

export function getReadableError(error: unknown): string {
  return classifyContractError(error).message;
}
