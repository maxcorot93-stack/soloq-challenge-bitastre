// =====================================================================
// SoloQ Challenge — classement live (API Riot). Voir _lib.js pour les helpers.
// =====================================================================
const L = require('./_lib.js');

const WEEKLY_CAP = parseInt(process.env.WEEKLY_CAP || '20', 10);

async function getSummoner(puuid) {
  return L.riot(`https://${L.PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`).catch(() => null);
}
async function getSoloRank(puuid, summonerId) {
  let e = await L.riot(`https://${L.PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`).catch(() => null);
  if (!e && summonerId) e = await L.riot(`https://${L.PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`).catch(() => null);
  return (e || []).find(x => x.queueType === 'RANKED_SOLO_5x5') || null;
}
async function getWeeklyGames(puuid, startSec) {
  const ids = await L.riot(`https://${L.REGIONAL}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${startSec}&queue=420&count=100`).catch(() => null);
  if (!Array.isArray(ids)) return 0;
  let n = 0; // exclut les remakes du compteur hebdo
  for (const id of ids) {
    const m = await L.getMatch(id);
    if (!m) { n++; continue; }
    const p = (m.info.participants || []).find(x => x.puuid === puuid);
    if (p && p.gameEndedInEarlySurrender) continue;
    n++;
  }
  return n;
}

async function fetchPlayer(riotId, ver, weekStartSec) {
  const [name, tag] = riotId.split('#');
  if (!name || !tag) return { riotId, name: riotId, tag: '', error: 'Format attendu : Pseudo#Tag' };
  try {
    const puuid = await L.getPuuid(name.trim(), tag.trim());
    if (!puuid) return { riotId, name, tag, error: 'Introuvable (pseudo#tag ou serveur ?)' };
    const [summ, weeklyGames] = await Promise.all([getSummoner(puuid), getWeeklyGames(puuid, weekStartSec)]);
    const solo = await getSoloRank(puuid, summ && summ.id);
    const tier = solo ? solo.tier : null, division = solo ? solo.rank : null;
    const lp = solo ? solo.leaguePoints : 0;
    let wins = solo ? solo.wins : 0, losses = solo ? solo.losses : 0, placements = false;
    if (!solo) { // pas de rang -> en placements : bilan V/D depuis l'historique
      const pl = await L.recentSoloWL(puuid, 5);
      wins = pl.wins; losses = pl.losses; placements = pl.games > 0;
    }
    return {
      riotId, name, tag, puuid, tier, division, lp, wins, losses, placements,
      games: wins + losses,
      winrate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null,
      score: L.ladderScore(tier, division, lp),
      hotStreak: solo ? !!solo.hotStreak : false,
      weeklyGames, overCap: weeklyGames > WEEKLY_CAP,
      summonerLevel: summ ? summ.summonerLevel : null,
      profileIcon: summ ? `https://ddragon.leagueoflegends.com/cdn/${ver}/img/profileicon/${summ.profileIconId}.png` : null,
    };
  } catch (e) { return { riotId, name, tag, error: e.msg || 'Erreur' }; }
}

async function mapLimit(arr, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, async () => { while (i < arr.length) { const k = i++; out[k] = await fn(arr[k]); } }));
  return out;
}
function loadPlayers() {
  let challengeName = 'SoloQ Challenge', players = [];
  try { const j = require('../players.json'); challengeName = j.challengeName || challengeName; players = j.players || []; } catch { }
  if (process.env.PLAYERS) players = process.env.PLAYERS.split(',').map(s => s.trim()).filter(Boolean);
  return { challengeName, players };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!L.KEY) return res.status(500).json({ error: "RIOT_API_KEY manquante (variables d'environnement Vercel)." });
  const cfg = loadPlayers();
  const week = L.weekWindow();
  if (!cfg.players.length) return res.status(200).json({ challengeName: cfg.challengeName, platform: L.PLATFORM, players: [], hasHistory: L.UPSTASH, weeklyCap: WEEKLY_CAP, week, updatedAt: Date.now(), note: 'Aucun joueur — édite players.json.' });

  if (req.query && req.query.reset && process.env.RESET_TOKEN && req.query.reset === process.env.RESET_TOKEN) { await L.uSet('baseline', ''); await L.uSet('history', ''); }

  if (L.mem.board && Date.now() - L.mem.boardTs < 55e3) {
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(L.mem.board);
  }

  try {
    const ver = await L.ddragonVersion();
    let players = await mapLimit(cfg.players, 4, (rid) => fetchPlayer(rid, ver, week.startSec));

    let history = null;
    if (L.UPSTASH) {
      const now = Date.now();
      let baseline = {}; try { baseline = JSON.parse(await L.uGet('baseline') || '{}'); } catch { }
      let hist = []; try { hist = JSON.parse(await L.uGet('history') || '[]'); } catch { }
      let changed = false;
      for (const p of players) {
        if (p.error) continue;
        if (baseline[p.riotId] == null) { baseline[p.riotId] = { score: p.score, ts: now }; changed = true; }
        p.startScore = baseline[p.riotId].score; p.lpGained = Math.round(p.score - p.startScore);
      }
      if (changed) await L.uSet('baseline', JSON.stringify(baseline));
      const last = hist[hist.length - 1];
      if (!last || now - last.t > 20 * 60e3) {
        const snap = { t: now, s: {} }; for (const p of players) if (!p.error) snap.s[p.riotId] = p.score;
        hist.push(snap); if (hist.length > 250) hist = hist.slice(-250); await L.uSet('history', JSON.stringify(hist));
      }
      history = hist;
    }

    players.sort((a, b) => (b.score ?? -2) - (a.score ?? -2));
    players.forEach((p, i) => { p.rankPos = p.error ? null : i + 1; });

    const payload = { challengeName: cfg.challengeName, platform: L.PLATFORM, updatedAt: Date.now(), hasHistory: L.UPSTASH, weeklyCap: WEEKLY_CAP, week, ddragonVersion: ver, players, history };
    L.mem.board = payload; L.mem.boardTs = Date.now();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(200).json({ challengeName: cfg.challengeName, platform: L.PLATFORM, players: [], hasHistory: L.UPSTASH, weeklyCap: WEEKLY_CAP, week, updatedAt: Date.now(), error: e.msg || String(e) });
  }
};
