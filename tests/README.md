# Tests

Trois suites, sans framework : chacune s'exécute seule et renvoie un code de sortie non nul
en cas d'échec. Elles tournent en CI avant la publication.

## `ScriptTag.Tests` — insertion dans `index.html`

```bash
dotnet run --project tests/ScriptTag.Tests -c Release
```

Couvre l'idempotence de l'insertion, le retrait des balises des versions 1.x et 2.x, et le
comportement sur un HTML sans `</body>`. Une régression ici laisse les navigateurs demander
un script disparu, ou duplique la balise à chaque démarrage du serveur.

## `browser/home-rows.test.mjs` — rendu de la page d'accueil

```bash
cd tests/browser && npm install && node home-rows.test.mjs
```

Charge `Web/media-carousel.js` dans Chromium contre un faux DOM d'accueil Jellyfin, avec un
`ApiClient` simulé. Vérifie le placement des rangées sous les bibliothèques, l'échappement
HTML, le chargement différé des genres, le cache client, le masquage des sections natives,
l'accessibilité — et **rejoue la fonction `allowSwipe()` de `jellyfin-web`** pour garantir
qu'un balayage horizontal sur mobile ne bascule pas vers l'onglet Favoris.

## `browser/config-page.test.mjs` — page de configuration

```bash
cd tests/browser && node config-page.test.mjs
```

Charge `Configuration/configPage.html` avec un `ApiClient` et un `Dashboard` simulés. Vérifie
le chargement et l'enregistrement des réglages, la révélation conditionnelle des groupes, le
panneau d'état et les garanties d'accessibilité.

## Chromium

En intégration continue, `playwright` installe et localise le navigateur lui-même. En local,
pour réutiliser un Chromium déjà présent :

```bash
export MC_CHROMIUM=/chemin/vers/chrome
```
