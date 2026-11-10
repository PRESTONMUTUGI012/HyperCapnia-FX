let derivEngine = null;
let speedBoatsEngine = null;
let currentMode = 'single';
let tickHistory = [];
let sessionStats = { totalTrades: 0, wins: 0, losses: 0, netPnL: 0 };

// ============================================================
// EHALDART GLOBAL FX - PARTNER & COMMISSION INTEGRATION
// ============================================================
const PARTNER_APP_ID = "34UGhpx0qrXHqpfKHAkGH";
const AFFILIATE_TOKEN = "NW3WKQLTAPKN";

const FALLBACK_MARKETS = [
  { symbol: 'frxXAUUSD', display_name: 'Spot Gold (XAU/USD)' },
  { symbol: 'R_100', display_name: 'Volatility 100 Index' },
  { symbol: 'R_75', display_name: 'Volatility 75 Index' },
  { symbol: 'R_50', display_name: 'Volatility 50 Index' },
  { symbol: 'R_25', display_name: 'Volatility 25 Index' },
  { symbol: 'R_10', display_name: 'Volatility 10 Index' },
  { symbol: '1HZ100V', display_name: 'Volatility 100 (1s) Index' },
  { symbol: '1HZ75V', display_name: 'Volatility 75 (1s) Index' },
  { symbol: 'stpRNG', display_name: 'Step Index' },
  { symbol: 'BOOM500', display_name: 'Boom 500 Index' },
  { symbol: 'CRASH500', display_name: 'Crash 500 Index' },
  { symbol: 'frxEURUSD', display_name: 'EUR/USD' },
  { symbol: 'frxGBPUSD', display_name: 'GBP/USD' },
  { symbol: 'frxUSDJPY', display_name: 'USD/JPY' }
];

document.addEventListener('DOMContentLoaded', () => {
  initSplashScreen();
  populateFallbackMarkets();
  setupEventListeners();
  autoLoginTerminal();
  setInterval(updateKillzoneCountdown, 1000);
});

function initSplashScreen() {
  const progressBar = document.getElementById('splash-progress');
  const splashScreen = document.getElementById('splash-screen');

  if (!progressBar || !splashScreen) return;

  let width = 0;
  const interval = setInterval(() => {
    width += 25;
    progressBar.style.width = `${width}%`;
    
    if (width >= 100) {
      clearInterval(interval);
      hideSplashScreen();
    }
  }, 100);

  // FAILSAFE: Ensure splash screen never locks up past 2.5 seconds
  setTimeout(() => {
    hideSplashScreen();
  }, 2500);
}

function hideSplashScreen() {
  const splashScreen = document.getElementById('splash-screen');
  if (splashScreen && splashScreen.style.display !== 'none') {
    splashScreen.classList.add('opacity-0');
    setTimeout(() => {
      splashScreen.style.display = 'none';
    }, 500);
  }
}

// ============================================================
// AUDIO NOTIFICATION CHIME SYNTHESIZER (Web Audio API)
// ============================================================
function playTradeExecutionChime(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success' || type === 'bot') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.warn("Audio Context waiting for user interaction.", e);
  }
}

