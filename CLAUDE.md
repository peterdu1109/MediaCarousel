# CLAUDE.md — MediaCarousel (JellyfinCarouselPlugin)

## Vue d'ensemble

Plugin Jellyfin qui génère automatiquement deux classements dynamiques :

1. **Top du serveur** — les titres les plus regardés d'après les statistiques de lecture de tous les comptes.
2. **Top mondial** — les titres les plus populaires d'après TMDB ou Trakt, rapprochés de la bibliothèque locale.

**Tout le calcul est backend.** Le frontend se limite à un script d'affichage de ~400 lignes qui
consomme l'API du plugin et insère deux rangées façon Netflix sous les bibliothèques de la page
d'accueil. Il ne calcule rien, ne remplace pas la page d'accueil et ne masque aucune section native.

- **Plugin GUID :** `191bd290-1054-4b55-a137-46c72181266b` — dans `Plugin.cs`, `manifest.json`, `build.yaml`, `configPage.html`
- **Cible :** Jellyfin **10.11.9+** (ABI `10.11.9.0`), .NET 9.0, paquets NuGet Jellyfin 10.11.11
- **Stack :** C# uniquement. Pas de Node, pas de npm, pas de TypeScript, pas de build frontend.

> **ABI 10.11.9 minimum :** `IUserManager.Users` (propriété) est devenu `IUserManager.GetUsers()` (méthode)
> en 10.11.9. Le plugin ne se charge pas sur une version antérieure.

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
│   └── AssetsController.cs            # Sert media-carousel.js depuis les ressources
├── Configuration/
│   ├── PluginConfiguration.cs         # Modèle de config + enums
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
│   ├── StudioNameNormalizer.cs              # Regroupement des variantes d'un studio
│   ├── LibraryRowBuilder.cs                 # Rangées « jamais vu » et « de retour »
│   ├── SnapshotStorage.cs                   # Persistance JSON des instantanés
│   ├── LocalTopListBuilder.cs               # Agrégation des statistiques de lecture
│   ├── GlobalTopListBuilder.cs              # Source externe + rapprochement local
│   ├── LibraryTitleIndex.cs                 # Index ProviderIds construit en une requête
│   ├── CollectionSynchronizer.cs            # Matérialisation en BoxSet
│   ├── TopListRefreshService.cs             # Orchestration, verrou, tolérance aux pannes
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
- Fenêtre d'observation appliquée sur `UserItemData.LastPlayedDate`.
- Plafond `MaxPlaysCountedPerUser` appliqué au score, `TotalPlays` conservant la valeur brute.
- Tri final : score, puis nombre de spectateurs distincts, puis dernière lecture.

### Top mondial

`ITrendingProvider` abstrait la source ; `GlobalTopListBuilder` choisit l'implémentation d'après
`GlobalTopProvider`. Les clients HTTP viennent de `IHttpClientFactory.CreateClient(NamedClient.Default)`
(client Jellyfin, avec User-Agent et compression). Délai maximal de 30 s, une nouvelle tentative
sur erreur transitoire.

Le rapprochement passe par `LibraryTitleIndex`, construit en **une seule requête** sur les films et
séries avec `Fields = [ProviderIds]`. Trois index : TMDB (séparé film/série, TMDB numérotant les
deux indépendamment), IMDb, et titre normalisé + année en dernier recours.

Sur-échantillonnage `size × 5` quand `GlobalTopLibraryOnly` est actif, pour remplir les places
après filtrage.

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

### Studios et genres

`CatalogBuilder` s'appuie sur `ILibraryManager.GetStudios` / `GetGenres`, qui renvoient un
`QueryResult<(BaseItem, ItemCounts)>`.

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
clé vide. Ces agrégations groupent sur toute la bibliothèque : elles
sont calculées une fois par la tâche planifiée, jamais par requête. Elles ne portent aucune donnée
de titre — seulement des noms et des décomptes — et la visibilité réelle reste appliquée par
Jellyfin quand l'utilisateur ouvre la page d'un studio ou d'un genre.

Les **titres** d'une rangée de genre ne sont pas précalculés : le script les demande à l'API native
de Jellyfin (`/Items?GenreIds=…`), une requête indexée, paginée et déjà filtrée par utilisateur —
exactement ce que fait la page d'accueil native pour ses propres rangées. Le chargement est différé
par `IntersectionObserver` pour ne pas déclencher toutes les requêtes au premier rendu.

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
- **`ClientOptions` existe parce que** `GET /Plugins/{id}/Configuration` exige `RequiresElevation` :
  un utilisateur standard ne peut pas lire la configuration du plugin. Le contrat `ClientOptionsDto`
  n'expose que ce qui sert au rendu — jamais la clé d'API de la source externe.
- **Point d'insertion** : la section « Mes médias » est repérée par
  `.homeLibraryButton, .card[data-type="CollectionFolder"], .card[data-type="UserView"]`,
  et les rangées sont insérées juste après. À défaut, en tête du conteneur.
- **Réinjection** : `jellyfin-web` reconstruit entièrement `.homeSectionsContainer` à chaque
  affichage de l'accueil. Un `MutationObserver` débouncé, plus `hashchange` et `viewshow`,
  déclenchent un nouveau rendu ; le garde `container.querySelector('.mc-row')` évite les doublons.
