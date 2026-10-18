<h1 align="center">🎬 Media Carousel</h1>

<p align="center">
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpeterdu1109%2FMediaCarousel%2Fmain%2Fmanifest.json&query=%24%5B0%5D.versions%5B0%5D.version&label=version&color=blue&cacheSeconds=3600" alt="Version">
  <img src="https://img.shields.io/badge/.NET-10.0%20%7C%209.0-purple" alt=".NET">
  <img src="https://img.shields.io/badge/Jellyfin-12.x%20%7C%2010.11.x-blueviolet" alt="Jellyfin">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/github/stars/peterdu1109/MediaCarousel?style=flat&color=yellow&cacheSeconds=3600" alt="GitHub stars">
  <img src="https://img.shields.io/github/downloads/peterdu1109/MediaCarousel/total?color=brightgreen&cacheSeconds=3600" alt="Downloads">
  <img src="https://img.shields.io/github/release-date/peterdu1109/MediaCarousel?color=orange&cacheSeconds=3600" alt="Last release">
</p>

<p align="center">
  <b>Netflix-style rows on your Jellyfin home page, computed automatically.</b><br>
  <i>Des rangées façon Netflix sur ta page d'accueil Jellyfin, calculées toutes seules.</i>
</p>

---

<p align="center">
  <b>🌐 Language / Langue</b><br>
  <a href="#english">English</a> | <a href="#français">Français</a>
</p>

---

<a name="english"></a>
# English

Media Carousel adds ranked rows under your libraries, like on streaming platforms: a Top 10 of what your users really watch, a worldwide Top 10, and rows built from your library. Everything is computed by the server, in the background.