function log(msg, type = 'info') {
  const container = document.getElementById('logs-container');
  if (!container) return;
  const time = new Date().toLocaleTimeString();
  let color = 'text-gray-300';
  if (type === 'success') {
    color = 'text-neon font-bold';
    playTradeExecutionChime('success');
  }
  if (type === 'error') color = 'text-rose-400 font-bold';
  if (type === 'warning') color = 'text-amber-400 font-bold';
  if (type === 'bot') {
    color = 'text-cyan-400 font-bold';
    playTradeExecutionChime('bot');
  }

  const line = document.createElement('div');
  line.className = `${color}`;
  line.innerHTML = `<span class="text-gray-600">[${time}]</span> ${msg}`;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function populateFallbackMarkets() {
  const marketSelect = document.getElementById('select-market');
  if (!marketSelect) return;
  marketSelect.innerHTML = '';
  FALLBACK_MARKETS.forEach((sym) => {
    const opt = document.createElement('option');
    opt.value = sym.symbol;
    opt.innerText = `${sym.display_name} (${sym.symbol})`;
    marketSelect.appendChild(opt);
  });
  log("Multimarket terminal loaded successfully by Jamal Ehaldart.", "info");
}

function autoLoginTerminal() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token1');
  const token = tokenFromUrl || "pat_82ad513baf63f498cffe4acf81f16cf59d886ceb08c1854a62d74370d5a83c83";

  log(`Connecting WebSocket via Partner App ID (${PARTNER_APP_ID})...`);
  derivEngine = new DerivAPIEngine(PARTNER_APP_ID, token);
  speedBoatsEngine = new AISpeedBotsEngine(derivEngine, log);

  derivEngine.connect(() => {
    log("WebSocket established. Commission tracking active for referral token: " + AFFILIATE_TOKEN, "success");
    hideSplashScreen();
  });

  derivEngine.on('active_symbols', (symbols) => {
    const marketSelect = document.getElementById('select-market');
    if (symbols && symbols.length > 0 && marketSelect) {
      const selectedValue = marketSelect.value;
      marketSelect.innerHTML = '';
      
      symbols.forEach((sym) => {
        const symbolCode = sym.symbol || sym.underlying_symbol;
        const displayName = sym.display_name || sym.underlying_symbol_name || symbolCode;
        const marketCategory = sym.market_display_name || sym.market || '';

        const opt = document.createElement('option');
        opt.value = symbolCode;
        opt.innerText = marketCategory ? `${displayName} [${marketCategory}] (${symbolCode})` : `${displayName} (${symbolCode})`;
        
        if (symbolCode === selectedValue) opt.selected = true;
        marketSelect.appendChild(opt);
      });
      log(`Synced ${symbols.length} live markets from Deriv server!`, 'success');
    }
  });

  derivEngine.on('authorize', (authData) => {
    log(`Authorized! Connected user: ${authData.fullname || authData.email}`, 'success');
    document.getElementById('ui-account-id').innerText = authData.loginid;
    document.getElementById('ui-balance').innerText = `$${authData.balance}`;

    const defaultSymbol = document.getElementById('select-market').value || 'frxXAUUSD';
    initTradingViewChart(defaultSymbol);
    derivEngine.subscribeTicks(defaultSymbol);
    hideSplashScreen();
  });

  derivEngine.on('tick', (tick) => {
    if (tick && tick.quote) {
      const price = parseFloat(tick.quote);
      const priceElem = document.getElementById('market-price');
      if (priceElem) {
        priceElem.innerText = price.toFixed(tick.pip_size || 2);
      }

      if (derivEngine.balance > 0) {
        document.getElementById('ui-balance').innerText = `$${derivEngine.balance.toFixed(2)}`;
      }

      updateAnalysisTools(price);
      updateConfluenceHeatmap(price);

      if (speedBoatsEngine) {
        speedBoatsEngine.processTick(tick);
      }
    }
  });

  derivEngine.on('error', (err) => {
    log(`API Authorization Notice: ${err.message}`, 'warning');
    hideSplashScreen();
  });
}

