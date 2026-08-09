const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { MARKETS, priceEngine, candleEngine } = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

// ============ Helpers ============

function findMarket(symbol) {
  return MARKETS.find((m) => m.symbol === symbol);
}

function getMarketSnapshot(m) {
  const sym = m.symbol;
  const price = priceEngine.getPrice(sym);
  const c = candleEngine.getCurrentCandle(sym, '1m');
  return {
    symbol: sym, name: m.name, price,
    direction: priceEngine.direction[sym],
    bid: parseFloat((price - m.spread / 2).toFixed(8)),
    ask: parseFloat((price + m.spread / 2).toFixed(8)),
    spread: m.spread,
    highPrice: m.highPrice,
    lowPrice: m.lowPrice,
    high: c ? c.high : price,
    low: c ? c.low : price,
    open: c ? c.open : price,
    change: parseFloat((price - m.basePrice).toFixed(8)),
    changePercent: parseFloat((((price - m.basePrice) / m.basePrice) * 100).toFixed(4)),
  };
}

const DISCLAIMER = 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.';

// ============ REST API Routes ============

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    markets: MARKETS.map(m => m.symbol),
    disclaimer: DISCLAIMER,
  });
});

// All markets with live prices
app.get('/api/markets', (_req, res) => {
  const result = MARKETS.map(getMarketSnapshot);
  res.json({
    disclaimer: DISCLAIMER,
    count: result.length,
    markets: result,
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
  res.json({ disclaimer: DISCLAIMER, ...getMarketSnapshot(market) });
});

// Candles — supports timeframe query param: 5s, 10s, 30s, 1m
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
  const result = candleEngine.getCandles(symbol, timeframe, limit);
  res.json({
    disclaimer: DISCLAIMER,
    symbol,
    timeframe,
    count: result.length,
    candles: result,
  });
});

// 404
app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });

// ============ HTTP + WebSocket Server ============

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  // Send full market snapshot on connect
  const snapshot = MARKETS.map(getMarketSnapshot);
  ws.send(JSON.stringify({ type: 'markets', data: snapshot }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    // Subscribe to specific symbol or all
    if (msg.type === 'subscribe' && msg.symbol) {
      ws._subscription = msg.symbol;
    } else if (msg.type === 'subscribe_all') {
      ws._subscription = 'ALL';
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

// Broadcast price ticks every second to all connected WS clients
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState !== 1) return; // 1 = OPEN

    if (ws._subscription === 'ALL') {
      const allPrices = MARKETS.map((m) => ({
        symbol: m.symbol,
        price: priceEngine.getPrice(m.symbol),
        direction: priceEngine.direction[m.symbol],
      }));
      ws.send(JSON.stringify({ type: 'tick_all', data: allPrices }));
    } else if (ws._subscription) {
      const sym = ws._subscription;
      const m = findMarket(sym);
      if (m) {
        ws.send(JSON.stringify({
          type: 'tick',
          data: {
            symbol: sym,
            price: priceEngine.getPrice(sym),
            direction: priceEngine.direction[sym],
            candle: candleEngine.getCurrentCandle(sym, '1m'),
          },
        }));
      }
    }
  });
}, 1000);

// ============ Start ============

server.listen(PORT, HOST, () => {
  console.log(`OX BROKER API running on ${HOST}:${PORT}`);
  console.log('WebSocket available at /ws');
  console.log('DISCLAIMER: Simulated OTC DEMO data only.');
});
