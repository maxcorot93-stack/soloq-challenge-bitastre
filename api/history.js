// =====================================================================
// Historique de games d'un joueur (chargé au clic). Match-V5.
//   GET /api/history?p=Pseudo%23Tag   (ou ?puuid=...)
// =====================================================================
const L = require('./_lib.js');
const COUNT = parseInt(process.env.HISTORY_COUNT || '8', 10);

async function getMatch(id) {
  if (L.mem.match[id]) return L.mem.match[id];
  const fromU = await L.uGet('match:' + id);
  if (fromU) { try { const j = JSON.parse(fromU); L.mem.match[id] = j; return j; } catch { } }
  const m = await L.riot(`https://${L.REGIONAL}.api.riotgames.com/lol/match/v5/matches/${id}`).catch(() => null);
  if (!m) return null;
  L.mem.match[id] = m; await L.uSet('match:' + id, JSON.stringify(m)); // immuable -> cache permanent
  return m;
}

function summarize(m, puuid) {
  const info = m.info;
  const p = (info.participants || []).find(x => x.puuid === puuid);
  if (!p) return null;
  const durSec = info.gameDuration > 100000 ? info.gameDuration / 1000 : info.gameDuration;
  const cs = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
  const k = p.kills || 0, d = p.deaths || 0, a = p.assists || 0;
  return {
    matchId: m.metadata.matchId,
    champion: p.championName, champLevel: p.champLevel,
    win: !!p.win, remake: !!p.gameEndedInEarlySurrender || durSec < 300,
    kills: k, deaths: d, assists: a,
    kda: d === 0 ? (k + a) : Math.round(((k + a) / d) * 10) / 10,
    cs, csPerMin: durSec > 0 ? Math.round((cs / (durSec / 60)) * 10) / 10 : 0,
    durationMin: Math.round(durSec / 60),
    role: p.teamPosition || '',
    dmg: p.totalDamageDealtToChampions || 0,
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter(Boolean),
    endTs: info.gameEndTimestamp || info.gameCreation || null,
    queue: info.queueId,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!L.KEY) return res.status(500).json({ error: 'RIOT_API_KEY manquante.' });
  const q = req.query || {};
  try {
    let puuid = q.puuid;
    if (!puuid && q.p) { const [name, tag] = String(q.p).split('#'); if (name && tag) puuid = await L.getPuuid(name.trim(), tag.trim()); }
    if (!puuid) return res.status(400).json({ error: 'Paramètre p=Pseudo#Tag manquant ou joueur introuvable.' });

    // cache court par joueur (évite de re-tirer à chaque re-clic)
    const cacheKey = 'h:' + puuid;
    const cached = L.mem.hist[cacheKey];
    if (cached && Date.now() - cached.t < 60e3) return res.status(200).json(cached.v);

    const ver = await L.ddragonVersion();
    const ids = await L.riot(`https://${L.REGIONAL}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=${COUNT}`).catch(() => []);
    const games = [];
    for (const id of (ids || [])) { const m = await getMatch(id); if (m) { const s = summarize(m, puuid); if (s) games.push(s); } }

    const payload = { puuid, ddragonVersion: ver, games };
    L.mem.hist[cacheKey] = { t: Date.now(), v: payload };
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(200).json({ games: [], error: e.msg || String(e) });
  }
};