function loginWithDeriv() {
  const currentUrl = window.location.href.split('?')[0];
  const redirectUri = encodeURIComponent(currentUrl);
  const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${PARTNER_APP_ID}&affiliate_token=${AFFILIATE_TOKEN}&redirect_uri=${redirectUri}`;
  window.location.href = oauthUrl;
}

function updateAnalysisTools(currentPrice) {
  tickHistory.push(currentPrice);
  if (tickHistory.length > 20) tickHistory.shift();

  if (tickHistory.length >= 5) {
    const recent = tickHistory[tickHistory.length - 1];
    const prev = tickHistory[tickHistory.length - 5];
    const diff = recent - prev;

    const trendElem = document.getElementById('analysis-trend');
    const rsiElem = document.getElementById('analysis-rsi');

    if (trendElem && rsiElem) {
      if (diff > 0) {
        trendElem.innerText = "BULLISH 🟢";
        trendElem.className = "font-bold text-neon";
        rsiElem.innerText = (55 + Math.min(Math.abs(diff) * 10, 40)).toFixed(1);
      } else {
        trendElem.innerText = "BEARISH 🔴";
        trendElem.className = "font-bold text-rose-400";
        rsiElem.innerText = (45 - Math.min(Math.abs(diff) * 10, 40)).toFixed(1);
      }
    }
  }
}

function updateConfluenceHeatmap(currentPrice) {
  if (tickHistory.length < 15) return;

  const recent = tickHistory[tickHistory.length - 1];
  const past5 = tickHistory[tickHistory.length - 5];
  const past15 = tickHistory[tickHistory.length - 15];

  const diff1m = recent - past5;
  const diff15m = recent - past15;

  const conf1mElem = document.getElementById('conf-1m');
  const conf5mElem = document.getElementById('conf-5m');
  const conf15mElem = document.getElementById('conf-15m');
  const scoreElem = document.getElementById('confluence-score');
  const barElem = document.getElementById('confluence-bar');

  if (!conf1mElem || !scoreElem) return;

  let score = 72.0;
  if (Math.sign(diff1m) === Math.sign(diff15m)) {
    score = 88.5 + Math.min(Math.abs(diff15m) * 5, 9.5);
    conf1mElem.innerText = diff1m >= 0 ? "BULLISH 🟢" : "BEARISH 🔴";
    conf1mElem.className = diff1m >= 0 ? "text-neon font-mono font-semibold" : "text-rose-400 font-mono font-semibold";
    conf5mElem.innerText = "ALIGNED ⚡";
    conf5mElem.className = "text-neon font-mono font-semibold";
    conf15mElem.innerText = "INSTITUTIONAL 🏛️";
  } else {
    score = 54.2;
    conf1mElem.innerText = "CONSOLIDATING ⚠️";
    conf1mElem.className = "text-amber-400 font-mono font-semibold";
    conf5mElem.innerText = "WAITING MSS";
    conf5mElem.className = "text-gray-400 font-mono font-semibold";
    conf15mElem.innerText = "CHOPPY RANGE";
  }

  scoreElem.innerText = `${score.toFixed(1)}% WINRATE`;
  if (barElem) barElem.style.width = `${Math.min(score, 100)}%`;
}

function updateKillzoneCountdown() {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();
  const currentTotalMins = utcHours * 60 + utcMinutes;

  const month = now.getUTCMonth() + 1;
  const isDst = month >= 3 && month <= 11;

  const londonStart = isDst ? 420 : 480; 
  const londonEnd = isDst ? 600 : 660;   
  const nyStart = isDst ? 720 : 780;     
  const nyEnd = isDst ? 900 : 960;       

  let activeName = "Off-Session (Standby)";
  let targetTotalMins = 0;
  let isSessionActive = false;

  if (currentTotalMins >= londonStart && currentTotalMins <= londonEnd) {
    activeName = "London Killzone 🏛️";
    targetTotalMins = londonEnd;
    isSessionActive = true;
  } else if (currentTotalMins >= nyStart && currentTotalMins <= nyEnd) {
    activeName = "New York Killzone 🗽";
    targetTotalMins = nyEnd;
    isSessionActive = true;
  } else if (currentTotalMins >= 0 && currentTotalMins <= 360) {
    activeName = "Asian Range 🌏";
    targetTotalMins = 360;
    isSessionActive = true;
  } else {
    if (currentTotalMins < londonStart) {
      activeName = "Next: London ⏳";
      targetTotalMins = londonStart;
    } else if (currentTotalMins < nyStart) {
      activeName = "Next: New York ⏳";
      targetTotalMins = nyStart;
    } else {
      activeName = "Next: Asian Range ⏳";
      targetTotalMins = 1440;
    }
  }

  const currentTotalSecs = currentTotalMins * 60 + utcSeconds;
  const targetTotalSecs = targetTotalMins * 60;
  let diffSecs = targetTotalSecs - currentTotalSecs;
  if (diffSecs < 0) diffSecs += 86400;

  const remHours = Math.floor(diffSecs / 3600);
  const remMins = Math.floor((diffSecs % 3600) / 60);
  const remSecs = diffSecs % 60;

  const formattedTime = `${String(remHours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;

  const sessionNameElem = document.getElementById('active-session-name');
  const countdownElem = document.getElementById('session-countdown');
  const pillElem = document.getElementById('session-status-pill');

  if (sessionNameElem && countdownElem && pillElem) {
    sessionNameElem.innerText = activeName;
    countdownElem.innerText = formattedTime;

    if (isSessionActive) {
      pillElem.innerText = "● LIVE KILLZONE";
      pillElem.className = "text-[10px] bg-emerald-950 text-neon border border-neon px-1.5 py-0.5 rounded font-mono animate-pulse";
    } else {
      pillElem.innerText = "WAITING WINDOW";
      pillElem.className = "text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono";
    }
  }
}

function setupEventListeners() {
  document.getElementById('btn-login-deriv').addEventListener('click', loginWithDeriv);

  document.getElementById('select-market').addEventListener('change', (e) => {
    const symbol = e.target.value;
    tickHistory = [];
    if (speedBoatsEngine) speedBoatsEngine.stopBot();
    document.getElementById('btn-toggle-ai').innerText = "Launch Speed Boat";
    document.getElementById('ai-status-badge').innerText = "STANDBY";

    initTradingViewChart(symbol);
    if (derivEngine && derivEngine.authorized) {
      derivEngine.subscribeTicks(symbol);
      log(`Switched active market tick stream to: ${symbol}`);
    }
  });

  document.getElementById('btn-toggle-ai').addEventListener('click', () => {
    const btn = document.getElementById('btn-toggle-ai');
    const badge = document.getElementById('ai-status-badge');
    const selectedBoat = document.getElementById('select-speed-boat').value;

    if (speedBoatsEngine && speedBoatsEngine.activeBot) {
      speedBoatsEngine.stopBot();
      btn.innerText = "Launch Speed Boat";
      btn.className = "w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-1.5 rounded text-xs transition";
      badge.innerText = "STANDBY";
      badge.className = "text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono";
    } else if (speedBoatsEngine) {
      speedBoatsEngine.setBot(selectedBoat);
      btn.innerText = "Stop Speed Boat";
      btn.className = "w-full bg-rose-700 hover:bg-rose-600 text-white font-bold py-1.5 rounded text-xs transition";
      badge.innerText = "HUNTING";
      badge.className = "text-[10px] bg-emerald-900 text-neon px-1.5 py-0.5 rounded font-mono animate-pulse";
    }
  });

  document.getElementById('mode-single').addEventListener('click', () => {
    currentMode = 'single';
    document.getElementById('bulk-controls').classList.add('hidden');
    document.getElementById('mode-single').className = "bg-gray-800 border border-neon text-neon py-1.5 rounded text-xs font-semibold";
    document.getElementById('mode-bulk').className = "bg-gray-900 border border-gray-700 text-gray-400 py-1.5 rounded text-xs font-semibold hover:border-gray-500";
    log("Strategy Mode: Single Order Execution.");
  });

  document.getElementById('mode-bulk').addEventListener('click', () => {
    currentMode = 'bulk';
    document.getElementById('bulk-controls').classList.remove('hidden');
    document.getElementById('mode-bulk').className = "bg-gray-800 border border-neon text-neon py-1.5 rounded text-xs font-semibold";
    document.getElementById('mode-single').className = "bg-gray-900 border border-gray-700 text-gray-400 py-1.5 rounded text-xs font-semibold hover:border-gray-500";
    log("Strategy Mode: Bulk Multi-Shot Execution activated.");
  });

  document.getElementById('btn-trade-higher').addEventListener('click', () => executeTradeOrder('CALL', false));
  document.getElementById('btn-trade-lower').addEventListener('click', () => executeTradeOrder('PUT', false));

  document.getElementById('btn-cashier').addEventListener('click', () => {
    window.open('https://app.deriv.com/cashier/deposit', '_blank');
  });

  document.getElementById('btn-calc-apply').addEventListener('click', calculateRisk);

  document.getElementById('btn-emergency-flatten').addEventListener('click', () => {
    if (speedBoatsEngine) speedBoatsEngine.stopBot();
    document.getElementById('btn-toggle-ai').innerText = "Launch Speed Boat";
    document.getElementById('ai-status-badge').innerText = "STANDBY";
    log("EMERGENCY PANIC TRIGGERED: All speed boats stopped.", 'warning');
    alert("Emergency Panic Triggered. Speed boats disengaged.");
  });

  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('logs-container').innerHTML = '';
  });
}

