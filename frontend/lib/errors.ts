export function getReadableError(error: unknown): string {
  if (!error) return 'Đã có lỗi xảy ra.';

  const errStr = (error as { shortMessage?: string; message?: string; details?: string })?.shortMessage ||
                 (error as { message?: string })?.message ||
                 String(error);

  if (/user rejected/i.test(errStr) || /action rejected/i.test(errStr)) {
    return 'Bạn đã từ chối ký giao dịch trên ví.';
  }
  if (/invalid buyer/i.test(errStr)) {
    return 'Địa chỉ người mua không hợp lệ (trống hoặc trùng với ví của bạn).';
  }
  if (/itemValue too small/i.test(errStr)) {
    return 'Giá trị món hàng quá nhỏ (cọc phải > 0).';
  }
  if (/not a party/i.test(errStr)) {
    return 'Ví của bạn không thuộc giao dịch này.';
  }
  if (/wrong state/i.test(errStr)) {
    return 'Giao dịch không ở bước cho phép thao tác này — vui lòng tải lại trang.';
  }
  if (/wrong deposit amount/i.test(errStr)) {
    return 'Số tiền nạp cọc không khớp với số tiền yêu cầu.';
  }
  if (/already\s*deposited/i.test(errStr)) {
    return 'Bạn đã nạp cọc cho giao dịch này rồi.';
  }
  if (/violator not a party/i.test(errStr)) {
    return 'Bên bị xử phạt phải là Người bán, Người mua, hoặc địa chỉ 0.';
  }
  if (/zero address/i.test(errStr)) {
    return 'Địa chỉ không được là 0x0.';
  }
  if (/evidence window closed/i.test(errStr)) {
    return 'Đã quá hạn nộp bằng chứng.';
  }
  if (/empty evidence/i.test(errStr)) {
    return 'Bằng chứng không được để trống.';
  }
  if (/evidence already submitted/i.test(errStr)) {
    return 'Bạn đã nộp bằng chứng rồi (mỗi bên chỉ nộp 1 lần).';
  }
  if (/dispute window still open/i.test(errStr)) {
    return 'Thời gian mở khiếu nại vẫn đang mở.';
  }
  if (/dispute window closed/i.test(errStr)) {
    return 'Đã hết thời gian mở khiếu nại.';
  }
  if (/trade flagged, cannot auto-resolve/i.test(errStr)) {
    return 'AI đã gắn cờ cảnh báo rủi ro — cần mở tranh chấp để trọng tài xử lý.';
  }
  if (/caller is not owner/i.test(errStr)) {
    return 'Chỉ có trọng tài (owner hợp đồng) mới có quyền thực hiện.';
  }
  if (/nothing to withdraw/i.test(errStr)) {
    return 'Không có số dư nào chờ rút.';
  }

  return (error as { shortMessage?: string })?.shortMessage || errStr.slice(0, 160);
}
