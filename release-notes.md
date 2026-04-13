## Changements majeurs

- **Détection de la page d'accueil entièrement refaite** : 14 sélecteurs DOM + détection URL en fallback
- **5 stratégies de détection** : viewshow, pageshow, hashchange, MutationObserver, polling 3s
- **Retry progressif** : jusqu'à 8 tentatives avec délai croissant (500ms → 3s)
- **Logs détaillés** dans la console du navigateur pour faciliter le diagnostic
- **Descriptions et changelogs en français** dans le manifest et le README
- **Version unifiée** : 2.1.1.0 dans le csproj, le manifest et le tag

## Installation

Ajoutez ce repo dans vos catalogues Jellyfin :
```
https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
```

Puis installez "Carousel Layout" depuis le catalogue.
