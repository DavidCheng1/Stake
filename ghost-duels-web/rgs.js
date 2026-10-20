// Stake Engine RGS client: session from the URL, wallet calls, replay, money formatting.
// Amounts on the API are integers with 6 decimals (1,000,000 = 1.00); the game works in currency units.
const RGS = (() => {
  const API = 1e6;
  const url = new URLSearchParams(location.search);
  const sessionID = url.get("sessionID") || "";
  const rgsUrl = url.get("rgs_url") || "";
  const lang = (url.get("lang") || "en").toLowerCase();
  const replay = url.get("replay") === "true";
  const base = /^https?:\/\//.test(rgsUrl) ? rgsUrl : "https://" + rgsUrl;
  const MODE = "BASE";

  // https://stake-engine.com/docs/rgs: symbol, decimals, symbol after the amount
  const CURRENCIES = {
    USD: ["$", 2], CAD: ["CA$", 2], JPY: ["¥", 0], EUR: ["€", 2], RUB: ["₽", 2], CNY: ["CN¥", 2], PHP: ["₱", 2],
    INR: ["₹", 2], IDR: ["Rp", 0], KRW: ["₩", 0], BRL: ["R$", 2], MXN: ["MX$", 2], DKK: ["KR", 2, true],
    PLN: ["zł", 2, true], VND: ["₫", 0, true], TRY: ["₺", 2], CLP: ["CLP", 0, true], ARS: ["ARS", 2, true],
    PEN: ["S/", 2, true], XGC: ["GC", 2], XSC: ["SC", 2],
  };
  let currency = url.get("currency") || "USD";
  const meta = () => CURRENCIES[currency] || [currency, 2, true];
  const formatNumber = v => {
    const d = meta()[1];
    return Number(v).toLocaleString(lang, { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const formatMoney = v => {
    const [sym, , after] = meta();
    return after ? `${formatNumber(v)} ${sym}` : `${sym}${formatNumber(v)}`;
  };

  class RGSError extends Error {
    constructor(code, message) { super(message || code); this.code = code; }
  }
  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
      });
    } catch (e) {
      throw new RGSError("ERR_NETWORK", e.message);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new RGSError(data.error || data.code || `HTTP_${res.status}`, data.message);
    return data;
  }

  const api = {
    lang, replay, formatMoney, formatNumber, RGSError,
    jurisdiction: {},
    minimumRoundDuration: 0,

    // Returns { balance, betLevels, defaultBet, jurisdiction, round } with round = an active round to resume
    // (or the replayed round), amounts in currency units.
    async init() {
      if (replay) {
        const amount = (Number(url.get("amount")) || API) / API;
        const p = ["game", "version", "mode", "event"].map(k => encodeURIComponent(url.get(k) || ""));
        const data = await call("GET", `/bet/replay/${p.join("/")}`);
        return { balance: 0, betLevels: [amount], defaultBet: amount, jurisdiction: {}, round: { state: data.state, active: false, amount } };
      }
      const data = await call("POST", "/wallet/authenticate", { sessionID, language: lang });
      currency = data.balance.currency;
      const cfg = data.config || {};
      api.jurisdiction = cfg.jurisdiction || {};
      // unit is not documented: small values are taken as seconds, large ones as milliseconds
      const mrd = Number(api.jurisdiction.minimumRoundDuration) || 0;
      api.minimumRoundDuration = mrd < 100 ? mrd * 1000 : mrd;
      const betLevels = (cfg.betLevels || [API]).map(v => v / API);
      const def = (cfg.defaultBetLevel || API) / API;
      const r = data.round;
      return {
        balance: data.balance.amount / API,
        betLevels,
        defaultBet: betLevels.includes(def) ? def : betLevels[0],
        jurisdiction: api.jurisdiction,
        round: r && r.active && r.state && r.state.length ? { state: r.state, active: true, amount: r.amount / API } : null,
      };
    },
    // Debits the bet; returns { balance, round: { state, active, payoutMultiplier } }
    async play(bet) {
      const data = await call("POST", "/wallet/play", { sessionID, currency, mode: MODE, amount: Math.round(bet * API) });
      if (!data.round || !data.round.state || !data.round.state.length) throw new RGSError("ERR_EMPTY_ROUND");
      return { balance: data.balance.amount / API, round: data.round };
    },
    // Credits the payout of the active round; returns { balance }
    async endRound() {
      const data = await call("POST", "/wallet/end-round", { sessionID });
      return { balance: data.balance.amount / API };
    },
    // Stores progress so an interrupted round can resume; fire and forget
    saveEvent(index) {
      if (replay || index === undefined) return;
      call("POST", "/bet/event", { sessionID, event: String(index) }).catch(e => console.warn("bet/event", e));
    },
    errorText(err) {
      const de = lang === "de";
      const T = {
        ERR_IPB: de ? "Guthaben reicht nicht" : "Insufficient balance",
        ERR_IS: de ? "Sitzung abgelaufen, bitte neu laden" : "Session expired, please reload",
        ERR_ATE: de ? "Anmeldung abgelaufen, bitte neu laden" : "Authentication expired, please reload",
        ERR_GLE: de ? "Spiellimit erreicht" : "Gambling limit reached",
        ERR_LOC: de ? "In deinem Land nicht verfügbar" : "Not available in your location",
        ERR_MAINTENANCE: de ? "Wartungsarbeiten, bitte später erneut versuchen" : "Under maintenance, please try again later",
        ERR_NETWORK: de ? "Keine Verbindung, bitte erneut versuchen" : "Connection lost, please try again",
      };
      return T[err && err.code] || (de ? "Fehler, bitte neu laden" : "Something went wrong, please reload");
    },
  };
  return api;
})();
