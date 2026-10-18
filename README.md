<h1 align="center">🎬 Media Carousel</h1>

<p align="center">
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpeterdu1109%2FMediaCarousel%2Frefs%2Fheads%2Fjellyfin-12%2Frepository-12.json&query=%24%5B0%5D.versions%5B0%5D.version&label=version&color=blue&cacheSeconds=3600" alt="Version">
  <img src="https://img.shields.io/badge/Jellyfin-12.x-blueviolet" alt="Jellyfin 12.x">
  <img src="https://img.shields.io/badge/.NET-10.0-purple" alt=".NET 10">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/github/stars/peterdu1109/MediaCarousel?style=flat&color=yellow&cacheSeconds=3600" alt="GitHub stars">
  <img src="https://img.shields.io/github/downloads/peterdu1109/MediaCarousel/total?color=brightgreen&cacheSeconds=3600" alt="Downloads">
</p>

<p align="center">
  <b>Netflix-style rows on your Jellyfin home page, computed automatically.</b><br>
  <i>Des rangées façon Netflix sur ta page d'accueil Jellyfin, calculées toutes seules.</i>
</p>

<p align="center">
  <b>Jellyfin 12.x — one repository for every version / un seul dépôt pour toutes les versions :</b><br>
  <code>https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json</code>
</p>

---

<p align="center">
  <b>🌐 Language / Langue</b><br>
  <a href="#english">English</a> | <a href="#français">Français</a>
</p>

---

<a name="english"></a>
# English

Media Carousel adds ranked, Netflix-style rows under your libraries: a **server Top 10** built from real playback, a **worldwide Top 10** (TMDB or Trakt) with **Seerr requests** for missing titles, and rows built from your own library. Everything is computed on the server, in the background; your home page keeps everything it already shows.

