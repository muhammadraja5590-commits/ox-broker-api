const express = require('express');
const cors = require('cors');
const { MARKETS, candles, livePrices, currentCandle } = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

function findMarket(symbol) { return MARKETS.find((m) => m.symbol === symbol); }

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    markets: MARKETS.map(m => m.symbol),
    disclaimer: 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.',
  });
});

// All markets
app.get('/api/markets', (_req, res) => {
  const result = MARKETS.map((m) => {
    const sym = m.symbol;
    const price = livePrices[sym];
    return {
      symbol: sym, name: m.name, price,
      bid: parseFloat((price - m.spread / 2).toFixed(8)),
      ask: parseFloat((price + m.spread / 2).toFixed(8)),
      spread: m.spread,
      high: currentCandle[sym] ? currentCandle[sym].high : price,
      low: currentCandle[sym] ? currentCandle[sym].low : price,
      change: parseFloat((price - m.basePrice).toFixed(8)),
      changePercent: parseFloat((((price - m.basePrice) / m.basePrice) * 100).toFixed(4)),
    };
  });
  res.json({
    disclaimer: 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.',
    count: result.length, markets: result,
  });
});

// Single market
app.get('/api/markets/:symbol', (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const market = findMarket(symbol);
  if (!market) {
    return res.status(404).json({
      error: 'Invalid symbol',
      message: `Market "${symbol}" not found. Available: ${MARKETS.map(m => m.symbol).join(', ')}`,
    });
  }
  const price = livePrices[symbol];
  const c = currentCandle[symbol];
  res.json({
    disclaimer: 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.',
    symbol, name: market.name, price,
    bid: parseFloat((price - market.spread / 2).toFixed(8)),
    ask: parseFloat((price + market.spread / 2).toFixed(8)),
    spread: market.spread,
    high: c ? c.high : price,
    low: c ? c.low : price,
    open: c ? c.open : price,
    change: parseFloat((price - market.basePrice).toFixed(8)),
    changePercent: parseFloat((((price - market.basePrice) / market.basePrice) * 100).toFixed(4)),
  });
});

// Candles
app.get('/api/candles/:symbol', (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const market = findMarket(symbol);
  if (!market) {
    return res.status(404).json({
      error: 'Invalid symbol',
      message: `Market "${symbol}" not found. Available: ${MARKETS.map(m => m.symbol).join(', ')}`,
    });
  }
  const timeframe = req.query.timeframe || '1m';
  const limit = parseInt(req.query.limit, 10) || 100;
  const symbolCandles = candles[symbol] || [];
  const result = symbolCandles.slice(-limit);
  const live = currentCandle[symbol];
  if (live && (result.length === 0 || result[result.length - 1].time !== live.time)) result.push(live);
  res.json({
    disclaimer: 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.',
    symbol, timeframe, count: result.length, candles: result,
  });
});

// 404
app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });

app.listen(PORT, HOST, () => {
  console.log(`OX BROKER API running on ${HOST}:${PORT}`);
  console.log('DISCLAIMER: Simulated OTC DEMO data only.');
});
