# CLAUDE.md — MediaCarousel (JellyfinCarouselPlugin)

## Project Overview

**MediaCarousel** is a Jellyfin server plugin that replaces the Jellyfin web UI home page with a Netflix-style horizontal carousel layout. It is a hybrid project: a C# (.NET 9.0) backend that injects a JavaScript file into Jellyfin's HTML at startup, and a vanilla JavaScript frontend that takes over the home page DOM at runtime.

- **Plugin ID (GUID):** `191bd290-1054-4b55-a137-46c72181266b` — used in `Plugin.cs`, `manifest.json`, `configPage.html`, and `carousel-layout.js`. This is the canonical GUID.
- **Target:** Jellyfin 10.11.x (ABI `10.11.0.0`), .NET 9.0
- **Current version:** 2.1.1.0
- **Language:** C# backend, vanilla JavaScript frontend (no Node.js, no TypeScript, no npm)

---

## Repository Structure

```
MediaCarousel/
├── Plugin.cs                        # BasePlugin<PluginConfiguration> + IHasWebPages
├── FileTransformationService.cs     # IHostedService — dual-strategy script injection
├── CarouselIndexTransformer.cs      # Static callback for FileTransformation plugin (reflection-based)
├── PluginServiceRegistrator.cs      # IPluginServiceRegistrator — registers FileTransformationService
├── JellyfinCarouselPlugin.csproj    # .NET 9.0 project — version 2.0.1.0
├── manifest.json                    # Plugin manifest (Jellyfin repo catalog)
├── build.yaml                       # Plugin registry metadata
├── nuget.config                     # nuget.org package source
├── LICENSE                          # MIT
├── README.md                        # User-facing documentation (French)
├── icon.png                         # Plugin icon (referenced by manifest.json ImageUrl)
├── .github/
│   └── workflows/
│       └── build.yml                # CI/CD: auto-version bump, build, package, GitHub release
├── Configuration/
│   ├── PluginConfiguration.cs       # 17-property config model (extends BasePluginConfiguration)
│   └── configPage.html              # Admin config UI, embedded as a resource
└── Web/
    ├── carousel-layout.js           # All plugin logic — single IIFE (~1099 lines)
    ├── carousel-styles.css          # CSS reference copy — NOT served as a linked stylesheet (see below)
    └── icon.png                     # Plugin icon (served as web asset)
```

> **Critical:** `carousel-styles.css` is **not linked** to Jellyfin. All styles are injected into the page as an inline `<style>` tag by `carousel-layout.js` when Jellyfin is detected. `carousel-styles.css` is a human-readable mirror kept in sync manually. When changing styles, edit the template literal string inside `carousel-layout.js` and keep `carousel-styles.css` in sync.

---

## Architecture

### C# Backend (Startup Only)

The backend has a single runtime responsibility: inject the carousel `<script>` tag into Jellyfin's `index.html` at server startup. This is handled by `FileTransformationService` (an `IHostedService`), registered via `PluginServiceRegistrator`.

**Injection strategy (dual-mode in `FileTransformationService.StartAsync`):**

1. **Primary — FileTransformation plugin:** Searches loaded assemblies for the third-party `FileTransformation` plugin via `AssemblyLoadContext.All`. If found, registers a transformation callback (`CarouselIndexTransformer.InjectScript`) that modifies `index.html` content at serve-time. This avoids modifying the file on disk and works without root/Docker permissions.

2. **Fallback — Direct file injection:** If the FileTransformation plugin is not installed, modifies `index.html` on disk directly (same behavior as the legacy `InjectionService`). The injection is idempotent (checks for the `<script>` tag before inserting).

**Fallback path resolution order (`TryInjectDirectly`):**
1. `{IApplicationPaths.WebPath}/index.html`
2. `{IApplicationPaths.ProgramDataPath}/jellyfin-web/index.html`
3. `{AppDomain.CurrentDomain.BaseDirectory}/jellyfin-web/index.html`
4. `{AppDomain.CurrentDomain.BaseDirectory}/web/index.html`

**`CarouselIndexTransformer`** is a static class invoked by reflection from the FileTransformation plugin. It receives a JSON object `{ "contents": "..." }`, parses it with Newtonsoft.Json, and injects the `<script>` tag before `</head>`. Do not rename the class or method without updating `FileTransformationService`.

`Plugin.cs` exposes the config page as an embedded resource (`JellyfinCarouselPlugin.Configuration.configPage.html`) and provides `GetWebPath()` so Jellyfin knows where to serve `Web/` assets from.

### JavaScript Frontend (All Runtime Logic)

`carousel-layout.js` is a single IIFE (`(function() { 'use strict'; ... })()`) with no external dependencies. It runs in the browser using Jellyfin's globally available `window.ApiClient` and `window.Dashboard`.