> 📖 **Changelog:** see [GitHub Releases](https://github.com/peterdu1109/MediaCarousel/releases).

## 📑 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [✨ Key Features](#-key-features)
- [📱 Compatibility](#-compatibility)
- [📦 Installation](#-installation)
- [⚙️ Configuration](#️-configuration)
- [⚠️ Known Limits & Conflicts](#️-known-limits--conflicts)
- [❓ Troubleshooting](#-troubleshooting)
- [🎨 Recommended Theme](#-recommended-theme)
- [👥 Authors, Support & License](#-authors-support--license)

## 🚀 Quick Start

1. Add the repository above in **Dashboard → Plugins → Repositories**.
2. Install **Media Carousel** from the Catalog → restart Jellyfin.
3. In **Dashboard → Plugins → Media Carousel**, tick the rows you want and click **Save**.
4. Open your home page (`Ctrl+Shift+R` once if the rows don't show).

The rows then refresh on their own: at server start and every 6 hours by default.

## ✨ Key Features

*   **Server Top 10** — What your users really watch. With the **Playback Reporting** plugin, a person counts once they watched a title for at least 5 minutes; episodes count for their series.
*   **Worldwide Top 10** — Trending titles from **TMDB** or **Trakt**, matched to your library. Optionally one row for movies and one for series.
*   **Seerr requests** — A *Request* button on titles you don't have yet (Jellyseerr, Overseerr…), sent under each user's own Seerr account, like Jellyfin Enhanced.
*   **Rows from your library** — *All-time most watched*, *Back this week*, *Never watched*, *Because you watched…*, *By studio* (logos, variants merged), *By genre*.
*   **Per-account rows** — Each user can choose their rows, their order, the accent color and the rank size (the admin can turn this off).
*   **Fits your theme** — Real Jellyfin cards: same size, spacing and fonts as the native rows, ElegantFin included. Nothing native is removed.
*   **Works with a remote** — TV layout: one stop per card, visible selection, Back closes windows.
*   **Respects permissions** — Each user only sees titles from libraries and ratings they are allowed.

## 📱 Compatibility

Media Carousel shows its rows wherever the client loads the **server's** web interface.

| Client | Rows | Tested |
|---|---|---|
| Web browser (desktop, mobile) | ✅ | not recorded |
| Jellyfin Android app (web interface) | ✅ | not recorded |
| Android TV app built on the web interface | ✅ | not recorded |
| Samsung (Tizen) / LG (webOS) apps | ❌ by default — see [limits](#️-known-limits--conflicts) | not recorded |
| Kodi and other non-web clients | Optional collections only | not recorded |

Made for **Jellyfin 12.x**. On Jellyfin 10.11, the same repository installs the last 10.11 version (3.15.1), which is no longer updated.

## 📦 Installation

> [!NOTE]
> **One repository for every Jellyfin version.** Jellyfin picks the build made for it: 4.x on Jellyfin 12, 3.15.1 on Jellyfin 10.11. The old Jellyfin 12 address keeps working.

1.  **Dashboard → Plugins → Repositories → +**, add:
    ```
    https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
    ```
2.  **Catalog** → install **Media Carousel**.
3.  Restart Jellyfin.

Nothing else to install: the plugin adds its script to the web interface on its own — through the **File Transformation** plugin if present (survives Jellyfin updates), otherwise by editing `index.html`.

**Manual install:** download the ZIP from [Releases](https://github.com/peterdu1109/MediaCarousel/releases), unzip it into `plugins/MediaCarousel/`, restart.

## ⚙️ Configuration

**Dashboard → Plugins → Media Carousel.** The page has five blocks and one *Advanced settings* fold; a row's settings only show when the row is ticked.

| Setting | Default | Description |
|---|---|---|
| **Home rows** | Server Top, Worldwide Top, Back this week, Never watched, Because…, Studios, Genres | One checkbox per row, ▲▼ to order them |
| **Server Top — period** | `30` days | `7` = week, `0` = all time |
| **Server Top — size** | `10` | Also the size of *All-time most watched* |
| **Worldwide Top** | off | Source TMDB/Trakt, list (trending, now playing, upcoming), API key — never sent to browsers |
| **Only titles in my library** | ✅ | Untick to show missing titles (needed for Seerr buttons) |
| **Seerr requests** | off | Seerr address (as seen from the Jellyfin server) and API key; *Test connection* button |
| **Accent color / rank size** | `#775BF4` / `100` % | |
| **Let each account customize** | ✅ | The *Customize my rows* panel on the home page |
| **Recompute every** | `6` h | |
| **Create a collection per ranking** | off | For clients without rows (Kodi…); rank order kept |
| **Ignore IPTV content** | ✅ | Keeps IPTV catalogs (XFusion and similar) out of the rows |

API keys: **TMDB** → [themoviedb.org → Settings → API](https://www.themoviedb.org/settings/api) · **Trakt** → [trakt.tv → Applications](https://trakt.tv/oauth/applications) (Client ID). Both free.

## ⚠️ Known Limits & Conflicts

*   **Samsung (Tizen) and LG (webOS) TV apps** carry their own copy of the web interface and never load the server's: the rows don't appear there, and no setting can change it. A TV package rebuilt from a web interface that includes the plugin's script does show them.
*   **Never watched** and **Because you watched…** are movies only: Jellyfin only marks a series as played once *every* episode is.
*   **Because you watched…** is the only row computed in the browser, so it differs per account.
*   **Other plugins and themes:** the plugin adds one `<script>` tag next to the others and never touches them; *Hide Jellyfin sections* only hides sections built by Jellyfin, never rows added by other plugins.

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| **No rows on the home page** | Restart Jellyfin, then `Ctrl+Shift+R`: the browser keeps the old page. |
| **Every row fails on Jellyfin 12** | A 3.x version is installed: update Media Carousel from the Catalog (4.x is the Jellyfin 12 line). |
| **Worldwide Top is empty** | Check the API key; with *Only titles in my library*, only titles you own show. |
| **No *Request* button** | Untick *Only titles in my library*, import your Jellyfin users into Seerr, then Save. |
| **Server Top counts titles marked as watched** | Install **Playback Reporting** to count real playback. |
| **Rows missing on a Samsung/LG TV** | Expected — see [Known Limits](#️-known-limits--conflicts). |

## 🎨 Recommended Theme

Media Carousel is made to sit naturally in [**ElegantFin Cinema Edition**](https://github.com/peterdu1109/ElegantFin). Colors can be adjusted from Jellyfin's Custom CSS:

```css
.mc-row { --mc-accent: #e50914; --mc-rank-stroke: rgba(255, 255, 255, .6); --mc-side-padding: 2%; }
```

## 👥 Authors, Support & License

Maintained by **[ElieMFR](https://github.com/ElieMFR)** and **[Peterdu1109](https://github.com/peterdu1109)**.

Bugs and ideas: [GitHub Issues](https://github.com/peterdu1109/MediaCarousel/issues) — please give your Jellyfin version, the client (browser, app, TV), the plugin version, your other plugins and theme, and the server log lines mentioning `MediaCarousel`.

Released under the [MIT License](./LICENSE).

---

<a name="français"></a>
# Français

Media Carousel ajoute sous tes bibliothèques des rangées classées façon Netflix : un **Top 10 du serveur** tiré des vraies lectures, un **Top 10 mondial** (TMDB ou Trakt) avec **demandes à Seerr** pour les titres absents, et des rangées tirées de ta bibliothèque. Tout est calculé par le serveur, en tâche de fond ; ta page d'accueil garde tout ce qu'elle affiche déjà.

> 📖 **Nouveautés :** voir les [versions sur GitHub](https://github.com/peterdu1109/MediaCarousel/releases).

## 📑 Sommaire

- [🚀 Démarrage rapide](#-démarrage-rapide)
- [✨ Fonctionnalités](#-fonctionnalités)
- [📱 Compatibilité](#-compatibilité)
- [📦 Installation](#-installation-1)
- [⚙️ Réglages](#️-réglages)
- [⚠️ Limites et conflits connus](#️-limites-et-conflits-connus)
- [❓ Dépannage](#-dépannage)
- [🎨 Thème recommandé](#-thème-recommandé)
- [👥 Auteurs, aide et licence](#-auteurs-aide-et-licence)

## 🚀 Démarrage rapide

1. Ajoute le dépôt ci-dessus dans **Tableau de bord → Extensions → Dépôts**.
2. Installe **Media Carousel** depuis le catalogue → redémarre Jellyfin.
3. Dans **Tableau de bord → Extensions → Media Carousel**, coche les rangées voulues et clique sur **Enregistrer**.
4. Ouvre ta page d'accueil (`Ctrl+Maj+R` une fois si les rangées n'apparaissent pas).

Ensuite, les rangées se recalculent toutes seules : au démarrage du serveur, puis toutes les 6 heures par défaut.

## ✨ Fonctionnalités

*   **Top 10 du serveur** — Ce que tes utilisateurs regardent vraiment. Avec le plugin **Playback Reporting**, une personne compte dès 5 minutes de visionnage ; les épisodes comptent pour leur série.
*   **Top 10 mondial** — Les tendances de **TMDB** ou **Trakt**, rapprochées de ta bibliothèque. En option, une rangée pour les films et une pour les séries.
*   **Demandes à Seerr** — Un bouton *Demander* sur les titres que tu n'as pas encore (Jellyseerr, Overseerr…), envoyé au nom du compte Seerr de chacun, comme dans Jellyfin Enhanced.
*   **Rangées tirées de ta bibliothèque** — *Les plus regardés de tous les temps*, *De retour cette semaine*, *Jamais vu*, *Parce que tu as regardé…*, *Par studio* (logos, variantes fusionnées), *Par genre*.
*   **Rangées par compte** — Chacun peut choisir ses rangées, leur ordre, la couleur et la taille du chiffre (l'administrateur peut le désactiver).
*   **S'adapte à ton thème** — De vraies cartes Jellyfin : même taille, mêmes marges et même police que les rangées natives, ElegantFin compris. Rien de natif n'est retiré.
*   **À la télécommande** — En affichage TV : un arrêt par carte, la sélection se voit, Retour ferme les fenêtres.
*   **Respecte les droits** — Chacun ne voit que les titres des bibliothèques et classifications qui lui sont permises.

## 📱 Compatibilité

Les rangées apparaissent partout où le client charge l'interface web **du serveur**.

| Client | Rangées | Essai consigné |
|---|---|---|
| Navigateur (ordinateur, téléphone) | ✅ | non |
| Appli Jellyfin Android (interface web) | ✅ | non |
| Appli Android TV construite sur l'interface web | ✅ | non |
| Applis Samsung (Tizen) / LG (webOS) | ❌ par défaut — voir [limites](#️-limites-et-conflits-connus) | non |
| Kodi et clients non web | Collections en option seulement | non |

Conçu pour **Jellyfin 12.x**. Sur Jellyfin 10.11, le même dépôt installe la dernière version 10.11 (3.15.1), qui n'est plus mise à jour.

## 📦 Installation

> [!NOTE]
> **Un seul dépôt pour toutes les versions de Jellyfin.** Jellyfin choisit lui-même la version faite pour lui : 4.x sur Jellyfin 12, 3.15.1 sur Jellyfin 10.11. L'ancienne adresse Jellyfin 12 reste valable.

1.  **Tableau de bord → Extensions → Dépôts → +**, ajoute :
    ```
    https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
    ```
2.  **Catalogue** → installe **Media Carousel**.
3.  Redémarre Jellyfin.

Rien d'autre à installer : le plugin ajoute lui-même son script à l'interface web — par le plugin **File Transformation** s'il est présent (résiste aux mises à jour de Jellyfin), sinon en modifiant `index.html`.

**À la main :** télécharge le ZIP depuis les [versions](https://github.com/peterdu1109/MediaCarousel/releases), décompresse-le dans `plugins/MediaCarousel/`, redémarre.

## ⚙️ Réglages

**Tableau de bord → Extensions → Media Carousel.** La page tient en cinq blocs et un pli « Réglages avancés » ; les réglages d'une rangée n'apparaissent que si elle est cochée.

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| **Rangées de l'accueil** | Top du serveur, Top mondial, De retour, Jamais vu, Parce que…, Studios, Genres | Une case par rangée, ▲▼ pour les ranger |
| **Top du serveur — période** | `30` jours | `7` = la semaine, `0` = depuis toujours |
| **Top du serveur — nombre** | `10` | Vaut aussi pour *Les plus regardés de tous les temps* |
| **Top mondial** | désactivé | Source TMDB/Trakt, liste (tendances, à l'affiche, prochaines sorties), clé d'API — jamais transmise aux navigateurs |
| **Ne garder que les titres présents** | ✅ | À décocher pour voir les titres absents (nécessaire aux boutons Seerr) |
| **Demandes à Seerr** | désactivé | Adresse de Seerr (vue depuis le serveur Jellyfin) et clé d'API ; bouton *Tester la connexion* |
| **Couleur / taille du chiffre** | `#775BF4` / `100` % | |
| **Laisser chaque compte régler son accueil** | ✅ | Le panneau *Personnaliser mes rangées* sur l'accueil |
| **Recalcul toutes les** | `6` h | |
| **Créer une collection par classement** | désactivé | Pour les clients sans rangées (Kodi…) ; l'ordre du classement est gardé |
| **Ignorer le contenu IPTV** | ✅ | Écarte les catalogues IPTV (XFusion et consorts) des rangées |

Clés d'API : **TMDB** → [themoviedb.org → Paramètres → API](https://www.themoviedb.org/settings/api) · **Trakt** → [trakt.tv → Applications](https://trakt.tv/oauth/applications) (Client ID). Gratuites toutes les deux.

## ⚠️ Limites et conflits connus

*   **Applis TV Samsung (Tizen) et LG (webOS)** : elles embarquent leur propre copie de l'interface web et ne chargent jamais celle du serveur. Les rangées n'y apparaissent pas, et aucun réglage ne peut y changer quoi que ce soit. Un paquet TV reconstruit à partir d'une interface web qui contient le script du plugin les affiche.
*   **Jamais vu** et **Parce que tu as regardé…** ne concernent que les films : Jellyfin ne marque une série comme vue que lorsque *tous* ses épisodes le sont.
*   **Parce que tu as regardé…** est la seule rangée calculée par le navigateur : elle diffère d'un compte à l'autre.
*   **Autres plugins et thèmes** : le plugin ajoute une balise `<script>` à côté des autres sans jamais les toucher ; *Masquer les sections de Jellyfin* ne masque que les sections construites par Jellyfin, jamais les rangées d'autres plugins.

## ❓ Dépannage

| Problème | Solution |
|-------|----------|
| **Aucune rangée sur l'accueil** | Redémarre Jellyfin, puis `Ctrl+Maj+R` : le navigateur garde l'ancienne page. |
| **Toutes les rangées échouent sur Jellyfin 12** | Une version 3.x est installée : mets Media Carousel à jour depuis le catalogue (la 4.x est la ligne Jellyfin 12). |
| **Top mondial vide** | Vérifie la clé d'API ; avec *Ne garder que les titres présents*, seuls tes titres apparaissent. |
| **Pas de bouton *Demander*** | Décoche *Ne garder que les titres présents*, importe tes utilisateurs Jellyfin dans Seerr, puis enregistre. |
| **Le Top du serveur compte les titres marqués « vu »** | Installe **Playback Reporting** pour compter les vraies lectures. |
| **Pas de rangées sur une TV Samsung/LG** | Normal — voir [Limites](#️-limites-et-conflits-connus). |

## 🎨 Thème recommandé

Media Carousel s'intègre naturellement à [**ElegantFin Cinema Edition**](https://github.com/peterdu1109/ElegantFin). Les couleurs se règlent depuis le Custom CSS de Jellyfin :

```css
.mc-row { --mc-accent: #e50914; --mc-rank-stroke: rgba(255, 255, 255, .6); --mc-side-padding: 2%; }
```

## 👥 Auteurs, aide et licence

Maintenu par **[ElieMFR](https://github.com/ElieMFR)** et **[Peterdu1109](https://github.com/peterdu1109)**.

Bugs et idées : [GitHub Issues](https://github.com/peterdu1109/MediaCarousel/issues) — indique ta version de Jellyfin, le client (navigateur, appli, TV), la version du plugin, tes autres plugins et ton thème, et les lignes du journal du serveur qui mentionnent `MediaCarousel`.

Publié sous [licence MIT](./LICENSE).

---

<details>
<summary><b>For developers / Pour les développeurs</b></summary>

All routes require Jellyfin authentication. / Toutes les routes exigent une authentification Jellyfin.

| Method | Route | Access |
|---|---|---|
| `GET` | `/MediaCarousel/Top/Local?limit=10` | Authenticated |
| `GET` | `/MediaCarousel/Top/Global?limit=10` | Authenticated |
| `GET` | `/MediaCarousel/Rows/Returning?limit=20` | Authenticated |
| `GET` | `/MediaCarousel/Rows/NeverPlayed?limit=20` | Authenticated |
| `GET` | `/MediaCarousel/Studios?limit=20` | Authenticated |
| `GET` | `/MediaCarousel/Genres?limit=6` | Authenticated |
| `GET` | `/MediaCarousel/Status` | Administrator |

Reads never trigger a computation: they return the last published ranking, filtered for the caller. Build: `dotnet build -c Release` (branch `jellyfin-12`, .NET 10). Tests: [tests/README.md](tests/README.md).

</details>