- **Accessibilité** : chaque rangée est reliée à son titre par `aria-labelledby`, la bande porte
  `role="list"` et les cartes `role="listitem"` avec un `aria-label` explicite (« Numéro 3 : … »).
  Les flèches sont un confort souris : `tabindex="-1"` et `aria-hidden="true"`, la navigation au
  clavier passant par les cartes elles-mêmes. `prefers-reduced-motion` et `prefers-contrast` sont
  honorés.
- **CSS** : injecté dans un `<style id="mc-styles">`, tout est préfixé `mc-`, rien n'est surchargé
  hors de ces classes.
- **Cohabitation avec les thèmes** : tous les réglages passent par des variables portées par
  `.mc-row`, jamais par `:root`. Quand le thème hôte expose déjà un jeton — `--sidePadding`,
  `--itemColumnGap`, `--smallRadius` — il est adopté, avec la valeur native de Jellyfin en repli.
  Les couleurs de texte sont héritées : les titres réutilisent `sectionTitle`, donc ils suivent
  le thème sans effort.
- **Cache client** : `jellyfin-web` reconstruit le conteneur à chaque affichage de l'accueil, donc
  `render()` repart de zéro à chaque visite. `loadCached` mémorise les réponses cinq minutes —
  sans quoi chaque retour sur l'accueil relancerait les quatre requêtes alors que les classements
  ne sont recalculés que toutes les quelques heures. Un résultat vide n'est jamais mémorisé :
  une panne passagère ne doit pas condamner une rangée pour cinq minutes.

### Intégration à index.html

`ScriptInjectionTask` tente d'abord le plugin **File Transformation** (transformation en mémoire,
rien sur le disque, insensible aux mises à jour de Jellyfin), sinon modifie `index.html`
directement. `ScriptTag` centralise la balise, garantit l'idempotence et **retire les balises des
versions 1.x et 2.x** — sans quoi un navigateur continuerait à demander l'ancien
`carousel-layout.js` disparu.

La charge utile envoyée à FileTransformation est construite par réflexion à partir du type de
paramètre déclaré par sa propre méthode (`JObject.Parse`), pour ne pas dépendre d'une version de
Newtonsoft.Json qui pourrait diverger à l'exécution.

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

Trois suites sans framework — 88 assertions — exécutées en CI avant la publication ; voir
`tests/README.md`. L'une charge un extrait des règles d'ElegantFin **après** les nôtres pour
vérifier que la cohabitation tient.
Les deux suites navigateur chargent le vrai `media-carousel.js` et le vrai `configPage.html`
dans Chromium, avec un `ApiClient` simulé. L'une d'elles **rejoue `allowSwipe()` de
`jellyfin-web`** : le correctif du balayage mobile tient à une classe CSS, ce test est ce qui
l'empêche de disparaître à un refactor.

Reste à valider à la main sur une instance Jellyfin : l'injection du script et le rendu réel.

### CI/CD (`.github/workflows/build.yml`)

Sur push `main` : bump de version d'après les commits conventionnels → `dotnet build -c Release` →
ZIP → mise à jour de `manifest.json` (`sourceUrl`, checksum, `targetAbi` `10.11.9.0`) → commit
`[skip ci]` → release GitHub.

---

## Ajouter un réglage

1. **`Configuration/PluginConfiguration.cs`** — propriété + valeur par défaut + commentaire XML français.
2. **`Configuration/configPage.html`** — contrôle de formulaire, puis ajout de l'identifiant dans le
   tableau JS correspondant (`checkboxes`, `numbers`, `texts` ou `lists`). Le chargement et la
   sauvegarde sont pilotés par ces tableaux : aucune autre modification n'est nécessaire.
3. Consommer le réglage dans le service concerné.

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

**Un `<span>` reste `display:inline` hors conteneur flex :** `width` et `height` y sont ignorés.
Les affiches des rangées de genre, qui ne sont pas des enfants directs de la bande flex, exigent
un `display:block` explicite.

**Ne pas dépendre de la remise à zéro du client hôte :** `box-sizing: border-box` est appliqué
explicitement sous `.mc-row`, sinon les hauteurs fixes dérivent selon le thème actif.

**Le glob implicite du SDK avale `tests/**` :** sans
`<DefaultItemExcludes>$(DefaultItemExcludes);tests\**</DefaultItemExcludes>`, le projet du
plugin compile aussi les fichiers `AssemblyInfo` générés dans les `obj/` des tests et échoue
sur des attributs dupliqués.

**Filtrage de visibilité au service, pas au calcul :** le classement est global ; c'est à la lecture
que `BaseItem.IsVisible(user)` retire ce que l'appelant n'a pas le droit de voir.

**Clé d'API externe :** `GlobalTopApiKey` n'est jamais renvoyée par l'API du plugin. Elle reste dans
la configuration, lisible uniquement par un administrateur via l'API de configuration de Jellyfin.

**`icon.png` en double :** racine du dépôt (référencé par `manifest.json`) et `Web/icon.png`
(référencé par le README). Synchroniser les deux à la mise à jour.

**`build.yaml` maintenu à la main :** la CI ne le met pas à jour. La source de vérité des versions
publiées est `manifest.json`.
