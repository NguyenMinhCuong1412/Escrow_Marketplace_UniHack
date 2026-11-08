#!/usr/bin/env bash
# E2E trên anvil local bằng cast: deploy → happy path (resolveClean) → dispute path
# (resolveDispute, phạt 5%) → timeout path (cancelOnEvidenceTimeout).
#
# Yêu cầu: anvil đang chạy ở 127.0.0.1:8545 (`anvil` trong terminal khác).
# Chạy từ thư mục contracts/:   bash script/e2e_anvil.sh
#
# Các private key dưới đây là key MẶC ĐỊNH CÔNG KHAI của anvil (test mnemonic),
# KHÔNG phải key thật — tuyệt đối không dùng cho Fuji/mainnet.
set -euo pipefail

RPC=${RPC_URL:-http://127.0.0.1:8545}
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil #0 (owner/arbiter)
AGENT_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d      # anvil #1
SELLER_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a     # anvil #2
BUYER_PK=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6      # anvil #3

AGENT=$(cast wallet address --private-key $AGENT_PK)
SELLER=$(cast wallet address --private-key $SELLER_PK)
BUYER=$(cast wallet address --private-key $BUYER_PK)

WIN=60   # cửa sổ thời gian 60s cho demo; tua bằng evm_increaseTime
TRADE_T='getTrade(uint256)((address,address,uint256,uint256,uint256,uint256,bytes32,bytes32,bytes32,bytes32,uint8,bool,uint64,uint64,uint64,uint8))'

step() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
send() { local pk=$1; shift; cast send --rpc-url "$RPC" --private-key "$pk" "$@" >/dev/null; }
call() { cast call --rpc-url "$RPC" "$@"; }
state() { call "$ESCROW" "$TRADE_T" "$1" | tr -d '()' | awk -F', ' '{print $NF}'; }
bal() { cast balance --rpc-url "$RPC" "$1"; }
warp() { cast rpc --rpc-url "$RPC" evm_increaseTime "$1" >/dev/null; cast rpc --rpc-url "$RPC" evm_mine >/dev/null; }
assert_eq() { if [ "$1" != "$2" ]; then echo "ASSERT FAIL: $3 (got '$1', want '$2')"; exit 1; else echo "  ok: $3"; fi; }

step "Deploy (windows = ${WIN}s)"
PRIVATE_KEY=$DEPLOYER_PK AGENT_ADDRESS=$AGENT \
EVIDENCE_WINDOW_SECS=$WIN ATTEST_WINDOW_SECS=$WIN DISPUTE_WINDOW_SECS=$WIN \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast >/dev/null
CHAIN_ID=$(cast chain-id --rpc-url "$RPC")
DEP=deployments/$CHAIN_ID.json
ESCROW=$(sed -n 's/.*"escrow": *"\(0x[0-9a-fA-F]*\)".*/\1/p' "$DEP")
TOKEN=$(sed -n 's/.*"token": *"\(0x[0-9a-fA-F]*\)".*/\1/p' "$DEP")
echo "  Escrow=$ESCROW  Token=$TOKEN"
assert_eq "$(call "$TOKEN" 'escrow()(address)')" "$ESCROW" "token.escrow == Escrow"
assert_eq "$(call "$ESCROW" 'agent()(address)')" "$AGENT" "escrow.agent == agent wallet"

ITEM=1000000000000000000          # 1 AVAX
DEPOSIT=300000000000000000        # 30%

new_funded_trade() {
  send $SELLER_PK "$ESCROW" 'createTrade(address,uint256)' "$BUYER" $ITEM
  local id=$(( $(call "$ESCROW" 'nextTradeId()(uint256)') - 1 ))
  send $SELLER_PK "$ESCROW" 'deposit(uint256)' $id --value $DEPOSIT
  send $BUYER_PK  "$ESCROW" 'deposit(uint256)' $id --value $DEPOSIT
  echo $id
}

# ---------------------------------------------------------------- happy path
step "Happy path: create → deposit x2 → evidence x2 → attest(clean) → resolveClean"
S0=$(bal $SELLER); B0=$(bal $BUYER)
ID=$(new_funded_trade)
assert_eq "$(state $ID)" "1" "state = AwaitingEvidence"
assert_eq "$(call "$TOKEN" 'totalSupply()(uint256)' | awk '{print $1}')" "600000000000000000" "CDU minted 1:1 (0.6)"
send $SELLER_PK "$ESCROW" 'submitEvidence(uint256,bytes32)' $ID "$(cast keccak seller-packing-cid)"
send $BUYER_PK  "$ESCROW" 'submitEvidence(uint256,bytes32)' $ID "$(cast keccak buyer-unbox-cid)"
send $AGENT_PK  "$ESCROW" 'attest(uint256,uint8,bool,bytes32)' $ID 12 false "$(cast keccak report-1)"
assert_eq "$(state $ID)" "2" "state = Attested"
if cast send --rpc-url "$RPC" --private-key $SELLER_PK "$ESCROW" 'resolveClean(uint256)' $ID >/dev/null 2>&1; then
  echo "ASSERT FAIL: resolveClean must revert inside dispute window"; exit 1
else echo "  ok: resolveClean reverts while dispute window open"; fi
warp $((WIN + 1))
send $SELLER_PK "$ESCROW" 'resolveClean(uint256)' $ID
assert_eq "$(state $ID)" "4" "state = Resolved"
assert_eq "$(call "$TOKEN" 'totalSupply()(uint256)' | awk '{print $1}')" "0" "CDU fully burned"
assert_eq "$(call "$ESCROW" 'reputationOf(address)(uint256)' $SELLER)" "51" "seller reputation 51"
S1=$(bal $SELLER); B1=$(bal $BUYER)
echo "  seller gas spent: $(cast from-wei $((S0 - S1))) AVAX, buyer gas spent: $(cast from-wei $((B0 - B1))) AVAX (cọc đã hoàn đủ)"

# ---------------------------------------------------------------- dispute path
step "Dispute path: attest(flagged) → fileComplaint → resolveDispute(buyer) → phạt 5%"
ID=$(new_funded_trade)
send $SELLER_PK "$ESCROW" 'submitEvidence(uint256,bytes32)' $ID "$(cast keccak seller-packing-cid-2)"
send $BUYER_PK  "$ESCROW" 'submitEvidence(uint256,bytes32)' $ID "$(cast keccak buyer-unbox-cid-2)"
send $AGENT_PK  "$ESCROW" 'attest(uint256,uint8,bool,bytes32)' $ID 88 true "$(cast keccak report-2)"
send $SELLER_PK "$ESCROW" 'fileComplaint(uint256)' $ID
assert_eq "$(state $ID)" "3" "state = Disputed"
S0=$(bal $SELLER); B0=$(bal $BUYER)
send $DEPLOYER_PK "$ESCROW" 'resolveDispute(uint256,address)' $ID "$BUYER"
S1=$(bal $SELLER); B1=$(bal $BUYER)
assert_eq "$(state $ID)" "4" "state = Resolved"
assert_eq "$((S1 - S0))" "315000000000000000" "seller nhận lại 0.3 + phạt 0.015"
assert_eq "$((B1 - B0))" "285000000000000000" "buyer nhận lại 0.3 - 0.015"
assert_eq "$(call "$ESCROW" 'reputationOf(address)(uint256)' $BUYER)" "41" "buyer reputation 51-10"
assert_eq "$(call "$ESCROW" 'reputationOf(address)(uint256)' $SELLER)" "56" "seller reputation 51+5"

# ---------------------------------------------------------------- timeout path
step "Timeout path: chỉ seller nộp bằng chứng → quá hạn → cancelOnEvidenceTimeout"
ID=$(new_funded_trade)
send $SELLER_PK "$ESCROW" 'submitEvidence(uint256,bytes32)' $ID "$(cast keccak seller-packing-cid-3)"
warp $((WIN + 1))
send $DEPLOYER_PK "$ESCROW" 'cancelOnEvidenceTimeout(uint256)' $ID
assert_eq "$(state $ID)" "5" "state = Cancelled"

step "Escrow balance cuối cùng"
assert_eq "$(bal "$ESCROW")" "0" "escrow không còn giữ AVAX"
echo
echo "E2E PASSED"
