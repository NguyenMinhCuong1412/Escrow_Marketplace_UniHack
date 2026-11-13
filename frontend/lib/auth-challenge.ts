import type { Address } from 'viem';

/**
 * Builds the standard human-readable SIWE-compliant challenge message.
 */
export function buildAuthChallengeMessage(address: Address, nonce: string, chainId: number): string {
  return [
    'Escrow Marketplace Authentication Challenge',
    '',
    'Vui lòng ký thông điệp này để xác thực phiên làm việc an toàn trên Escrow Marketplace.',
    '',
    `Địa chỉ ví: ${address}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    '',
    'Lưu ý: Thao tác này không tốn phí gas và không gửi bất kỳ giao dịch on-chain nào.',
  ].join('\n');
}
