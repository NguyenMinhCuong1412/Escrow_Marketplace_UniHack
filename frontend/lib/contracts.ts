import EscrowArtifact from './abi/Escrow.json';
import CollectibleTokenArtifact from './abi/CollectibleToken.json';
import { isAddress } from 'viem';

export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 43113);

const rawEscrowAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS || '';
export const escrowAddress = (isAddress(rawEscrowAddress)
  ? rawEscrowAddress
  : '0x0000000000000000000000000000000000000000') as `0x${string}`;

const rawTokenAddress = process.env.NEXT_PUBLIC_TOKEN_ADDRESS || '';
export const tokenAddress = (isAddress(rawTokenAddress)
  ? rawTokenAddress
  : '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const deployBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || '0');

export const escrowAbi = (EscrowArtifact.abi || EscrowArtifact) as readonly unknown[];
export const tokenAbi = (CollectibleTokenArtifact.abi || CollectibleTokenArtifact) as readonly unknown[];