**Startup sequence:**
1. `waitForJellyfin()` — polls every 100 ms until `window.ApiClient` and `window.Dashboard` exist
2. Injects CSS inline via `<style>` tag into `document.head`
3. Calls `triggerLayout()` at 0, 300, 800, 1500, and 3000 ms (five progressive attempts)
4. Calls `observePageChanges()` to listen for SPA navigation

**Home page detection — hybrid DOM + URL (`isOnHomePage()`):**
- DOM selectors: `#indexPage`, `.homePage`, `#homeTab`, `[data-type="home"]`, `.view.homePage:not(.hide)`, `.page.homePage:not(.hide)`
- URL fallback: checks `window.location.hash` for `#!/home`, `#!/home.html`, empty hash, etc.
- Excludes detail/config/dashboard/search/list/settings pages by hash inspection

**Home container detection — 14 selectors in cascade (`findHomeContainer()`):**
`.homePage` → `#indexPage .scrollSlider` → `#indexPage .itemsContainer` → `#indexPage .padded-left.padded-right` → `#indexPage .sections` → `#indexPage` → `#homeTab` → `[data-type="home"]` → `.mainAnimatedPages .page:not(.hide)` → `.view:not(.hide) .sections` → `.view:not(.hide) .verticalSection` → `.view:not(.hide)` → `.mainAnimatedPages > div:not(.hide)` → `#skinBody .page:not(.hide)`

**Navigation detection (5 strategies):**
- **Strategy 1 — `viewshow` event:** Jellyfin's native DOM event — checks for `#indexPage`, `#homeTab`, `.homePage`, `data-type="home"`
- **Strategy 1b — `pageshow` event:** Alternative Jellyfin event (varies by version)
- **Strategy 2 — `hashchange`:** Detects SPA hash navigation
- **Strategy 3 — `MutationObserver`:** Watches `document.body` for DOM changes; triggers layout after 400 ms debounce
- **Strategy 4 — Polling:** Every 3 seconds, checks if on home page without an active carousel (safety net)

**Layout activation:**
- Adds `body.media-carousel-active` class — scoped CSS rules hide all native Jellyfin home sections under this class
- Hides native Jellyfin children via `data-jc-hidden="true"` attribute (instead of broad CSS selectors, for plugin compatibility)
- Inserts `#jellyfin-carousel-layout` div before `mainContent.firstChild`
- Guards against re-initialization with `_layoutBusy` flag and `#jellyfin-carousel-layout` existence check

**Configuration:**
- `pluginConfig` is a module-level variable, lazy-loaded once via `ensureConfigLoaded()`
- Falls back to `DEFAULT_CONFIG` if the API call fails
- Config is **not** reloaded on SPA navigation — requires a page refresh for changes to take effect

**Groq AI Recommendations (optional):**
- When `EnableGroqAi` is true and a `GroqApiKey` is set, `loadAiRecommendations()` sends the user's recent watch history to the Groq API
- The AI returns 3 recommended genres and a personalized welcome message
- AI-recommended genre carousels are loaded eagerly (before main categories), prefixed with 🤖
- A stylized banner (`carousel-ai-banner`) displays the AI message
- Remaining genres still lazy-load normally but skip AI-recommended ones to avoid duplicates

---

## Key Files and Their Roles

| File | Role | Edit frequency |
|---|---|---|
| `Web/carousel-layout.js` | All UI behavior, API calls, DOM manipulation, inline CSS | High |
| `Configuration/PluginConfiguration.cs` | Config schema — must match `DEFAULT_CONFIG` in JS | When adding settings |
| `Configuration/configPage.html` | Admin UI — must match both the C# model and JS defaults | When adding settings |
| `FileTransformationService.cs` | Dual-mode script injection at server start | Rarely |
| `CarouselIndexTransformer.cs` | Static reflection callback for FileTransformation plugin | Rarely |
| `PluginServiceRegistrator.cs` | DI registration for `FileTransformationService` | Rarely |
| `Plugin.cs` | Plugin identity and web page registration | Rarely |
| `Web/carousel-styles.css` | CSS reference copy — keep in sync with inline styles in JS | When changing styles |
| `.github/workflows/build.yml` | CI/CD pipeline — auto-version, build, release | When changing CI |

---

## Development Workflow

### Build

```bash
dotnet build -c Release
```

Output goes to `bin/Release/net9.0/`. The `Web/` directory is copied to the output via `CopyToOutputDirectory`. `Configuration/configPage.html` is embedded as a managed resource.

### Package

```bash
# Linux
cd bin/Release/net9.0 && zip -r ../../../JellyfinCarouselPlugin.zip .
```

```powershell
# Windows PowerShell
Compress-Archive -Path "bin\Release\net9.0\*" -DestinationPath "JellyfinCarouselPlugin.zip" -Force
```

