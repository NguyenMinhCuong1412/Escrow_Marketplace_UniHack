export interface TradeData {
  id: bigint;
  seller: `0x${string}`;
  buyer: `0x${string}`;
  itemValue: bigint;
  depositRequired: bigint;
  sellerDeposit: bigint;
  buyerDeposit: bigint;
  nonce: `0x${string}`;
  sellerEvidenceHash: `0x${string}`;
  buyerEvidenceHash: `0x${string}`;
  reportHash: `0x${string}`;
  riskScore: number;
  flagged: boolean;
  createdAt: bigint;
  evidenceDeadline: bigint;
  disputeDeadline: bigint;
  state: number;
}

export type TradeRole = 'seller' | 'buyer' | 'viewer';
