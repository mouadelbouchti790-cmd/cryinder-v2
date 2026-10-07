// One-time on-chain setup for the Cryinder 1% fee, baked into every swap
// transaction via Jupiter's Referral Program (single signature, fee can
// never be skipped).
//
// WHY THIS SCRIPT: the previous referral account (CHLEVPab...) was created
// under the WRONG project, so /order 400s with:
//   "Please check that referralAccount is initialized under REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3
//    for project DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc"
// and no SOL referral token account exists, so even a valid referral
// account would collect ZERO fees (Jupiter silently skips the fee).
//
// WHAT THIS SCRIPT DOES (idempotent — safe to re-run):
//   1. Creates a referral account under the Jupiter Ultra project with
//      partner = your treasury wallet (fees ultimately withdrawable there)
//   2. Creates referral token accounts for SOL, USDC, USDT (fee-mint
//      priority order), so Jupiter can always collect the fee in a mint
//      that has an account
//   3. Verifies the setup with a live /order call and prints the exact
//      .env line to use
//
// Usage:
//   WALLET_PRIVATE_KEY=<treasury base58 secret key> node scripts/create-referral-account.mjs
//
// ⚠️  The private key must be the CRYINDER_TREASURY_WALLET key
//    (matches CRYINDER_TREASURY_PUBLIC_KEY in .env) so fees are
//    withdrawable by the treasury.

import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { ReferralProvider } from '@jup-ag/referral-sdk';
import bs58 from 'bs58';

const RPC =
  process.env.HELIUS_RPC_URL ||
  (process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : '');
const API_KEY = process.env.JUPITER_API_KEY || '';
// Jupiter Ultra project — the ONLY project the Swap API accepts.
const PROJECT = new PublicKey('DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc');
// Fee mints in Jupiter's fee-mint priority order (SOL first).
const FEE_MINTS = [
  ['SOL', 'So11111111111111111111111111111111111111112'],
  ['USDC', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
  ['USDT', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'],
];

if (!RPC) {
  console.error('Set HELIUS_API_KEY (or HELIUS_RPC_URL) first.');
  process.exit(1);
}

const key = process.env.WALLET_PRIVATE_KEY;
if (!key) {
  console.error('Set WALLET_PRIVATE_KEY (base58) first.');
  process.exit(1);
}

const wallet = Keypair.fromSecretKey(bs58.decode(key));
const EXPECTED_TREASURY = process.env.CRYINDER_TREASURY_PUBLIC_KEY;
if (EXPECTED_TREASURY && wallet.publicKey.toBase58() !== EXPECTED_TREASURY) {
  console.error(
    `⚠️  This wallet is NOT the Cryinder treasury (${EXPECTED_TREASURY}).\n` +
    '    Use the treasury key so fees are withdrawable by the treasury.',
  );
  process.exit(1);
}

const connection = new Connection(RPC, 'confirmed');
const provider = new ReferralProvider(connection);

console.log('Payer (treasury):', wallet.publicKey.toBase58());
console.log('Project (Jupiter Ultra):', PROJECT.toBase58());

// 1. Referral account (name-derived PDA, deterministic + idempotent)
console.log('\n1/4 Creating referral account under Jupiter Ultra project...');
const { tx, referralAccountPubKey } =
  await provider.initializeReferralAccountWithName({
    payerPubKey: wallet.publicKey,
    partnerPubKey: wallet.publicKey, // treasury = partner (fee admin)
    projectPubKey: PROJECT,
    name: 'Cryinder',
  });

// Check if it already exists before sending (idempotency).
let referralExists = false;
try {
  await provider.getReferralAccount(referralAccountPubKey);
  referralExists = true;
  console.log('   Referral account already exists:', referralAccountPubKey.toBase58());
} catch {
  await sendAndConfirmTransaction(connection, tx, [wallet]);
  console.log('   Created referral account:', referralAccountPubKey.toBase58());
}

// 2. Referral token accounts for each fee mint
const tokenAccounts = [];
for (const [label, mint] of FEE_MINTS) {
  console.log(`\n${tokenAccounts.length + 2}/4 Creating ${label} referral token account...`);
  const mintPk = new PublicKey(mint);
  try {
    const tokenTx = await provider.initializeReferralTokenAccountV2({
      payerPubKey: wallet.publicKey,
      referralAccountPubKey,
      mint: mintPk,
    });
    // If it already exists, fetching it succeeds; the init tx is only sent on failure.
    let exists = false;
    const acct = await connection.getAccountInfo(tokenTx.tokenAccount);
    exists = !!acct;
    if (exists) {
      console.log('   Already exists:', tokenTx.tokenAccount.toBase58());
    } else {
      await sendAndConfirmTransaction(connection, tokenTx.tx, [wallet]);
      console.log('   Created:', tokenTx.tokenAccount.toBase58());
    }
    tokenAccounts.push(tokenTx.tokenAccount.toBase58());
  } catch (err) {
    console.error(`   ${label} failed:`, err?.message || err);
    process.exit(1);
  }
}

// 3. Verify on-chain state
console.log('\n3/4 Verifying on-chain state...');
const acc = await provider.getReferralAccount(referralAccountPubKey);
console.log('   partner:', acc.partner.toBase58(), acc.partner.toBase58() === wallet.publicKey.toBase58() ? '✓' : '✗ WRONG');
console.log('   project:', acc.project.toBase58(), acc.project.toBase58() === PROJECT.toBase58() ? '✓' : '✗ WRONG');

// 4. Verify with a live /order call
//    NOTE: use the fee fields, not `transaction` — a taker wallet without
//    balance returns 200 with errorCode 1 ("Insufficient funds") even when
//    the fee configuration is applied correctly.
console.log('\n4/4 Verifying with live /order call...');
const params = new URLSearchParams({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '100000000',
  taker: wallet.publicKey.toBase58(),
  referralAccount: referralAccountPubKey.toBase58(),
  referralFee: '100',
});
const res = await fetch(`https://api.jup.ag/swap/v2/order?${params}`, {
  headers: { 'x-api-key': API_KEY },
});
const data = await res.json().catch(() => ({}));
const feeApplied =
  res.ok &&
  Number(data.feeBps) >= 100 &&
  data.feeMint &&
  (!data.referralAccount || data.referralAccount === referralAccountPubKey.toBase58());
if (feeApplied) {
  console.log(
    '   ✓ Fee applied — feeBps:',
    data.feeBps,
    '| feeMint:',
    data.feeMint,
    '| referral:',
    data.referralAccount,
    data.errorCode !== undefined ? `(taker note: errorCode ${data.errorCode} — fee config is still correct)` : '',
  );
  console.log('\n✅ Setup complete. Put this in .env:');
  console.log(`   VITE_JUPITER_REFERRAL_ACCOUNT=${referralAccountPubKey.toBase58()}`);
  console.log('   (and restart the Vite dev server)');
} else {
  console.error('   ✗ /order failing:', res.status, JSON.stringify(data).slice(0, 400));
  process.exit(1);
}
