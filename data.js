// OX BROKER — Centralized Price Engine + Candle Engine
// SIMULATED OTC DEMO DATA ONLY — Not real financial market data.
// Architecture: MARKET CONFIG → PRICE ENGINE → TICK ENGINE → CANDLE ENGINE → API/WS

const EventEmitter = require('events');

// ============ MARKET CONFIG ============

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

// ============ PRICE ENGINE ============

class PriceEngine {
  constructor(markets) {
    this.markets = markets;
    this.prices = {};       // { symbol: currentPrice }
    this.prevPrices = {};   // previous tick to compute direction
    this.direction = {};    // 1 = up, -1 = down, 0 = flat
    this.ticks = {};        // total ticks since start
    this.initialized = false;
  }

  init() {
    this.markets.forEach((m) => {
      const decimals = getDecimals(m.basePrice);
      const p = fmtPrice(m.basePrice, decimals);
      this.prices[m.symbol] = p;
      this.prevPrices[m.symbol] = p;
      this.direction[m.symbol] = 0;
      this.ticks[m.symbol] = 0;
    });
    this.initialized = true;
    console.log('[PriceEngine] Initialized', Object.keys(this.prices).length, 'markets');
  }

  getPrice(symbol) {
    return this.prices[symbol] || null;
  }

  getAllPrices() {
    return { ...this.prices };
  }

  tick() {
    if (!this.initialized) return;

    this.markets.forEach((m) => {
      const sym = m.symbol;
      const oldPrice = this.prices[sym];
      const decimals = getDecimals(m.basePrice);

      // Compute tick movement
      const momentum = Math.sin(this.ticks[sym] * 0.02) * m.volatility * 0.3;
      const noise = (Math.random() - 0.5) * 2 * m.volatility;
      const change = momentum + noise;
      let newPrice = fmtPrice(oldPrice + change, decimals);

      // Clamp to highPrice / lowPrice range
      if (newPrice > m.highPrice) newPrice = fmtPrice(m.highPrice - m.volatility, decimals);
      if (newPrice < m.lowPrice) newPrice = fmtPrice(m.lowPrice + m.volatility, decimals);

      // Track direction
      this.prevPrices[sym] = oldPrice;
      if (newPrice > oldPrice) this.direction[sym] = 1;
      else if (newPrice < oldPrice) this.direction[sym] = -1;
      else this.direction[sym] = 0;

      this.prices[sym] = newPrice;
      this.ticks[sym]++;
    });
  }
}

// ============ CANDLE ENGINE ============

class CandleEngine {
  constructor(markets) {
    this.markets = markets;
    // candles[symbol] = { '5s': [...], '10s': [...], '30s': [...], '1m': [...] }
    this.candles = {};
    this.current = {};   // current in-progress candles per symbol per timeframe
    this.windows = {
      '5s':  5000,
      '10s': 10000,
      '30s': 30000,
      '1m':  60000,
    };
    this.initialized = false;
  }

  init(priceEngine) {
    this.markets.forEach((m) => {
      const sym = m.symbol;
      const decimals = getDecimals(m.basePrice);
      const price = priceEngine.getPrice(sym);

      this.candles[sym] = {};
      this.current[sym] = {};

      Object.entries(this.windows).forEach(([tf, ms]) => {
        const now = Date.now();
        const bucketTime = Math.floor(now / ms) * ms;

        // Generate 100 historical candles
        const arr = [];
        let p = price;
        for (let i = 100; i >= 0; i--) {
          const t = bucketTime - i * ms;
          const o = p;
          const ch = (Math.random() - 0.5) * 2 * m.volatility;
          const c = fmtPrice(o + ch, decimals);
          const hi = fmtPrice(Math.max(o, c) + Math.random() * m.volatility * 0.3, decimals);
          const lo = fmtPrice(Math.min(o, c) - Math.random() * m.volatility * 0.3, decimals);
          arr.push({ time: t, open: fmtPrice(o, decimals), high: hi, low: lo, close: c });
          p = c;
        }
        this.candles[sym][tf] = arr;

        this.current[sym][tf] = {
          time: bucketTime,
          open: price,
          high: price,
          low: price,
          close: price,
        };
      });
    });
    this.initialized = true;
    console.log('[CandleEngine] Initialized with timeframes:', Object.keys(this.windows).join(', '));
  }

  feedTick(symbol, price) {
    if (!this.initialized) return;
    const now = Date.now();
    const decimals = getDecimals(price);

    Object.entries(this.windows).forEach(([tf, ms]) => {
      const bucketTime = Math.floor(now / ms) * ms;
      const cur = this.current[symbol][tf];

      if (bucketTime > cur.time) {
        // Close current candle, start new one
        this.candles[symbol][tf].push({
          time: cur.time,
          open: cur.open,
          high: cur.high,
          low: cur.low,
          close: cur.close,
        });
        if (this.candles[symbol][tf].length > 500) {
          this.candles[symbol][tf].shift();
        }
        this.current[symbol][tf] = {
          time: bucketTime,
          open: price,
          high: price,
          low: price,
          close: price,
        };
      } else {
        // Update current candle
        if (price > cur.high) cur.high = price;
        if (price < cur.low) cur.low = price;
        cur.close = price;
      }
    });
  }

  getCandles(symbol, timeframe, limit = 100) {
    if (!this.initialized || !this.candles[symbol]) return [];
    const tf = timeframe || '1m';
    const arr = (this.candles[symbol][tf] || []).slice(-limit);
    const live = this.current[symbol] && this.current[symbol][tf];
    if (live && (arr.length === 0 || arr[arr.length - 1].time !== live.time)) {
      arr.push(live);
    }
    return arr;
  }

  getCurrentCandle(symbol, timeframe = '1m') {
    return this.current[symbol] ? this.current[symbol][timeframe] : null;
  }
}

// ============ Helpers ============

function fmtPrice(val, decimals) {
  return parseFloat(val.toFixed(decimals || 5));
}

function getDecimals(price) {
  if (price >= 100) return 3;
  if (price >= 10) return 4;
  return 5;
}

// ============ Initialize & Wire Up ============

const priceEngine = new PriceEngine(MARKETS);
const candleEngine = new CandleEngine(MARKETS);

priceEngine.init();
candleEngine.init(priceEngine);

// Tick every 1 second — Price Engine drives Candle Engine
setInterval(() => {
  priceEngine.tick();
  // Feed all updated prices into candle engine
  MARKETS.forEach((m) => {
    const price = priceEngine.getPrice(m.symbol);
    candleEngine.feedTick(m.symbol, price);
  });
}, 1000);

// ============ Exports ============

module.exports = { MARKETS, priceEngine, candleEngine };
