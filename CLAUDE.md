# CLAUDE.md — MediaCarousel (JellyfinCarouselPlugin)

## Vue d'ensemble

Plugin Jellyfin qui remplace la page d'accueil par un layout Netflix : bannière Hero, carrousels horizontaux par catégorie et par genre, badges qualité, favoris, et recommandations IA optionnelles (Groq).

- **Plugin GUID :** `191bd290-1054-4b55-a137-46c72181266b` — dans `Plugin.cs`, `manifest.json`, `configPage.html`, `carousel-layout.js`
- **Cible :** Jellyfin 10.11.x (ABI `10.11.0.0`), .NET 9.0
- **Version actuelle :** 2.7.2.0
- **Stack :** C# backend, JavaScript vanilla frontend (pas de Node, pas de TypeScript, pas de npm)

---

## Structure du dépôt

```
MediaCarousel/
├── Plugin.cs                        # BasePlugin<PluginConfiguration> + IHasWebPages
├── FileTransformationService.cs     # IHostedService — injection du script dans index.html
├── CarouselIndexTransformer.cs      # Callback statique pour le plugin FileTransformation (réflexion)
├── PluginServiceRegistrator.cs      # IPluginServiceRegistrator — enregistre FileTransformationService
├── JellyfinCarouselPlugin.csproj    # .NET 9.0, version 2.7.2.0
├── manifest.json                    # Catalogue Jellyfin (mis à jour par CI)
├── build.yaml                       # Métadonnées du registre de plugins
├── nuget.config                     # Source nuget.org
├── Configuration/
│   ├── PluginConfiguration.cs       # Modèle de config (24 propriétés)
│   └── configPage.html              # UI admin, ressource embarquée
└── Web/
    ├── carousel-layout.js           # Toute la logique frontend — IIFE (~1400 lignes)
    ├── carousel-styles.css          # Copie CSS de référence (ne pas servir directement)
    └── icon.png                     # Icône plugin (assets web)
```

> **Critique :** `carousel-styles.css` n'est **pas** lié à Jellyfin. Tout le CSS est injecté en `<style>` inline par `carousel-layout.js`. Modifier `carousel-styles.css` seul n'a aucun effet. Modifier le template literal dans `carousel-layout.js` et garder `carousel-styles.css` en sync manuellement.

---

## Architecture

### Backend C# (démarrage uniquement)

Responsabilité unique : injecter le `<script>` du carrousel dans `index.html` de Jellyfin au démarrage du serveur.

**Stratégie d'injection duale (`FileTransformationService.StartAsync`) :**

1. **Primaire — plugin FileTransformation :** Cherche l'assembly du plugin tiers via `AssemblyLoadContext.All`. Si trouvé, enregistre `CarouselIndexTransformer.InjectScript` comme callback de transformation — modifie le contenu de `index.html` à la volée, sans écrire sur le disque.
2. **Fallback — injection directe :** Modifie `index.html` sur le disque si le plugin FileTransformation n'est pas installé. Idempotent (vérifie la présence de la balise `<script>` avant insertion).

**Ordre de résolution du chemin (`TryInjectDirectly`) :**
1. `{WebPath}/index.html`
2. `{ProgramDataPath}/jellyfin-web/index.html`
3. `{BaseDirectory}/jellyfin-web/index.html`
4. `{BaseDirectory}/web/index.html`

> `CarouselIndexTransformer` est invoqué par réflexion. Les noms de classe et de méthode `InjectScript` sont hardcodés dans `FileTransformationService`. Ne pas renommer sans mettre à jour les deux fichiers.

### Frontend JavaScript (toute la logique runtime)

`carousel-layout.js` : IIFE unique `(function() { 'use strict'; ... })()`, pas de dépendances externes. Utilise `window.ApiClient` et `window.Dashboard` fournis par Jellyfin.

**Séquence de démarrage :**
1. Lecture synchrone de `localStorage('MediaCarousel_Config')` — anti-FOUC avant même que Jellyfin soit prêt
2. `waitForJellyfin()` — polling toutes les 100 ms jusqu'à ce que `ApiClient` et `Dashboard` existent
3. `triggerLayout()` appelé à 0, 300, 800, 1500 et 3000 ms (5 tentatives progressives)
4. `observePageChanges()` — écoute les navigations SPA

