<div align="center">
  <img src="Web/icon.png" alt="Media Carousel" width="96" />
  <h1>Media Carousel</h1>
  <p>Plugin Jellyfin — Interface d'accueil style Netflix avec carrousels horizontaux</p>

  [![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.x-00a4dc?style=flat-square)](https://jellyfin.org/)
  [![.NET](https://img.shields.io/badge/.NET-9.0-512BD4?style=flat-square)](https://dotnet.microsoft.com/)
  [![Licence](https://img.shields.io/badge/Licence-MIT-green?style=flat-square)](LICENSE)
</div>

---

## Présentation

**Media Carousel** remplace la page d'accueil de Jellyfin par une interface moderne à carrousels horizontaux, inspirée de Netflix. Le plugin fonctionne en injectant un script JavaScript dans l'interface web de Jellyfin — aucune modification permanente du serveur n'est effectuée.

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| Carrousels horizontaux | Navigation fluide par catégories |
| Bannière Hero | Affichage plein écran : Aléatoire, Dernier ajout, ou En cours |
| Continuer à regarder | Reprend là où vous vous êtes arrêté |
| Nouveautés | Les derniers médias ajoutés |
| Top 10 | Les plus regardés sur le serveur |
| Recommandés | Suggestions personnalisées |
| Collections | Sagas et coffrets (Boxsets) |
| Carrousels par genre | Action, Comédie, Drame, etc. — chargement différé au défilement |
| Badge qualité | Indicateur 4K / HD sur chaque vignette |
| Badge nouveaux épisodes | Signalement des séries avec épisodes non vus |
| Bouton Favoris | Ajout/retrait aux favoris au survol, sans ouvrir la fiche |
| Couleur personnalisée | Sélecteur de couleur pour l'accent de l'interface |
| Compatible plugins tiers | Masquage propre des sections natives (Compatible "Enhanced Home Screen Sections") |

---

## Installation via le dépôt Jellyfin (recommandé)

> C'est la méthode la plus simple — Jellyfin gère les mises à jour automatiquement.

1. Ouvrez le **Dashboard Jellyfin**
2. Allez dans **Plugins → Catalogues (Repositories)**
3. Cliquez sur **+** et ajoutez l'URL suivante :

```
https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
```

4. Enregistrez, puis allez dans **Plugins → Catalogue**
5. Recherchez **Carousel Layout** et cliquez sur **Installer**
6. Redémarrez le serveur Jellyfin

---

## Installation manuelle (ZIP)

1. Téléchargez `JellyfinCarouselPlugin.zip` depuis la [page des releases](https://github.com/peterdu1109/MediaCarousel/releases)
2. Extrayez le contenu dans un dossier `CarouselLayout` à l'intérieur du répertoire `plugins` de Jellyfin
3. Redémarrez le serveur Jellyfin

---

## Configuration

1. **Dashboard → Plugins → Carousel Layout → Paramètres (roue crantée)**
2. Ajustez les options selon vos préférences :

| Paramètre | Description | Défaut |
|---|---|---|
| Activer le carrousel | Active/désactive le plugin | Oui |
| Mode Bannière Hero | Aléatoire / Dernier ajout / En cours | Aléatoire |
| Couleur de surbrillance | Couleur accent (boutons, bordures) | `#00a4dc` |
| Continuer à regarder | Afficher la catégorie | Oui |
| Nouveautés | Afficher la catégorie | Oui |
| Top 10 | Afficher la catégorie | Oui |
| Recommandés | Afficher la catégorie | Oui |
| Collections | Afficher les Boxsets | Oui |
| Carrousels par genre | Activer les genres | Oui |
| Badge nouveaux épisodes | Indicateur sur les séries | Oui |
| Badge qualité | Indicateur 4K / HD | Oui |
| Animations au survol | Effet de zoom sur les vignettes | Oui |
| Bouton Favoris | Cœur visible au survol | Oui |
| Éléments par carrousel | Nombre max de vignettes | 20 |

3. **Sauvegardez**, puis appuyez sur **F5** sur la page d'accueil pour appliquer les changements

---

## Compilation depuis les sources

Prérequis : **.NET 9.0 SDK**

```bash
# Cloner le dépôt
git clone https://github.com/peterdu1109/MediaCarousel.git
cd MediaCarousel

# Compiler en mode Release
dotnet build -c Release
```

```bash
# Empaqueter (Linux)
cd bin/Release/net9.0 && zip -r ../../../JellyfinCarouselPlugin.zip .
```

```powershell
# Empaqueter (Windows PowerShell)
Compress-Archive -Path "bin\Release\net9.0\*" -DestinationPath "JellyfinCarouselPlugin.zip" -Force
```

---

## Prérequis

- Jellyfin Server **10.11.x**
- .NET **9.0** SDK (uniquement pour compiler depuis les sources)

---

## Licence

Distribué sous licence [MIT](LICENSE). Projet par [peterdu1109](https://github.com/peterdu1109).
