const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { MARKETS, priceEngine, candleEngine } = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DISCLAIMER = 'SIMULATED OTC DEMO DATA ONLY — Not real financial market data.';

app.use(cors());
app.use(express.json());

// ============ HELPERS ============

function findMarket(symbol) {
  return MARKETS.find((m) => m.symbol === symbol);
}

function getMarketSnapshot(market) {
  const s = market.symbol;
  const price = priceEngine.getPrice(s);
  const c1m = candleEngine.getCurrentCandle(s, '1m');
  const allCandles = candleEngine.getCurrentCandles(s);
  return {
    symbol: s,
    name: market.name,
    price,
    direction: priceEngine.direction[s],
    bid: parseFloat((price - market.spread / 2).toFixed(8)),
    ask: parseFloat((price + market.spread / 2).toFixed(8)),
    spread: market.spread,
    highPrice: market.highPrice,
    lowPrice: market.lowPrice,
    high: c1m ? c1m.high : price,
    low: c1m ? c1m.low : price,
    open: c1m ? c1m.open : price,
    change: parseFloat((price - market.basePrice).toFixed(8)),
    changePercent: parseFloat((((price - market.basePrice) / market.basePrice) * 100).toFixed(4)),
    candles: allCandles,
  };
}

// ============ REST API ============

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    markets: MARKETS.map(m => m.symbol),
    disclaimer: DISCLAIMER,
  });
});

// All markets
app.get('/api/markets', (_req, res) => {
  const result = MARKETS.map(getMarketSnapshot);
  res.json({ disclaimer: DISCLAIMER, count: result.length, markets: result });
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

// Candles — supports timeframe=5s|10s|30s|1m
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
    symbol, timeframe, count: result.length, candles: result,
  });
});

// 404
app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });

// ============ HTTP + WEBSOCKET SERVER ============

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

// Broadcast helper
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

wss.on('connection', (ws) => {
  console.log('[WS] Client connected. Total:', wss.clients.size);

  // Send full market snapshot on connect
  const snapshot = MARKETS.map(getMarketSnapshot);
  ws.send(JSON.stringify({ type: 'markets', data: snapshot }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.type === 'subscribe' && msg.symbol) ws._sub = msg.symbol;
    else if (msg.type === 'subscribe_all') ws._sub = 'ALL';
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected. Total:', wss.clients.size);
  });
});

// 1-second tick broadcast: current price + current candle for ALL subscribed clients
setInterval(() => {
  if (wss.clients.size === 0) return;

  wss.clients.forEach((ws) => {
    if (ws.readyState !== 1) return;

    if (ws._sub === 'ALL') {
      const all = MARKETS.map((m) => ({
        symbol: m.symbol,
        price: priceEngine.getPrice(m.symbol),
        direction: priceEngine.direction[m.symbol],
        candle: candleEngine.getCurrentCandle(m.symbol, '1m'),
        candles: candleEngine.getCurrentCandles(m.symbol),
      }));
      ws.send(JSON.stringify({ type: 'tick_all', data: all }));
    } else if (ws._sub) {
      const m = findMarket(ws._sub);
      if (m) {
        ws.send(JSON.stringify({
          type: 'tick',
          data: {
            symbol: ws._sub,
            price: priceEngine.getPrice(ws._sub),
            direction: priceEngine.direction[ws._sub],
            candle: candleEngine.getCurrentCandle(ws._sub, '1m'),
            candles: candleEngine.getCurrentCandles(ws._sub),
          },
        }));
      }
    }
  });
}, 1000);

// CandleEngine emits 'candles-closed' → broadcast to all WS clients
candleEngine.on('candles-closed', (closedCandles) => {
  if (wss.clients.size === 0) return;
  broadcast('candles_closed', closedCandles);
});

// ============ START ============

server.listen(PORT, HOST, () => {
  console.log(`OX BROKER API → ${HOST}:${PORT}`);
  console.log('WebSocket → /ws');
  console.log('Timeframes → 5s 10s 30s 1m');
  console.log('DISCLAIMER:', DISCLAIMER);
});
