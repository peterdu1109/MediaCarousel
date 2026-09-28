# CLAUDE.md — MediaCarousel (JellyfinCarouselPlugin)

## Vue d'ensemble

Plugin Jellyfin qui génère automatiquement deux classements dynamiques :

1. **Top du serveur** — les titres les plus regardés d'après les statistiques de lecture de tous les comptes.
2. **Top mondial** — les titres les plus populaires d'après TMDB ou Trakt, rapprochés de la bibliothèque locale.

**Tout le calcul est backend.** Le frontend se limite à un script d'affichage de ~400 lignes qui
consomme l'API du plugin et insère deux rangées façon Netflix sous les bibliothèques de la page
d'accueil. Il ne calcule rien, ne remplace pas la page d'accueil et ne masque aucune section native.

- **Plugin GUID :** `191bd290-1054-4b55-a137-46c72181266b` — dans `Plugin.cs`, `manifest.json`, `build.yaml`, `configPage.html`
- **Cible :** Jellyfin **10.11.11+** (ABI `10.11.11.0`), .NET 9.0, paquets NuGet Jellyfin 10.11.11
- **Stack :** C# uniquement. Pas de Node, pas de npm, pas de TypeScript, pas de build frontend.

> **Plancher technique et `targetAbi` ne coïncident pas.** La seule API utilisée qui soit plus
> récente que 10.11.8 est `IUserManager.GetUsers()` — `IUserManager.Users` (propriété) est devenu
> une méthode en 10.11.9 — donc le code se chargerait sur 10.11.9 et 10.11.10. Le `targetAbi`
> publié est malgré tout `10.11.11.0` : c'est la version contre laquelle le plugin est compilé et
> testée. Conséquence assumée : **le plugin disparaît du catalogue des serveurs en 10.11.9 et
> 10.11.10.** Abaisser la valeur dans `manifest.json` suffit à les rouvrir.

> **Pourquoi un script frontend est inévitable :** les sections de la page d'accueil de Jellyfin
> sont l'énumération fermée `HomeSectionType` (`None`, `SmallLibraryTiles`, `LibraryButtons`,
> `ActiveRecordings`, `Resume`, `ResumeAudio`, `LatestMedia`, `NextUp`, `LiveTv`, `ResumeBook`),
> et `jellyfin-web` les rend via un `switch` dont le `default` vide l'élément
> (`src/components/homesections/homesections.js`). Aucun point d'extension serveur n'existe :
> ajouter une rangée impose d'injecter du JavaScript dans le client. Le plugin le fait
> automatiquement, sans intervention de l'administrateur.

---

## Structure du dépôt

```
MediaCarousel/
├── Plugin.cs                          # BasePlugin<PluginConfiguration> + IHasWebPages
├── PluginServiceRegistrator.cs        # Enregistrement DI de tous les services
├── JellyfinCarouselPlugin.csproj      # net9.0, références compile-time uniquement
├── manifest.json                      # Catalogue Jellyfin (mis à jour par la CI)
├── build.yaml                         # Métadonnées du registre (maintenu à la main)
├── Api/
│   ├── TopListsController.cs          # GET Top/*, Rows/*, ClientOptions ; POST Top/Refresh
│   ├── CatalogController.cs           # GET Studios, Genres
│   ├── StatusController.cs            # GET Status (admin) : état des sections
│   ├── TopListResponseDto.cs          # Contrat de sortie des classements
│   ├── CatalogResponseDto.cs          # Contrat de sortie des catalogues
│   ├── PluginStatusDto.cs             # Contrat de la page de configuration
│   ├── ClientOptionsDto.cs            # Réglages d'affichage, lisibles sans droits admin
│   ├── AssetsController.cs            # Sert media-carousel.js depuis les ressources
│   ├── UserPreferencesController.cs   # GET/POST/DELETE des choix propres à un compte
│   ├── SeerrController.cs             # POST Seerr/Status, Seasons, Options, Request ; Test (admin)
│   └── PosterController.cs            # Relaie et met en cache les affiches TMDB
├── Configuration/
│   ├── PluginConfiguration.cs         # Modèle de config + enums
│   ├── UserRowPreferences.cs          # Choix d'affichage d'un compte (tout nullable)
│   └── configPage.html                # UI admin, ressource embarquée
├── Models/
│   ├── TopListKind.cs                 # Local | Global | NeverPlayed | ReturningSeries
│   ├── TopListEntry.cs                # Une entrée classée
│   ├── TopListSnapshot.cs             # Résultat figé et immuable d'un calcul
│   ├── CatalogKind.cs                 # Studios | Genres
│   ├── CatalogEntry.cs                # Un studio ou un genre, avec son décompte
│   └── CatalogSnapshot.cs             # Résultat figé d'une agrégation
├── Providers/
│   ├── ITrendingProvider.cs           # Contrat d'une source externe
│   ├── TrendingRequest.cs             # Paramètres d'interrogation
│   ├── TrendingFeed.cs                # Liste demandée : tendances, à l'affiche, à venir
│   ├── TrendingTitle.cs               # Titre renvoyé par une source
│   ├── TmdbTrendingProvider.cs        # TMDB /trending
│   └── TraktTrendingProvider.cs       # Trakt /trending
├── ScheduledTasks/
│   ├── TopListRefreshTask.cs          # IScheduledTask : démarrage + intervalle
│   └── ScriptInjectionTask.cs         # IScheduledTask : intègre le script à index.html
├── Services/
│   ├── ITopListStore.cs / TopListStore.cs   # Publication atomique des classements
│   ├── ICatalogStore.cs / CatalogStore.cs   # Publication atomique des catalogues
│   ├── CatalogBuilder.cs                    # Agrégation studios / genres
│   ├── CatalogCounter.cs                    # Comptage par nom et par bibliothèque
│   ├── CatalogRepresentative.cs             # Choix de la variante affichée
│   ├── StudioNameNormalizer.cs              # Regroupement des variantes d'un studio
│   ├── TopListAccumulator.cs                # Règle de classement du Top du serveur
│   ├── PosterProxy.cs                       # Validation des adresses d'affiches
│   ├── LibraryRowBuilder.cs                 # Rangées « jamais vu » et « de retour »
│   ├── SnapshotStorage.cs                   # Persistance JSON des instantanés
│   ├── LocalTopListBuilder.cs               # Agrégation des statistiques de lecture
│   ├── GlobalTopListBuilder.cs              # Source externe + rapprochement local
│   ├── LibraryTitleIndex.cs                 # Index ProviderIds construit en une requête
│   ├── CollectionSynchronizer.cs            # Matérialisation en BoxSet
│   ├── TopListRefreshService.cs             # Orchestration, verrou, tolérance aux pannes
│   ├── RefreshHealth.cs                     # Bilan du dernier recalcul : durée, échecs
│   ├── UserPreferenceStore.cs               # Persistance des préférences par compte
│   ├── UserPreferenceRules.cs               # Validation et fusion de ces préférences
│   ├── SeerrRules.cs                        # Seerr sans Jellyfin : comptes, statuts, demande
│   ├── SeerrClient.cs                       # Appels à Seerr, caches des comptes et des états
│   ├── ScriptTag.cs                         # Balise script : insertion, retrait, migration
│   └── IndexHtmlTransformer.cs              # Callback FileTransformation (réflexion)
└── Web/
    ├── media-carousel.js              # Rangées Top 10 sur la page d'accueil (ressource embarquée)
    └── icon.png                       # Icône (asset du dépôt, pas servi par le plugin)
```

---

## Architecture

### Principe directeur

**Tout le travail lourd a lieu dans la tâche planifiée ; les requêtes HTTP ne font que lire.**

```
TopListRefreshTask ──> TopListRefreshService ──┬─> LocalTopListBuilder  ──> ITopListStore
   (démarrage +                                ├─> GlobalTopListBuilder ──> ITopListStore
    intervalle)                                └─> CollectionSynchronizer ──> BoxSet Jellyfin

TopListsController ──> ITopListStore (lecture sans verrou) ──> IDtoService ──> BaseItemDto
                                                                      ▲
ScriptInjectionTask ──> index.html ──> media-carousel.js ─────────────┘
   (FileTransformation, sinon disque)      (rendu des rangées)
```

### Top du serveur — pourquoi une requête par utilisateur

Jellyfin ne stocke **aucun compteur de lecture global**. `UserItemData.PlayCount` appartient au couple
(utilisateur, élément), et `OrderMapper` traduit `ItemSortBy.PlayCount` en
`e.UserData.FirstOrDefault(f => f.UserId == query.User.Id).PlayCount` : le tri **déréférence
`query.User`**. Une requête sans utilisateur ne peut donc pas trier par nombre de lectures.

Conséquence directe : un classement « serveur » demande **une requête bornée par utilisateur**
(tri et `Limit` délégués à SQL), puis une agrégation en mémoire des candidats. Coût :
`nbUtilisateurs` requêtes, jamais un balayage complet de la bibliothèque.

Détails d'implémentation :

- `IncludeItemTypes = [Movie, Episode]` — les compteurs de lecture des séries vivent sur les épisodes.
  Chaque épisode est reporté sur `Episode.SeriesId`, mémorisé dans un cache local pour éviter un N+1.
- `DtoOptions(false) { Fields = [ProviderIds], EnableImages = false }` — seules les colonnes utiles
  sont jointes (voir `BaseItemRepository.PrepareFilterQuery`).
- **Le tri suit la fenêtre d'observation.** `InternalItemsQuery` n'offre aucun filtre sur la date
  de lecture — `MinDateLastSavedForUser` porte, malgré son nom, sur le `DateLastSaved` de
  l'élément — donc la fenêtre ne peut être appliquée qu'en mémoire, après la requête. Trier par
  `PlayCount` remplirait alors la `Limit` des favoris de toujours, et les lectures récentes
  seraient écartées par SQL avant même d'être datées. Quand une fenêtre est configurée, la requête
  trie donc par `DatePlayed` décroissant ; sans fenêtre, par `PlayCount` décroissant.
- Fenêtre d'observation appliquée sur `UserItemData.LastPlayedDate`.
- Plafond `MaxPlaysCountedPerUser` appliqué au score, `TotalPlays` conservant la valeur brute.
- Tri final : score, puis nombre de spectateurs distincts, puis dernière lecture.
- Ces trois grandeurs — score, spectateurs, dernière lecture — **ne sortent pas de
  `TopListAccumulator`**. Elles servaient aussi de champs de `TopListEntry`, donc étaient
  recopiées et écrites dans les instantanés sur disque à chaque recalcul ; plus rien ne les
  relisait depuis leur retrait du contrat d'API. Ne pas les y remettre sans un lecteur.
  Les anciens instantanés portant encore ces clés se relisent sans erreur, `System.Text.Json`
  ignorant les propriétés qu'il ne connaît pas.

