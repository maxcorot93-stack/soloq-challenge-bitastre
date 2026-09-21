# 🏆 SoloQ Challenge — classement live entre potes

Un site web (thème LoL) qui affiche **en direct** le rang SoloQ de toi et tes potes. Un seul lien à partager.

- Classement par palier réel · LP · victoires/défaites · winrate · **LP gagnés depuis le début**.
- **Compteur 20 games classées / semaine** par joueur, avec **reset automatique le lundi 00:01 (Paris)** et compte à rebours.
- **Clique un invocateur** → sa **courbe de progression LP** + son **historique de games** (champion, KDA, CS, V/D).

- **Frontend** : `index.html` (aucune installation).
- **Backend** : `api/leaderboard.js` (fonction serverless qui appelle l'API Riot — la clé reste secrète côté serveur).
- **Zéro dépendance npm.** Déploiement gratuit sur **Vercel**.

---

## 1) Récupérer une clé API Riot (gratuit, ~2 min)

1. Va sur **https://developer.riotgames.com/** et connecte-toi avec ton compte Riot.
2. Sur la page d'accueil, copie ta **Development API Key** (commence par `RGAPI-…`).

> ⚠️ La *Development Key* **expire toutes les 24 h**. Pour un challenge sur plusieurs jours, demande une **Personal API Key** (permanente, gratuite) : bouton **« REGISTER PRODUCT »** → **Personal API Key** → remplis le petit formulaire (nom du projet, description « classement soloq entre amis », URL = ton futur lien Vercel). Validée en général vite. En attendant, la Development Key marche pour tester.

---

## 2) Mettre le projet sur GitHub

Le plus simple sans rien installer :

1. Crée un compte sur **https://github.com** si besoin.
2. **New repository** → nom `soloq-challenge` → **Create**.
3. **uploading an existing file** → glisse **tous** les fichiers de ce dossier (`index.html`, le dossier `api/`, `players.json`, `package.json`, `vercel.json`, `README.md`) → **Commit changes**.

*(Alternative pour initiés : `vercel` en CLI depuis ce dossier.)*

---

## 3) Déployer sur Vercel

1. Va sur **https://vercel.com** → **Sign up** avec **GitHub**.
2. **Add New… → Project** → importe ton repo `soloq-challenge`.
3. Avant de cliquer **Deploy**, ouvre **Environment Variables** et ajoute :

   | Name | Value |
   |------|-------|
   | `RIOT_API_KEY` | ta clé `RGAPI-…` |
   | `PLATFORM` | `euw1` |

4. **Deploy**. Au bout de ~30 s tu obtiens une URL du type `https://soloq-challenge-xxx.vercel.app` → **c'est le lien à partager** aux potes. 🎉

> Quand ta clé change (Development Key toutes les 24 h, ou passage à la Personal Key) : Vercel → ton projet → **Settings → Environment Variables** → modifie `RIOT_API_KEY` → onglet **Deployments** → **Redeploy**.

---

## 4) Mettre les joueurs

Édite **`players.json`** (directement sur GitHub : ouvre le fichier → icône crayon ✏️ → modifie → **Commit** ; Vercel redéploie tout seul) :

```json
{
  "challengeName": "SoloQ Challenge des potes",
  "players": [
    "TonPseudo#EUW",
    "Pote2#EUW",
    "Pote3#1234"
  ]
}
```

Le format est **Pseudo#Tag** (le *Riot ID*). Le tag se voit en jeu ou sur op.gg (ex : `Faker#KR1`). Sur EUW le tag est souvent `EUW` mais pas toujours — mets celui exact.

---

## 5) (Recommandé) Activer la progression « depuis le début » + la courbe

Sans ça, le site montre le **classement live**. Pour suivre les **LP gagnés** et la **courbe**, il faut un petit stockage (gratuit) — **Upstash Redis**, intégré à Vercel :

1. Vercel → ton projet → onglet **Storage** → **Create Database** → **Upstash for Redis** (Marketplace) → crée-la (région Europe).
2. Connecte-la au projet : Vercel ajoute automatiquement `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.
3. **Redeploy**.

Le **point de départ** du challenge est figé au **premier chargement** après activation. Pour le réinitialiser plus tard : ajoute une variable `RESET_TOKEN` (une valeur secrète au choix) puis ouvre `…/api/leaderboard?reset=TAVALEUR` une fois.

---

## Variables d'environnement (récap)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `RIOT_API_KEY` | ✅ | Clé API Riot |
| `PLATFORM` | – | Serveur (`euw1` par défaut ; `eun1`, `na1`, `kr`, …) |
| `PLAYERS` | – | Liste `Pseudo#Tag,…` (sinon `players.json`) |
| `UPSTASH_REDIS_REST_URL` / `…_TOKEN` | – | Progression + courbe + cache des games |
| `WEEKLY_CAP` | – | Plafond de games/semaine (défaut `20`) |
| `WEEK_TZ` | – | Fuseau du reset hebdo (défaut `Europe/Paris`) |
| `HISTORY_COUNT` | – | Nb de games dans l'historique (défaut `8`) |
| `RESET_TOKEN` | – | Réinitialiser le point de départ |

> **Débit API** : afficher les rangs + le compteur hebdo + l'historique fait plusieurs appels Riot. C'est bien géré (classement mis en cache ~55 s, détails de games mis en cache **définitivement**), mais avec une **Development Key** (limite basse) évite de rafraîchir à 10 en même temps. La **Personal API Key** (permanente, limite plus haute) est vivement recommandée pour un challenge à plusieurs. Brancher **Upstash** aide aussi (cache partagé).

---

## Tester en local (facultatif)

Avec Node 18+ : `npm i -g vercel` puis `vercel dev` dans ce dossier (crée un fichier `.env` avec `RIOT_API_KEY=RGAPI-…`). Ouvre http://localhost:3000.
Sans clé, ouvre juste `index.html` : il s'affiche en **mode démo** avec des données d'exemple.

---

## Notes

- Le classement est trié par **palier réel** (un score absolu Fer→Challenger, LP compris) pour comparer tout le monde correctement.
- L'API est mise en cache ~55 s : rafraîchir à plusieurs ne surcharge pas Riot.
- Respecte les [conditions d'utilisation de l'API Riot](https://developer.riotgames.com/policies/general) (usage perso/non commercial : OK).
