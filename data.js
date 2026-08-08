// OX BROKER — Simulated OTC Demo Market Data
// All prices are SIMULATED DEMO DATA ONLY — NOT real financial market data.

const MARKETS = [
  { symbol: 'GBPNZD-OTC', name: 'GBP/NZD OTC', basePrice: 1.8715,  spread: 0.00008, volatility: 0.00006 },
  { symbol: 'USDMXN-OTC', name: 'USD/MXN OTC', basePrice: 18.4205, spread: 0.00050, volatility: 0.00060 },
  { symbol: 'NZDCHF-OTC', name: 'NZD/CHF OTC', basePrice: 0.53421, spread: 0.00003, volatility: 0.00004 },
  { symbol: 'USDBRL-OTC', name: 'USD/BRL OTC', basePrice: 5.1234,  spread: 0.00020, volatility: 0.00030 },
  { symbol: 'USDNGN-OTC', name: 'USD/NGN OTC', basePrice: 1450.5,  spread: 0.05000, volatility: 0.08000 },
  { symbol: 'EURNZD-OTC', name: 'EUR/NZD OTC', basePrice: 1.7823,  spread: 0.00006, volatility: 0.00008 },
  { symbol: 'NZDJPY-OTC', name: 'NZD/JPY OTC', basePrice: 91.45,   spread: 0.01000, volatility: 0.01500 },
  { symbol: 'AUDNGN-OTC', name: 'AUD/NGN OTC', basePrice: 960.25,  spread: 0.04000, volatility: 0.06000 },
];

const candles = {};
const livePrices = {};
const currentCandle = {};
const candleOpenTime = {};

function roundToMinute(ts) { return Math.floor(ts / 60000) * 60000; }
function fmtPrice(price, decimals) { return parseFloat(price.toFixed(decimals)); }
function getDecimals(price) {
  if (price >= 100) return 2;
  if (price >= 10) return 4;
  return 5;
}

function init() {
  MARKETS.forEach((m) => {
    const sym = m.symbol;
    const decimals = getDecimals(m.basePrice);
    livePrices[sym] = fmtPrice(m.basePrice, decimals);

    const now = Date.now();
    const currentMinute = roundToMinute(now);
    const arr = [];
    let price = m.basePrice;

    for (let i = 99; i >= 0; i--) {
      const candleTime = currentMinute - (i + 1) * 60000;
      const open = price;
      const change = (Math.random() - 0.5) * 2 * m.volatility;
      const close = fmtPrice(open + change, decimals);
      const hi = fmtPrice(Math.max(open, close) + Math.random() * m.volatility * 0.5, decimals);
      const lo = fmtPrice(Math.min(open, close) - Math.random() * m.volatility * 0.5, decimals);
      arr.push({ time: candleTime, open: fmtPrice(open, decimals), high: hi, low: lo, close });
      price = close;
    }

    candles[sym] = arr;
    candleOpenTime[sym] = currentMinute;
    currentCandle[sym] = {
      time: currentMinute,
      open: fmtPrice(price, decimals),
      high: fmtPrice(price, decimals),
      low: fmtPrice(price, decimals),
      close: fmtPrice(price, decimals),
    };
  });
}

function tick() {
  MARKETS.forEach((m) => {
    const sym = m.symbol;
    const decimals = getDecimals(m.basePrice);
    const oldPrice = livePrices[sym];
    const change = (Math.random() - 0.5) * 2 * m.volatility;
    let newPrice = fmtPrice(oldPrice + change, decimals);

    if (Math.abs(newPrice - m.basePrice) / m.basePrice > 0.02) {
      newPrice = fmtPrice(m.basePrice + (Math.random() - 0.5) * m.basePrice * 0.01, decimals);
    }

    livePrices[sym] = newPrice;
    const now = Date.now();
    const currentMin = roundToMinute(now);

    if (currentMin > candleOpenTime[sym]) {
      candles[sym].push({ ...currentCandle[sym] });
      if (candles[sym].length > 500) candles[sym].shift();
      candleOpenTime[sym] = currentMin;
      currentCandle[sym] = { time: currentMin, open: newPrice, high: newPrice, low: newPrice, close: newPrice };
    } else {
      const c = currentCandle[sym];
      if (newPrice > c.high) c.high = newPrice;
      if (newPrice < c.low) c.low = newPrice;
      c.close = newPrice;
    }
  });
}

setInterval(tick, 1000);
init();

module.exports = { MARKETS, candles, livePrices, currentCandle };
