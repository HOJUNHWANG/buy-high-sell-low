
// scripts/stress_test.ts

interface Position {
  shares: number;
  avg_cost: number;
  borrowed: number;
  leverage: number;
  side: 'long' | 'short';
}

interface Account {
  cash_balance: number;
}

const EPSILON = 0.01; // $0.01 tolerance for buy
const DUST_EPSILON = 0.000001; // Share deletion threshold

// Mock LOGIC (matching app/api/paper/*)

function calculateBuy(account: Account, price: number, shares: number, leverage: number) {
  const margin = shares * price;
  const borrowed = margin * (leverage - 1);
  
  // Bug fix: margin > account.cash_balance + EPSILON
  if (margin > account.cash_balance + EPSILON) {
    return { error: 'Insufficient funds' };
  }
  
  return {
    newBalance: account.cash_balance - margin,
    borrowedAdded: borrowed
  };
}

function calculateSell(account: Account, position: Position, sellShares: number, currentPrice: number) {
  const sellRatio = sellShares / position.shares;
  const borrowedRepay = position.borrowed * sellRatio;
  const grossProceeds = sellShares * currentPrice;
  const netProceeds = grossProceeds - borrowedRepay;
  const originalMargin = (sellShares * position.avg_cost) - borrowedRepay;
  const realizedPnl = netProceeds - originalMargin;
  
  const newShares = position.shares - sellShares;
  const shouldDelete = newShares <= DUST_EPSILON;
  
  return {
    newBalance: account.cash_balance + netProceeds,
    realizedPnl,
    shouldDelete,
    remainingShares: Math.max(0, newShares)
  };
}

function calculateCover(account: Account, position: Position, coverShares: number, currentPrice: number) {
  const sellRatio = coverShares / position.shares;
  const borrowedRepay = position.borrowed * sellRatio;
  const costBasis = coverShares * position.avg_cost;
  const costToCover = coverShares * currentPrice;
  const shortPnl = costBasis - costToCover;
  const marginUsed = costBasis - borrowedRepay;
  const netProceeds = marginUsed + shortPnl;
  
  const newShares = position.shares - coverShares;
  const shouldDelete = newShares <= DUST_EPSILON;
  
  return {
    newBalance: account.cash_balance + netProceeds,
    realizedPnl: shortPnl,
    shouldDelete,
    remainingShares: Math.max(0, newShares)
  };
}

// TEST CASES

function runTests() {
  console.log("🚀 Starting Paper Trading Logic Stress Test...\n");

  // CASE 1: Exact Balance Buy (The 312 case)
  console.log("TEST 1: Exact Balance Buy (312 needed, 312 have)");
  let acc1: Account = { cash_balance: 312.0 };
  let buy1 = calculateBuy(acc1, 31.2, 10, 1);
  if (!('error' in buy1)) {
    console.log("✅ PASS: Can buy when margin equals balance exactly.");
  } else {
    console.error("❌ FAIL: Buying for exact balance failed.");
  }

  // CASE 2: Floating point risk (312 needed, 312.0000000001 reported)
  console.log("TEST 2: Floating Point Resilience (Margin is slightly higher than balance)");
  let acc2: Account = { cash_balance: 312.0 };
  let buy2 = calculateBuy(acc2, 31.200000000001, 10, 1);
  if (!('error' in buy2)) {
    console.log("✅ PASS: Buy epsilon caught the floating point error.");
  } else {
    console.error("❌ FAIL: Still giving insufficient funds on micro-difference.");
  }

  // CASE 3: Short -> Cover -> Buy Long Switch
  console.log("TEST 3: Short to Long Switch Sequence");
  let acc3: Account = { cash_balance: 1000 };
  // Short 10 shares of MSFT @ 100
  let costBasis = 10 * 100;
  let pos3: Position = { shares: 10, avg_cost: 100, borrowed: 0, leverage: 1, side: 'short' };
  acc3.cash_balance -= 1000; // margin locked
  
  // Price drops to 80. Cover all.
  let cover3 = calculateCover(acc3, pos3, 10, 80);
  acc3.cash_balance = cover3.newBalance;
  console.log(` - Covered for profit. New balance: $${acc3.cash_balance} (Expected: 1200)`);
  
  if (acc3.cash_balance === 1200 && cover3.shouldDelete) {
    // Now try to Buy max with the new balance
    let buyLong = calculateBuy(acc3, 120, 10, 1);
    if (!('error' in buyLong)) {
      console.log("✅ PASS: Short-to-Long sequence successful with full reinvestment.");
    } else {
       console.error("❌ FAIL: Could not reinvest full balance after cover.");
    }
  }

  // CASE 4: Precision DUST Removal
  console.log("TEST 4: Dust Removal (Partial sells)");
  let pos4: Position = { shares: 1.0, avg_cost: 100, borrowed: 0, leverage: 1, side: 'long' };
  let acc4: Account = { cash_balance: 0 };
  
  // Sell 0.99999999 shares
  let sell4 = calculateSell(acc4, pos4, 0.99999999, 100);
  if (sell4.shouldDelete) {
    console.log("✅ PASS: Dust shares triggered deletion correctly.");
  } else {
    console.error(`❌ FAIL: Dust remains! Shares left: ${sell4.remainingShares}`);
  }

  // CASE 5: High Leverage Liquidation Threshold
  console.log("TEST 5: 10x Leverage Margin Check");
  let acc5: Account = { cash_balance: 1000 };
  // Want to buy $10,000 worth (leveraged 10x)
  // user puts up 1000 (margin), borrows 9000
  let buy5 = calculateBuy(acc5, 100, 10, 10);
  if (!('error' in buy5)) {
    console.log(`✅ PASS: Correctly authorized 10x leverage trade with maxed margin. New Balance: ${buy5.newBalance}`);
  } else {
    console.error("❌ FAIL: 10x leverage buy failed with exact margin.");
  }

}

runTests();
