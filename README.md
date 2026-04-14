<div align="center">
  <img src="Web/icon.png" alt="Media Carousel" width="96" />
  <h1>Media Carousel</h1>
  <p>Plugin Jellyfin — Transforme ta page d'accueil en interface Netflix</p>

  [![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.x-00a4dc?style=flat-square)](https://jellyfin.org/)
  [![.NET](https://img.shields.io/badge/.NET-9.0-512BD4?style=flat-square)](https://dotnet.microsoft.com/)
  [![Version](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json&query=%24%5B0%5D.versions%5B0%5D.version&label=Version&color=brightgreen&style=flat-square)](https://github.com/peterdu1109/MediaCarousel/releases)
  [![Licence](https://img.shields.io/badge/Licence-MIT-green?style=flat-square)](LICENSE)
</div>

---

## 🎬 C'est quoi Media Carousel ?

**Media Carousel** remplace la page d'accueil de Jellyfin par une interface moderne inspirée de Netflix.  
Carrousels horizontaux, bannière Hero plein écran, genres automatiques, ordre personnalisable — le tout intégré nativement dans l'interface Jellyfin, sans modifier ton serveur de façon permanente.

**Avant** → La page d'accueil classique Jellyfin.  
**Après** → Une interface Netflix fluide, thémée, et personnalisable.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🔗 Intégration native | S'insère dans le layout Jellyfin — pas d'overlay, thème automatique |
| 🎞️ Carrousels horizontaux | Navigation fluide par catégories avec scroll tactile |
| 🖼️ Bannière Hero | Média en grand format avec bouton Lecture et Plus d'infos |
| ▶️ Continuer à regarder | Reprends là où tu t'es arrêté |
| 🆕 Nouveautés | Les derniers médias ajoutés à ta bibliothèque |
| 🏆 Top 10 | Les plus regardés sur ton serveur |
| ⭐ Recommandés | Suggestions basées sur tes favoris |
| 📦 Collections | Sagas et coffrets (Boxsets) |
| 🎭 Genres automatiques | Chargés depuis ta bibliothèque, filtrés par popularité, lazy-load au défilement |
| ✨ Sections personnalisées | Crée tes propres carrousels (par Genre, Studio, Tag ou Recherche) |
| 🔀 Ordre personnalisable | Glisse-dépose pour réorganiser toutes les sections |
| 🖼️ Style poster ou paysage | Cartes portrait (affiche) ou paysage (backdrop) au choix |
| 🏷️ Badge qualité | Indicateur 4K / HD sur chaque vignette |
| 📺 Nouveaux épisodes | Badge sur les séries avec des épisodes non vus |
| ❤️ Favoris | Ajoute/retire des favoris en un clic, sans ouvrir la fiche |
| 🎨 Couleur personnalisable | Change la couleur d'accent de toute l'interface |
| 🤖 IA Groq (optionnel) | Recommandations personnalisées basées sur ton historique |

---

## 📦 Installation recommandée — via le catalogue Jellyfin

> Jellyfin gère les mises à jour automatiquement avec cette méthode.

1. Ouvre le **Dashboard Jellyfin**
2. Va dans **Plugins → Catalogues (Repositories)**
3. Clique sur **+** et ajoute cette URL :

```
https://raw.githubusercontent.com/peterdu1109/MediaCarousel/main/manifest.json
```

4. Enregistre, puis va dans **Plugins → Catalogue**
5. Cherche **Carousel Layout** et clique sur **Installer**
6. **Redémarre** le serveur Jellyfin
7. Ouvre ta page d'accueil → le carousel apparaît automatiquement

---

## 📥 Installation manuelle (ZIP)

1. Télécharge `JellyfinCarouselPlugin.zip` depuis la [page des releases](https://github.com/peterdu1109/MediaCarousel/releases)
2. Extrais le contenu dans un dossier `CarouselLayout` dans le répertoire `plugins/` de Jellyfin
3. Redémarre le serveur Jellyfin

---

## ⚙️ Configuration

1. **Dashboard → Plugins → Carousel Layout → Paramètres** (icône ⚙️)
2. Ajuste les options :

**Général**

| Paramètre | Description | Défaut |
|---|---|---|
| Activer le carrousel | Active/désactive le plugin entier | ✅ Oui |
| Animations au survol | Effet de zoom sur les cartes | ✅ Oui |
| Cacher l'interface native | Masque les sections Jellyfin originales | ❌ Non |

**Layout**

| Paramètre | Description | Défaut |
|---|---|---|
| Ordre des sections | Glisse-dépose pour réorganiser | hero, continuer, nouveautés... |
| Style des cartes | Poster (portrait) ou Paysage (backdrop) | Poster |
| Mode Bannière Hero | Aléatoire / Dernier ajout / En cours / Désactivé | Aléatoire |
| Couleur accent | Couleur des boutons et bordures | `#00a4dc` |
| Éléments par carrousel | Nombre max de vignettes par ligne | 20 |

**Catégories**

| Paramètre | Défaut |
|---|---|
| Continuer à regarder | ✅ Oui |
| Nouveautés | ✅ Oui |
| Top 10 | ✅ Oui |
| Recommandés | ✅ Oui |
| Collections | ✅ Oui |
| Genres | ✅ Oui |

**Genres intelligents**

| Paramètre | Description | Défaut |
|---|---|---|
| Min. éléments par genre | En-dessous, le genre est masqué | 3 |
| Max. genres affichés | Seuls les plus populaires s'affichent | 12 |

**Badges**

| Paramètre | Défaut |
|---|---|
| Badge nouveaux épisodes | ✅ Oui |
| Badge qualité (4K/HD) | ✅ Oui |
| Bouton Favoris au survol | ✅ Oui |

**IA Groq (optionnel)**

| Paramètre | Description | Défaut |
|---|---|---|
| Activer l'IA | Recommandations personnalisées | ❌ Non |
| Clé API Groq | Obtenir sur console.groq.com (gratuit) | — |
| Modèle IA | LLaMA 3 8B (rapide) / 70B (précis) / Mixtral | LLaMA 3 8B |

3. **Sauvegarde**, puis appuie sur **F5** pour voir les changements

---

## 🔧 Dépannage

### Le carousel ne s'affiche pas ?

1. **Vérifie l'installation** : Dashboard → Plugins → tu dois voir "Carousel Layout"
2. **Redémarre Jellyfin** après l'installation ou une mise à jour
3. **Vide le cache** : `Ctrl + Shift + R` (ou `Cmd + Shift + R` sur Mac)
4. **Ouvre la console** (`F12` → Console) et cherche les messages `[MediaCarousel]` :
   - `Jellyfin prêt — démarrage` → le script est bien chargé
   - `Container trouvé via:` → la page d'accueil est détectée
   - `✅ Fusion native activée!` → tout fonctionne
   - `Container introuvable après 8 tentatives` → le DOM de ta version Jellyfin n'est pas reconnu → ouvre une issue GitHub

### Conflit avec d'autres plugins ?

Media Carousel s'intègre nativement dans le layout Jellyfin. Si tu utilises aussi **Home Screen Sections (HSS)**, les deux peuvent entrer en conflit car ils modifient la même zone. Désactive l'un des deux si tu constates des problèmes.

### Le plugin FileTransformation est-il nécessaire ?

Non, mais **recommandé** pour Docker. Sans lui, Media Carousel modifie directement le fichier `index.html` de Jellyfin (permissions d'écriture requises). Avec FileTransformation, l'injection se fait en mémoire.

**Installer FileTransformation** : ajoute `https://www.iamparadox.dev/jellyfin/plugins/manifest.json` dans tes catalogues, puis installe "File Transformation".

---

## 🛠️ Compilation depuis les sources

**Prérequis** : .NET 9.0 SDK

```bash
git clone https://github.com/peterdu1109/MediaCarousel.git
cd MediaCarousel
dotnet build -c Release
```

```powershell
# Empaqueter (Windows)
Compress-Archive -Path "bin\Release\net9.0\*" -DestinationPath "JellyfinCarouselPlugin.zip" -Force
```

```bash
# Empaqueter (Linux)
cd bin/Release/net9.0 && zip -r ../../../JellyfinCarouselPlugin.zip .
```

---

## 📋 Prérequis

- Jellyfin Server **10.11.x**
- .NET **9.0** SDK (uniquement pour compiler depuis les sources)
- Plugin **File Transformation** (optionnel, recommandé pour Docker)

---

## 📜 Licence

Distribué sous licence [MIT](LICENSE). Projet par [peterdu1109](https://github.com/peterdu1109).
