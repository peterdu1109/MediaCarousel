## Nouveautés de cette version

### ✨ Nouvelles fonctionnalités
- Intégration native dans l'interface Jellyfin — les carrousels s'insèrent directement dans ton thème, pas par-dessus
- Ordre des sections personnalisable par glisser-déposer depuis les paramètres
- Genres automatiques chargés depuis ta bibliothèque (filtrés par popularité, plus de liste fixe)
- Sections personnalisées : crée tes propres carrousels par Genre, Studio, Tag ou Recherche
- Style des cartes au choix : Poster (portrait) ou Paysage (backdrop)
- Chargement parallèle de toutes les sections — affichage plus rapide

### 🐛 Corrections
- La page de configuration se sauvegarde maintenant correctement
- Les carrousels s'affichent bien même avec l'option "Cacher l'interface native" activée
- Les sections du plugin ne sont plus confondues avec les sections natives lors du nettoyage

### ⚡ Performances
- Les recommandations IA Groq se chargent en arrière-plan sans bloquer l'affichage
- Config mise en cache localement pour éviter le flash au chargement

---

## Installation

Ajoute ce repo dans tes catalogues Jellyfin :
```
https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
```

Puis installe **Carousel Layout** depuis le catalogue et redémarre Jellyfin.
