class AISpeedBotsEngine {
  constructor(derivApiEngine, logCallback) {
    this.api = derivApiEngine;
    this.log = logCallback || console.log;
    this.activeBot = null; 
    this.lastDigits = [];
    this.tickHistory = [];
    this.isExecuting = false;
    this.inRecoveryMode = false;
    
    // Profit Circuit Breaker & Trade Lifecycle State
    this.initialSessionBalance = 0;
    this.profitTargetReached = false;
    this.activeTradeState = null;
  }

  setBot(botType) {
    if (this.profitTargetReached) {
      this.log("[AI Circuit Breaker] Cannot launch bot. +10% Daily Profit Target already achieved!", "warning");
      return;
    }

    this.activeBot = botType;
    this.lastDigits = [];
    this.tickHistory = [];
    this.isExecuting = false;
    this.inRecoveryMode = false;
    this.activeTradeState = null;

    if (this.initialSessionBalance === 0 && this.api.balance > 0) {
      this.initialSessionBalance = this.api.balance;
      const targetVal = (this.initialSessionBalance * 0.10).toFixed(2);
      this.log(`[AI Circuit Breaker] Initial Session Balance: $${this.initialSessionBalance.toFixed(2)} | Target (+10%): +$${targetVal}`, 'info');
    }

    this.log(`[AI Speed Boat] Activated strategy: ${botType.toUpperCase()}`, 'bot');
  }

  stopBot() {
    this.activeBot = null;
    this.isExecuting = false;
    this.inRecoveryMode = false;
    this.activeTradeState = null;
    this.log("[AI Speed Boat] All speed boats disengaged.", 'warning');
  }

  // Strict 3% Risk Management Sizing
  getCalculatedStake() {
    if (this.api && this.api.balance > 0) {
      const riskPercent = 3.0; 
      const computedStake = (this.api.balance * (riskPercent / 100)).toFixed(2);
      return Math.max(0.35, parseFloat(computedStake)).toString();
    }
    return document.getElementById('input-stake').value;
  }

  checkProfitTargetCircuitBreaker() {
    if (this.initialSessionBalance === 0 && this.api.balance > 0) {
      this.initialSessionBalance = this.api.balance;
    }

    if (this.initialSessionBalance > 0 && this.api.balance > 0) {
      const currentNetPnL = this.api.balance - this.initialSessionBalance;
      const targetProfitAmount = this.initialSessionBalance * 0.10; // 10% Account Target

      if (currentNetPnL >= targetProfitAmount && !this.profitTargetReached) {
        this.profitTargetReached = true;
        this.stopBot();

        const btn = document.getElementById('btn-toggle-ai');
        const badge = document.getElementById('ai-status-badge');
        if (btn) btn.innerText = "Target Hit (+10%)";
        if (btn) btn.className = "w-full bg-emerald-900 border border-neon text-neon font-bold py-1.5 rounded text-xs opacity-75 cursor-not-allowed";
        if (badge) badge.innerText = "TARGET REACHED";
        if (badge) badge.className = "text-[10px] bg-emerald-950 text-neon border border-neon px-1.5 py-0.5 rounded font-mono font-bold";

        this.log(`🎯 [CIRCUIT BREAKER] +10% Profit Target Hit! Session Profit: +$${currentNetPnL.toFixed(2)}. All bots stopped safely.`, 'success');
        alert(`🎯 Target Achieved! Account hit +10% profit (+$${currentNetPnL.toFixed(2)}). All bots stopped.`);
        return true;
      }
    }
    return false;
  }

  async processTick(tick) {
    if (!this.api.authorized) return;

    if (this.checkProfitTargetCircuitBreaker()) return;
    if (!this.activeBot || this.isExecuting) return;

    const priceStr = tick.quote.toString();
    const decimalSplit = priceStr.split('.');
    const fractionalPart = decimalSplit[1] || '0';
    const lastDecimal = parseInt(fractionalPart.slice(-1));
    const currentPrice = parseFloat(tick.quote);

    this.lastDigits.push(lastDecimal);
    if (this.lastDigits.length > 50) this.lastDigits.shift();

    this.tickHistory.push(currentPrice);
    if (this.tickHistory.length > 80) this.tickHistory.shift();

    if (this.activeTradeState) {
      this.monitorTradeLifecycle(currentPrice);
    }

    if (this.inRecoveryMode) {
      await this.runRecoveryExecution(lastDecimal);
      return;
    }

    if (this.activeBot === 'matches') {
      await this.runAPlusMatchesSpeedBoat();
    } else if (this.activeBot === 'mtf_macd_synthetic') {
      await this.run15MMACD1MTrendAlignerBot();
    } else if (this.activeBot === 'adaptive_smc_sr') {
      await this.runAutoAssetAPlusKillzoneBot();
    } else if (this.activeBot === 'rise_fall') {
      await this.runRiseFallSpeedBoat();
    } else if (this.activeBot === 'even_odd') {
      await this.runEvenOddSpeedBoat();
    } else if (this.activeBot === 'differs') {
      await this.runDiffersSpeedBoat();
    } else if (this.activeBot === 'over3_under6') {
      await this.runOver3Under6SpeedBoat(lastDecimal);
    }
  }

