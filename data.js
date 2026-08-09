// OX BROKER — 3-Layer Live Market System
// Layer 1: Price Engine  → 1-second ticks
// Layer 2: Candle Engine → 5s/10s/30s/1m OHLC from same ticks
// Layer 3: API + WebSocket → broadcast
// SIMULATED OTC DEMO DATA ONLY — Not real financial market data.

const EventEmitter = require('events');

// ==================== MARKET CONFIG ====================

const MARKETS = [
  { symbol: 'USDPKR-OTC', name: 'USD/PKR OTC', basePrice: 288.84,  highPrice: 600.0, lowPrice: 100.0,   spread: 0.0500, volatility: 0.0800 },
  { symbol: 'GBPNZD-OTC', name: 'GBP/NZD OTC', basePrice: 1.8715,  highPrice: 1.9000, lowPrice: 1.8400,   spread: 0.00008, volatility: 0.00006 },
  { symbol: 'USDMXN-OTC', name: 'USD/MXN OTC', basePrice: 18.4205, highPrice: 18.8000, lowPrice: 18.0000, spread: 0.0005,  volatility: 0.0006 },
  { symbol: 'NZDCHF-OTC', name: 'NZD/CHF OTC', basePrice: 0.53421, highPrice: 0.5500, lowPrice: 0.5200,   spread: 0.00003, volatility: 0.00004 },
  { symbol: 'USDBRL-OTC', name: 'USD/BRL OTC', basePrice: 5.1234,  highPrice: 5.3000, lowPrice: 4.9000,    spread: 0.0002,  volatility: 0.0003 },
  { symbol: 'USDNGN-OTC', name: 'USD/NGN OTC', basePrice: 1450.5,  highPrice: 1500.0, lowPrice: 1400.0,   spread: 0.05,    volatility: 0.08 },
  { symbol: 'EURNZD-OTC', name: 'EUR/NZD OTC', basePrice: 1.7823,  highPrice: 1.8200, lowPrice: 1.7500,    spread: 0.00006, volatility: 0.00008 },
  { symbol: 'NZDJPY-OTC', name: 'NZD/JPY OTC', basePrice: 93.78,   highPrice: 95.0000, lowPrice: 92.5000,  spread: 0.01,    volatility: 0.015 },
  { symbol: 'AUDNGN-OTC', name: 'AUD/NGN OTC', basePrice: 960.25,  highPrice: 980.0, lowPrice: 940.0,      spread: 0.04,    volatility: 0.06 },
];

// ==================== HELPERS ====================

function fmtPrice(val, decimals) {
  return parseFloat(val.toFixed(decimals));
}

function getDecimals(price) {
  if (price >= 100) return 3;
  if (price >= 10) return 4;
  return 5;
}

// ==================== PRICE ENGINE (Layer 1) ====================

class PriceEngine extends EventEmitter {
  constructor(markets) {
    super();
    this.markets = markets;
    this.prices = {};
    this.prevPrices = {};
    this.direction = {};
    this.tickCount = {};
  }

  init() {
    this.markets.forEach((m) => {
      const d = getDecimals(m.basePrice);
      const p = fmtPrice(m.basePrice, d);
      this.prices[m.symbol] = p;
      this.prevPrices[m.symbol] = p;
      this.direction[m.symbol] = 0;
      this.tickCount[m.symbol] = 0;
    });
    console.log('[PriceEngine] Initialized', this.markets.length, 'markets');
  }

  getPrice(symbol) { return this.prices[symbol]; }
  getAllPrices() { return { ...this.prices }; }

  tick() {
    this.markets.forEach((m) => {
      const s = m.symbol;
      const old = this.prices[s];
      const d = getDecimals(m.basePrice);

      // Smooth movement: momentum wave + small noise
      const wave = Math.sin(this.tickCount[s] * 0.018) * m.volatility * 0.35;
      const noise = (Math.random() - 0.5) * 2 * m.volatility * 0.45;
      let next = fmtPrice(old + wave + noise, d);

      // RULE: Price must stay within highPrice/lowPrice range
      if (next > m.highPrice) next = fmtPrice(m.highPrice - m.volatility, d);
      if (next < m.lowPrice)  next = fmtPrice(m.lowPrice + m.volatility, d);

      // Direction
      this.prevPrices[s] = old;
      if (next > old) this.direction[s] = 1;
      else if (next < old) this.direction[s] = -1;
      else this.direction[s] = 0;

      this.prices[s] = next;
      this.tickCount[s]++;
    });

    // Emit tick event for candle engine + WebSocket
    this.emit('tick', this.getAllPrices(), this.direction);
  }
}

