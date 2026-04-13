<div align="center">
  <img src="Web/icon.png" alt="Media Carousel" width="96" />
  <h1>Media Carousel</h1>
  <p>Plugin Jellyfin — Transforme ta page d'accueil en interface Netflix</p>

  [![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.x-00a4dc?style=flat-square)](https://jellyfin.org/)
  [![.NET](https://img.shields.io/badge/.NET-9.0-512BD4?style=flat-square)](https://dotnet.microsoft.com/)
  [![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen?style=flat-square)](https://github.com/peterdu1109/MediaCarousel/releases)
  [![Licence](https://img.shields.io/badge/Licence-MIT-green?style=flat-square)](LICENSE)
</div>

---

## 🎬 C'est quoi Media Carousel ?

**Media Carousel** remplace la page d'accueil de Jellyfin par une interface moderne inspirée de Netflix. Plus de carrousels horizontaux, une bannière Hero plein écran, et tout ça sans modifier ton serveur de façon permanente.

**Avant** : La page d'accueil classique Jellyfin.
**Après** : Une interface Netflix avec carrousels, badges et bannière Hero.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🎞️ Carrousels horizontaux | Navigue par catégories avec des carrousels fluides |
| 🖼️ Bannière Hero | Un film/série en grand, avec bouton Lecture et Plus d'infos |
| ▶️ Continuer à regarder | Reprends là où tu t'es arrêté |
| 🆕 Nouveautés | Les derniers médias ajoutés à ta bibliothèque |
| 🏆 Top 10 | Les plus regardés sur ton serveur |
| ⭐ Recommandés | Suggestions basées sur tes goûts |
| 📦 Collections | Sagas et coffrets (Boxsets) |
| 🎭 16 genres | Action, Comédie, Drame, Horreur... chargés automatiquement au défilement |
| 🏷️ Badge qualité | Indicateur 4K / HD sur chaque vignette |
| 📺 Nouveaux épisodes | Badge sur les séries avec des épisodes non vus |
| ❤️ Favoris | Ajoute/retire des favoris en un clic, sans ouvrir la fiche |
| 🎨 Couleur personnalisable | Change la couleur d'accent de toute l'interface |
| 🤖 IA Groq (optionnel) | Recommandations personnalisées basées sur ton historique |

---

## 📦 Installation (recommandée — via le catalogue Jellyfin)

> C'est la méthode la plus simple. Jellyfin gère les mises à jour automatiquement.

1. Ouvre le **Dashboard Jellyfin**
2. Va dans **Plugins → Catalogues (Repositories)**
3. Clique sur **+** et ajoute cette URL :

```
https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
```

4. Enregistre, puis va dans **Plugins → Catalogue**
5. Cherche **Carousel Layout** et clique sur **Installer**
6. **Redémarre** le serveur Jellyfin
7. Ouvre ta page d'accueil → le carousel devrait apparaître !

---

## 📥 Installation manuelle (ZIP)

1. Télécharge `JellyfinCarouselPlugin.zip` depuis la [page des releases](https://github.com/peterdu1109/MediaCarousel/releases)
2. Extrais le contenu dans un dossier `CarouselLayout` dans le répertoire `plugins/` de Jellyfin
3. Redémarre le serveur Jellyfin

---

## ⚙️ Configuration

1. **Dashboard → Plugins → Carousel Layout → Paramètres** (icône ⚙️)
2. Ajuste les options :

| Paramètre | Description | Défaut |
|---|---|---|
| Activer le carrousel | Active/désactive le plugin | ✅ Oui |
| Mode Bannière Hero | Aléatoire / Dernier ajout / En cours | Aléatoire |
| Couleur accent | Couleur des boutons et bordures | `#00a4dc` |
| Continuer à regarder | Afficher cette catégorie | ✅ Oui |
| Nouveautés | Afficher cette catégorie | ✅ Oui |
| Top 10 | Afficher cette catégorie | ✅ Oui |
| Recommandés | Afficher cette catégorie | ✅ Oui |
| Collections | Afficher les Boxsets | ✅ Oui |
| Genres | Afficher les carrousels par genre | ✅ Oui |
| Badge nouveaux épisodes | Indicateur sur les séries | ✅ Oui |
| Badge qualité | Indicateur 4K / HD | ✅ Oui |
| Animations | Effet de zoom au survol | ✅ Oui |
| Bouton Favoris | ❤️ visible au survol | ✅ Oui |
| Éléments par carrousel | Nombre max de vignettes | 20 |
| 🤖 IA Groq | Recommandations personnalisées | ❌ Non |

3. **Sauvegarde**, puis appuie sur **F5** sur la page d'accueil pour voir les changements

---

## 🔧 Dépannage

### Le carousel ne s'affiche pas ?

1. **Vérifie que le plugin est bien installé** : Dashboard → Plugins → tu dois voir "Carousel Layout"
2. **Redémarre Jellyfin** après l'installation
3. **Vide le cache du navigateur** : `Ctrl + Shift + R` (ou `Cmd + Shift + R` sur Mac)
4. **Ouvre la console développeur** (`F12` → Console) et cherche les messages `[MediaCarousel]` :
   - `Jellyfin prêt — démarrage` → Le script est bien chargé
   - `Container trouvé via:` → La page d'accueil est détectée
   - `✅ Carousel Layout initialisé` → Tout fonctionne
   - `Container introuvable après 8 tentatives` → Le DOM de ta version Jellyfin n'est pas reconnu → ouvre une issue GitHub

### Conflit avec d'autres plugins ?

Media Carousel est conçu pour fonctionner seul sur la page d'accueil. Si tu utilises aussi **Home Screen Sections (HSS)**, il peut y avoir des conflits car les deux plugins remplacent la page d'accueil. Désactive l'un des deux.

### Le plugin FileTransformation est-il nécessaire ?

Non, mais **recommandé**. Sans lui, Media Carousel modifie directement le fichier `index.html` de Jellyfin, ce qui nécessite des permissions d'écriture (problème fréquent avec Docker). Avec FileTransformation, l'injection se fait en mémoire.

**Installer FileTransformation** : Ajoute le repo `https://www.iamparadox.dev/jellyfin/plugins/manifest.json` dans tes catalogues et installe "File Transformation".

---

## 🛠️ Compilation depuis les sources

**Prérequis** : .NET 9.0 SDK

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

## 📋 Prérequis

- Jellyfin Server **10.11.x**
- .NET **9.0** SDK (uniquement pour compiler depuis les sources)
- Plugin **File Transformation** (optionnel mais recommandé pour Docker)

---

## 📜 Licence

Distribué sous licence [MIT](LICENSE). Projet par [peterdu1109](https://github.com/peterdu1109).
