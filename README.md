<div align="center">
  <img src="Web/icon.png" alt="Media Carousel" width="96" />

  <h1>Media Carousel</h1>
  <p><strong>Le Top 10 de ton serveur Jellyfin, calculé automatiquement.</strong></p>

  [![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.11%2B-00a4dc?style=flat-square)](https://jellyfin.org/)
  [![.NET](https://img.shields.io/badge/.NET-9.0-512BD4?style=flat-square)](https://dotnet.microsoft.com/)
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
| 🌍 | **Top mondial** | TMDB ou Trakt, rapproché de ta bibliothèque |
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
2. Colle cette adresse :
   ```
   https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
   ```
3. **Extensions → Catalogue** → installe **Media Carousel**
4. Redémarre Jellyfin

### Manuellement

Télécharge le ZIP depuis la [page des versions](https://github.com/peterdu1109/MediaCarousel/releases),
décompresse-le dans `plugins/MediaCarousel/`, puis redémarre Jellyfin.

> **Prérequis : Jellyfin 10.11.11 ou plus récent.**

---

## Premiers pas

1. **Tableau de bord → Extensions → Media Carousel**
2. Règle le **Top du serveur** : nombre de titres, fenêtre d'observation.
3. Pour le **Top mondial**, choisis TMDB ou Trakt et colle ta clé d'API.
4. Clique sur **Recalculer maintenant**.
5. Ouvre ta page d'accueil. Si les rangées n'apparaissent pas tout de suite, vide le cache du
   navigateur (**Ctrl + Maj + R**) — l'interface web garde l'ancienne page en mémoire.

Ensuite, plus rien à faire : le recalcul se relance au démarrage du serveur et à intervalle régulier.

### Où trouver une clé d'API

| Source | Où | Gratuit |
|---|---|---|
| **TMDB** | [themoviedb.org → Paramètres → API](https://www.themoviedb.org/settings/api) — clé v3 ou jeton v4 | Oui |
| **Trakt** | [trakt.tv → Settings → Applications](https://trakt.tv/oauth/applications) — le **Client ID** | Oui |

---

## Réglages

<details>
<summary><strong>Top du serveur</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Activer le Top du serveur | ✅ | Interrupteur principal |
| Nombre d'entrées | `10` | Taille du classement |
| Types de médias | Films et séries | Ce qui est classé |
| Fenêtre d'observation | `30` jours | `30` = tendance du mois, `0` = palmarès de toujours |
| Lectures comptées par utilisateur | `3` | Empêche qu'un seul spectateur qui revoit un film en boucle fausse le classement |
| Titres candidats par utilisateur | `100` | Plus haut = plus précis, mais plus long à calculer |
| Utilisateurs exclus | — | Comptes de service, invités |
| Bibliothèques exclues | — | Vidéos perso, etc. S'applique à toutes les rangées, Top mondial compris |

Les **épisodes comptent pour leur série** : c'est la série qui apparaît au classement, pas
l'épisode isolé.

</details>

<details>
<summary><strong>Top mondial</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Activer le Top mondial | ❌ | Interrupteur principal |
| Source | TMDB | TMDB ou Trakt |
| Clé d'API | — | Voir le tableau ci-dessus |
| Liste | Tendances du moment | Ou « à l'affiche », ou « prochaines sorties ». Propre à TMDB ; Trakt ne publie que les tendances |
| Types de médias | Films | Ce qui est classé |
| Nombre d'entrées | `10` | Taille du classement |
| Ne garder que ce que j'ai | ✅ | Masque les titres absents de ta bibliothèque |
| Langue des métadonnées | `fr-FR` | Langue demandée à la source |

Si la source est injoignable, le classement précédent est conservé — une coupure réseau ne vide
jamais la liste.

</details>

<details>
<summary><strong>Actualité de la bibliothèque</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Afficher « de retour cette semaine » | ✅ | Séries dont des épisodes viennent d'arriver |
| Fenêtre | `7` jours | |
| Nombre de séries | `20` | |
| Afficher « jamais vu » | ✅ | Films bien notés jamais lancés sur le serveur |
| Note minimale | `7.0` | Note de la communauté, sur 10 |
| Nombre de films | `20` | |
| Afficher « parce que tu as regardé… » | ✅ | Rangée personnelle, propre à chaque compte |
| Titre de la rangée | `Parce que tu as regardé {0}` | `{0}` est remplacé par le titre du film |
| Nombre de titres | `20` | |

« Jamais vu » est limité aux films : pour une série, Jellyfin ne la considère lue que si
**tous** ses épisodes le sont, donc une série abandonnée en cours de route remonterait
comme jamais vue. « Parce que tu as regardé… » l'est pour la même raison, et reste absente
tant qu'un utilisateur n'a terminé aucun film. C'est la seule rangée que **chaque compte
voit différemment** : elle est calculée par le navigateur, pas par la tâche planifiée.

</details>

<details>
<summary><strong>Studios et genres</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Afficher la rangée des studios | ✅ | Vignettes des studios, logo compris |
| Titre de la rangée | `Par studio` | |
| Nombre de studios | `20` | |
| Titres minimum par studio | `3` | Écarte les studios trop peu représentés |

« Warner Bros. », « Warner Bros. Pictures » et « Warner Bros. Animation » sont trois entrées
distinctes dans Jellyfin. Le plugin les regroupe en un seul studio et affiche la variante qui
possède un logo.
| Afficher des rangées par genre | ✅ | Une rangée par genre |
| Nombre de genres | `6` | Les plus fournis en premier |
| Titres par rangée | `20` | |
| Titres minimum par genre | `5` | |

Les rangées de genre se chargent au fur et à mesure du défilement, pour ne pas ralentir
l'ouverture de la page d'accueil.

</details>

<details>
<summary><strong>Affichage sur la page d'accueil</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Afficher les rangées | ✅ | Interrupteur principal du rendu sur l'accueil |
| Ordre des rangées | Top serveur, Top mondial, De retour, Jamais vu, Parce que…, Studios, Genres | Réorganisable avec les flèches ▲▼ |
| Titre — Top du serveur | `Top 10 sur ce serveur` | Titre de la rangée |
| Titre — Top mondial | `Top 10 mondial` | Titre de la rangée |
| Couleur d'accentuation | `#775BF4` | Contour du chiffre au survol et anneau de focus. Seule une valeur `#rrggbb` est retenue, sinon le violet par défaut s'applique |
| Masquer les sections natives | ❌ | Ne laisse que tes bibliothèques et les rangées du plugin |

Le plugin **n'écrase pas** ta page d'accueil : il ajoute ses rangées sous les bibliothèques et
laisse le reste intact (Continuer à regarder, Derniers ajouts, etc.).

</details>

<details>
<summary><strong>Rafraîchissement et collections</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Intervalle de recalcul | `6` h | Fréquence du recalcul automatique |
| Créer aussi une collection | ❌ | Pour les clients qui n'exécutent pas le script (Kodi, certains boîtiers TV) |
| Nom de la collection — Top du serveur | `Top 10 du serveur` | |
| Nom de la collection — Top mondial | `Top 10 mondial` | |

Le classement étant ordonné, la collection l'est aussi : le rang est préservé.

</details>

---

## Thèmes et autres plugins

Le plugin est conçu pour cohabiter, pas pour imposer son style.

**Il adopte les jetons de votre thème.** Si le thème installé en expose (ElegantFin et la
plupart des autres), les rangées reprennent automatiquement son espacement latéral, sa
gouttière et son rayon d'arrondi. Les titres réutilisent les classes natives de Jellyfin,
donc ils héritent exactement du style que le thème donne aux titres de section.

**Il ne masque jamais les rangées des autres plugins.** L'option « masquer les sections
natives » ne vise que les sections construites par Jellyfin ; tout élément ajouté par un
autre plugin reste intact. De même, la balise `<script>` insérée dans `index.html` s'ajoute
à celles des autres plugins sans jamais les toucher.

**Vous pouvez tout ajuster** depuis le Custom CSS de Jellyfin, sans surcharger nos règles :

```css
.mc-row {
    --mc-poster-width: 140px;
    --mc-poster-height: 210px;
    --mc-rank-size: 10rem;
    --mc-rank-outline: rgba(255, 255, 255, .85);
    --mc-radius: 1em;
    --mc-side-padding: 2%;
}
```

| Variable | Défaut | Rôle |
|---|---|---|
| `--mc-accent` | réglage du plugin | Contour du chiffre au survol, anneau de focus |
| `--mc-side-padding` | `--sidePadding` du thème, sinon `3.3%` | Marge latérale des rangées |
| `--mc-gap` | `--itemColumnGap` du thème, sinon `.7em` | Espace entre les cartes |
| `--mc-radius` | `--smallRadius` du thème, sinon `5px` | Arrondi des affiches et vignettes |
| `--mc-poster-width` / `-height` | `120px` / `180px` | Taille des affiches |
| `--mc-tile-width` / `-height` | `172px` / `104px` | Taille des vignettes de studio |
| `--mc-rank-size` | `8.5rem` | Taille du chiffre de rang |
| `--mc-rank-stroke` | `3px` | Épaisseur du contour du chiffre |
| `--mc-rank-fill` / `--mc-rank-outline` | blanc translucide | Remplissage et contour du chiffre |
| `--mc-surface` / `--mc-surface-hover` | blanc translucide | Fond des cartes sans image |
| `--mc-shadow` / `--mc-shadow-hover` | ombre portée | Ombres des affiches |

Ces variables sont redéfinies aux points de rupture mobile : les surcharger sur `.mc-row`
suffit pour les deux tailles, sauf si vous ciblez vous-même un média.

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
