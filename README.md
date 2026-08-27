<div align="center">
  <img src="Web/icon.png" alt="Media Carousel" width="96" />

  <h1>Media Carousel</h1>
  <p><strong>Le Top 10 de ton serveur Jellyfin, calculé automatiquement.</strong></p>

  [![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.9%2B-00a4dc?style=flat-square)](https://jellyfin.org/)
  [![.NET](https://img.shields.io/badge/.NET-9.0-512BD4?style=flat-square)](https://dotnet.microsoft.com/)
  [![Version](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json&query=%24%5B0%5D.versions%5B0%5D.version&label=Version&color=brightgreen&style=flat-square)](https://github.com/peterdu1109/MediaCarousel/releases)
  [![Licence](https://img.shields.io/badge/Licence-MIT-green?style=flat-square)](LICENSE)
</div>

---

## Ce que fait le plugin

Media Carousel génère **tout seul** deux classements et les tient à jour.

| | Classement | D'où viennent les données |
|---|---|---|
| 🏠 | **Top du serveur** | Les statistiques de lecture de **tous** les comptes de ton serveur |
| 🌍 | **Top mondial** | TMDB ou Trakt, rapproché de ta bibliothèque |

<div align="center">
  <em>Rang en grand chiffre, affiche, défilement horizontal — sous tes bibliothèques.</em>
</div>

Les deux classements s'affichent **directement sur ta page d'accueil**, en rangées façon Netflix,
juste sous tes bibliothèques — grand chiffre du rang, affiche, défilement horizontal.

Rien à installer ni à bricoler : le plugin s'intègre tout seul à l'interface web au démarrage
du serveur. Tout le calcul est fait côté serveur, en tâche de fond.

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

> **Prérequis : Jellyfin 10.11.9 ou plus récent.**

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
| Bibliothèques exclues | — | Vidéos perso, etc. |

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
| Types de médias | Films | Ce qui est classé |
| Nombre d'entrées | `10` | Taille du classement |
| Ne garder que ce que j'ai | ✅ | Masque les titres absents de ta bibliothèque |
| Langue des métadonnées | `fr-FR` | Langue demandée à la source |

Si la source est injoignable, le classement précédent est conservé — une coupure réseau ne vide
jamais la liste.

</details>

<details>
<summary><strong>Affichage sur la page d'accueil</strong></summary>

| Réglage | Défaut | À quoi ça sert |
|---|---|---|
| Afficher les rangées | ✅ | Interrupteur principal du rendu sur l'accueil |
| Titre — Top du serveur | `Top 10 sur ce serveur` | Titre de la rangée |
| Titre — Top mondial | `Top 10 mondial` | Titre de la rangée |
| Couleur d'accentuation | `#e50914` | Couleur du badge et du contour du chiffre au survol |

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

## Pour les développeurs

<details>
<summary><strong>API REST</strong></summary>

Toutes les routes exigent une authentification Jellyfin (jeton utilisateur ou clé d'API).

| Méthode | Route | Accès |
|---|---|---|
| `GET` | `/MediaCarousel/Top/Local?limit=10` | Authentifié |
| `GET` | `/MediaCarousel/Top/Global?limit=10` | Authentifié |
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

Le paquet ne contient que l'assembly du plugin : toutes les dépendances sont fournies par le serveur.

L'architecture interne est documentée dans [CLAUDE.md](CLAUDE.md).

</details>

---

## Licence

MIT — voir [LICENSE](LICENSE).