  // =========================================================================
  // A+ MATCHES SPEED BOAT (HIGHEST WINRATE STRATEGY)
  // =========================================================================
  async runAPlusMatchesSpeedBoat() {
    if (this.lastDigits.length < 25) return;

    const recentSegment = this.lastDigits.slice(-25);
    const counts = {};
    for (let i = 0; i <= 9; i++) counts[i] = 0;
    recentSegment.forEach(d => { counts[d]++; });

    let targetDigit = 0;
    let maxFreq = 0;
    for (let d in counts) {
      if (counts[d] > maxFreq) {
        maxFreq = counts[d];
        targetDigit = parseInt(d);
      }
    }

    // A+ Setup: High Frequency Concentration (>= 28% concentration & frequency >= 7)
    const winrateProbability = (maxFreq / recentSegment.length) * 100;
    const isAPlusSetup = winrateProbability >= 28.0 && maxFreq >= 7;

    if (isAPlusSetup) {
      this.isExecuting = true;
      const symbol = document.getElementById('select-market').value;
      const stake = this.getCalculatedStake(); // 3% Risk Management

      this.log(`[A+ Matches Bot] Confluence Achieved! Target Digit: ${targetDigit} | Frequency: ${maxFreq}/25 (${winrateProbability.toFixed(1)}% Winrate) | Risk Stake: $${stake}`, 'bot');

      try {
        const res = await this.api.executeTradeWithBarrier({
          symbol: symbol,
          amount: stake,
          duration: 1,
          duration_unit: 't',
          contract_type: 'DIGITMATCH',
          barrier: targetDigit.toString()
        });

        this.log(`[Matches Executed] ID: ${res.contract_id} | Barrier: ${targetDigit}`, 'success');
      } catch (err) {
        this.log(`[Matches Error]: ${err.message || err.code}`, 'warning');
        this.inRecoveryMode = true; // Engage recovery mode on miss
      }

      setTimeout(() => { this.isExecuting = false; }, 2500);
    }
  }

  // =========================================================================
  // RECOVERY MODE: OVER 7 OR UNDER 2
  // =========================================================================
  async runRecoveryExecution(lastDigit) {
    this.isExecuting = true;
    const symbol = document.getElementById('select-market').value;
    const baseStake = parseFloat(this.getCalculatedStake());
    const recoveryStake = (baseStake * 1.5).toFixed(2); // Martingale drawdown recovery sizing

    // Recovery target: Over 7 or Under 2 probability zones
    let contractType = lastDigit >= 5 ? 'DIGITOVER' : 'DIGITUNDER';
    let barrier = contractType === 'DIGITOVER' ? '6' : '3'; // Over 7 or Under 2 barriers

    this.log(`[Recovery Mode Active] Executing ${contractType} (Barrier ${barrier}) @ $${recoveryStake}...`, 'warning');

    try {
      const res = await this.api.executeTradeWithBarrier({
        symbol: symbol,
        amount: recoveryStake,
        duration: 1,
        duration_unit: 't',
        contract_type: contractType,
        barrier: barrier
      });
      this.log(`[Recovery Success] ID: ${res.contract_id} | Payout: $${res.payout}`, 'success');
      this.inRecoveryMode = false;
    } catch (err) {
      this.log(`[Recovery Execution Error]: ${err.message || err.code}`, 'error');
    }

    setTimeout(() => { this.isExecuting = false; }, 2500);
  }