> 📖 **Version history:** see [GitHub Releases](https://github.com/peterdu1109/MediaCarousel/releases) for what's new in each version.

## 📑 Table of Contents

- [✨ Key Features](#-key-features)
- [📦 Installation](#-installation)
- [⚙️ Configuration](#️-configuration)
- [⚠️ Known Limits](#️-known-limits)
- [❓ Troubleshooting](#-troubleshooting)
- [🎨 Recommended Theme](#-recommended-theme)
- [👥 Authors & Credits](#-authors--credits)

## ✨ Key Features

*   **Server Top 10**: what your users really watch. With the **Playback Reporting** plugin, a person counts after 5 minutes of viewing. Episodes count for their series.
*   **Worldwide Top 10**: the trends from **TMDB** or **Trakt**, matched to your library. One row for movies and one for series if you like.
*   **Seerr requests**: a **Request** button on the titles you don't have yet (Jellyseerr, Overseerr). The request goes out under each user's own Seerr account, as in Jellyfin Enhanced.
*   **Rows from your library**: all-time most watched, back this week, never watched, because you watched, by studio, by genre.
*   **Rows per account**: everyone can choose their rows, their order, the color and the size of the numbers. The admin can turn this off.
*   **Fits your theme**: real Jellyfin cards, same size, spacing and fonts as the native rows, ElegantFin included. Nothing native is removed.
*   **Remote control**: on TV, one stop per card, a visible selection, Back closes the windows.
*   **Permissions respected**: everyone only sees the libraries and ratings they are allowed.

## 📦 Installation

> [!IMPORTANT]
> **Requirements:**
> * Jellyfin **12.x**
> * Jellyfin **10.11.x** (with Media Carousel 3.15.1, no longer updated)
>
> 📺 **On TV:** the rows only show if the TV app loads the server's web interface. The Samsung (Tizen) and LG (webOS) apps carry their own copy and don't show them.

### Steps
1.  Open **Dashboard → Plugins → Repositories**.
2.  Add this repository, the same for 12.x and 10.11.x:
    ```
    https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
    ```
3.  Go to the **Catalog** and install **Media Carousel**.
4.  Restart Jellyfin.
5.  In **Dashboard → Plugins → Media Carousel**, check the rows you want and click **Save**.
6.  Open your home page. If the rows don't show, press `Ctrl+Shift+R` once.

Nothing else to install: the plugin adds its script to the web interface by itself, through the **File Transformation** plugin if you have it (it then survives Jellyfin updates), otherwise by editing `index.html`.

**Manual install:** download the ZIP from [Releases](https://github.com/peterdu1109/MediaCarousel/releases), unzip it into `plugins/MediaCarousel/`, restart Jellyfin.

## ⚙️ Configuration

Go to **Dashboard → Plugins → Media Carousel**. The settings page is in French; the names below are the ones it shows.

| Setting | Default | Description |
|---------|---------|-------------|
| **Afficher les rangées sur la page d'accueil** | `enabled` | Then one checkbox per row, and arrows to set their order. |
| **Période (jours)** | `30` | Server Top period. `7` for the week, `0` for all time. |
| **Nombre de titres** | `10` | Size of each ranking. |
| **Top mondial** | `disabled` | Source (TMDB or Trakt), list and **Clé d'API**. The key is never sent to browsers. |
| **Ne garder que les titres présents dans la bibliothèque** | `enabled` | Uncheck it to show missing titles, and their Seerr button. |
| **Proposer les demandes à Seerr** | `disabled` | With the **Adresse de Seerr** (as seen from the Jellyfin server) and the **Clé d'API de Seerr**. |
| **Couleur d'accentuation** | `#775BF4` | Color of the numbers on hover and of the selection. |
| **Taille du chiffre (%)** | `100` | Below 100, the row gets narrower. The posters don't change. |
| **Laisser chaque compte régler son accueil** | `enabled` | The **Personnaliser mes rangées** panel on the home page. |
| **Recalcul toutes les (heures)** | `6` | How often the rankings are computed again. |
| **Créer aussi une collection par classement** | `disabled` | For clients without the rows, such as Kodi. The rank order is kept. |
| **Ignorer le contenu IPTV (XFusion et autres chaînes)** | `enabled` | Keeps IPTV catalogs out of the rows. |

API keys are free: **TMDB** on [themoviedb.org → Settings → API](https://www.themoviedb.org/settings/api), **Trakt** on [trakt.tv → Applications](https://trakt.tv/oauth/applications) (the Client ID).

## ⚠️ Known Limits

*   **Samsung and LG TVs:** their apps carry their own copy of the web interface and never load the server's. No setting can change that.
*   **Never watched** and **Because you watched** only cover movies: Jellyfin only marks a series as watched once all its episodes are.
*   **Because you watched** is computed in the browser, so it differs from one account to another.
*   **Other plugins:** Media Carousel adds its own script tag without touching the others, and **Les masquer** (Jellyfin sections) only hides sections built by Jellyfin, never the rows of other plugins.

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| **No rows on the home page** | Restart Jellyfin, then `Ctrl+Shift+R`: the browser keeps the old page. |
| **Every row fails on Jellyfin 12** | A 3.x version is installed. Update Media Carousel from the Catalog: 4.x is the Jellyfin 12 line. |
| **The worldwide Top is empty** | Check the API key. With **Ne garder que les titres présents**, only the titles you have show. |
| **No Request button** | Uncheck **Ne garder que les titres présents**, import your Jellyfin users into Seerr, then click **Save**. |
| **The server Top counts titles marked as watched** | Install **Playback Reporting** to count real viewing. |
| **No rows on a Samsung or LG TV** | Expected, see [Known Limits](#️-known-limits). |

## 🎨 Recommended Theme

Media Carousel fits naturally into [**ElegantFin Cinema Edition**](https://github.com/peterdu1109/ElegantFin). You can change its colors from Jellyfin's custom CSS:

```css
.mc-row { --mc-accent: #e50914; --mc-rank-stroke: rgba(255, 255, 255, .6); --mc-side-padding: 2%; }
```

## 👥 Authors & Credits

Media Carousel is maintained by **[ElieMFR](https://github.com/ElieMFR)** and **[Peterdu1109](https://github.com/peterdu1109)**.

Bug reports and ideas are welcome on [GitHub Issues](https://github.com/peterdu1109/MediaCarousel/issues). Please give your Jellyfin version, the client (browser, app, TV), the plugin version, your other plugins and theme, and the server log lines that mention `MediaCarousel`.

Released under the [MIT License](./LICENSE).

---

<a name="français"></a>
# Français

Media Carousel ajoute sous tes bibliothèques des rangées classées, comme sur les plateformes de streaming : un Top 10 de ce que tes utilisateurs regardent vraiment, un Top 10 mondial, et des rangées tirées de ta bibliothèque. Tout est calculé par le serveur, en tâche de fond.

> 📖 **Historique des versions :** voir les [versions sur GitHub](https://github.com/peterdu1109/MediaCarousel/releases) pour les nouveautés de chaque version.

## 📑 Sommaire

- [✨ Fonctionnalités](#-fonctionnalités)
- [📦 Installation](#-installation-1)
- [⚙️ Réglages](#️-réglages)
- [⚠️ Limites connues](#️-limites-connues)
- [❓ Dépannage](#-dépannage)
- [🎨 Thème recommandé](#-thème-recommandé)
- [👥 Auteurs et remerciements](#-auteurs-et-remerciements)

## ✨ Fonctionnalités

*   **Top 10 du serveur** : ce que tes utilisateurs regardent vraiment. Avec le plugin **Playback Reporting**, une personne compte après 5 minutes de visionnage. Les épisodes comptent pour leur série.
*   **Top 10 mondial** : les tendances de **TMDB** ou de **Trakt**, rapprochées de ta bibliothèque. Une rangée pour les films et une pour les séries si tu veux.
*   **Demandes à Seerr** : un bouton **Demander** sur les titres que tu n'as pas encore (Jellyseerr, Overseerr). La demande part au nom du compte Seerr de chacun, comme dans Jellyfin Enhanced.
*   **Rangées tirées de ta bibliothèque** : les plus regardés de tous les temps, de retour cette semaine, jamais vu, parce que tu as regardé, par studio, par genre.
*   **Rangées par compte** : chacun choisit ses rangées, leur ordre, la couleur et la taille des chiffres. L'administrateur peut le désactiver.
*   **S'accorde à ton thème** : de vraies cartes Jellyfin, avec la taille, les marges et la police des rangées natives, ElegantFin compris. Rien de natif n'est retiré.
*   **À la télécommande** : sur la télé, un arrêt par carte, la sélection bien visible, Retour ferme les fenêtres.
*   **Droits respectés** : chacun ne voit que les bibliothèques et les classifications qui lui sont permises.

## 📦 Installation

> [!IMPORTANT]
> **Prérequis :**
> * Jellyfin **12.x**
> * Jellyfin **10.11.x** (avec Media Carousel 3.15.1, qui n'est plus mis à jour)
>
> 📺 **Sur la télé :** les rangées n'apparaissent que si l'appli charge l'interface web du serveur. Les applis Samsung (Tizen) et LG (webOS) ont leur propre copie et ne les affichent pas.

### Étapes
1.  Ouvre **Tableau de bord → Extensions → Dépôts**.
2.  Ajoute ce dépôt, le même pour 12.x et 10.11.x :
    ```
    https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
    ```
3.  Va dans le **Catalogue** et installe **Media Carousel**.
4.  Redémarre Jellyfin.
5.  Dans **Tableau de bord → Extensions → Media Carousel**, coche les rangées voulues et clique sur **Enregistrer**.
6.  Ouvre ta page d'accueil. Si les rangées n'apparaissent pas, fais `Ctrl+Maj+R` une fois.

Rien d'autre à installer : le plugin ajoute lui-même son script à l'interface web, par le plugin **File Transformation** si tu l'as (il résiste alors aux mises à jour de Jellyfin), sinon en modifiant `index.html`.

**À la main :** télécharge le ZIP depuis les [versions](https://github.com/peterdu1109/MediaCarousel/releases), décompresse-le dans `plugins/MediaCarousel/`, redémarre Jellyfin.

## ⚙️ Réglages

Va dans **Tableau de bord → Extensions → Media Carousel**.

| Réglage | Défaut | À quoi ça sert |
|---------|--------|----------------|
| **Afficher les rangées sur la page d'accueil** | `activé` | Ensuite, une case par rangée et des flèches pour les ranger. |
| **Période (jours)** | `30` | Période du Top du serveur. `7` pour la semaine, `0` depuis toujours. |
| **Nombre de titres** | `10` | Taille de chaque classement. |
| **Top mondial** | `désactivé` | Source (TMDB ou Trakt), liste et **Clé d'API**. La clé n'est jamais envoyée aux navigateurs. |
| **Ne garder que les titres présents dans la bibliothèque** | `activé` | À décocher pour voir les titres absents, et leur bouton Seerr. |
| **Proposer les demandes à Seerr** | `désactivé` | Avec l'**Adresse de Seerr** (vue depuis le serveur Jellyfin) et la **Clé d'API de Seerr**. |
| **Couleur d'accentuation** | `#775BF4` | Couleur des chiffres au survol et de la sélection. |
| **Taille du chiffre (%)** | `100` | En dessous de 100, la rangée se resserre. Les affiches ne changent pas. |
| **Laisser chaque compte régler son accueil** | `activé` | Le panneau **Personnaliser mes rangées** sur l'accueil. |
| **Recalcul toutes les (heures)** | `6` | Fréquence du recalcul des classements. |
| **Créer aussi une collection par classement** | `désactivé` | Pour les clients sans les rangées, comme Kodi. L'ordre du classement est gardé. |
| **Ignorer le contenu IPTV (XFusion et autres chaînes)** | `activé` | Écarte les catalogues IPTV des rangées. |

Les clés d'API sont gratuites : **TMDB** sur [themoviedb.org → Paramètres → API](https://www.themoviedb.org/settings/api), **Trakt** sur [trakt.tv → Applications](https://trakt.tv/oauth/applications) (le Client ID).

## ⚠️ Limites connues

*   **Télés Samsung et LG :** leurs applis embarquent leur propre copie de l'interface web et ne chargent jamais celle du serveur. Aucun réglage n'y peut rien.
*   **Jamais vu** et **Parce que tu as regardé** ne concernent que les films : Jellyfin ne marque une série comme vue que lorsque tous ses épisodes le sont.
*   **Parce que tu as regardé** est calculé par le navigateur, donc diffère d'un compte à l'autre.
*   **Autres plugins :** Media Carousel ajoute son propre script sans toucher aux autres, et **Les masquer** (sections de Jellyfin) ne masque que les sections construites par Jellyfin, jamais les rangées d'autres plugins.

## ❓ Dépannage

| Problème | Solution |
|----------|----------|
| **Aucune rangée sur l'accueil** | Redémarre Jellyfin, puis `Ctrl+Maj+R` : le navigateur garde l'ancienne page. |
| **Toutes les rangées échouent sur Jellyfin 12** | Une version 3.x est installée. Mets Media Carousel à jour depuis le catalogue : la 4.x est la ligne Jellyfin 12. |
| **Le Top mondial est vide** | Vérifie la clé d'API. Avec **Ne garder que les titres présents**, seuls tes titres apparaissent. |
| **Pas de bouton Demander** | Décoche **Ne garder que les titres présents**, importe tes utilisateurs Jellyfin dans Seerr, puis clique sur **Enregistrer**. |
| **Le Top du serveur compte les titres marqués comme vus** | Installe **Playback Reporting** pour compter les vrais visionnages. |
| **Pas de rangées sur une télé Samsung ou LG** | Normal, voir [Limites connues](#️-limites-connues). |

## 🎨 Thème recommandé

Media Carousel s'intègre naturellement à [**ElegantFin Cinema Edition**](https://github.com/peterdu1109/ElegantFin). Tu peux changer ses couleurs dans le CSS personnalisé de Jellyfin :

```css
.mc-row { --mc-accent: #e50914; --mc-rank-stroke: rgba(255, 255, 255, .6); --mc-side-padding: 2%; }
```

## 👥 Auteurs et remerciements

Media Carousel est maintenu par **[ElieMFR](https://github.com/ElieMFR)** et **[Peterdu1109](https://github.com/peterdu1109)**.

Bugs et idées sont les bienvenus dans les [issues GitHub](https://github.com/peterdu1109/MediaCarousel/issues). Indique ta version de Jellyfin, le client (navigateur, appli, télé), la version du plugin, tes autres plugins et ton thème, et les lignes du journal du serveur qui mentionnent `MediaCarousel`.

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

Reads never trigger a computation: they return the last published ranking, filtered for the caller. Build: `dotnet build -c Release` on the `jellyfin-12` branch (.NET 10). Tests: [tests/README.md](tests/README.md).

</details>