### Top du moment et de toujours

`LocalTopListBuilder.Build` prend la fenêtre, la taille et la nature de l'instantané en
**paramètres** plutôt que de les lire dans la configuration : c'est ce qui permet de produire
`Local` (fenêtre configurée) et `LocalAllTime` (fenêtre nulle) à partir du même calcul, en ne
changeant que ce qui les distingue. Les deux cohabitent sur l'accueil au lieu d'obliger à
choisir entre tendance du moment et fond de catalogue.

### Top mondial

`ITrendingProvider` abstrait la source ; `GlobalTopListBuilder` choisit l'implémentation d'après
`GlobalTopProvider`. `GlobalTopFeed` choisit ensuite la **liste** : tendances de la semaine,
à l'affiche (`movie/now_playing`, `tv/on_the_air`) ou prochaines sorties (`movie/upcoming`).
Toutes les combinaisons n'existent pas chez TMDB — il n'y a pas d'« à venir » pour les séries —
et `ResolvePath` renvoie alors `null` : le type est ignoré et journalisé, plutôt qu'inventé.
Trakt ne publie que les tendances et ignore ce réglage, ce que la page de configuration dit. Les clients HTTP viennent de `IHttpClientFactory.CreateClient(NamedClient.Default)`
(client Jellyfin, avec User-Agent et compression). Délai maximal de 30 s, une nouvelle tentative
sur erreur transitoire.

Le rapprochement passe par `LibraryTitleIndex`, construit en **une seule requête** sur les films et
séries avec `Fields = [ProviderIds]`. Trois index : TMDB (séparé film/série, TMDB numérotant les
deux indépendamment), IMDb, et titre normalisé + année en dernier recours.

Sur-échantillonnage `size × 5` quand `GlobalTopLibraryOnly` est actif, pour remplir les places
après filtrage.

### Demandes à Seerr

