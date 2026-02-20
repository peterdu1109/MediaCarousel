<div align="center">
  <img src="Web/icon.png" alt="Logo Media Carousel" width="128" height="128" />
  <h1>Media Carousel Plugin</h1>
  <p>
    <b>Transformez votre Jellyfin en une expérience de streaming moderne et immersive.</b>
  </p>

  [![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.x-blue.svg)](https://jellyfin.org/)
  [![.NET](https://img.shields.io/badge/.NET-9.0-purple.svg)](https://dotnet.microsoft.com/)
</div>

---

Transforme complètement l'interface web de votre page d'accueil Jellyfin pour adopter un layout **type Netflix** avec des carrousels horizontaux modernes, des animations fluides, des favoris rapides, et une bannière Hero.

## 🎬 Fonctionnalités

- ✨ **Carrousels horizontaux** rapides et fluides organisés par catégories
- 🎯 **Catégories Intelligentes** :
  - **Continuer à regarder** (Reprise de lecture)
  - **Derniers Ajouts** (Nouveautés)
  - **Collections (Boxsets)** (Sagas complètes type Marvel, Harry Potter, etc.)
  - **Top 10** (Les médias les plus regardés sur le serveur)
  - **Recommandés pour vous**
  - **Carrousels par Genre** (Action, Comédie, etc.) avec chargement différé (Lazy Loading).
- 🖼️ **Bannière "Héros" (Hero) Personnalisable** :
  - Choisissez le mode d'affichage de la grande tuile d'accueil : **Aléatoire**, **Dernier ajout**, ou le média en cours (**Reprendre la lecture**).
- ♥️ **Interactions Avancées au survol** :
  - **Bouton Favori (Cœur)** : Ajoutez ou retirez le média de vos favoris sans même ouvrir sa fiche !
  - Effets d'échelle de carte type Netflix.
- 🏷️ **Badges dynamiques** :
  - Indicateurs "NOUVEAUX ÉPISODES" pour les séries en cours.
  - Indicateur de qualité vidéo (4K, HD).
- 🎨 **Personnalisation** : Modifiez la couleur de surbrillance/boutons directement avec un sélecteur dans les réglages (ex: Rouge Netflix, Bleu primaire, etc).
- ⚡ **Haute Performance** : Le plugin repousse le chargement des genres jusqu'au défilement de la page (IntersectionObserver).

## 🤝 Compatibilité Inter-Plugins (Enhanced Home)

Ce plugin est conçu être robuste. 
**Problème des doublons / "Layout de base" résolu** : 
Désormais, le JS n'écrase plus brutalement le DOM du client Jellyfin. Les sections d'accueil natives (ou celles ajoutées par le plugin tiers **"Enhanced Home Screen Sections"**) sont repérées et **masquées propement** via CSS dès l'initialisation de Media Carousel. Seuls vos jolis carrousels seront visibles, sans aucun conflit visuel et sans casser votre navigation !

## 📋 Prérequis

- Jellyfin Server **10.11.x** ou supérieur
- .NET **9.0** SDK (pour compiler soi-même)

## 🚀 Installation

### Option 1 : Installation rapide (Build pré-compilé)

1. **Téléchargez** l'archive `JellyfinCarouselPlugin.zip` la plus récente.
2. Extrayez le contenu dans votre dossier `plugins` de Jellyfin (sous la forme d'un dossier nommé `CarouselLayout`).
3. Redémarrez le serveur Jellyfin.
4. Activez et configurez le plugin depuis `Dashboard -> Plugins -> Carousel Layout`.

### Option 2 : Compilation locale

Si vous souhaitez recompiler vous-même les sources C# après modifications :

```powershell
# S'assurer d'être à la racine de MediaCarousel
dotnet build -c Release

# Empaqueter tous les fichiers générés dans un zip
Compress-Archive -Path "bin\Release\net9.0\*" -DestinationPath "JellyfinCarouselPlugin.zip" -Force
```

## ⚙️ Configuration

1. Ouvrez le **Dashboard Jellyfin**
2. Allez dans **Plugins** → **Carousel Layout** -> **Settings** (roue crantée)
3. Modifiez tous les nouveaux paramètres :
   - Mode d'affichage de la bannière (HeroMode)
   - Couleur du thème custom (HighlightColor)
   - Carrousel des Collections (Boxsets)
   - Bouton Favoris au survol ...
4. **Sauvegardez**, la page va enregistrer les modifications dans le serveur.
5. **Rechargez l'accueil (F5)** de l'interface Jellyfin.

## 📄 Licence & Crédits

Ce projet est sous licence MIT. Code source par peterdu1109, optimisé avec amour pour de meilleures performances et la tolérance aux plugins communautaires !
