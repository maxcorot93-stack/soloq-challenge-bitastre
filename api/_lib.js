// =====================================================================
// Librairie partagée (fonctions serverless) — API Riot, cache, semaine.
// Fichier préfixé "_" => ignoré comme route par Vercel.
// =====================================================================
const KEY = process.env.RIOT_API_KEY;
const PLATFORM = (process.env.PLATFORM || 'euw1').toLowerCase();
const TZ = process.env.WEEK_TZ || 'Europe/Paris';

function regionalRoute(p) {
  if (['euw1', 'eun1', 'tr1', 'ru', 'me1'].includes(p)) return 'europe';
  if (['na1', 'br1', 'la1', 'la2'].includes(p)) return 'americas';
  if (['kr', 'jp1'].includes(p)) return 'asia';
  if (['oc1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(p)) return 'sea';
  return 'europe';
}
const REGIONAL = regionalRoute(PLATFORM);

// ---- Score d'échelle (Fer -> Challenger, LP compris) ----
const TIER_BASE = { IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2800, CHALLENGER: 2800 };
const DIV = { IV: 0, III: 100, II: 200, I: 300 };
function ladderScore(tier, division, lp) {
  if (!tier) return -1;
  const base = TIER_BASE[tier] ?? 0;
  if (tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER') return base + lp;
  return base + (DIV[division] ?? 0) + lp;
}

// ---- Fenêtre hebdomadaire : lundi 00:00 (heure locale TZ) -> lundi suivant ----
function tzParts(ts, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {}; for (const p of f.formatToParts(new Date(ts))) o[p.type] = p.value;
  return o;
}
function tzOffsetMs(ts, tz) { // ms dont le fuseau est en avance sur UTC à l'instant ts
  const p = tzParts(ts, tz);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? 0 : p.hour), +p.minute, +p.second);
  return asUTC - ts;
}
function weekWindow(now = Date.now()) {
  const p = tzParts(now, TZ);
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday] || 1;
  const daysSinceMon = wd - 1;
  // minuit (00:00) local du jour courant, exprimé comme si c'était de l'UTC :
  const midnightAsUTC = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0);
  const mondayAsUTC = midnightAsUTC - daysSinceMon * 86400000;
  const off = tzOffsetMs(mondayAsUTC, TZ);
  const start = mondayAsUTC - off;              // vrai epoch du lundi 00:00 local
  const end = start + 7 * 86400000;             // lundi suivant
  return { start, end, startSec: Math.floor(start / 1000), tz: TZ };
}

// ---- Appel Riot ----
async function riot(url) {
  const r = await fetch(url, { headers: { 'X-Riot-Token': KEY } });
  if (r.status === 404) return null;
  if (r.status === 429) throw { code: 429, msg: 'Limite de requêtes Riot atteinte (réessaie dans 1 min)' };
  if (r.status === 401 || r.status === 403) throw { code: r.status, msg: 'Clé API Riot invalide ou expirée' };
  if (!r.ok) throw { code: r.status, msg: 'Erreur Riot ' + r.status };
  return r.json();
}

// ---- Cache mémoire (instance chaude) ----
const mem = (globalThis.__soloq ||= { board: null, boardTs: 0, puuid: {}, ver: null, verTs: 0, match: {}, hist: {} });

// ---- Upstash (optionnel) ----
const UURL = process.env.UPSTASH_REDIS_REST_URL, UTOK = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH = !!(UURL && UTOK);
async function u(cmd) {
  const r = await fetch(UURL, { method: 'POST', headers: { Authorization: 'Bearer ' + UTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({})); return j.result;
}
async function uGet(k) { try { return UPSTASH ? await u(['GET', k]) : null; } catch { return null; } }
async function uSet(k, v) { try { if (UPSTASH) await u(['SET', k, v]); } catch { } }

async function ddragonVersion() {
  if (mem.ver && Date.now() - mem.verTs < 6 * 3600e3) return mem.ver;
  try { const v = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json(); mem.ver = v[0]; mem.verTs = Date.now(); return mem.ver; }
  catch { return mem.ver || '15.18.1'; }
}

async function getPuuid(name, tag) {
  const id = name + '#' + tag;
  if (mem.puuid[id]) return mem.puuid[id];
  const fromU = await uGet('puuid:' + id);
  if (fromU) { mem.puuid[id] = fromU; return fromU; }
  const acc = await riot(`https://${REGIONAL}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  if (!acc || !acc.puuid) return null;
  mem.puuid[id] = acc.puuid; await uSet('puuid:' + id, acc.puuid); return acc.puuid;
}

module.exports = {
  KEY, PLATFORM, REGIONAL, TZ, UPSTASH, mem,
  regionalRoute, ladderScore, weekWindow,
  riot, uGet, uSet, ddragonVersion, getPuuid,
};
