<div align="center">
  <img src="Web/icon.png" alt="Media Carousel" width="96" />

  <h1>Media Carousel</h1>
  <p><strong>Le Top 10 de ton serveur Jellyfin, calculé automatiquement.</strong></p>

  [![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.x%20%7C%2012.x-00a4dc?style=flat-square)](https://jellyfin.org/)
  [![.NET](https://img.shields.io/badge/.NET-9.0%20%7C%2010.0-512BD4?style=flat-square)](https://dotnet.microsoft.com/)
  [![Version](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json&query=%24%5B0%5D.versions%5B0%5D.version&label=Version&color=brightgreen&style=flat-square)](https://github.com/peterdu1109/MediaCarousel/releases)
  [![Licence](https://img.shields.io/badge/Licence-MIT-green?style=flat-square)](LICENSE)
</div>

---

## Ce que fait le plugin

Media Carousel génère **tout seul** plusieurs rangées et les tient à jour.

| | Rangée | D'où viennent les données |
|---|---|---|
| 🏠 | **Top du serveur** | Les statistiques de lecture de **tous** les comptes de ton serveur |
| ⏳ | **Les plus regardés de tous les temps** | Le même calcul que le Top du serveur, sans fenêtre d'observation |
| 🌍 | **Top mondial** | TMDB ou Trakt, rapproché de ta bibliothèque — un titre absent se demande à Seerr |
| 📺 | **De retour cette semaine** | Les séries dont des épisodes viennent d'arriver |
| 💎 | **Jamais vu** | Les films bien notés que personne n'a encore lancés |
| 🎬 | **Par studio** | Les studios les mieux représentés, avec leur logo — variantes fusionnées |
| 🎭 | **Par genre** | Une rangée par genre, les plus fournis en premier |
| ❤️ | **Parce que tu as regardé…** | Le dernier film terminé par **chaque** utilisateur, et d'autres titres du même genre |

<div align="center">
  <em>Rang en grand chiffre, affiche, défilement horizontal — sous tes bibliothèques.</em>
</div>

Les deux classements s'affichent **directement sur ta page d'accueil**, en rangées façon Netflix,
juste sous tes bibliothèques — grand chiffre du rang, affiche, défilement horizontal.

Rien à installer ni à bricoler : le plugin s'intègre tout seul à l'interface web au démarrage
du serveur. Tout le calcul est fait côté serveur, en tâche de fond.

Les rangées **s'adaptent à l'écran** : du téléphone en portrait au téléviseur 4K, les affiches
et les chiffres de rang changent de taille à sept paliers. Les rangées entrent en fondu, l'une après
l'autre, et les cartes s'animent au survol comme à la télécommande — tout est coupé si le système
demande à réduire les animations.

> **Téléviseurs Samsung et LG.** Les applications Tizen et webOS embarquent leur propre copie de
> l'interface web et ne chargent jamais celle du serveur : les rangées n'y apparaissent pas, et
> aucun réglage ne peut le changer. Voir [Téléviseurs](#téléviseurs-samsung-et-lg).

---

## Installation

### Via le catalogue Jellyfin — recommandé

Les mises à jour suivantes se font toutes seules.

1. **Tableau de bord → Extensions → Dépôts → +**
2. Colle l'adresse **correspondant à ta version de Jellyfin** — un même build ne peut pas viser les deux :
   - Jellyfin **10.11.x**
     ```
     https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
     ```
   - Jellyfin **12.x**
     ```
     https://raw.githubusercontent.com/peterdu1109/MediaCarousel/refs/heads/jellyfin-12/repository-12.json
     ```
3. **Extensions → Catalogue** → installe **Media Carousel** — le canal Jellyfin 12 le liste sous
   **Media Carousel (Jellyfin 12)**
4. Redémarre Jellyfin

### Manuellement

Télécharge le ZIP depuis la [page des versions](https://github.com/peterdu1109/MediaCarousel/releases),
décompresse-le dans `plugins/MediaCarousel/`, puis redémarre Jellyfin.

> **Prérequis : Jellyfin 10.11.11 ou plus récent, ou Jellyfin 12.**
> Sur Jellyfin 12, n'utilise **pas** l'adresse 10.11 : ses versions 3.x s'installent, apparaissent
> « Actives », puis échouent sur chaque rangée — Jellyfin 12 a modifié une méthode qu'elles appellent.

---

## Premiers pas

1. **Tableau de bord → Extensions → Media Carousel**
2. Coche les **rangées** à afficher et range-les avec les flèches.
3. Règle le **Top du serveur** : nombre de titres, période.
4. Pour le **Top mondial**, choisis TMDB ou Trakt et colle ta clé d'API.
5. Clique sur **Enregistrer** : les rangées se recalculent aussitôt.
6. Ouvre ta page d'accueil. Si les rangées n'apparaissent pas tout de suite, vide le cache du
   navigateur (**Ctrl + Maj + R**) — l'interface web garde l'ancienne page en mémoire.

Ensuite, plus rien à faire : le recalcul se relance au démarrage du serveur et à intervalle régulier.

### Où trouver une clé d'API

| Source | Où | Gratuit |
|---|---|---|
| **TMDB** | [themoviedb.org → Paramètres → API](https://www.themoviedb.org/settings/api) — clé v3 ou jeton v4 | Oui |
| **Trakt** | [trakt.tv → Settings → Applications](https://trakt.tv/oauth/applications) — le **Client ID** | Oui |

---

## Réglages

La page tient en cinq blocs et un pli « Réglages avancés ». Les réglages d'une rangée
décochée n'apparaissent pas.

<details>
<summary><strong>Rangées de l'accueil</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Afficher les rangées sur la page d'accueil | ✅ | Interrupteur général ; les collections restent à jour |
| Liste des rangées | Top du serveur, De tous les temps, Top mondial, De retour, Jamais vu, Parce que…, Studios, Genres | Une case par rangée, des flèches ▲▼ pour la ranger |

Chaque rangée cochée montre ses réglages juste en dessous :

| Rangée | Réglages | Défauts |
|---|---|---|
| De retour cette semaine | Titre, épisodes ajoutés depuis, nombre de séries | `7` jours, `20` |
| Jamais vu | Titre, nombre de films, note minimale (sur 10) | `20`, `7.0` |
| Parce que tu as regardé… | Titre (`{0}` = le dernier film vu), nombre de titres | `20` |
| Par studio | Titre, nombre de studios | `20` |
| Par genre | Nombre de genres, titres par rangée | `6`, `20` |

« Jamais vu » est limité aux films : pour une série, Jellyfin ne la considère lue que si
**tous** ses épisodes le sont, donc une série abandonnée en cours de route remonterait
comme jamais vue. « Parce que tu as regardé… » l'est pour la même raison, et reste absente
tant qu'un utilisateur n'a terminé aucun film. C'est la seule rangée que **chaque compte
voit différemment** : elle est calculée par le navigateur, pas par la tâche planifiée.

« Warner Bros. », « Warner Bros. Pictures » et « Warner Bros. Animation » sont trois entrées
distinctes dans Jellyfin. Le plugin les regroupe en un seul studio et affiche la variante qui
possède un logo. Les rangées de genre se chargent au fur et à mesure du défilement, pour ne pas
ralentir l'ouverture de la page d'accueil.

Le plugin **n'écrase pas** ta page d'accueil : il ajoute ses rangées sous les bibliothèques et
laisse le reste intact (Continuer de regarder, À suivre, etc.).

</details>

<details>
<summary><strong>Top du serveur</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Titre de la rangée | `Top 10 sur ce serveur` | |
| Nombre de titres | `10` | Taille du classement |
| Période | `30` jours | `7` = la semaine, `30` = le mois, `0` = depuis toujours |
| Types de médias | Films et séries | Ce qui est classé |
| De tous les temps : titre, nombre | `10` | Le même calcul, sans période |

Les **épisodes comptent pour leur série** : c'est la série qui apparaît au classement, pas
l'épisode isolé.

**Avec le plugin Playback Reporting**, le Top suit ce qui a vraiment été regardé : une personne
compte si elle a regardé le titre au moins 5 minutes, et le temps passé départage les ex æquo.
Un épisode marqué « vu » sans être regardé, la musique ou une bande-annonce ne comptent plus.
Sans Playback Reporting, le Top compte les titres marqués « vu ».

</details>

<details>
<summary><strong>Top mondial</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Source | TMDB | TMDB ou Trakt |
| Liste | Tendances du moment | Ou « à l'affiche », ou « prochaines sorties ». Propre à TMDB ; Trakt ne publie que les tendances |
| Types de médias | Films | Ce qui est classé |
| Nombre de titres | `10` | Taille du classement (de chaque rangée, si séparées) |
| Une rangée pour les films, une pour les séries | ❌ | Proposé avec « Films et séries » : deux classements au lieu d'un seul mélangé |
| Titre de la rangée | `Top 10 mondial` | Remplacé par `Top 10 des films` / `Top 10 des séries` quand les rangées sont séparées |
| Clé d'API | — | Voir le tableau ci-dessus. Jamais transmise aux navigateurs |
| Ne garder que les titres présents | ✅ | Masque les titres absents de ta bibliothèque |

Si la source est injoignable, le classement précédent est conservé — une coupure réseau ne vide
jamais la liste.

Un titre qui arrive dans ta bibliothèque — une demande Seerr servie, par exemple — y passe
« présent » dans la minute, sans attendre le recalcul suivant.

</details>

<details>
<summary><strong>Seerr</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Proposer les demandes à Seerr | ❌ | Un bouton « Demander » sur l'affiche de chaque titre absent du Top mondial |
| Adresse de Seerr | — | Vue depuis le serveur Jellyfin, par exemple `http://192.168.1.10:5055` |
| Clé d'API de Seerr | — | Dans Seerr : Paramètres → Général. Jamais transmise aux navigateurs |
| Proposer le serveur, le profil et le dossier | ❌ | Les options avancées de chaque demande |

**Demander à Seerr** (Jellyseerr, Overseerr ou leur successeur) fonctionne comme dans
Jellyfin Enhanced, avec les mêmes libellés. La demande part au nom du compte Seerr de chaque
utilisateur, donc ses droits et ses quotas s'appliquent. Pour que le bouton apparaisse :

- décoche « Ne garder que les titres présents » dans le Top mondial, sinon aucun titre absent ne
  s'affiche ;
- importe tes utilisateurs Jellyfin dans Seerr (Seerr → Utilisateurs → Importer depuis Jellyfin) ;
- enregistre : les rangées se recalculent aussitôt.

Comme dans Jellyfin Enhanced, le bouton apparaît au survol de l'affiche — et en permanence sur
un écran tactile ou une télévision. Un film se demande d'un clic. Une série ouvre la fenêtre de
Jellyfin Enhanced : chaque saison y montre son état, et seules celles qui ne sont ni disponibles ni
déjà demandées s'activent. Si Seerr n'accepte pas les demandes partielles, la série part en
entière. Avec les options avancées, la fenêtre propose aussi le serveur, le profil de qualité et le
dossier racine — et un film l'ouvre à son tour.
Le bouton « Tester la connexion » vérifie l'adresse et la clé avant l'enregistrement.

</details>

<details>
<summary><strong>Apparence</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Couleur d'accentuation | `#775BF4` | Contour du chiffre au survol et focus. Seule une valeur `#rrggbb` est retenue |
| Taille du chiffre | `100` % | `100` = comme Netflix ; plus bas, la rangée se resserre, l'affiche ne change pas |
| Laisser chaque compte régler son accueil | ✅ | Un bouton sur l'accueil : rangées, ordre, couleur, taille du chiffre. Ce qu'un compte ne touche pas suit cette page |

</details>

<details>
<summary><strong>Réglages avancés</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Ignorer le contenu IPTV | activé | Écarte les catalogues IPTV (XFusion et consorts), qui arrivent en base comme des films et des épisodes ordinaires |
| Comptes exclus | — | Comptes de service, invités |
| Bibliothèques exclues | — | Vidéos perso, etc. S'applique à toutes les rangées, Top mondial compris |
| Lectures comptées par compte | `3` | Sur un classement depuis toujours. Affiché seulement quand il sert |
| Titres examinés par compte | `100` | Plus haut = plus précis, mais plus long. Sans Playback Reporting, ou pour « de tous les temps » |
| Recalcul toutes les | `6` h | Remplace l'intervalle de la tâche planifiée de Jellyfin |
| Créer aussi une collection par classement | ❌ | Pour les clients sans les rangées (Kodi, certains boîtiers TV). Le rang est préservé |
| Noms des collections | `Top 10 du serveur` / `Top 10 mondial` | |
| Ranger les sections de Jellyfin | ❌ | Ajoute « Continuer de regarder », « À suivre »… à la liste des rangées. Cet ordre s'impose alors à tous les comptes |
| Masquer les sections de Jellyfin | ❌ | Ne laisse que tes bibliothèques et les rangées du plugin |
| Titres minimum par studio / par genre | `3` / `5` | Écarte les studios et genres trop peu représentés |
| Langue des titres | `fr-FR` | Langue demandée à la source du Top mondial |

</details>

---|---|---|
| Intervalle de recalcul | `6` h | Fréquence du recalcul automatique |
| Créer aussi une collection | ❌ | Pour les clients qui n'exécutent pas le script (Kodi, certains boîtiers TV) |
| Nom de la collection — Top du serveur | `Top 10 du serveur` | |
| Nom de la collection — Top mondial | `Top 10 mondial` | |

Le classement étant ordonné, la collection l'est aussi : le rang est préservé.

</details>

---

## Thèmes et autres plugins

Le plugin est conçu pour cohabiter, pas pour imposer son style.

**Il adopte votre thème.** Les cartes sont de vraies cartes Jellyfin — mêmes classes, même
balisage que les rangées natives : elles prennent donc la taille, l'arrondi, l'espacement et la
typographie que votre thème donne aux autres rangées, ElegantFin compris. La taille des affiches
classées n'est pas un réglage : elle est **mesurée** sur les affiches natives de la page, pour leur
rester identique au pixel près. Les titres réutilisent eux aussi les classes natives.

**Il ne masque jamais les rangées des autres plugins.** L'option « masquer les sections
natives » ne vise que les sections construites par Jellyfin ; tout élément ajouté par un
autre plugin reste intact. De même, la balise `<script>` insérée dans `index.html` s'ajoute
à celles des autres plugins sans jamais les toucher.

**Vous pouvez tout ajuster** depuis le Custom CSS de Jellyfin, sans surcharger nos règles :

```css
.mc-row {
    --mc-accent: #e50914;
    --mc-rank-stroke: rgba(255, 255, 255, .6);
    --mc-side-padding: 2%;
}
```

| Variable | Défaut | Rôle |
|---|---|---|
| `--mc-accent` | réglage du plugin | Couleur du chiffre au survol, contours de focus, bouton de personnalisation |
| `--mc-rank-stroke` | gris bleuté, éclairci sur un thème clair | **Couleur** du contour du chiffre au repos |
| `--mc-side-padding` | `--sidePadding` du thème, sinon `3.3%` | Marge latérale des rangées |

La **hauteur du chiffre** se règle dans la page du plugin (« Taille du chiffre du rang »), et chaque
compte peut la changer pour lui-même si la personnalisation est ouverte.

> **Ne surchargez pas la taille des affiches.** Elle est mesurée sur les affiches natives de la
> page pour rester identique à celles des autres rangées : l'imposer depuis le Custom CSS les ferait
> diverger. Pour agrandir ou réduire toutes les affiches, réglez la taille des cartes de votre
> thème — les rangées du plugin suivent.

## Téléviseurs Samsung et LG

Les rangées s'affichent partout où le client charge l'interface web **du serveur** : navigateur,
application de bureau, mobile, Android TV.

Les applications **Tizen** (Samsung) et **webOS** (LG) font exception. Elles embarquent leur propre
copie de l'interface web dans le paquet installé sur le téléviseur — `jellyfin-tizen` package
`jellyfin-web/dist` dans le `.wgt` — et ne chargent donc jamais le `index.html` du serveur, celui
que le plugin complète au démarrage. **Aucun réglage ne peut y changer quoi que ce soit** : ce
n'est pas une limite du plugin mais la façon dont ces applications sont construites.

Pour les y faire apparaître, il faut reconstruire le paquet du téléviseur à partir d'une interface
web où cette balise a été ajoutée avant `</body>` :

```html
<script plugin="MediaCarousel" defer="defer" src="/MediaCarousel/media-carousel.js"></script>
```

`jellyfin-tizen` accepte la variable d'environnement `JELLYFIN_WEB_DIR`, qui désigne l'interface
web à empaqueter : il suffit de la faire pointer sur une copie modifiée.

Le rendu, lui, est écrit pour ces téléviseurs :

- **Pas de `gap` en flexbox** — la propriété arrive avec Chromium 84, et Tizen 6.0 (téléviseurs
  2021) tourne en Chromium 76. L'espacement des cartes passe par des marges.
- **Contour de focus sur `:focus`**, pas seulement `:focus-visible` — celui-ci arrive avec
  Chromium 86, et même Tizen 6.5 (téléviseurs 2022) est en Chromium 85. Sans ce repli, la
  télécommande déplacerait un focus **invisible**. Le contour reste retiré au clic souris sur les
  navigateurs récents.
- **Pas de `clamp()`** pour les tailles — Chromium 79. Le dimensionnement passe par des paliers.
- Affiches et libellés agrandis au-delà de 1920 px, la largeur que déclare un téléviseur 4K
  sous Tizen.

---

## Pour les développeurs

<details>
<summary><strong>API REST</strong></summary>

Toutes les routes exigent une authentification Jellyfin (jeton utilisateur ou clé d'API).

| Méthode | Route | Accès |
|---|---|---|
| `GET` | `/MediaCarousel/Top/Local?limit=10` | Authentifié |
| `GET` | `/MediaCarousel/Top/Global?limit=10` | Authentifié |
| `GET` | `/MediaCarousel/Rows/Returning?limit=20` | Authentifié |
| `GET` | `/MediaCarousel/Rows/NeverPlayed?limit=20` | Authentifié |
| `GET` | `/MediaCarousel/Studios?limit=20` | Authentifié |
| `GET` | `/MediaCarousel/Genres?limit=6` | Authentifié |
| `GET` | `/MediaCarousel/Status` | Administrateur |
| `POST` | `/MediaCarousel/Top/Refresh` | Administrateur |

Les lectures ne déclenchent jamais de calcul : elles renvoient le dernier classement publié,
filtré selon ce que l'utilisateur appelant a le droit de voir (contrôle parental, bibliothèques
autorisées).

```jsonc
{
  "Kind": "Local",
  "Source": "Jellyfin",
  "GeneratedUtc": "2026-08-27T03:00:11.4Z",
  "Items": [
    {
      "Rank": 1,
      "Score": 27,
      "Name": "Dune",
      "ProductionYear": 2021,
      "TmdbId": "438631",
      "TotalPlays": 31,
      "DistinctViewers": 9,
      "LastPlayedUtc": "2026-08-26T21:12:00Z",
      "Item": { /* BaseItemDto Jellyfin complet */ }
    }
  ]
}
```

</details>

<details>
<summary><strong>Compiler</strong></summary>

```bash
dotnet build -c Release
cd bin/Release/net9.0 && zip -r ../../../JellyfinCarouselPlugin.zip .
```

Le paquet ne contient que l'assembly du plugin (**50 Ko**) : les dépendances sont fournies par le
serveur, et ni les symboles de débogage ni la documentation XML ne sont empaquetés.

Les tests sont décrits dans [tests/README.md](tests/README.md) et tournent en CI avant chaque
publication. L'architecture interne est documentée dans [CLAUDE.md](CLAUDE.md).

</details>

---

## Licence

MIT — voir [LICENSE](LICENSE).