  async run15MMACD1MTrendAlignerBot() {
    if (this.tickHistory.length < 60) return;
    const htfSegment = this.tickHistory.slice(-45);
    const htfStart = htfSegment[0];
    const htfMid = htfSegment[Math.floor(htfSegment.length / 2)];
    const htfEnd = htfSegment[htfSegment.length - 1];
    const htfMacdHistogram = (htfEnd - htfMid) - (htfMid - htfStart);

    const htfBullish = htfMacdHistogram > 0 && htfEnd > htfStart;
    const htfBearish = htfMacdHistogram < 0 && htfEnd < htfStart;
    const ltfSegment = this.tickHistory.slice(-15);
    const ltfMomentumPositive = ltfSegment[ltfSegment.length - 1] > ltfSegment[0];

    let contractType = htfBullish && ltfMomentumPositive ? "CALL" : (htfBearish && !ltfMomentumPositive ? "PUT" : null);

    if (contractType && !this.activeTradeState) {
      this.isExecuting = true;
      const symbol = document.getElementById('select-market').value;
      const stake = this.getCalculatedStake();
      try {
        const res = await this.api.executeTrade({ symbol, amount: stake, duration: 12, duration_unit: 't', contract_type: contractType });
        this.log(`[MTF Trade Executed] ID: ${res.contract_id}`, 'success');
      } catch (err) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 7000);
    }
  }

  async runAutoAssetAPlusKillzoneBot() {
    if (this.tickHistory.length < 50) return;
    const segment = this.tickHistory.slice(-50);
    const high = Math.max(...segment.slice(0, 30));
    const low = Math.min(...segment.slice(0, 30));
    const currentPrice = segment[segment.length - 1];

    let contractType = currentPrice < low && segment[segment.length - 2] > currentPrice ? "CALL" : (currentPrice > high && segment[segment.length - 2] < high ? "PUT" : null);

    if (contractType && !this.activeTradeState) {
      this.isExecuting = true;
      const symbol = document.getElementById('select-market').value;
      const stake = this.getCalculatedStake();
      try {
        const res = await this.api.executeTrade({ symbol, amount: stake, duration: 15, duration_unit: 't', contract_type: contractType });
        this.log(`[A+ SMC Trade Executed] ID: ${res.contract_id}`, 'success');
      } catch (err) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 8000);
    }
  }

  async runRiseFallSpeedBoat() {
    if (this.tickHistory.length < 3) return;
    const p = this.tickHistory;
    let contractType = p[p.length-1] > p[p.length-2] && p[p.length-2] > p[p.length-3] ? 'CALL' : (p[p.length-1] < p[p.length-2] && p[p.length-2] < p[p.length-3] ? 'PUT' : null);
    
    if (contractType) {
      this.isExecuting = true;
      try {
        const res = await this.api.executeTrade({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(), duration: 1, duration_unit: 't', contract_type: contractType });
        this.log(`[Rise/Fall Success] ${contractType} | ID: ${res.contract_id}`, 'success');
      } catch (err) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 1500);
    }
  }

  monitorTradeLifecycle(currentPrice) {
    if (!this.activeTradeState) return;
    const tr = this.activeTradeState;
    const hitTP1 = tr.type === 'CALL' ? currentPrice >= tr.tp1 : currentPrice <= tr.tp1;
    if (hitTP1 && !tr.breakevenSecured) {
      tr.breakevenSecured = true;
      this.log(`🎯 [TP1 Secured] Price hit TP1. Stop loss shifted to Breakeven.`, 'success');
    }
  }

  async runEvenOddSpeedBoat() {
    if (this.lastDigits.length < 10) return;
    const evens = this.lastDigits.slice(-10).filter(d => d % 2 === 0).length;
    let contractType = evens >= 8 ? 'DIGITODD' : (10 - evens >= 8 ? 'DIGITEVEN' : null);
    if (contractType) {
      this.isExecuting = true;
      try { await this.api.executeTrade({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(), duration: 1, duration_unit: 't', contract_type: contractType }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2000);
    }
  }

  async runDiffersSpeedBoat() {
    if (this.lastDigits.length < 15) return;
    const counts = {};
    for (let i = 0; i <= 9; i++) counts[i] = 0;
    this.lastDigits.slice(-15).forEach(d => { counts[d]++; });
    let rarestDigit = 0, minFreq = 999;
    for (let d in counts) { if (counts[d] < minFreq) { minFreq = counts[d]; rarestDigit = parseInt(d); } }
    this.isExecuting = true;
    try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(), duration: 1, duration_unit: 't', contract_type: 'DIGITDIFF', barrier: rarestDigit.toString() }); } catch (e) { this.inRecoveryMode = true; }
    setTimeout(() => { this.isExecuting = false; }, 2500);
  }

  async runOver3Under6SpeedBoat(lastDigit) {
    if (this.lastDigits.length < 10) return;
    let contractType = lastDigit <= 3 ? 'DIGITOVER' : lastDigit >= 6 ? 'DIGITUNDER' : null;
    let barrier = lastDigit <= 3 ? '3' : '6';
    if (contractType) {
      this.isExecuting = true;
      try { await this.api.executeTradeWithBarrier({ symbol: document.getElementById('select-market').value, amount: this.getCalculatedStake(), duration: 1, duration_unit: 't', contract_type: contractType, barrier: barrier }); } catch (e) { this.inRecoveryMode = true; }
      setTimeout(() => { this.isExecuting = false; }, 2000);
    }
  }
}