**Détection de la page d'accueil (`isOnHomePage()`) :**
- DOM : `#indexPage`, `.homePage`, `#homeTab`, `[data-type="home"]`, `.view.homePage:not(.hide)`, `.page.homePage:not(.hide)`
- URL fallback : `window.location.hash` — `#!/home`, `#!/home.html`, hash vide, etc.
- Exclusion explicite : `details`, `config`, `dashboard`, `search`, `list`, `settings`

**Détection du container home (`findHomeContainer()`) — 14 sélecteurs en cascade :**
`.homePage` → `#indexPage .scrollSlider` → `#indexPage .itemsContainer` → ... → `#skinBody .page:not(.hide)`

**Détection de navigation (5 stratégies dans `observePageChanges()`) :**
1. Événement natif Jellyfin `viewshow`
2. Événement Jellyfin `pageshow` (variante selon version)
3. `hashchange` — navigation SPA
4. `MutationObserver` sur `document.body` — debounce 400 ms
5. Polling toutes les 3 s — filet de sécurité

**Activation du layout :**
- `applySyncLayoutStates()` applique immédiatement les classes anti-FOUC : `media-carousel-init`, `mc-hide-all-native`, `mc-hide-native-resume`, `mc-hide-native-latest`
- `removeNativeDuplicates()` masque les sections Jellyfin natives dupliquées par correspondance de texte
- Le layout est inséré via `insertBefore(carouselContainer, mainContent.firstChild)` dans `.mainAnimatedPages || body`
- `body.media-carousel-active` est ajouté après insertion complète

**Ordre des sections — `SectionOrder` :**
La config `SectionOrder` est une chaîne CSV (ex. `"hero,continue,latest,top10,recommended,genres,collections"`) qui contrôle l'ordre d'affichage. Les sections inconnues sont ignorées silencieusement.

**Genres dynamiques :**
Les genres ne sont plus hardcodés. À chaque chargement, l'API Jellyfin est interrogée (`/Genres`), filtrée par `MinGenreItems`, triée par popularité, limitée à `MaxGenres`. Les genres Groq AI sont chargés en priorité, les autres en lazy via `IntersectionObserver` (marge 200 px).

**Config — cache et invalidation :**
- Chargée une fois via `ensureConfigLoaded()` puis mise en cache dans `localStorage('MediaCarousel_Config')`
- Chargée synchronement depuis le cache au démarrage pour éviter le FOUC
- Les changements de config nécessitent un rechargement complet (F5)

---

## Fichiers clés

| Fichier | Rôle | Fréquence de modification |
|---|---|---|
| `Web/carousel-layout.js` | Tout le comportement UI, appels API, DOM, CSS inline | Haute |
| `Configuration/PluginConfiguration.cs` | Modèle de config — doit rester en sync avec `DEFAULT_CONFIG` JS | À chaque nouveau réglage |
| `Configuration/configPage.html` | UI admin — doit rester en sync avec le modèle C# et les défauts JS | À chaque nouveau réglage |
| `FileTransformationService.cs` | Injection du script au démarrage | Rare |
| `CarouselIndexTransformer.cs` | Callback réflexion pour FileTransformation | Rare |
| `Web/carousel-styles.css` | Copie CSS de référence — garder en sync avec le JS | À chaque changement CSS |

---

## Workflow de développement

### Build

```bash
dotnet build -c Release
```

Sortie dans `bin/Release/net9.0/`. Le dossier `Web/` est copié via `CopyToOutputDirectory`. `configPage.html` est embarqué comme ressource managée.

### Package

```powershell
# Windows
Compress-Archive -Path "bin\Release\net9.0\*" -DestinationPath "JellyfinCarouselPlugin.zip" -Force
```

```bash
# Linux
cd bin/Release/net9.0 && zip -r ../../../JellyfinCarouselPlugin.zip .
```

### Installation et test