### Install and Test

1. Extract the ZIP into a directory named `CarouselLayout` under Jellyfin's `plugins/` folder
2. Restart the Jellyfin server
3. Navigate to **Dashboard → Plugins → Carousel Layout → Settings** to configure
4. Open the home page to see the carousel layout

There are **no automated tests**. All testing is manual on a running Jellyfin instance. Use the browser console (`console.log` from the plugin) for debugging.

### Iterating on JavaScript

During development, you can directly edit `carousel-layout.js` in the Jellyfin web server directory and hard-reload the browser (Ctrl+Shift+R / Cmd+Shift+R). No build step is needed for JS-only changes.

### CI/CD Pipeline (`.github/workflows/build.yml`)

Triggered on push to `main` or manual `workflow_dispatch`. The pipeline:

1. **Bump version** — Reads current version from `manifest.json`, analyzes conventional commits since last tag:
   - Breaking changes → major bump
   - `feat:` → minor bump
   - Everything else → patch bump
2. **Build** — `dotnet restore` + `dotnet build -c Release`
3. **Package** — Zips `bin/Release/net9.0/` into `JellyfinCarouselPlugin.zip`
4. **Update manifest** — Prepends a new version entry to `manifest.json` with `sourceUrl` and `checksum`; updates `AssemblyVersion`/`FileVersion` in `.csproj`
5. **Commit** — Commits version bump with `[skip ci]` to avoid infinite loops
6. **Release** — Creates a GitHub release with auto-generated changelog from commit messages

---

## Code Conventions

### C#

- **Naming:** PascalCase for classes, methods, and properties
- **Docs:** XML doc comments (`///`) on public members; descriptions are in French
- **Nullable:** `<Nullable>enable</Nullable>` is on — use `?` annotations and null checks
- **Structure:** One class per file; file name matches class name

### JavaScript

- **Naming:** camelCase for functions and variables; SCREAMING_SNAKE_CASE for module-level constants (`PLUGIN_ID`, `DEFAULT_CONFIG`, `CONFIG`)
- **Style:** Vanilla JS only — no modules, no TypeScript, no npm, no build step
- **Pattern:** Single IIFE — no globals exported
- **Async:** `async/await` throughout; top-level code uses `.then()` (IIFE is not async)
- **Comments:** French language; English for code identifiers

### CSS

- **Naming:** kebab-case with semantic prefixes: `.carousel-*`, `.badge-*`, `.carousel-hero-*`, `.carousel-ai-*`
- **Custom properties:** Defined in `:root`; use Jellyfin theme variables as fallbacks (e.g., `var(--theme-primary, var(--accent-color, var(--link-color, #00a4dc)))`)
- **Responsive breakpoints:** 1400 px, 800 px, 500 px + `@media (hover: none)` for touch devices
- **Activation guard:** All home-page override rules are scoped to `body.media-carousel-active` — this class is set/removed by the JS

### Commit Messages

Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Keep messages concise and under 80 characters. The CI pipeline uses these prefixes for automatic semantic versioning.

---

## Adding a New Configuration Setting

Configuration is defined in three places that must stay in sync:

1. **`Configuration/PluginConfiguration.cs`** — Add a C# property with a default value and a French XML doc comment
2. **`Configuration/configPage.html`** — Add the form control (use `emby-checkbox`, `emby-input`, or `emby-select`) and update both the `pageshow` load handler and the `submit` save handler
3. **`Web/carousel-layout.js`** — Add the key to `DEFAULT_CONFIG`, then reference it via `pluginConfig.YourNewSetting` in the relevant function

---

## Adding a New Carousel Category

1. Add an entry to `CONFIG.categories` in `carousel-layout.js`:
   ```js
   { id: 'mycat', name: 'Ma Catégorie', filter: 'SomeFilter', configKey: 'ShowMyCategory' }
   ```
2. Add the sorting/filtering logic for the new `id` inside `loadCategoryItems()`
3. Add `ShowMyCategory` as a configuration setting (see above)

## Adding a New Genre Carousel

Edit the `CONFIG.genres` array in `carousel-layout.js`. Genre names must match Jellyfin's genre strings exactly (case-sensitive). Current genres (16): Action, Aventure, Animation, Comédie, Crime, Documentaire, Drame, Enfants, Fantaisie, Horreur, Musique, Mystère, Romance, Science-Fiction, Thriller, Western. Genre carousels are loaded lazily via `IntersectionObserver` with a 200 px root margin (unless prioritized by Groq AI).

---

## Gotchas and Constraints

**CSS lives inside JS:** Edit the inline style template literal in `carousel-layout.js` — not just `carousel-styles.css`. Changes to `carousel-styles.css` alone have no effect on a running Jellyfin instance.

