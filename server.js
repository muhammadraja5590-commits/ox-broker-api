const express = require('express');
const cors = require('cors');
const { MARKETS, candles, livePrices, currentCandle } = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------- Middleware ---------------

app.use(cors());
app.use(express.json());

// --------------- Helpers ---------------

function findMarket(symbol) {
  return MARKETS.find((m) => m.symbol === symbol);
}

// --------------- Routes ---------------

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    markets: MARKETS.length,
    disclaimer: 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.',
  });
});

// All markets with live prices
app.get('/api/markets', (_req, res) => {
  const result = MARKETS.map((m) => {
    const sym = m.symbol;
    const price = livePrices[sym];
    return {
      symbol: sym,
      price,
      bid: price - m.spread / 2,
      ask: price + m.spread / 2,
      spread: m.spread,
      high: currentCandle[sym] ? currentCandle[sym].high : price,
      low: currentCandle[sym] ? currentCandle[sym].low : price,
      change: price - m.basePrice,
      changePercent: ((price - m.basePrice) / m.basePrice) * 100,
    };
  });

  res.json({
    disclaimer: 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.',
    count: result.length,
    markets: result,
  });
});

// Single market by symbol
app.get('/api/markets/:symbol', (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const market = findMarket(symbol);

  if (!market) {
    return res.status(404).json({
      error: 'Invalid symbol',
      message: `Market "${symbol}" not found. Available symbols: ${MARKETS.map((m) => m.symbol).join(', ')}`,
    });
  }

  const price = livePrices[symbol];
  const c = currentCandle[symbol];

  res.json({
    disclaimer: 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.',
    symbol,
    price,
    bid: price - market.spread / 2,
    ask: price + market.spread / 2,
    spread: market.spread,
    high: c ? c.high : price,
    low: c ? c.low : price,
    open: c ? c.open : price,
    change: price - market.basePrice,
    changePercent: ((price - market.basePrice) / market.basePrice) * 100,
  });
});

// Candles for a symbol
app.get('/api/candles/:symbol', (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const market = findMarket(symbol);

  if (!market) {
    return res.status(404).json({
      error: 'Invalid symbol',
      message: `Market "${symbol}" not found. Available symbols: ${MARKETS.map((m) => m.symbol).join(', ')}`,
    });
  }

  const timeframe = req.query.timeframe || '1m';
  const limit = parseInt(req.query.limit, 10) || 100;

  const symbolCandles = candles[symbol] || [];
  const result = symbolCandles.slice(-limit);

  // Append current (in-progress) candle if it doesn't match the last one
  const live = currentCandle[symbol];
  if (live && (result.length === 0 || result[result.length - 1].time !== live.time)) {
    result.push(live);
  }

  res.json({
    disclaimer: 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.',
    symbol,
    timeframe,
    count: result.length,
    candles: result,
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --------------- Start ---------------

app.listen(PORT, () => {
  console.log(`OX BROKER API running on port ${PORT}`);
  console.log('DISCLAIMER: Simulated OTC DEMO data only — NOT real financial market data.');
});