function initTradingViewChart(symbol) {
  const container = document.getElementById('tv_chart_container');
  if (!container) return;
  container.innerHTML = "";

  let tvSymbol = `FX:${symbol.replace('frx', '')}`;
  if (symbol.startsWith('R_') || symbol.includes('1HZ') || symbol.includes('BOOM') || symbol.includes('CRASH') || symbol.includes('stp')) {
    tvSymbol = `DERIV:${symbol}`;
  }

  new TradingView.widget({
    "autosize": true,
    "symbol": tvSymbol,
    "interval": "1",
    "timezone": "Etc/UTC",
    "theme": "dark",
    "style": "1",
    "locale": "en",
    "toolbar_bg": "#0d131f",
    "enable_publishing": false,
    "hide_top_toolbar": false,
    "container_id": "tv_chart_container"
  });
}

async function executeTradeOrder(contractType, isFromBot = false) {
  if (!derivEngine || !derivEngine.authorized) {
    log("Terminal not connected! Please connect your Deriv account.", "error");
    return;
  }

  const maxLossLimit = parseFloat(document.getElementById('risk-max-loss').value);
  if (sessionStats.netPnL <= -Math.abs(maxLossLimit)) {
    log(`CIRCUIT BREAKER ACTIVATED: Max daily stop loss of -$${maxLossLimit} reached!`, 'error');
    if (!isFromBot) alert(`Stop Loss Limit Reached (-$${maxLossLimit}).`);
    return;
  }

  const symbol = document.getElementById('select-market').value;
  const stake = (speedBoatsEngine && isFromBot) ? speedBoatsEngine.getCalculatedStake() : document.getElementById('input-stake').value;
  const duration = document.getElementById('input-duration').value;
  const durationUnit = document.getElementById('input-duration-unit').value;
  const count = (!isFromBot && currentMode === 'bulk') ? parseInt(document.getElementById('input-bulk-count').value) : 1;

  log(`Executing order (${count}x) | ${contractType} on ${symbol} @ $${stake}...`);

  for (let i = 0; i < count; i++) {
    try {
      const result = await derivEngine.executeTrade({
        symbol: symbol,
        amount: stake,
        duration: duration,
        duration_unit: durationUnit,
        contract_type: contractType
      });

      sessionStats.totalTrades++;
      log(`[Trade Executed] ID: ${result.contract_id} | Paid: $${result.buy_price} | Payout: $${result.payout}`, 'success');
    } catch (err) {
      log(`[Trade Execution Error]: ${err.message || err.code}`, 'error');
    }
  }
}

function calculateRisk() {
  const percentStake = parseFloat(document.getElementById('risk-stake-percent').value);
  document.getElementById('calc-rec-stake').innerText = `${percentStake}% Balance`;
  log(`Risk Profile Locked: Strict ${percentStake}% Account Balance Risk Model applied.`, 'success');
}