**Config is cached per page load:** `pluginConfig` is loaded once and never reloaded during SPA navigation. Config changes require the user to do a full page refresh (F5). This is intentional.

**No npm / no TypeScript:** Do not introduce `package.json`, webpack, babel, TypeScript, or any build tooling for the JavaScript. Keep it vanilla.

**Robust DOM selectors with retry:** `findHomeContainer()` tries 14 selectors in cascade (see Architecture section). If none match, `initCarouselLayout()` uses progressive retry (up to 8 attempts, 500 ms → 3 s delay). Detailed logs are printed to the browser console at each attempt. If Jellyfin changes its home page HTML structure, add new selectors to the `findHomeContainer()` array.

**`toggleFavorite` uses a non-standard API path:** `ApiClient.FavoriteManager.updateFavoriteStatus()` is not a standard documented method. If Jellyfin changes this API, `toggleFavorite` will fail silently (errors are caught and logged to console).

**`icon.png` exists in two places:** At the repo root (referenced by `manifest.json`'s `ImageUrl`) and inside `Web/` (served as a plugin asset). Keep both in sync when updating the icon.

**Build artifacts at root:** `build_output.txt`, `errors.txt`, and `restore_log.txt` are local build logs at the repo root. They are **not** gitignored — consider adding them to `.gitignore`.

**`CarouselIndexTransformer` invoked by reflection:** The class name and method name `InjectScript` are hardcoded as strings in `FileTransformationService`. Renaming either without updating the registration payload will break the FileTransformation integration silently.

**Groq API key exposed client-side:** The `GroqApiKey` is stored in plugin config and fetched by the browser JS via `ApiClient.getPluginConfiguration()`. Any authenticated Jellyfin user can read it. This is a known trade-off.

**`build.yaml` is manually maintained:** `build.yaml` is not auto-updated by CI. The authoritative version history is in `manifest.json`, which is updated automatically by the GitHub Actions workflow.

---

## Jellyfin Integration Notes

- Plugin configuration is stored as XML by Jellyfin's `BasePluginConfiguration` serializer
- The config page is served at: `/web/configurationpage?name=Carousel+Layout`
- The JS asset is served at: `/plugins/JellyfinCarouselPlugin/Web/carousel-layout.js`
- `ApiClient.getItems(userId, params)` returns `{ Items: [], TotalRecordCount: N }`
- `ApiClient.getPluginConfiguration(pluginId)` and `ApiClient.updatePluginConfiguration(pluginId, config)` use the plugin GUID as a string
- `Dashboard.navigate('details?id=' + itemId)` triggers SPA navigation to the item detail page
- `window.ApiClient` and `window.Dashboard` are Jellyfin globals — always guard access behind `waitForJellyfin()`; do not assume they exist at script load time

---

## NuGet Dependencies

| Package | Version |
|---|---|
| `Jellyfin.Model` | 10.11.8 |
| `Jellyfin.Controller` | 10.11.8 |
| `Newtonsoft.Json` | 13.0.3 |

All packages use `<PrivateAssets>all</PrivateAssets>` and `<ExcludeAssets>runtime</ExcludeAssets>` — they are compile-time references only; Jellyfin provides them at runtime.

---

## Configuration Properties (17 total)

| Property | Type | Default | Description |
|---|---|---|---|
| `EnableCarouselLayout` | bool | `true` | Master toggle for the carousel layout |
| `ShowNewReleases` | bool | `true` | Show "Nouveautés" category |
| `ShowTop10` | bool | `true` | Show "Top 10" category |
| `ShowContinueWatching` | bool | `true` | Show "Continuer à regarder" category |
| `ShowRecommended` | bool | `true` | Show "Recommandés" category |
| `ShowGenreCategories` | bool | `true` | Show genre-based carousels |
| `ShowNewEpisodesBadge` | bool | `true` | Show "NOUVEAUX ÉPISODES" badge on series |
| `ShowQualityBadge` | bool | `true` | Show 4K/HD quality badges |
| `ItemsPerCarousel` | int | `20` | Max items per carousel row |
| `EnableHoverAnimations` | bool | `true` | Enable zoom-on-hover animation |
| `ShowCollections` | bool | `true` | Show "Collections" (Boxsets) category |
| `HeroMode` | string | `"Random"` | Hero banner mode: `Random`, `Latest`, or `Resume` |
| `EnableFavoritesButton` | bool | `true` | Show heart button on hover |
| `HighlightColor` | string | `"#00a4dc"` | Accent color (hex code) |
| `EnableGroqAi` | bool | `false` | Enable Groq AI recommendations |
| `GroqApiKey` | string | `""` | Groq API key |
| `GroqModel` | string | `"llama3-8b-8192"` | Groq model to use |