// ==================== CANDLE ENGINE (Layer 2) ====================

class CandleEngine extends EventEmitter {
  constructor(markets) {
    super();
    this.markets = markets;
    // { '5s': 5000, '10s': 10000, '30s': 30000, '1m': 60000 }
    this.timeframes = { '5s': 5000, '10s': 10000, '30s': 30000, '1m': 60000 };
    // candles[symbol][timeframe] = [{time,open,high,low,close}, ...]
    this.history = {};
    // current[symbol][timeframe] = {time,open,high,low,close}
    this.current = {};
  }

  init(priceEngine) {
    this.markets.forEach((m) => {
      const s = m.symbol;
      const d = getDecimals(m.basePrice);
      const now = Date.now();
      this.history[s] = {};
      this.current[s] = {};

      Object.entries(this.timeframes).forEach(([tf, ms]) => {
        const bucket = Math.floor(now / ms) * ms;
        const arr = [];
        let p = priceEngine.getPrice(s);

        // Generate 100 historical candles per timeframe
        for (let i = 100; i >= 1; i--) {
          const t = bucket - i * ms;
          const o = p;
          const ch = (Math.random() - 0.5) * 2 * m.volatility;
          const c = fmtPrice(o + ch, d);
          const h = fmtPrice(Math.max(o, c) + Math.random() * m.volatility * 0.3, d);
          const l = fmtPrice(Math.min(o, c) - Math.random() * m.volatility * 0.3, d);
          arr.push({ time: t, open: fmtPrice(o, d), high: h, low: l, close: c });
          p = c;
        }
        this.history[s][tf] = arr;

        // Current (in-progress) candle
        this.current[s][tf] = {
          time: bucket,
          open: fmtPrice(p, d),
          high: fmtPrice(p, d),
          low: fmtPrice(p, d),
          close: fmtPrice(p, d),
        };
      });
    });
    console.log('[CandleEngine] Initialized with timeframes:', Object.keys(this.timeframes).join(', '));
  }

  // Called every tick with latest prices
  feedTick(prices, direction) {
    const now = Date.now();
    const closedCandles = [];

    this.markets.forEach((m) => {
      const s = m.symbol;
      const price = prices[s];
      if (price === undefined) return;
      const d = getDecimals(m.basePrice);

      Object.entries(this.timeframes).forEach(([tf, ms]) => {
        const bucket = Math.floor(now / ms) * ms;
        const cur = this.current[s][tf];

        if (bucket > cur.time) {
          // Timeframe complete → close current candle
          const closed = {
            time: cur.time,
            open: cur.open,
            high: cur.high,
            low: cur.low,
            close: cur.close,
          };
          this.history[s][tf].push(closed);
          if (this.history[s][tf].length > 500) this.history[s][tf].shift();

          closedCandles.push({ symbol: s, timeframe: tf, candle: closed });

          // Start new candle
          this.current[s][tf] = {
            time: bucket,
            open: price,
            high: price,
            low: price,
            close: price,
          };
        } else {
          // Same bucket → update OHLC
          if (price > cur.high) cur.high = price;
          if (price < cur.low) cur.low = price;
          cur.close = price;
        }
      });
    });

    // Emit closed candles event
    if (closedCandles.length > 0) {
      this.emit('candles-closed', closedCandles);
    }
  }

  getCandles(symbol, timeframe, limit = 100) {
    const tf = timeframe || '1m';
    if (!this.history[symbol] || !this.history[symbol][tf]) return [];
    const arr = this.history[symbol][tf].slice(-limit);
    // Append current candle as rightmost
    const live = this.current[symbol] && this.current[symbol][tf];
    if (live && (arr.length === 0 || arr[arr.length - 1].time !== live.time)) {
      arr.push(live);
    }
    return arr;
  }

  getCurrentCandle(symbol, timeframe = '1m') {
    if (!this.current[symbol]) return null;
    return this.current[symbol][timeframe];
  }

  getCurrentCandles(symbol) {
    if (!this.current[symbol]) return {};
    return { ...this.current[symbol] };
  }
}

// ==================== WIRE UP ====================

const priceEngine = new PriceEngine(MARKETS);
const candleEngine = new CandleEngine(MARKETS);

priceEngine.init();
candleEngine.init(priceEngine);

// Tick every 1 second: Price Engine → Candle Engine
setInterval(() => {
  priceEngine.tick();
  candleEngine.feedTick(priceEngine.getAllPrices(), priceEngine.direction);
}, 1000);

// ==================== EXPORTS ====================

module.exports = { MARKETS, priceEngine, candleEngine };
