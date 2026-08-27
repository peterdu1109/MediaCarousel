<div align="center">
  <img src="Web/icon.png" alt="Media Carousel" width="96" />
  <h1>Media Carousel</h1>
  <p>Plugin Jellyfin — classements dynamiques générés côté serveur</p>

  [![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.9%2B-00a4dc?style=flat-square)](https://jellyfin.org/)
  [![.NET](https://img.shields.io/badge/.NET-9.0-512BD4?style=flat-square)](https://dotnet.microsoft.com/)
  [![Licence](https://img.shields.io/badge/Licence-MIT-green?style=flat-square)](LICENSE)
</div>

---

## Ce que fait le plugin

Media Carousel génère automatiquement deux classements, **entièrement côté serveur**. Il ne modifie
ni `index.html`, ni le thème, ni aucun fichier du client web.

| Classement | Source | Contenu |
|---|---|---|
| **Top du serveur** | Statistiques de lecture Jellyfin | Les titres les plus regardés par l'ensemble des comptes du serveur |
| **Top mondial** | TMDB ou Trakt | Les titres les plus populaires du moment, rapprochés de votre bibliothèque |

Les deux classements sont publiés de deux façons :

1. **Sous forme de collections Jellyfin** (option `SyncCollections`) — elles apparaissent
   telles quelles dans tous les clients existants, sans aucune modification d'interface.
2. **Via l'API REST du serveur**, pour les intégrations sur mesure.

---

## Comment le Top du serveur est calculé

Jellyfin ne stocke aucun compteur de lecture global : `PlayCount` appartient au couple
(utilisateur, élément), et le tri SQL `PlayCount` est traduit par le serveur en un filtre
sur l'utilisateur de la requête. Un classement « serveur » ne peut donc pas être obtenu
par une requête unique.

Le plugin interroge la base **une fois par utilisateur**, en laissant le tri et la limite au
moteur SQL, puis agrège les meilleurs candidats en mémoire :

- les **épisodes sont comptabilisés au profit de leur série** — c'est la série qui est classée ;
- une **fenêtre d'observation** configurable produit un classement « tendance » plutôt qu'un
  palmarès historique ;
- un **plafond de lectures par utilisateur** empêche qu'un seul spectateur qui revoit le même
  titre en boucle écrase le classement ;
- les comptes désactivés, ainsi que les utilisateurs et bibliothèques explicitement exclus,
  sont ignorés.

Le calcul a lieu dans une tâche planifiée, jamais pendant une requête HTTP.

---

## Comment le Top mondial est calculé

La source externe (TMDB `/trending` ou Trakt `/trending`) est interrogée avec un délai maximal
et une nouvelle tentative en cas d'erreur réseau. Les titres reçus sont rapprochés de la
bibliothèque locale via un index construit **en une seule requête**, par identifiant TMDB, puis
IMDb, puis titre normalisé + année.

En cas d'échec de la source, le classement précédent est conservé : une coupure réseau ne vide
jamais la liste.

---

## Installation

### Via le catalogue Jellyfin (recommandé)

1. **Tableau de bord → Extensions → Dépôts**
2. Ajoutez cette URL :
   ```
   https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
   ```
3. **Extensions → Catalogue**, installez **Media Carousel**, puis redémarrez Jellyfin.

### Manuellement

Décompressez `JellyfinCarouselPlugin.zip` dans un dossier `MediaCarousel` sous `plugins/`,
puis redémarrez le serveur.

> **Prérequis : Jellyfin 10.11.9 ou plus récent** (`IUserManager.GetUsers()`).

---

## Configuration

**Tableau de bord → Extensions → Media Carousel**

### Top du serveur

| Réglage | Défaut | Rôle |
|---|---|---|
| `EnableLocalTop` | `true` | Active le calcul |
| `LocalTopSize` | `10` | Nombre d'entrées |
| `LocalTopMediaKind` | `Both` | Films, séries, ou les deux |
| `LocalTopWindowDays` | `30` | Fenêtre d'observation (0 = depuis toujours) |
| `MaxPlaysCountedPerUser` | `3` | Plafond de lectures comptées par utilisateur (0 = aucun) |
| `CandidatesPerUser` | `100` | Titres candidats extraits par utilisateur |
| `ExcludedUserIds` | `[]` | Comptes ignorés |
| `ExcludedLibraryIds` | `[]` | Bibliothèques ignorées |

### Top mondial

| Réglage | Défaut | Rôle |
|---|---|---|
| `EnableGlobalTop` | `false` | Active la récupération |
| `GlobalTopProvider` | `Tmdb` | `Tmdb` ou `Trakt` |
| `GlobalTopApiKey` | `""` | TMDB : clé v3 ou jeton v4. Trakt : Client ID |
| `GlobalTopMediaKind` | `Movies` | Films, séries, ou les deux |
| `GlobalTopSize` | `10` | Nombre d'entrées |
| `GlobalTopLibraryOnly` | `true` | N'afficher que les titres présents localement |
| `MetadataLanguage` | `fr-FR` | Langue demandée à la source |

### Rafraîchissement et publication

| Réglage | Défaut | Rôle |
|---|---|---|
| `RefreshIntervalHours` | `6` | Intervalle de recalcul |
| `SyncCollections` | `false` | Publier les classements en collections Jellyfin |
| `LocalCollectionName` | `Top 10 du serveur` | Nom de la collection locale |
| `GlobalCollectionName` | `Top 10 mondial` | Nom de la collection mondiale |

Le bouton **Recalculer maintenant** de la page de configuration déclenche un recalcul immédiat
en arrière-plan.

---

## API

Toutes les routes exigent une authentification Jellyfin (jeton utilisateur ou clé d'API).

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/MediaCarousel/Top/Local?limit=10` | Top du serveur |
| `GET` | `/MediaCarousel/Top/Global?limit=10` | Top mondial |
| `POST` | `/MediaCarousel/Top/Refresh` | Recalcul immédiat (administrateur) |

Les lectures ne déclenchent jamais de calcul : elles renvoient le dernier instantané publié,
filtré selon la visibilité de l'utilisateur appelant (contrôle parental, bibliothèques autorisées).

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

---

## Développement

```bash
dotnet build -c Release          # sortie dans bin/Release/net9.0/
cd bin/Release/net9.0 && zip -r ../../../JellyfinCarouselPlugin.zip .
```

Le paquet ne contient que l'assembly du plugin : toutes les dépendances sont fournies par le
serveur (`CopyLocalLockFileAssemblies=false`, `ExcludeAssets=runtime`).

---

## Licence

MIT — voir [LICENSE](LICENSE).
