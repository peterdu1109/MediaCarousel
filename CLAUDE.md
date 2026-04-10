# CLAUDE.md — MediaCarousel (JellyfinCarouselPlugin)

## Project Overview

**MediaCarousel** is a Jellyfin server plugin that replaces the Jellyfin web UI home page with a Netflix-style horizontal carousel layout. It is a hybrid project: a C# (.NET 9.0) backend that injects a JavaScript file into Jellyfin's HTML at startup, and a vanilla JavaScript frontend that takes over the home page DOM at runtime.

- **Plugin ID (GUID):** `191bd290-1054-4b55-a137-46c72181266b` — used in `Plugin.cs`, `manifest.json`, `configPage.html`, and `carousel-layout.js`. This is the canonical GUID.
- **Target:** Jellyfin 10.11.x (ABI `10.11.0.0`), .NET 9.0
- **Language:** C# backend, vanilla JavaScript frontend (no Node.js, no TypeScript, no npm)

---

## Repository Structure

```
MediaCarousel/
├── Plugin.cs                    # BasePlugin<PluginConfiguration> + IHasWebPages
├── InjectionService.cs          # IServerEntryPoint — injects <script> into index.html at startup
├── JellyfinCarouselPlugin.csproj
├── manifest.json                # Actual plugin manifest used by Jellyfin
├── build.yaml                   # Plugin registry metadata (NOTE: contains wrong GUID — see Gotchas)
├── nuget.config                 # nuget.org package source
├── LICENSE                      # MIT
├── README.md                    # User-facing documentation (French)
├── Configuration/
│   ├── PluginConfiguration.cs   # 14-property config model (extends BasePluginConfiguration)
│   └── configPage.html          # Admin config UI, embedded as a resource
└── Web/
    ├── carousel-layout.js       # All plugin logic — single IIFE (~905 lines)
    ├── carousel-styles.css      # CSS reference copy — NOT served as a linked stylesheet (see below)
    └── icon.png                 # Plugin icon (also duplicated at repo root)
```

> **Critical:** `carousel-styles.css` is **not linked** to Jellyfin. All styles are injected into the page as an inline `<style>` tag by `carousel-layout.js` when Jellyfin is detected. `carousel-styles.css` is a human-readable mirror kept in sync manually. When changing styles, edit the template literal string inside `carousel-layout.js` and keep `carousel-styles.css` in sync.

---

## Architecture

### C# Backend (Startup Only)

The backend has a single runtime responsibility: at server startup, `InjectionService.Run()` finds Jellyfin's `index.html` and splices in a `<script>` tag before `</head>`. The injection is idempotent (checks for the tag before inserting). After that, all behavior is frontend.

**Path resolution order in `InjectionService`:**
1. `{IApplicationPaths.ProgramDataPath}/jellyfin-web/index.html`
2. `{AppDomain.CurrentDomain.BaseDirectory}/jellyfin-web/index.html`

`Plugin.cs` exposes the config page as an embedded resource (`JellyfinCarouselPlugin.Configuration.configPage.html`) and provides `GetWebPath()` so Jellyfin knows where to serve `Web/` assets from.

> **Note:** `InjectionService.cs` is minified to a single line. Reformat it before editing.

### JavaScript Frontend (All Runtime Logic)

`carousel-layout.js` is a single IIFE (`(function() { 'use strict'; ... })()`) with no external dependencies. It runs in the browser using Jellyfin's globally available `window.ApiClient` and `window.Dashboard`.

**Startup sequence:**
1. `waitForJellyfin()` — polls every 100 ms until `window.ApiClient` and `window.Dashboard` exist
2. Injects CSS inline via `<style>` tag into `document.head`
3. Calls `triggerLayout()` after an 800 ms initial delay
4. Calls `observePageChanges()` to listen for SPA navigation

**Navigation detection (dual strategy):**
- Primary: Jellyfin's native `viewshow` DOM event — checks for `#indexPage` or `.homePage`
- Fallback: `MutationObserver` on `document.body` watching for `#indexPage` to appear