1. Extraire le ZIP dans un dossier `CarouselLayout` sous `plugins/` de Jellyfin
2. Redémarrer le serveur Jellyfin
3. **Dashboard → Plugins → Carousel Layout → Settings**
4. Ouvrir la page d'accueil — console browser pour les logs `[MediaCarousel]`

Pas de tests automatisés. Tout est manuel sur une instance Jellyfin. Itération JS : éditer directement dans le dossier web Jellyfin + hard reload (Ctrl+Shift+R).

### CI/CD (`.github/workflows/build.yml`)

Déclenché sur push `main` ou `workflow_dispatch` :
1. **Bump version** — lit `manifest.json`, analyse les commits conventionnels depuis le dernier tag (breaking → majeur, `feat:` → mineur, reste → patch)
2. **Build** — `dotnet restore` + `dotnet build -c Release`
3. **Package** — ZIP `bin/Release/net9.0/`
4. **Mise à jour manifest** — ajoute une entrée de version avec `sourceUrl` et checksum ; met à jour `AssemblyVersion` dans `.csproj`
5. **Commit** — commit du bump avec `[skip ci]`
6. **Release** — GitHub release avec changelog auto depuis les messages de commit

---

## Conventions de code

### C#
- PascalCase pour classes, méthodes, propriétés
- Commentaires XML (`///`) en français sur les membres publics
- `<Nullable>enable</Nullable>` — utiliser `?` et null checks
- Un fichier par classe

### JavaScript
- camelCase pour fonctions et variables ; SCREAMING_SNAKE_CASE pour constantes module (`PLUGIN_ID`, `DEFAULT_CONFIG`, `CONFIG`)
- JS vanilla uniquement — pas de modules, pas de TypeScript, pas de npm, pas de build
- IIFE unique — rien d'exporté en global
- `async/await` partout ; code top-level avec `.then()` (IIFE non async)
- Commentaires en français ; identifiants en anglais

### CSS
- kebab-case avec préfixes sémantiques : `.carousel-*`, `.badge-*`, `.carousel-hero-*`, `.carousel-ai-*`
- Custom properties dans `:root` ; fallbacks sur les variables Jellyfin
- Breakpoints : 1400 px, 800 px, 500 px + `@media (hover: none)`
- Toutes les règles de la page d'accueil scopées à `body.media-carousel-active`

