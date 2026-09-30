/* VK monetization is independent of profile/storage availability. */
'use strict';
const VKAds = {
  ready: false, bannerVisible: false, bannerPending: false, busy: false,
  flights: 0, lastAd: 0, lastBannerAttempt: -Infinity, retryTimer: null, lastError: null,
  send(method, params, ms = 120000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(method + ' timeout')), ms);
      Promise.resolve().then(() => window.vkBridge.send(method, params)).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  },
  bannerLayout(result) {
    const height = result?.layout_type === 'overlay' && result.result !== false ? Math.min(150, Math.max(0, Number(result.banner_height) || 0)) : 0;
    $('gameContainer').style.setProperty('--vk-banner-space', height + 'px');
  },
  async banner(force = false) {
    if (!this.ready || this.bannerPending || (this.bannerVisible && !force) || Date.now() - this.lastBannerAttempt < 15000) return;
    this.bannerPending = true; this.lastBannerAttempt = Date.now();
    try {
      let result;
      try { result = await this.send('VKWebAppShowBannerAd', { banner_location: 'bottom', layout_type: 'resize', can_close: false }, 10000); }
      catch (error) {
        if (error?.error_data?.error_code !== 4) throw error;
        result = await this.send('VKWebAppShowBannerAd', { banner_location: 'bottom' }, 10000);
      }
      this.bannerVisible = result?.result !== false;
      if (!this.bannerVisible) throw new Error('No banner inventory');
      this.bannerLayout(result);
      this.lastError = null;
    } catch (error) {
      this.bannerVisible = false; this.lastError = String(error?.error_data?.error_reason || error?.message || 'Banner unavailable');
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => { if (!document.hidden) this.banner(); }, 60000);
    } finally { this.bannerPending = false; }
  },
  async afterFlight(duration) {
    if (!this.ready || duration < 15000) return;
    this.flights++;
    if (this.flights < 3 || this.busy || run.active || Date.now() - this.lastAd < 180000) return;
    this.busy = true; this.lastAd = Date.now(); this.flights = 0;
    $('bgMusic').pause();
    try {
      // Preserve the original Games call. New clients can advertise the native API instead.
      const bridge = window.vkBridge;
      const legacy = !bridge.supports || bridge.supports('VKWebAppShowInterstitialAd');
      if (legacy) {
        try { await this.send('VKWebAppShowInterstitialAd'); }
        catch (error) {
          const code = error?.error_data?.error_code;
          if (code !== 3 && code !== 4 && error?.error_type !== 'client_error') throw error;
          await this.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
        }
      } else await this.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
      this.lastError = null;
    } catch (error) { this.lastError = String(error?.error_data?.error_reason || error?.message || 'Interstitial unavailable'); }
    finally { this.busy = false; Audio.music(); this.banner(true); }
  }
};
const VK = {
  async init() {
    if (!new URLSearchParams(location.search).has('vk_app_id') && !window.vkBridge) return;
    const timeout = promise => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('VK timeout')), 5000);
      Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
    try {
      if (!window.vkBridge) await timeout(new Promise((resolve, reject) => {
        const s = document.createElement('script'); s.src = 'https://unpkg.com/@vkontakte/vk-bridge@2.14.0/dist/browser.min.js';
        s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
      }));
      await timeout(window.vkBridge.send('VKWebAppInit'));
    } catch { return; }
    VKAds.ready = true; VKAds.banner();
    window.vkBridge.subscribe(e => {
      const type = e.detail?.type;
      if (type === 'VKWebAppViewHide') { pauseGame(); $('bgMusic').pause(); }
      if (type === 'VKWebAppViewRestore') { if (!VKAds.busy) Audio.music(); VKAds.banner(true); }
      if (type === 'VKWebAppBannerAdUpdated') { VKAds.bannerVisible = e.detail.data?.result !== false; VKAds.bannerLayout(e.detail.data); }
      if (type === 'VKWebAppBannerAdClosedByUser') {
        VKAds.bannerVisible = false; VKAds.bannerLayout({ result: false });
        clearTimeout(VKAds.retryTimer); VKAds.retryTimer = setTimeout(() => VKAds.banner(), 15000);
      }
    });
    try {
      const user = await timeout(window.vkBridge.send('VKWebAppGetUserInfo'));
      const key = `voidstorm_data_${user.id}`;
      let loaded = safeParse(localGet(key));
      try { const cloud = await timeout(window.vkBridge.send('VKWebAppStorageGet', { keys: [key] })); loaded = safeParse(cloud.keys?.[0]?.value) || loaded; } catch { /* User-keyed local backup remains usable. */ }
      if (sessionChanged) { toast('Облачный профиль будет доступен при следующем запуске.'); return; }
      Save.userId = user.id;
      if (loaded) { if (!localGet(`${key}_before_v5`)) localSet(`${key}_before_v5`, JSON.stringify(loaded)); Save.data = Balance.migrate(loaded); }
      if (Save.data.migrationRefund) toast('Общие улучшения возмещены: ' + fmt(Save.data.migrationRefund) + ' CR. Каждый корабль улучшается отдельно.');
      selectedLevel = Save.data.campaignLevel; shopIndex = Save.data.currentShip; Missions.check(); renderMenu(); renderShop(); Daily.check();
    } catch { /* Ads stay available even if user info or cloud storage fails. */ }
  }
};