**Layout activation:**
- Adds `body.media-carousel-active` class — scoped CSS rules hide all native Jellyfin home sections under this class
- Inserts `#jellyfin-carousel-layout` div before `mainContent.firstChild`
- Guards against re-initialization by checking for existing `#jellyfin-carousel-layout`

**Configuration:**
- `pluginConfig` is a module-level variable, lazy-loaded once via `ensureConfigLoaded()`
- Falls back to `DEFAULT_CONFIG` if the API call fails
- Config is **not** reloaded on SPA navigation — requires a page refresh for changes to take effect

---

## Key Files and Their Roles

| File | Role | Edit frequency |
|---|---|---|
| `Web/carousel-layout.js` | All UI behavior, API calls, DOM manipulation | High |
| `Configuration/PluginConfiguration.cs` | Config schema — must match `DEFAULT_CONFIG` in JS | When adding settings |
| `Configuration/configPage.html` | Admin UI — must match both the C# model and JS defaults | When adding settings |
| `InjectionService.cs` | Script injection at server start | Rarely |
| `Plugin.cs` | Plugin identity and web page registration | Rarely |
| `Web/carousel-styles.css` | CSS reference copy — keep in sync with inline styles in JS | When changing styles |

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

- **Naming:** kebab-case with semantic prefixes: `.carousel-*`, `.badge-*`, `.carousel-hero-*`
- **Custom properties:** Defined in `:root`; use Jellyfin theme variables as fallbacks (e.g., `var(--theme-primary, #00a4dc)`)
- **Responsive breakpoints:** 1400 px, 800 px, 500 px
- **Activation guard:** All home-page override rules are scoped to `body.media-carousel-active` — this class is set/removed by the JS

### Commit Messages

Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Keep messages concise and under 80 characters.

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

Edit the `CONFIG.genres` array in `carousel-layout.js`. Genre names must match Jellyfin's genre strings exactly (case-sensitive). Genre carousels are loaded lazily via `IntersectionObserver` with a 200 px root margin.

---

## Gotchas and Constraints

**GUID mismatch in `build.yaml`:** `build.yaml` contains a placeholder GUID (`a1b2c3d4-e5f6-4789-a1b2-c3d4e5f67890`) that differs from the real plugin GUID (`191bd290-1054-4b55-a137-46c72181266b`) used in `Plugin.cs`, `manifest.json`, `carousel-layout.js`, and `configPage.html`. Always use the real GUID; `build.yaml` is wrong.

**CSS lives inside JS:** Edit the inline style template literal in `carousel-layout.js` — not just `carousel-styles.css`. Changes to `carousel-styles.css` alone have no effect on a running Jellyfin instance.

**Config is cached per page load:** `pluginConfig` is loaded once and never reloaded during SPA navigation. Config changes require the user to do a full page refresh (F5). This is intentional.

**`InjectionService.cs` is minified:** The entire file is on a single line. Reformat it before editing.

**No npm / no TypeScript:** Do not introduce `package.json`, webpack, babel, TypeScript, or any build tooling for the JavaScript. Keep it vanilla.

**Fragile DOM selectors:** `initCarouselLayout()` locates the home page container by trying `.homePage`, then `#indexPage .scrollSlider`, then `#indexPage`. If Jellyfin changes its home page HTML structure, these selectors will need updating.

**`toggleFavorite` uses a non-standard API path:** `ApiClient.FavoriteManager.updateFavoriteStatus()` is not a standard documented method. If Jellyfin changes this API, `toggleFavorite` will fail silently (errors are caught and logged to console).

**`icon.png` exists in two places:** At the repo root (referenced by `manifest.json`'s `ImageUrl`) and inside `Web/` (served as a plugin asset). Keep both in sync when updating the icon.

**Build artifacts at root:** `build_output.txt`, `errors.txt`, and `restore_log.txt` are local build logs at the repo root. Do not commit them.

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
| `Jellyfin.Model` | 10.11.6 |
| `MediaBrowser.Server.Core` | 4.9.1.90 |