Un titre du Top mondial absent de la bibliothèque porte un bouton « Demander », qui passe la
demande à Seerr (Jellyseerr, Overseerr et leur successeur partagent l'API `/api/v1`). **Le
bouton est celui de Jellyfin Enhanced**, relevé dans son code (`seerr-status.js`,
`ui-buttons.js`, `analyzeSeasonStatuses`, `ui-season-modal.js`) : mêmes libellés, mêmes couleurs,
même voile en dégradé, mêmes icônes — prises dans la police Material que jellyfin-web sert déjà,
sans recopier ses SVG. Un serveur qui utilise ce plugin retrouve le même geste.

- **Le bouton n'apparaît qu'au survol ou au focus**, comme chez Jellyfin Enhanced 12.8 (vu sur la
  prod : son voile n'existe pas au repos). Sur un écran sans survol — tactile, téléviseur — il
  est toujours là : la règle vit dans le `@media (hover:none)` des flèches, pas dans un nouveau
  point de rupture.
- **Un film se demande d'un clic** et devient « Demandé ». **Une série ouvre le choix des
  saisons** — jamais une demande de toutes les saisons d'office. Son état se déduit de celui de
  ses saisons : tant qu'il en reste une à demander, ce sont les libellés de Jellyfin Enhanced
  (« Demander », « Demander manquant », « Demander plus »).
- **Seul écart assumé avec Jellyfin Enhanced** : quand plus aucune saison n'est demandable, il
  affiche encore « Demander » (`analyzeSeasonStatuses` classe la série en « supprimée »), en
  comptant sur ses pastilles d'état. Constaté sur le 12.1 : une série dont on venait de demander
  toutes les saisons redevenait « Demander ▼ ». Ici le bouton dit l'état réel — « En attente
  d'approbation », « Demandé », « Partiellement disponible » — et n'agit plus. Les épisodes
  spéciaux ne comptent que si Seerr les accepte.
- **La fenêtre de demande est celle de Jellyfin Enhanced**, relevée règle par règle dans
  `ui-styles.js` et `modal.js` de sa 12.8 : en-tête sous un voile à 80 %, titre en dégradé,
  interrupteurs, une carte par saison, pastilles en capitales, pied « Annuler / Demander ». Deux
  écarts : l'en-tête prend l'affiche déjà relayée plutôt que le fond TMDB — pas de nouveau relais
  d'images, et TMDB ne voit pas le visiteur ; la colonne du nom perd son `min-width: 0`, qui
  laissait un mot long chevaucher la colonne des épisodes sur un téléphone.
- **Voiles à z-index 10000**, comme la fenêtre de Jellyfin Enhanced — fenêtre Seerr et panneau de
  personnalisation ; le toast à 10001. jellyfin-web 12.1 place `.skinHeader` dans un conteneur
  `sticky` à z-index 1099 (relevé sur le vrai serveur le 2026-09-27) : à 1000, l'en-tête restait
  net par-dessus le voile et cachait le haut de la fenêtre. Le banc rejoue cet en-tête.
- **Options avancées** (`SeerrAdvancedRequests`, l'option du même nom chez Jellyfin Enhanced) :
  serveurs lus dans `/api/v1/service/{sonarr|radarr}` puis le détail de chacun, gardés 5 min, le
  serveur par défaut non-4K présélectionné. Un film ouvre alors lui aussi sa fenêtre. **Seerr ne
  filtre pas ces choix selon les droits du compte** — lu dans `MediaRequest.ts` : il les enregistre
  tels quels. `SeerrRules.IsAllowedChoice` vérifie donc chacun contre les listes publiées, sinon
  400 : aucun dossier arbitraire ne part vers Sonarr ou Radarr avec la clé d'administration.
- **Le choix des saisons suit deux réglages de Seerr**, lus dans `/api/v1/settings/main` comme le
  fait Jellyfin Enhanced — seuls deux booléens, car la réponse contient la clé d'API. Sans
  demandes partielles, la série part en entière, épisodes spéciaux exceptés ; sans épisodes
  spéciaux, la saison 0 n'est pas proposée.
- **Une saison qui attend son approbation n'est plus demandable.** Une demande porte un statut de
  DEMANDE (1 à approuver, 2 approuvée), que `SeerrRules` traduit en statut de MÉDIA. Jellyfin
  Enhanced les mélange, et rend ainsi demandable une saison déjà demandée.

- **La clé d'administration ne quitte jamais le serveur.** Le navigateur parle à
  `SeerrController`, qui parle à Seerr. Chaque demande part avec `X-Api-User`, l'identifiant du
  compte Seerr lié au compte Jellyfin (`jellyfinUserId`, sans tirets) : Seerr applique alors les
  droits et les quotas de l'utilisateur, pas ceux de l'administrateur.
- **Le serveur ne relaie que ce qu'il a publié.** `Status`, `Seasons` et `Request` n'acceptent que les
  titres absents de l'instantané Global. Sans cette liste blanche, tout compte connecté pourrait
  faire demander n'importe quel titre au nom de n'importe qui — ou sonder Seerr à travers Jellyfin.
- **Le type de média fait partie de l'identité.** TMDB numérote films et séries séparément :
  `TopListEntry.MediaType` (`movie` ou `tv`) accompagne l'identifiant. Un instantané antérieur n'en
  porte pas, donc pas de bouton jusqu'au recalcul suivant.
- **Caches** : association des comptes 10 min (1 min si le compte est introuvable, le temps
  qu'un administrateur l'importe), état d'un titre 1 min. Les états sont lus par lots de 20.
- **Réponses de `Request`** : 200 avec l'état ; 400 si une série arrive sans saisons, ou un film
  avec ; 404 compte absent de Seerr ; 403 droits insuffisants ; 502 Seerr injoignable ou incohérent (le corps précise `offline` ou `error`) ; 503
  intégration désactivée. Le 403 est sans danger : le seul gestionnaire d'échec de jellyfin-web,
  `appRouter.onRequestFail` (lu dans le bundle 12.1), ne réagit qu'à un 403 portant
  `X-Application-Error-Code: ParentalControl`, qu'il renvoie à l'écran de connexion.

Côté client, le bouton est une **surimpression dans `.cardScalable`**, jamais un élément sous la
carte : la carte garde la hauteur de ses voisines, et la rangée celle des rangées natives. Il
reste masqué tant que l'état n'est pas connu. Un état illisible masque le bouton, sans afficher
d'erreur : l'accueil est la page la plus vue du serveur, une panne de Seerr ne doit pas le couvrir
de rouge. Une erreur ne s'affiche qu'en réponse à un clic, sur le bouton concerné. Une erreur
passagère (« Seerr hors ligne », « Erreur ») rend la main au bout de 4 s ; « Utilisateur non
trouvé » et « Pas de permission » restent affichés, puisqu'un nouvel essai échouerait pareil.
Dans le choix des saisons, un refus s'affiche dans la fenêtre, qui reste ouverte.

Aucune transition sur le fond du bouton : chaque bouton passerait par le violet de « Demander »
avant sa vraie couleur, à chaque affichage. Seul le soulèvement au survol s'anime.

### Jamais vu et de retour cette semaine

`LibraryRowBuilder` produit deux listes qui ne dépendent que de la bibliothèque.

**Jamais vu** croise l'union des films lus par au moins un compte — obtenue par
`GetItemIds`, qui ne remonte que des identifiants — avec les mieux notés triés par
`CommunityRating`. Volontairement limité aux films : Jellyfin ne considère une série lue
que si tous ses épisodes le sont, si bien qu'une série entamée puis abandonnée remonterait
comme jamais vue. Sur-échantillonnage `size × 20` car la plupart des mieux notés ont déjà
été vus.

**De retour cette semaine** interroge les épisodes ajoutés depuis N jours, triés par
`DateCreated` décroissant, et retient la première occurrence de chaque `SeriesId` : l'ordre
des épisodes donne donc directement le rang des séries. La limite de 1000 épisodes garantit
qu'une saison ajoutée d'un bloc ne masque pas les séries suivantes.

### Parce que tu as regardé

La seule rangée **propre à chaque compte**, et la seule qui ne soit pas précalculée : un
classement par utilisateur n'a rien à faire dans un instantané partagé. Elle vit donc
entièrement dans le client, en deux requêtes à l'API native de Jellyfin — le dernier film
terminé par l'utilisateur (`SortBy=DatePlayed`, `IsPlayed=true`), puis d'autres titres
partageant ses genres (`Genres`, pipe-délimité, `ExcludeItemIds` pour retirer le film de
départ). Aucun code serveur, aucune ligne dans la tâche planifiée.

Limitée aux films pour la même raison que « jamais vu » : Jellyfin ne considère une série lue
que si tous ses épisodes le sont, si bien qu'une série abandonnée passerait pour le dernier
titre regardé. Deux genres au plus dans le filtre — au-delà, il devient si large qu'il ne
recommande plus rien de particulier. La rangée est simplement absente tant que l'utilisateur
n'a terminé aucun film.

### Studios et genres

**Les décomptes de Jellyfin ne sont pas utilisables.** Dans `BaseItemRepository.GetItemValues`
(vérifié sur le tag `v10.11.11`), l'`ItemCounts` attaché à chaque studio ou genre est calculé à
partir d'un `itemCountQuery` qui **n'est corrélé à aucune ligne du résultat** : le `Select` sur
l'entrée courante ne le référence jamais. La même valeur est donc renvoyée pour toutes les
entrées — le nombre de titres possédant un studio, quel qu'il soit. Le code amont porte un
`// TODO: This is bad refactor!` à cet endroit.

Conséquence, tant que le plugin s'y fiait : les studios étaient classés par **nombre de variantes
d'écriture** de leur nom, pas par nombre de titres, et `MinItemsPerStudio` / `MinItemsPerGenre` ne
filtraient rien ou filtraient tout.

`CatalogBuilder` recompte donc lui-même. `GetStudios` / `GetGenres` ne servent plus qu'à
**l'identité** : l'identifiant qui fait le lien et le logo qui décide de la variante affichée.
Le comptage passe par un balayage **bibliothèque par bibliothèque** (`AncestorIds`), ce qui a trois
effets : les décomptes sont justes, `ExcludedLibraryIds` s'applique enfin aux catalogues, et chaque
entrée porte sa ventilation par bibliothèque. `Studios` et `Genres` sont des colonnes de l'élément
— des chaînes jointes par `|` — donc aucun `ItemFields` supplémentaire n'est nécessaire pour les
lire. Les deux catalogues sont produits par un seul balayage : ils se comptent sur les mêmes titres.

**Les variantes d'un même studio sont fusionnées.** Les fournisseurs de métadonnées écrivent
la même société sous plusieurs libellés — « Warner Bros. », « Warner Bros. Pictures »,
« Warner Bros. Animation » sont trois entrées distinctes dans Jellyfin, et la rangée affichait
donc trois fois le même studio. `StudioNameNormalizer` réduit un nom à son identité (sans
accents, sans ponctuation, sans les mots décrivant la nature de la société) et sert de clé de
regroupement. La variante retenue est celle qui **possède un logo**, puis celle qui compte le
plus de titres : la rangée affiche des logos, un studio sans image y apparaîtrait comme un
simple libellé. Le classement s'appuie en revanche sur le **total de toutes les variantes**,
pour qu'un studio éclaté en cinq libellés ne soit pas relégué derrière un studio moins présent.

Ce total n'est pas affiché : il agrège des variantes alors que le lien ne mène qu'à l'une
d'elles. Il sert au classement et au seuil `MinItemsPerStudio`, pas au rendu.

Un nom composé uniquement de mots génériques — « Studio », « Films » — conserve sa forme sans
ponctuation comme clé, sinon des sociétés sans rapport se retrouveraient fusionnées sous une
clé vide.

**Les genres sont regroupés de la même façon, à la casse près.** Jellyfin distingue
« Science-Fiction » de « science-fiction » : ce sont deux entrées, avec deux décomptes. Studios
et genres partagent donc `NameGroup`, qui **additionne** les décomptes des variantes au lieu de
ne garder que la plus grosse — sans quoi un genre éclaté en deux graphies affichait la moitié de
ses titres et pouvait passer sous `MinItemsPerGenre`. Les genres se regroupent sur le nom
insensible à la casse, les studios sur la clé normalisée. Ces agrégations sont calculées une fois par la
tâche planifiée, jamais par requête.

**La visibilité est appliquée à la lecture.** L'agrégation reste globale, mais chaque entrée porte
son décompte ventilé par bibliothèque : `CatalogController` n'additionne que les bibliothèques
visibles par l'appelant — `GetUserRootFolder().GetChildren(user, true)` — puis reclasse avant de
tronquer, sans quoi la limite retiendrait les entrées d'après un ordre calculé sur des titres
interdits. Une entrée dont le total visible tombe à zéro disparaît de la rangée, au lieu d'y
afficher un nom menant à une page vide. Un instantané agrégé avant la mise à jour ne porte aucune
ventilation : sa provenance est *inconnue*, pas vide, et il passe alors avec son total d'origine
plutôt que de vider les rangées entre le redémarrage et le premier recalcul.

Les **titres** d'une rangée de genre ne sont pas précalculés : le script les demande à l'API native
de Jellyfin (`/Items?GenreIds=…`), une requête indexée, paginée et déjà filtrée par utilisateur —
exactement ce que fait la page d'accueil native pour ses propres rangées. Le chargement est différé
par `IntersectionObserver` pour ne pas déclencher toutes les requêtes au premier rendu.

### Réglages du serveur, choix de chacun

La page de configuration décide pour tout le serveur. Quand `AllowUserPreferences` est
activé — **par défaut** — ces réglages ne sont plus qu'un **défaut** : chaque compte peut
choisir ses rangées, leur ordre, sa couleur d'accentuation, la taille du chiffre et le
masquage des sections natives.

**Chaque champ de `UserRowPreferences` est nullable, et c'est tout le contrat.**
`null` signifie « je n'ai rien choisi, prends la valeur de l'administrateur ». Sans cette
distinction, une préférence enregistrée figerait la valeur du jour : un administrateur qui
active une nouvelle rangée ne la verrait apparaître chez personne, puisque tous les comptes
porteraient un « faux » explicite hérité d'un panneau ouvert des mois plus tôt.

Ce que ces préférences **ne** couvrent pas : tailles de rangées, titres, fenêtre
d'observation, source externe. Ceux-là décident de ce qui est *calculé*, une seule fois pour
tout le serveur ; les préférences ne décident que de ce qui est *montré*. Un utilisateur qui
pourrait changer une taille demanderait un recalcul rien que pour lui.

La fusion a lieu dans `ClientOptions` (`UserPreferenceRules.Apply`) : le rendu reçoit des
valeurs déjà effectives et n'a rien à savoir de tout cela. Le seul champ ajouté au contrat
est `AllowUserPreferences`, qui décide si le bouton de personnalisation est proposé.

**Les préférences vivent dans leur propre fichier**, `user-preferences.json`, à côté des
instantanés. Écrire dans `MediaCarousel.xml` demanderait `UpdateConfiguration`, qui réécrit
toute la configuration et notifie le serveur : un utilisateur qui coche une case
déclencherait la même mécanique qu'une modification administrateur, sur un fichier que
plusieurs comptes toucheraient en même temps. Tout est gardé en mémoire — ces valeurs sont
lues à chaque chargement de la page d'accueil de chaque utilisateur.

**Le panneau vit sur la page d'accueil**, pas dans le tableau de bord : la page de
configuration du plugin est réservée aux administrateurs, un compte ordinaire ne peut pas
l'ouvrir. Un bouton est posé dans l'en-tête de la **première rangée du plugin** — jamais
dans celui d'une section native, que Jellyfin reconstruit quand bon lui semble. Le panneau
n'emprunte ni `dialogHelper` ni `emby-checkbox` : ces composants doivent avoir été
enregistrés par le client, ce qui n'est garanti sur aucune page.

Trois règles, chacune venue d'un défaut constaté :

- **Un compte qui masque tout garde un accès.** Le bouton vivant sur une rangée, masquer
  toutes les rangées le faisait disparaître, sans retour possible sans l'administrateur. Quand
  toutes les rangées sont masquées, `insertPreferencesEntry` pose un en-tête discret, « Mes
  rangées », qui porte le bouton.
- **Le panneau est accroché au corps du document**, hors de toute rangée : le sélecteur des
  couleurs du plugin inclut donc `.mc-prefs-backdrop`. Sans lui, `--mc-accent` n'y était pas
  définie, le bouton « Enregistrer » perdait son fond et les contours de focus disparaissaient
  — invisibles à la télécommande. Et il se ferme sur `hashchange` et `popstate` : sinon, un
  retour arrière le laissait par-dessus la page suivante.
- **Le curseur de taille reçoit un pourcentage.** `normalizeRankScale` rend une FRACTION ;
  donnée telle quelle à un curseur borné à partir de 25, elle y était ramenée, et enregistrer
  le panneau sans y toucher réduisait le chiffre à 40 % — constaté sur un client réel.

### Persistance

`SnapshotStorage` écrit chaque instantané en JSON dans `Plugin.Instance.DataFolderPath`, et
les stores le relisent dans leur constructeur. Sans cela, un redémarrage du serveur vide
toutes les rangées jusqu'à la fin du premier recalcul — qui peut être long sur une grande
bibliothèque, ou attendre le réseau pour le Top mondial. L'écriture passe par un fichier
temporaire puis un `File.Move` : un arrêt brutal ne laisse jamais un fichier tronqué, et un
fichier illisible est simplement ignoré au démarrage.

### Tolérance aux pannes

`TopListRefreshService` traite les deux classements indépendamment et **conserve l'instantané
précédent** en cas d'échec. Une coupure réseau ne vide jamais la liste côté client. Un
`SemaphoreSlim` empêche deux recalculs simultanés (tâche planifiée + bouton manuel).

**Cette tolérance rend les échecs invisibles**, c'est son revers : une clé TMDB expirée laisse
une rangée d'apparence normale dont la date vieillit en silence. `RefreshHealth` consigne donc
chaque échec rattrapé — section et message — plus la durée du passage, `Status` l'expose, et la
tuile « Dernier calcul » de la page de configuration passe en alerte en nommant la section. Le
bilan vit en mémoire : un redémarrage le remet à zéro, comme tout ce qu'il décrit. La durée sert
aussi de mesure : c'est elle qu'on regarde avant de parler d'optimiser le balayage.

**Le cache d'affiches se purge tout seul.** À la fin de chaque recalcul, les fichiers de
`posters/` non demandés depuis 30 jours sont supprimés. `PosterController` pose la date d'accès à
chaque service — les montages `noatime` ne la maintiennent pas — et une affiche supprimée à tort
se retélécharge simplement à la prochaine requête.

### Publication en collections

`CollectionSynchronizer` maintient un `BoxSet` par classement. `BoxSet.IsPreSorted` vaut `true` :
l'ordre des `LinkedChildren` **est** l'ordre affiché, donc le rang est préservé. La synchronisation
réécrit l'ensemble (`RemoveFromCollectionAsync` puis `AddToCollectionAsync`) plutôt que le delta,
car l'ordre fait partie du résultat. L'identifiant de la collection est mémorisé dans la config ;
si l'administrateur supprime la collection, elle est recréée au recalcul suivant.

---

### Couche frontend

`Web/media-carousel.js` est une IIFE sans dépendance, servie par `AssetsController` sur
`/MediaCarousel/media-carousel.js` (route stable, contrairement au nom du dossier d'installation).

- **Aucun calcul** : le script appelle `Top/Local`, `Top/Global` et `ClientOptions`, puis rend.
- **Les affiches externes passent par le serveur.** Le Top mondial peut classer des titres absents
  de la bibliothèque ; leur affiche vient de TMDB. Servie telle quelle, elle ferait tomber le
  navigateur de **chaque utilisateur** sur `image.tmdb.org` — leur adresse IP part chez un tiers, et
  un client sans accès Internet sortant n'affiche rien. `PosterController` télécharge une fois, met
  en cache dans le dossier de données, et sert ensuite depuis le disque. Le client n'envoie jamais
  d'URL : seulement un nom de fichier, validé par `PosterProxy` (`^[A-Za-z0-9._-]{1,128}\.(jpg|jpeg|png|webp)$`,
  refus de `..`), et l'hôte distant est une constante du plugin — aucune requête ne peut être
  détournée vers une adresse choisie par l'appelant. Une adresse que le plugin ne sait pas relayer
  est laissée intacte : mieux vaut une affiche chargée depuis sa source qu'une vignette vide.
- **Les dates de lecture passent par `PlaybackDate.AsUtc`.** Jellyfin écrit ses dates en UTC,
  mais EF Core sur SQLite les relit en `Unspecified`, et `ToUniversalTime()` traite alors une
  date non qualifiée comme LOCALE : une lecture de 1 h du matin à Paris ressortait à 23 h la
  veille, donc un jour plus tôt, ce qui déplace la frontière de la fenêtre d'observation.
- **Sous une fenêtre d'observation, le plafond vaut 1.** `UserItemData.PlayCount` est le cumul
  DEPUIS TOUJOURS — Jellyfin ne compte rien par période. Retenir ce cumul ferait remonter un
  film vu cinquante fois il y a trois ans et une fois cette semaine comme s'il avait été vu
  cinquante fois cette semaine. Chaque compte pèse donc une voix, la seule chose que la
  donnée permette d'affirmer.
- **Une requête PAR TYPE de média, chacune avec ses créneaux.** Une requête unique mêlant
  films et épisodes laissait un seul binge-watcher consommer ses cent créneaux avec quatre
  saisons : ses films n'atteignaient jamais le classement.
- **`RefreshIntervalHours` est appliqué par `RefreshScheduleSynchronizer`.**
  `GetDefaultTriggers()` n'est consulté par Jellyfin qu'à la PREMIÈRE installation de la
  tâche ; ensuite le calendrier vit dans sa configuration. Sans ce service, le réglage ne
  faisait plus rien. Seul le déclencheur d'intervalle est réécrit : un passage quotidien
  ajouté à la main survit. **Au démarrage, les tâches n'existent pas encore** : Jellyfin démarre
  les services hébergés AVANT de les enregistrer (« Running startup tasks » vient ensuite —
  huit démarrages sur huit sur un serveur 12.1). L'application au démarrage échouait donc
  toujours, le réglage n'étant repris qu'au prochain enregistrement de la page. Le service
  s'abonne désormais à `ITaskManager.TaskExecuting` et applique l'intervalle dès que la
  première tâche s'exécute — la nôtre, que son déclencheur de démarrage lance aussitôt.
- **Le contrat d'API ne publie que ce que le rendu consomme.** Le score, le nombre de
  lectures, le nombre de spectateurs distincts et la date de dernière lecture en ont été
  retirés : le client ne les lisait pas, et ils décrivent le comportement de visionnage des
  autres comptes. Ils restent calculés — ils départagent les ex æquo.
- **`ClientOptions` existe parce que** `GET /Plugins/{id}/Configuration` exige `RequiresElevation` :
  un utilisateur standard ne peut pas lire la configuration du plugin. Le contrat `ClientOptionsDto`
  n'expose que ce qui sert au rendu — jamais la clé d'API de la source externe.
- **Point d'insertion** : la section « Mes médias » est repérée par
  `.homeLibraryButton, .card[data-type="CollectionFolder"], .card[data-type="UserView"]`,
  et les rangées sont insérées juste après. À défaut, en tête du conteneur.
- **Réinjection** : `jellyfin-web` reconstruit entièrement `.homeSectionsContainer` à chaque
  affichage de l'accueil. Un `MutationObserver` débouncé, plus `hashchange` et `viewshow`,
  déclenchent un nouveau rendu ; le garde `container.querySelector('.mc-row')` évite les doublons.
- **Nos `.itemsContainer` répondent à `pause()` et `resume()`.** La classe est là pour le thème
  (gouttière, `.itemsContainer .card`), mais jellyfin-web 12.1 appelle `pause()` sur CHAQUE
  `.itemsContainer` de l'accueil quand on le quitte, sans vérifier qu'elle existe
  (`homeSections.pause`, lu dans son code ; `resume` est gardé par `e.resume &&`). Sur une
  simple `div`, l'exception remontait jusqu'à React : en prod le 2026-09-28, passer à l'onglet
  Favoris laissait une page vide ou l'écran d'erreur. `buildRow()` pose donc des méthodes vides
  sur la bande et sur son étalon.
- **Un rendu qui ne pose rien espace les suivants.** Tant qu'aucune rangée n'est posée, chaque
  mutation de la page relance un rendu — et ses requêtes, puisque rien de vide n'est mémorisé.
  Constaté en prod le 2026-09-27 : la build 10.11 installée sur Jellyfin 12.1 répondait 500 à
  chaque liste, 4 388 erreurs en une journée, une salve par mutation et par accueil ouvert.
  Désormais, après un rendu vide, le même affichage attend 2 s, puis 4, 8… jusqu'à cinq minutes.
  Une navigation (`hashchange`, `viewshow`), un changement de compte ou de préférences repart
  aussitôt. Pas d'identité de conteneur pour reconnaître une nouvelle visite : jellyfin-web
  réécrit le contenu du même `.homeSectionsContainer`.
- **Accessibilité** : chaque rangée est reliée à son titre par `aria-labelledby`, la bande porte
  `role="list"` et les cartes `role="listitem"` avec un `aria-label` explicite (« Numéro 3 : … »).
  Les flèches sont un confort souris : `tabindex="-1"` et `aria-hidden="true"`, la navigation au
  clavier passant par les cartes elles-mêmes. `prefers-reduced-motion` et `prefers-contrast` sont
  honorés.
- **Balisage natif** : chaque carte reprend la structure et les classes de
  `cardBuilder.buildCard` — `.card`, `.overflowPortraitCard`, `.cardBox`, `.cardScalable`,
  `.cardPadder`, `.cardImageContainer`, `.cardFooter`, `.cardText` — et l'affiche est un fond
  CSS, comme chez Jellyfin. Les vignettes de studio prennent la forme paysage
  (`overflowBackdropCard`), le logo contenu et non recadré.
- **Aucune dimension n'est écrite ici.** Elle vient de jellyfin-web et du thème actif :
  ElegantFin calcule `--cardWidth` à partir d'un `--cardCount` révisé sur une quinzaine de
  paliers, et pose `width: var(--cardWidth) !important` sur `.card`. Le plugin posait
  auparavant ses propres tailles en pixels sur sept paliers maison ; ses rangées détonnaient
  au milieu des rangées natives — affiches plus petites, libellés absents, gouttières
  différentes — et aucun réglage ne pouvait les rattraper. **La règle est donc : ne jamais
  redimensionner une carte ici.** Une carte classée fait exception : elle est volontairement
  plus large, le chiffre occupant sa propre colonne — mais **l'affiche qu'elle contient garde
  la taille native au pixel près**. Les tests navigateur mesurent donc la parité sur
  l'**affiche**, et non sur la carte, à chaque palier d'écran.
- **La référence native des tests porte un `emby-scroller`.** Jellyfin interpose ce maillon
  entre la section et le conteneur de cartes, et c'est **lui** que les thèmes padent. Sans lui,
  la fixture résolvait ses pourcentages contre 100 % de la largeur alors que nos rangées les
  résolvaient contre une boîte rétrécie par le thème : la comparaison passait au vert en
  montrant un écart d'un pixel dans le navigateur. Toute référence ajoutée doit reproduire la
  chaîne complète, pas seulement les classes de la carte.
- **CSS** : injecté dans un `<style id="mc-styles">`, tout est préfixé `mc-`, rien n'est surchargé
  hors de ces classes. La feuille ne garde que les trois choses qui n'existent pas dans
  Jellyfin : le chiffre du rang, la bande défilante et les flèches. Il ne reste que trois
  `@media`, tous de comportement (`hover:none`, `prefers-reduced-motion`, `prefers-contrast`),
  plus aucun de taille.
- **Ordre des rangées** : `collectRows` n'impose plus d'ordre. Chaque rangée a un identifiant
  (`local`, `global`, `returning`, `neverplayed`, `because`, `studios`, `genres`) et un
  constructeur ; `RowOrder` décide de la séquence. La normalisation est **volontairement
  tolérante** : identifiants inconnus ignorés, rangées absentes ajoutées à la fin dans l'ordre
  par défaut, **pas à la fin** : sans cela, une configuration antérieure à l'apparition d'une
  rangée verrait toute la disposition basculer le jour de la mise à jour. La même règle est
  réimplémentée dans `configPage.html` (`normalizeOrder`) : les deux listes d'identifiants
  doivent rester synchronisées.
- **Sections natives déplaçables** (`ManageNativeSections`, désactivé par défaut) : l'ordre
  accepte alors des entrées `native:resume`, `native:latestmedia`… `.section{N}` étant
  purement positionnel — jellyfin-web n'écrit aucun type dans le DOM — le type se lit dans
  les préférences du compte (`getDisplayPreferences('usersettings', …)`,
  `CustomPrefs.homesection{i}`). **C'est un réglage par utilisateur ramené à un ordre
  global :** l'activer impose l'ordre de l'administrateur à tout le monde, d'où l'opt-in
  explicite. Déplacer une section native est sans risque, `loadSection` la retrouvant par
  `querySelector('.section' + i)` où qu'elle soit dans le conteneur.

  Trois détails décident si une section est **trouvée** :
  **dix positions, pas huit** — `loadSections` rend `userSectionCount = 10` sections alors
  que `DEFAULT_SECTIONS` n'en nomme que huit, donc une section descendue en neuvième ou
  dixième position existe dans les préférences et s'arrêter à huit revenait à ne pas la
  voir ; **le décalage des interfaces téléviseur** — `getAllSectionsToShow` ajoute une
  section de bibliothèques en tête quand l'ordre du compte n'en contient aucune, et tout
  glisse alors d'un cran, ce que `nativeOffset` rattrape en reconnaissant les onze
  `.section{N}` de ces interfaces ; et **les libellés de la page de configuration**, qui
  sont ceux de `jellyfin-web` (`fr.json` : `NextUp` → « À suivre », `HeaderLatestMedia` →
  « Médias récemment ajoutés »). En inventer d'autres faisait chercher « À suivre » dans
  une liste qui affichait « Prochainement », et paraître incomplète une liste qui ne
  l'était pas.
- **Thème clair** : les chiffres du rang sont des blancs translucides, invisibles sur fond
  clair. Aucun media query ne peut le dire — les thèmes Jellyfin ne suivent pas
  `prefers-color-scheme` — donc `isLightBackground()` lit la couleur **réelle** de la page, en
  remontant jusqu'au premier fond opaque, et pose `mc-on-light` sur les rangées : tous les jetons
  de couleur basculent en sombre. Recalculé à chaque rendu, donc un changement de thème est
  rattrapé à la visite suivante de l'accueil.
- **Chargement** : les rangées de genre différées affichent six silhouettes pulsantes plutôt
  qu'une bande vide qui ressemble à une panne ; la pulsation ne touche que l'opacité. Chaque
  affiche naît transparente et se fond une fois chargée — l'événement `load` ne remonte pas en
  bulle mais se capture ; une image déjà en cache ou en erreur est marquée immédiatement, sinon
  elle resterait invisible à jamais.
- **Défilement** : `scroll-snap-type:x proximity` aligne les cartes en fin de geste sans
  confisquer le défilement libre (Chromium 69, donc Tizen l'a).
- **Animation** : les rangées entrent en fondu montant, décalées de 55 ms l'une après l'autre
  (plafond 400 ms, posé en JS à l'insertion). Au survol et au focus, la carte s'agrandit
  légèrement et l'affiche respire dans son cadre — deux échelles superposées donnent de la
  profondeur là où une seule paraît plate.
- **Le chiffre du rang est un SVG**, dans sa propre colonne **à côté** de l'affiche, comme
  chez Netflix. `-webkit-text-stroke` sur du texte HTML donnait un contour d'épaisseur **fixe
  en pixels** : il rongeait la hampe du « 1 », resserrait le « 10 », et ne suivait pas la
  taille de la carte. Le SVG porte son propre repère, dont la largeur suit le nombre de
  chiffres : le glyphe garde les mêmes proportions du téléphone au téléviseur, sans un seul
  point de rupture. Le repère est **resserré sur le glyphe** (`viewBox="0 30 W 84"`) : une
  hauteur d'em complète laisse près de quarante pour cent de vide au-dessus des capitales et
  sous la ligne de base, et le chiffre paraissait alors deux fois plus petit que demandé.

  **Sa position n'est jamais ce que dit le CSS.** Le repère SVG porte sa propre marge —
  l'espace des hampes et des talons — si bien que les valeurs déclarées ne décrivent pas ce
  qu'on voit : un réglage antérieur à `bottom:-1.5%` faisait tomber la ligne de base **4 %
  sous l'affiche**, dans la zone du titre, alors que le CSS annonçait l'inverse. Les tests
  mesurent donc la boîte du **glyphe**, jamais la valeur déclarée.
- **À côté, plus par-dessus** : posé sur l'affiche, le chiffre dépendait de ce qu'il y avait
  dessous — contour, halo et ombre tiennent sur une image sombre et lâchent sur une image
  claire, et il fallait tout inverser selon le thème. Le sortir de l'affiche supprime le
  problème à la racine : plus de voile, plus de remplissage, un simple contour évidé
  (`fill: none`) dans le gris du thème. L'affiche mord dessus par une marge négative
  (`-.46` de sa largeur), ce qui l'enfonce comme sur la maquette Netflix.
- **Alignement par le HAUT de la ligne**, pas par le bas. La colonne contient l'affiche **et**
  son libellé ; aligné par le bas, le chiffre descendait de toute la hauteur du libellé et
  venait le chevaucher. Par le haut, ses deux bords tombent sur ceux de l'affiche, dont il a
  exactement la hauteur. Pour la même raison le libellé entre **dans** la colonne de
  l'affiche : centré sur la carte élargie, il aurait dérivé à cheval sur le chiffre.
- **La largeur d'une carte classée est CALCULÉE, jamais laissée à `width: auto`.** Le
  navigateur doit alors deviner la largeur « max-content » de la carte, et la marge négative
  du chiffre le trompe : mesuré sur un serveur réel, il proposait 342 px pour un contenu qui
  en réclamait 433, et l'affiche se faisait rogner de 91 px par la carte suivante. Les trois
  termes sont connus — le chiffre vaut `1,5 × largeurDuRepère / 84` d'affiche, moins le
  chevauchement, plus l'affiche — auxquels s'ajoute **l'habillage mesuré** : le padding de
  `.card` et les marges de son `.cardBox`, que chaque thème fixe à sa guise. La valeur est
  posée **en ligne** et en `border-box` : les thèmes déclarent `width: var(--cardWidth)
  !important` sur `.card`, et à spécificité égale c'est la dernière feuille chargée qui
  gagne — le Custom CSS de Jellyfin est toujours chargé après la nôtre. Seul un style en
  ligne `!important` échappe à cette course.
- **Une carte classée ne confine pas la peinture.** `jellyfin-web` pose `contain: content`
  sur `.card` ; ce mot inclut le confinement de peinture, qui découpe net ce qui dépasse de
  la boîte. Tant que la carte était plus large que son contenu il restait du jeu ; calée au
  pixel, elle amène le bord de l'affiche pile sur cette lame, et l'agrandissement au survol
  — 1,06 chez ElegantFin — était tranché à droite. On garde `layout` et `style`, on retire
  `paint`. Et la carte survolée prend un `z-index` : les cartes classées sont jointives,
  donc l'agrandissement empiète sur la voisine, qui la recouvrirait.
- **La largeur d'affiche des rangées classées est MESURÉE, jamais calculée.** La colonne du
  chiffre tient la place d'un `.cardScalable`, et c'est donc sa largeur qu'il faut reproduire.
  La calculer supposerait de connaître le modèle de boîte, le padding de `.card` et la marge
  de `.cardBox` — trois valeurs qu'un thème redéfinit. `measurePosterWidth()` lit la vraie
  valeur sur un `.cardScalable` non classé de la page et la publie dans `--mc-measured` ;
  elle est relue à chaque redimensionnement, regroupée sur la trame d'affichage. Mesurer
  `.cardImageContainer` serait un piège : ElegantFin borde `.cardScalable` d'un pixel, et
  chaque affiche classée sortirait deux pixels trop étroite. La référence doit aussi avoir la
  **même forme** : nos rangées sont insérées juste après « Mes médias », dont les vignettes
  de bibliothèque sont au format PAYSAGE et précèdent tout le reste dans le DOM. Prendre la
  première carte venue gonflait l'affiche de moitié au bureau et la DOUBLAIT presque sur
  téléphone. D'où le filtre sur `.overflowPortraitCard`, doublé d'un contrôle du rapport de
  la boîte.
- **Chaque rangée classée emporte son propre étalon**, la « bande sonde ». Chercher la
  référence dans la page était une COURSE : sur un serveur où seules des rangées classées
  sont activées, aucune de nos rangées ne fournit d'affiche non classée, et la seule
  référence possible vient d'une section native — qui se remplit par sa propre requête.
  Quand notre rendu passait devant, la mesure n'avait pas lieu ; et comme elle n'était
  tentée qu'une fois et que `render()` refuse de rejouer tant qu'une rangée est en place,
  **plus rien ne rattrapait jusqu'au rechargement de la page**. Mesuré : 167 px au lieu de
  113, soit +48 %, et la rangée apparaissait « en petit » une fois sur deux. La sonde est
  une bande jumelle de la vraie — mêmes classes `itemsContainer scrollX`, donc mêmes règles
  de thème et même boîte de contenu, sans quoi le pourcentage de `--cardWidth` se
  résoudrait sur une autre base. `height:0` la retire de la page sans la retirer de la mise
  en page ; `align-items:flex-start` est obligatoire, car le `stretch` par défaut lui
  donnerait la hauteur nulle de sa bande et le contrôle de proportion 2:3 la rejetterait.
  Une position absolue ne conviendrait pas : le pourcentage se résoudrait alors contre la
  boîte de **padding**, plus large que la vraie. `ensureMeasured()` complète le dispositif —
  un relevé qui échoue est retenté au lieu d'abandonner en silence. Le banc joue la course
  dans les deux sens (`COURSE:`) et vérifie que la sonde n'ajoute ni hauteur, ni carte
  visible, ni nœud d'accessibilité (`SONDE:`).
- **La bande peut déborder du document, et elle le doit.** En « version pour ordinateur »
  sur téléphone, Chrome pose un document plus étroit que ce qu'il affiche — mesuré sur
  l'appareil : document 980 px, écran 1645 px, soit **59,6 %**. Les rangées de Jellyfin ne
  rognent pas : leurs cartes débordent de leur conteneur et restent visibles jusqu'au bord
  de l'écran. La nôtre porte `overflow-x: auto` pour son défilement, et ce réglage **découpe
  net** au bord du document : elle s'arrêtait donc à 59,6 % de la largeur affichée, trois
  cartes visibles au lieu de huit, pendant que les rangées voisines allaient au bord.
  `stretchStrips()` pose alors une largeur explicite, jusqu'au bord **affiché**, lu sur
  `visualViewport.width`. Surtout pas `window.innerWidth` : il compte la barre de défilement
  verticale, et ses ~15 px suffisaient à étirer la bande sur **tout PC** — constaté sur un
  client 12.1 réel, 501 px posés pour une page de 491. `visualViewport` exclut la barre et rend
  bien la largeur affichée en mode PC sur téléphone (1045 pour un document de 980, mesuré sur
  l'appareil). Sans lui, aucune extension. La marge de 8 px absorbe les arrondis. `box-sizing: border-box` accompagne la largeur, sinon le retrait
  latéral du thème s'y ajoute (1737 px pour 1645 demandés). Et **seules les bandes classées**
  sont étendues : leurs cartes portent une largeur en pixels posée en ligne, donc insensible
  au conteneur, alors qu'une carte ordinaire tient la sienne d'un pourcentage résolu contre
  ce même conteneur — l'élargir la ferait grossir et diverger des rangées natives.
- **La hauteur du chiffre est un réglage**, `RankNumberScale`, **100 % par défaut** — la
  proportion de Netflix, et le rendu validé à l'écran. Le prix est qu'une rangée classée
  occupe près du double d'une rangée ordinaire : sur téléphone une seule carte tient. Le
  réglage existe pour la resserrer sans jamais toucher à l'affiche. Le chevauchement suit l'échelle :
  à valeur fixe, un chiffre réduit finirait presque entièrement caché derrière l'affiche.
  **L'affiche, elle, ne bouge jamais.**
- **La respiration de fin de bande est une cale, jamais un `padding-right`.** `--cardWidth`
  contient un **pourcentage** (`99vw - 3.3% × 2`), qui se résout contre la boîte de contenu de
  la bande. Un padding la rétrécit — et les thèmes, ElegantFin compris, ne padent que le côté
  **gauche** (`.emby-scroller, .scrollX`). Nos affiches sortaient donc un demi-pixel plus
  larges que celles des sections natives, sur **toutes** les rangées, classées ou non. Une
  cale (`::after`) occupe la ligne sans toucher à la boîte de contenu. Second bénéfice : un
  `padding-right` de fin est ignoré par plusieurs moteurs à défilement horizontal.
- **L'espacement entre cartes est celui de Jellyfin** : le padding que `.card` porte
  lui-même, plus le `column-gap` que le thème pose sur `.itemsContainer` — classe que notre
  bande porte pour cette raison. Plus aucune marge de notre côté.
- **Contraintes Tizen** (voir la section dédiée) : pas de `gap` en flexbox, contour de focus porté
  par `:focus` et non `:focus-visible`, pas de `clamp()`.
- **Cohabitation avec les thèmes** : tous les réglages passent par des variables portées par
  `.mc-row`, jamais par `:root`. Quand le thème hôte expose déjà un jeton — `--sidePadding`,
  `--smallRadius` — il est adopté, avec la valeur native de Jellyfin en repli.
  Les couleurs de texte sont héritées : les titres réutilisent `sectionTitle`, donc ils suivent
  le thème sans effort.
- **Cache client** : `jellyfin-web` reconstruit le conteneur à chaque affichage de l'accueil, donc
  `render()` repart de zéro à chaque visite. `loadCached` mémorise les réponses cinq minutes —
  sans quoi chaque retour sur l'accueil relancerait les quatre requêtes alors que les classements
  ne sont recalculés que toutes les quelques heures. Un résultat vide n'est jamais mémorisé :
  une panne passagère ne doit pas condamner une rangée pour cinq minutes.
- **Cette mémoire appartient au compte connecté.** jellyfin-web est une application d'une seule
  page : sa déconnexion NAVIGUE vers l'écran de connexion au lieu de recharger (lu dans son code,
  12.1), si bien que le script survit d'un compte à l'autre. Les classements étant filtrés pour
  chaque appelant — visibilité, contrôle parental — un compte voyait ceux du précédent pendant
  cinq minutes, et ses réglages personnels jusqu'au rechargement. `scopeMemoryToUser()` oublie
  tout quand le compte change, et le compte fait partie de la clé de `loadCached`.
- **Le bouton Seerr est `aria-disabled`, jamais `disabled`.** Un bouton désactivé perd le focus :
  la télécommande qui vient de le presser ne serait plus nulle part. Le clic sur un bouton inerte
  est ignoré par le script. Dans le banc, Playwright refuse de cliquer un bouton `aria-disabled` :
  le test d'un clic ignoré passe `{ force: true }`.
- **Le script n'abandonne jamais l'attente.** Il observe la page dès son chargement, connecté ou
  non ; `render()` attend lui-même qu'un compte soit connecté. L'ancienne attente cessait au bout
  de trente secondes : quiconque passait plus longtemps sur l'écran de connexion n'avait aucune
  rangée jusqu'au rechargement — constaté sur un client 12.1 réel.
- **Les flèches ne font qu'un fondu.** Décalée de 6 px vers l'extérieur au repos, la flèche
  « suivant » dépassait du bord de la page et y ajoutait 6 px de défilement horizontal, que seul
  le `body{overflow-x:hidden}` de jellyfin-web masquait.

### Intégration à index.html

`ScriptInjectionTask` tente d'abord le plugin **File Transformation** (transformation en mémoire,
rien sur le disque, insensible aux mises à jour de Jellyfin), sinon modifie `index.html`
directement. `ScriptTag` centralise la balise, garantit l'idempotence et **retire les balises des
versions 1.x et 2.x** — sans quoi un navigateur continuerait à demander l'ancien
`carousel-layout.js` disparu.

La charge utile envoyée à FileTransformation est construite par réflexion à partir du type de
paramètre déclaré par sa propre méthode (`JObject.Parse`), pour ne pas dépendre d'une version de
Newtonsoft.Json qui pourrait diverger à l'exécution.

**Les applications Tizen et webOS ne chargent jamais ce fichier.** `jellyfin-tizen` empaquette
`jellyfin-web/dist` dans le `.wgt` installé sur le téléviseur — son `index.html` redirige vers
`www/index.html`, local à l'application — et `JELLYFIN_WEB_DIR` permet de choisir quelle interface
web est empaquetée. Le `index.html` du serveur, celui que `ScriptInjectionTask` complète, n'y est
donc pas lu. **Aucun réglage serveur ne peut y changer quoi que ce soit :** les rangées
n'apparaissent sur ces téléviseurs que si leur paquet est reconstruit à partir d'une interface web
portant déjà la balise. La page de configuration l'explique et affiche la balise à copier. Le seul
canal que ces applications récupèrent bien du serveur est le CSS personnalisé (`/Branding/Css`),
qui ne peut pas créer de rangée. Le rendu, lui, reste écrit pour ces téléviseurs — c'est ce qui
sert le jour où le paquet est reconstruit, et cela ne coûte rien ailleurs.

**L'écriture sur disque passe par un fichier temporaire puis un `File.Move`.** `index.html` est le
point d'entrée de toute l'interface web : une coupure de courant au milieu d'un
`File.WriteAllText` le laisserait tronqué et Jellyfin ne servirait plus aucune page. Le fichier
temporaire est créé dans le même répertoire, condition du remplacement atomique. Une `IOException`
est rattrapée au même titre qu'une `UnauthorizedAccessException` : le disque plein ou le fichier
verrouillé sont journalisés, ils ne font pas échouer la tâche planifiée.

---

## Conventions de code

### C#
- PascalCase pour classes, méthodes, propriétés ; `_camelCase` pour les champs privés.
- Commentaires XML (`///`) en français sur **tous** les membres publics (`GenerateDocumentationFile` est actif).
- `<Nullable>enable</Nullable>` — utiliser `?` et des vérifications explicites.
- Un fichier par type public.
- `async`/`await` avec `.ConfigureAwait(false)` dans les services ; jamais de `.Result` ni de `.Wait()`.
- Tout appel long accepte et honore un `CancellationToken`.
- Injection de dépendances par constructeur, jamais de service locator.

### JavaScript
- ES5 uniquement (pas de `let`, d'arrow function ni de template literal) : certains téléviseurs
  exécutent un moteur ancien. Aucun build, aucun paquet npm, aucun TypeScript.
- IIFE unique, rien exposé en global.
- Commentaires en français, identifiants en anglais.
- Tout HTML construit à partir de données passe par `escapeHtml`.

### Commits
Conventional Commits : `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Messages < 80 caractères.
Utilisés par la CI pour le versionnage sémantique (`!` ou `BREAKING CHANGE` → majeur, `feat:` → mineur).

---

## Workflow de développement

### Build

```bash
dotnet build -c Release
```

Sortie dans `bin/Release/net9.0/` : **uniquement** `JellyfinCarouselPlugin.dll` et `deps.json`.

- `CopyLocalLockFileAssemblies=false` et `ExcludeAssets=runtime` : aucune dépendance Jellyfin
  ou EF Core n'est empaquetée, le serveur fournit tout à l'exécution.
- `DebugType=none` : pas de `.pdb`, Jellyfin ne le lit pas.
- La cible `RemoveDocumentationFromOutput` retire le `.xml` de documentation après la copie.
  Il reste généré (il fait respecter les commentaires XML à la compilation) mais pesait à lui
  seul plus de la moitié du paquet.

Ces trois règles ramènent le ZIP de 84 Ko à 50 Ko.

### Package

```bash
cd bin/Release/net9.0 && zip -r ../../../JellyfinCarouselPlugin.zip .
```

### Test

1. Extraire le ZIP dans `plugins/MediaCarousel/` puis redémarrer Jellyfin.
2. **Tableau de bord → Extensions → Media Carousel** pour configurer.
3. **Tableau de bord → Tâches planifiées → Recalcul des classements MediaCarousel** pour déclencher.
4. Vérifier via `GET /MediaCarousel/Top/Local` et le journal du serveur (préfixe `MediaCarousel`).

### Tests

```bash
dotnet run --project tests/ScriptTag.Tests -c Release
cd tests/browser && npm install && node home-rows.test.mjs && node config-page.test.mjs
```

Trois suites sans framework — 482 assertions — exécutées en CI avant la publication ; voir
`tests/README.md`. L'une charge un extrait des règles d'ElegantFin **après** les nôtres pour
vérifier que la cohabitation tient.
Les deux suites navigateur chargent le vrai `media-carousel.js` et le vrai `configPage.html`
dans Chromium, avec un `ApiClient` simulé. L'une d'elles **rejoue `allowSwipe()` de
`jellyfin-web`** : le correctif du balayage mobile tient à une classe CSS, ce test est ce qui
l'empêche de disparaître à un refactor.

Reste à valider à la main sur une instance Jellyfin : l'injection du script et le rendu réel.

### CI/CD (`.github/workflows/build.yml`)

Sur push `main` : bump de version d'après les commits conventionnels → `dotnet build -c Release` →
ZIP → mise à jour de `manifest.json` (`sourceUrl`, checksum, `targetAbi` `10.11.11.0`) → commit
`[skip ci]` → release GitHub.

---

## Ajouter un réglage

1. **`Configuration/PluginConfiguration.cs`** — propriété + valeur par défaut + commentaire XML français.
2. **`Configuration/configPage.html`** — contrôle de formulaire dans le `<div role="tabpanel">` de
   l'onglet concerné, puis ajout de l'identifiant dans le tableau JS correspondant (`checkboxes`,
   `numbers`, `decimals`, `texts` ou `lists`). Le chargement et la sauvegarde sont pilotés par ces
   tableaux : **un champ absent de ces tableaux n'est ni chargé ni enregistré**, quel que soit son
   emplacement dans la page. Penser à mettre à jour le compteur de l'onglet.
3. Un réglage de calcul que personne ne touche après l'installation va sous le
   `<details class="mcCfg-advanced">` de son onglet, jamais en vue directe.
4. Consommer le réglage dans le service concerné.

### Structure de la page de configuration

Six onglets, un par groupe de réglages, construits avec le motif ARIA standard
(`role="tablist"/"tab"/"tabpanel"`, `aria-selected`, roving `tabindex`, flèches et Début/Fin).
Les `emby-tabs` de `jellyfin-web` ne sont volontairement pas utilisés : ils attendent une
structure interne précise et instancient leur propre scroller, ce qui reviendrait à dépendre de
détails d'implémentation du client. Seuls les `emby-button` sont réutilisés, pour l'apparence.

Les panneaux d'onglet n'utilisent que `hidden`, jamais `disabled` : `disabled` est réservé à
`applyToggle`, qui désactive les champs d'un groupe dont la case d'activation est décochée. Les
deux mécanismes restent ainsi indépendants.

L'avertissement de doublon vit **hors des onglets** : il compare `GlobalRowTitle` (onglet
Affichage) à `GlobalCollectionName` (onglet Rafraîchissement), deux onglets différents. Le placer
dans l'un des deux le rendrait invisible depuis l'autre.

Le groupe Seerr vit **dans** celui du Top mondial, sans `data-toggles`. `applyToggle` réactive
tous les champs d'un groupe : rallumer le Top mondial réactiverait les champs d'un Seerr resté
décoché. Et `refreshTabStates` compte les `data-toggles` d'un onglet : un Seerr coché sous un Top
mondial éteint ferait croire l'onglet actif. `applySeerrToggle` gère donc les deux cases.

**`pageshow` revient à chaque retour sur la page** : jellyfin-web réaffiche alors la même page,
gardée en cache, sans relancer son script. Les écouteurs se posent une seule fois, sous la garde
`wired`. Seul l'état relu de la configuration se réapplique à chaque affichage (`applyToggles`,
`applySeerrToggle`, `renderRowOrder`). Un écouteur anonyme posé à chaque affichage s'ajoute aux
précédents : c'est ainsi que « Descendre » faisait reculer une rangée de deux places.

## Ajouter une source de tendances

1. Implémenter `ITrendingProvider` dans `Providers/` (renvoyer des `TrendingTitle` avec le plus
   d'identifiants externes possible : le rapprochement local en dépend).
2. Ajouter la valeur à `TrendingProviderKind`.
3. Enregistrer l'implémentation dans `PluginServiceRegistrator`.
4. Ajouter l'option au `<select>` `GlobalTopProvider` de `configPage.html`.

---

## Pièges et contraintes

**Tri par `PlayCount` sans utilisateur :** `OrderMapper` déréférence `query.User`. Toute requête triée
par `PlayCount`, `DatePlayed`, `IsPlayed` ou `IsFavoriteOrLiked` **doit** porter un utilisateur.

**`DtoOptions` pilote les jointures SQL :** sans `Fields = [ItemFields.ProviderIds]`, les `ProviderIds`
reviennent vides. De même pour `EnableUserData` et `EnableImages`. Ne demander que le nécessaire.

**Pas de calcul dans un contrôleur :** le contrôleur lit l'instantané publié. Ajouter un calcul
synchrone dans une route bloquerait le serveur sur les grandes bibliothèques.

**Ne pas déplacer ce qui est déjà en place :** `placeRows` sort sans rien toucher quand
l'ordre du DOM est déjà celui demandé. Chaque déplacement produit des mutations dans
`.homeSectionsContainer`, et d'autres plugins l'observent pour réinjecter leur contenu — un
plugin dont la garde d'idempotence est faible peut alors ajouter une deuxième fois sa
bannière à chaque retour sur l'accueil. Nous ne dupliquons rien nous-mêmes (`insertBefore`
déplace un nœud, il ne le copie pas), mais nous pouvions déclencher la duplication chez le
voisin. La contiguïté n'est pas exigée pour ce raccourci : si un autre plugin s'est glissé
entre deux de nos rangées, l'ordre demandé reste respecté, et le laisser tranquille vaut
mieux que de le déplacer sans cesse.

**Le placement regroupe les nœuds gérés en un bloc contigu :** au premier placement,
`placeRows` rassemble nos rangées et les sections natives ordonnées à l'emplacement du
premier d'entre eux **dans le DOM** — pas du premier de l'ordre demandé. Le bloc occupe
alors l'espace qu'il occupe déjà et ce nœud-là n'a pas à bouger ; ancrer sur le premier de
l'ordre le ferait au contraire glisser derrière tous ceux qui le précèdent. La section des
bibliothèques étant presque toujours en tête de page, c'est elle que cela laisse tranquille
— et c'est celle que les autres plugins surveillent. Quand aucune native n'est gérée,
l'ancrage retombe **après** la section des bibliothèques ; insérer avant les ferait
descendre sous nos rangées.

**Un nœud déjà à sa place n'est jamais réinséré :** le bloc est construit en avançant un
curseur (`before`) et un nœud qui s'y trouve déjà se contente de le faire avancer. Ce n'est
pas une optimisation. **Un `MutationObserver` rapporte un nœud DÉPLACÉ dans `addedNodes`**,
comme s'il venait d'apparaître : le plugin Editor's Choice relance son injection dès qu'un
nœud portant `section0` est ajouté, si bien que réinsérer la section des bibliothèques
alors qu'elle était déjà bien placée lui faisait afficher une **deuxième bannière**. Le
test navigateur installe le même observateur et compte les ré-ajouts de `section0` : il
retombe en échec dès qu'on revient à une réinsertion en bloc.

**L'ordre des rangées est écrit dans un champ caché :** la liste de réorganisation de la page
de configuration ne fait qu'écrire dans `#RowOrder`, seul champ que les tableaux de chargement
et de sauvegarde connaissent. Un seul écouteur porte sur la liste entière, jamais sur les
boutons : elle est reconstruite à chaque déplacement, des écouteurs par bouton disparaîtraient
avec eux. Le focus est reposé sur la rangée déplacée, sinon la navigation au clavier repart du
début de la page à chaque appui — et ce focus n'est possible que si l'onglet est ouvert, un
panneau `hidden` ne pouvant rien focaliser.

**Un champ absent des tableaux de la page de configuration est silencieusement perdu :**
`checkboxes`, `numbers`, `decimals`, `texts` et `lists` pilotent à la fois le chargement et la
sauvegarde. Le test de la page vérifie que l'ensemble des identifiants du HTML et l'union de ces
tableaux coïncident exactement.

**`GET /Plugins/{id}/Configuration` est réservé aux administrateurs :** tout script client qui
appelle `ApiClient.getPluginConfiguration` échoue en 403 pour un utilisateur standard. Passer par
`ClientOptions`.

**Ne demander au `DtoOptions` que ce que le rendu utilise :** chaque `ItemFields` supplémentaire
est une jointure SQL de plus et des octets inutiles sur le réseau. Le script n'a besoin que de
`Id`, `Name`, `ServerId`, `IsFolder` et de l'affiche — `Overview` seul pesait souvent plus que
tout le reste de la réponse.

**`AssetsController` répond `304` :** la version du plugin sert d'`ETag` et la surcharge
`File(stream, contentType, lastModified, entityTag)` gère seule `If-None-Match`. Sans cela, les
26 Ko du script étaient retransmis à chaque chargement de page.

**Le navigateur met `index.html` en cache :** après un changement d'intégration, un rechargement
forcé (Ctrl+Maj+R) est nécessaire. `AssetsController` place la version du plugin en `ETag` pour
qu'une mise à jour invalide l'ancien script.

**Pas de `gap` en flexbox, pas de `:focus-visible` seul :** l'espacement des cartes passe par
`margin-right` sur les enfants de la bande, et le contour de focus est déclaré sur `:focus`, une
règle `:focus:not(:focus-visible)` le retirant ensuite au clic souris. `gap` en flexbox arrive
avec Chromium 84 et `:focus-visible` avec Chromium 86 ; les téléviseurs Tizen plafonnent à
Chromium 76 (Tizen 6.0) et 85 (Tizen 6.5). Sans ces deux replis, les cartes s'y collent et la
télécommande déplace un focus **invisible**. Les moteurs qui ignorent `:focus-visible` jugent la
règle de retrait invalide et l'écartent entièrement — c'est le comportement recherché.

**Nos sélecteurs portent deux classes :** les rangées réutilisent `verticalSection`,
`sectionTitle` et `scrollX` pour hériter du style natif, mais les thèmes ciblent aussi ces
classes — ElegantFin impose par exemple `padding-left` à `.scrollX` et redéfinit
`.verticalSection`. À spécificité égale, le vainqueur dépend de l'ordre d'insertion des
feuilles de style, et le Custom CSS de Jellyfin est injecté **après** le nôtre. D'où
`.mc-row .mc-strip` plutôt que `.mc-strip`, et `.verticalSection.mc-row` plutôt que `.mc-row`.

**Ne masquer que les sections de Jellyfin :** `hideNativeSections` ne vise que les conteneurs
`.section{N}` construits par `loadSections()`. Masquer tout enfant du conteneur emporterait
les rangées injectées par d'autres plugins.

**Défilement horizontal et changement d'onglet :** `allowSwipe()`
(`jellyfin-web/src/components/maintabsmanager.js`) remonte le DOM depuis la cible du geste et
n'annule le changement d'onglet que si un ancêtre porte la classe `scrollX` ou `animatedScrollX`.
Une bande à `overflow-x:auto` **sans cette classe** fait basculer l'accueil vers l'onglet Favoris
au moindre balayage sur mobile. Toute zone défilant horizontalement doit porter
`scrollX hiddenScrollX smoothScrollX`.

**`contain` décide de ce qui peut déborder d'une carte :** `.cardImageContainer` est en
`contain: strict`, qui **inclut** la peinture — un élément placé à l'intérieur y serait rogné
net. C'est l'une des raisons pour lesquelles le chiffre du rang a quitté l'affiche : il vit
maintenant en frère de `.cardScalable`, dans la ligne flex `.mc-rank-row`, et n'a plus rien à
déborder ni aucun `z-index` à arbitrer.

**Les animations ne portent que sur `transform` et `opacity` :** ce sont les deux propriétés que
le compositeur traite sans repasser par la mise en page ni le dessin. Toute autre propriété
animée — `width`, `top`, `box-shadow` sur une grande surface — se paie sur le processeur, et un
téléviseur n'en a pas les moyens. `prefers-reduced-motion` coupe **aussi** l'animation d'entrée,
pas seulement les transitions : une rangée figée sur l'image de départ resterait invisible.

**Une carte native a une largeur fixe :** dans une bande en flexbox, elle serait comprimée dès
que le contenu déborde. `.mc-row .mc-strip > .card { flex: 0 0 auto }` est la seule règle de
géométrie que nous posons encore sur une carte, et elle ne fait que préserver la largeur venue
du thème.

**Le glob implicite du SDK avale `tests/**` :** sans
`<DefaultItemExcludes>$(DefaultItemExcludes);tests\**</DefaultItemExcludes>`, le projet du
plugin compile aussi les fichiers `AssemblyInfo` générés dans les `obj/` des tests et échoue
sur des attributs dupliqués.

**Le contenu des plugins de chaîne n'est pas de la bibliothèque :** XFusion et les autres
passerelles IPTV publient leur catalogue via `IChannel`, et Jellyfin le matérialise en `Movie`
et en `Episode` ordinaires — exactement les types que tous les classements interrogent. Rien ne
les distingue par le type ni par le chemin ; le seul marqueur est `BaseItem.ChannelId`, non vide
pour ces éléments. Les laisser entrer ne fausse pas seulement les rangées, cela les emporte :
un catalogue IPTV compte couramment plus de titres que toute la bibliothèque locale, et il est
reconstruit à chaque rafraîchissement du fournisseur, si bien que ses `DateCreated` sont
perpétuellement récentes et remplissent « de retour cette semaine » à elles seules. `LibraryFilter`
centralise la règle ; `ExcludeChannelContent` l'active, **par défaut**. Sur un serveur sans
plugin de chaîne le réglage n'a aucun effet ; sur un serveur qui en a un, l'ancien
comportement était presque toujours subi plutôt que voulu.

**Filtrage de visibilité au service, pas au calcul :** le classement est global ; c'est à la lecture
que `BaseItem.IsVisible(user)` retire ce que l'appelant n'a pas le droit de voir.

**Ne jamais se fier à `ItemCounts` de `GetStudios` / `GetGenres` :** la valeur est identique pour
toutes les entrées (voir « Studios et genres »). Tout classement ou seuil bâti dessus est faux sans
le paraître. Le plugin recompte lui-même ; si une future version de Jellyfin corrige le calcul, le
balayage restera nécessaire pour la ventilation par bibliothèque.

**Tout chemin absolu doit porter le chemin de base du serveur :** Jellyfin peut être servi
sous un sous-chemin (`BaseUrl` de la configuration réseau), ce qui est le cas courant derrière
un reverse proxy. Un `src` ou une adresse d'affiche écrits en dur avec une barre initiale y
tombent en 404 : aucune rangée n'apparaît, alors que l'API du plugin répond parfaitement par
ailleurs — ce qui rend la panne particulièrement déroutante. Deux règles en découlent. La
balise script est construite par `ScriptTag.BuildTag`, à partir de `ScriptTag.BaseUrl` que
`ScriptInjectionTask` renseigne avant toute écriture ; cette propriété est statique parce que
`IndexHtmlTransformer.InjectScript` est un rappel **statique** dont la signature est imposée
par File Transformation, et qui ne reçoit donc aucun service. Et `PosterProxy.RoutePrefix` est
**relatif**, sans barre initiale : le client le passe à `ApiClient.getUrl`, qui applique le
préfixe lui-même.

**Le retrait de la balise ne peut pas se faire par égalité de chaîne :** si l'administrateur
change le chemin de base entre deux démarrages, la balise déjà en place ne ressemble plus à
celle que nous produirions. Elle resterait dans le fichier, et une seconde s'y ajouterait à
chaque démarrage. `ScriptTag.Remove` travaille donc sur `plugin="MediaCarousel"` par expression
régulière, jamais sur la chaîne complète.

**Le relais d'affiches est anonyme, mais pas ouvert :** l'accès doit rester anonyme — une
requête partie d'un `background-image` ne porte aucun en-tête d'authentification, et les routes
d'images de Jellyfin lui-même sont anonymes pour cette raison. Retirer `AllowAnonymous` ne
sécuriserait rien, cela casserait toutes les affiches. Ce qui est fermé est l'**amplification** :
`PosterController` ne télécharge un nom que s'il est référencé par un instantané publié. Sans
cette liste blanche, n'importe qui pouvait faire télécharger au serveur, puis écrire sur son
disque, tout nom syntaxiquement valide — la purge ne passant qu'au recalcul, et seulement
au-delà de trente jours sans accès.

**Un paramètre d'utilisateur ne prime jamais sur le jeton :** `TopListsController` honorait
`?userId=` tel quel. Le filtrage de visibilité s'appliquait alors au compte **nommé** et non à
l'appelant, si bien qu'un compte standard pouvait demander le classement « pour » un
administrateur et recevoir les titres, années et affiches des bibliothèques dont il est exclu.
Le claim `Jellyfin-UserId` gagne toujours ; le paramètre ne sert qu'aux appels par clé d'API,
qui ne portent aucun utilisateur et valent déjà administrateur.

**Le proxy d'affiches ne prend jamais d'URL du client :** `PosterController` reçoit un nom de
fichier, le valide, et reconstruit l'adresse distante à partir d'une constante. Accepter une URL
— même « vérifiée » — rouvrirait une SSRF, et une liste blanche d'hôtes se contourne
(`image.tmdb.org.attaquant.test`). La route est anonyme parce qu'une balise `<img src>` ne
transmet aucun en-tête d'authentification, comme pour le script.

**`ExcludedLibraryIds` couvre désormais tout :** Top du serveur, « jamais vu », « de retour »,
catalogues studios / genres, et le rapprochement du Top mondial — `LibraryTitleIndex` reçoit les
exclusions et, quand il y en a, indexe bibliothèque par bibliothèque (`InternalItemsQuery` sait
restreindre à des ancêtres mais pas en exclure ; sans exclusion, la requête unique demeure). Un
titre externe d'une bibliothèque exclue apparaît « absent » au lieu d'y mener. Le nom de la
propriété reste `ExcludedLibraryIds` : le renommer perdrait silencieusement les valeurs déjà
écrites dans `MediaCarousel.xml` et casserait le tableau `lists` de la page de configuration.

**Un jeton de thème sans unité invalide silencieusement un `calc()` :**
`--itemColumnGap` n'existe pas dans `jellyfin-web` — ce sont les thèmes qui l'inventent, et l'un
d'eux le déclare `0`, sans unité. La valeur reste valide pour `margin-right` mais rend
**invalide** tout `calc()` qui l'additionne à une longueur, et la déclaration retombe alors à sa
valeur initiale, sans le moindre message. Aucune de nos règles ne lit plus ce jeton :
l'espacement entre cartes est celui que le thème applique lui-même à `.itemsContainer`, et c'est
son affaire. Un test le vérifie en injectant `--itemColumnGap:0`.

**Rien de ce qu'un utilisateur envoie n'est enregistré tel quel :** `UserPreferenceRules.Sanitize`
écarte les identifiants de rangées inconnus et les doublons, refuse une couleur qui ne soit
pas `/^#[0-9a-fA-F]{3,8}$/`, et borne l'échelle du chiffre aux bornes du rendu, 40 à 100 —
une valeur sous 40 est **écartée**, pas relevée : c'est la signature du curseur défectueux
jusqu'en 3.14.1, et `Apply` l'écarte aussi quand le fichier la porte encore. Ces trois valeurs
finissent respectivement dans des sélecteurs, dans une feuille de styles construite par
concaténation, et dans une longueur CSS. Le contrôleur enregistre le résultat de la
validation, jamais l'objet reçu. Le compte concerné est **toujours celui du jeton**, jamais
un paramètre : accepter un identifiant laisserait n'importe qui lire et réécrire les
préférences d'un autre.

**La couleur d'accent est validée avant d'entrer dans le CSS :** `HighlightColor` est concaténée
dans la feuille de styles construite par `buildCss`. `safeAccent` n'accepte que
`/^#[0-9a-fA-F]{3,8}$/` et retombe sinon sur `#775BF4` — sans quoi une valeur comme
`red;} body{display:none} .x{color:red` fermerait la règle et injecterait des déclarations
arbitraires. La constante `DEFAULT_ACCENT` du script doit rester synchronisée avec la valeur par
défaut de `PluginConfiguration.HighlightColor`.

**Le chemin TMDB dépend de la liste demandée :** `ResolvePath` traduit `TrendingFeed` en
segment d'API (`trending/{type}/week`, `movie/now_playing`, `tv/on_the_air`, `movie/upcoming`).
Elle est restée **orpheline** pendant plusieurs versions : `FetchAsync` codait en dur
`trending/{type}/week`, si bien que le `<select>` « Liste » de la page de configuration, sa
description détaillée et toute la chaîne `TrendingFeed` ne servaient à rien. Un retour `null`
signifie que TMDB ne publie pas cette liste pour ce type de média — « prochaines sorties » côté
séries — et ce type est alors ignoré plutôt que rabattu en silence sur une autre liste.

**Clé d'API externe :** `GlobalTopApiKey` n'est jamais renvoyée par l'API du plugin. Elle reste dans
la configuration, lisible uniquement par un administrateur via l'API de configuration de Jellyfin.

**`icon.png` en double :** racine du dépôt (référencé par `manifest.json`) et `Web/icon.png`
(référencé par le README). Synchroniser les deux à la mise à jour.

**`build.yaml` maintenu à la main :** la CI ne le met pas à jour, et personne d'autre ne le
lit — aucun script du dépôt n'y touche. La source de vérité des versions publiées est
`manifest.json`. Il avait dérivé jusqu'à s'arrêter à la 2.0.1 en annonçant `targetAbi`
`10.11.0.0`, soit une contradiction directe avec ce que le catalogue publie ; il ne porte plus
qu'une entrée, celle de la version courante. Le supprimer serait tout aussi défendable.

---

## Économie de contexte

Le propriétaire du dépôt travaille en budget de tokens serré. Par ordre de coût décroissant :

1. **Pas de capture d'écran** sauf demande explicite, ou quand seul l'œil peut trancher.
   Une image coûte plus qu'une réponse entière.
2. **Lire par extrait, jamais le fichier entier** : `grep -n`, `sed -n 'a,bp'`.
   `media-carousel.js` et `configPage.html` font plus de mille lignes chacun.
3. **N'exécuter que la suite concernée**, et n'en afficher que les échecs
   (`| grep -v '^OK'`). Le décompte complet ne sert qu'avant un commit.
4. **Réponses courtes** : ce qui a changé, pourquoi, ce qui a été vérifié. Le raisonnement
   détaillé n'est déroulé que sur demande ou quand il change une décision.
5. **Ne pas réexpliquer** ce qui vient d'être dit, ni redemander une préférence déjà donnée.