### Commits
Conventional Commits : `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Messages < 80 caractères. Utilisés pour le versioning sémantique automatique par CI.

---

## Ajouter un réglage de configuration

Trois fichiers à synchroniser :

1. **`PluginConfiguration.cs`** — propriété C# avec valeur par défaut + commentaire XML français
2. **`configPage.html`** — contrôle de formulaire (`emby-checkbox`, `emby-input`, `emby-select`) + mise à jour des handlers `pageshow` (chargement) et `submit` (sauvegarde)
3. **`carousel-layout.js`** — clé dans `DEFAULT_CONFIG`, puis utilisation via `pluginConfig.LeNouveauReglage`

---

## Ajouter une catégorie carrousel

1. Ajouter une entrée à `CONFIG.categories` dans `carousel-layout.js` :
   ```js
   { id: 'mycat', name: 'Ma Catégorie', filter: 'SomeFilter', configKey: 'ShowMyCategory' }
   ```
2. Ajouter la logique de filtrage pour ce `id` dans `loadCategoryItems()`
3. Ajouter `ShowMyCategory` comme réglage de configuration (voir ci-dessus)
4. Ajouter l'id à `SectionOrder` si besoin

---

## Configuration — 24 propriétés

| Propriété | Type | Défaut | Description |
|---|---|---|---|
| `EnableCarouselLayout` | bool | `true` | Interrupteur maître |
| `ShowNewReleases` | bool | `true` | Catégorie "Nouveautés" |
| `ShowTop10` | bool | `true` | Catégorie "Top 10" |
| `ShowContinueWatching` | bool | `true` | Catégorie "Continuer à regarder" |
| `ShowRecommended` | bool | `true` | Catégorie "Recommandés" |
| `ShowGenreCategories` | bool | `true` | Carrousels par genre |
| `ShowCollections` | bool | `true` | Catégorie "Collections" (Boxsets) |
| `ShowNewEpisodesBadge` | bool | `true` | Badge "Nouveaux épisodes" sur les séries |
| `ShowQualityBadge` | bool | `true` | Badges 4K/HD |
| `ItemsPerCarousel` | int | `20` | Max items par carrousel |
| `EnableHoverAnimations` | bool | `true` | Animation zoom au survol |
| `EnableFavoritesButton` | bool | `true` | Bouton cœur sur les cartes |
| `HeroMode` | string | `"Random"` | Mode bannière : `Random`, `Latest`, `Resume`, `None` |
| `HighlightColor` | string | `"#00a4dc"` | Couleur d'accentuation (hex) |
| `HideNativeHome` | bool | `false` | Masquer toute la page d'accueil native Jellyfin |
| `IncludedLibraries` | string[] | `[]` | IDs de bibliothèques incluses (vide = toutes) |
| `SectionOrder` | string | `"hero,continue,..."` | Ordre CSV des sections du layout |
| `CardStyle` | string | `"poster"` | Style des cartes : `poster` (vertical) ou `landscape` (backdrop) |
| `MinGenreItems` | int | `3` | Minimum d'items pour afficher un genre |
| `MaxGenres` | int | `12` | Nombre maximum de genres affichés |
| `CustomSectionsJson` | string | `"[]"` | Sections personnalisées (JSON array) |
| `EnableGroqAi` | bool | `false` | Recommandations IA via Groq |
| `GroqApiKey` | string | `""` | Clé API Groq |
| `GroqModel` | string | `"llama3-8b-8192"` | Modèle Groq |

---

## Pièges et contraintes

**CSS dans le JS :** Modifier le template literal dans `carousel-layout.js`, pas seulement `carousel-styles.css`.

**Config cachée par chargement :** Les changements nécessitent F5. C'est intentionnel.

**Pas de npm / TypeScript :** Ne pas introduire de `package.json`, webpack, babel, TypeScript ou tout outillage de build pour le JS.

**Genres dynamiques :** Les genres sont récupérés depuis l'API Jellyfin à chaque init, filtrés et triés. Pas de liste hardcodée.

**Clé Groq exposée côté client :** `GroqApiKey` est accessible à tout utilisateur Jellyfin authentifié via `ApiClient.getPluginConfiguration()`. Compromis assumé.

**`CarouselIndexTransformer` par réflexion :** Nom de classe et méthode `InjectScript` hardcodés dans `FileTransformationService`. Renommer sans mettre à jour les deux fichiers casse l'intégration silencieusement.

**`icon.png` en double :** Racine du dépôt (référencé par `manifest.json`) et dans `Web/` (asset servi). Synchroniser les deux à la mise à jour.

**`build.yaml` maintenu manuellement :** Pas mis à jour par CI. La source de vérité des versions est `manifest.json`.

**Artifacts de build à la racine :** `build_output.txt`, `errors.txt`, `restore_log.txt` ne sont pas gitignorés.

---

## Intégration Jellyfin

- Config stockée en XML par le sérialiseur `BasePluginConfiguration`
- Page de config : `/web/configurationpage?name=Carousel+Layout`
- Asset JS servi : `/plugins/JellyfinCarouselPlugin/Web/carousel-layout.js`
- `ApiClient.getItems(userId, params)` → `{ Items: [], TotalRecordCount: N }`
- `ApiClient.getPluginConfiguration(pluginId)` / `updatePluginConfiguration(pluginId, config)` — GUID en string
- `Dashboard.navigate('details?id=' + itemId)` — navigation SPA vers la fiche item
- `window.ApiClient` et `window.Dashboard` sont des globaux Jellyfin — toujours vérifier leur existence via `waitForJellyfin()`

---

## Dépendances NuGet

| Package | Version |
|---|---|
| `Jellyfin.Model` | 10.11.8 |
| `Jellyfin.Controller` | 10.11.8 |
| `Newtonsoft.Json` | 13.0.3 |

Toutes avec `<PrivateAssets>all</PrivateAssets>` et `<ExcludeAssets>runtime</ExcludeAssets>` — références compile-time uniquement.
