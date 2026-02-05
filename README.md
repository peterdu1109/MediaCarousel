# Jellyfin Carousel Layout Plugin

[![Jellyfin](https://img.shields.io/badge/Jellyfin-10.11.x-blue.svg)](https://jellyfin.org/)
[![.NET](https://img.shields.io/badge/.NET-9.0-purple.svg)](https://dotnet.microsoft.com/)

Transforme l'interface web Jellyfin en un layout type Netflix avec des carrousels horizontaux pour une expérience utilisateur moderne et intuitive.

## 🎬 Fonctionnalités

- ✨ **Carrousels horizontaux** organisés par catégories
- 🎯 **Catégories intelligentes** :
  - Continuer à regarder
  - Nouveautés
  - Top 10 (les plus regardés)
  - Recommandés pour vous
  - Catégories par genre (Action, Comédie, Drame, etc.)
- 🏷️ **Badges dynamiques** :
  - "NOUVEAUX ÉPISODES" pour les séries
  - Qualité vidéo (4K, HD)
- 🌙 **Thème sombre** inspiré de Netflix
- 📱 **Responsive** : fonctionne sur desktop, tablette et mobile
- ⚙️ **Configuration flexible** via l'interface Jellyfin

## 📋 Prérequis

- Jellyfin Server **10.11.x** ou supérieur
- .NET **9.0** SDK (pour la compilation)
- Accès aux clients web Jellyfin

## 🚀 Installation

### Option 1 : Installation depuis le repository de plugins (Recommandé)

1. Ouvrez le **Dashboard Jellyfin**
2. Allez dans **Plugins** → **Repositories**
3. Ajoutez le repository :
   ```
   Nom: Carousel Layout
   URL: https://raw.githubusercontent.com/peterdu1109/Nouveaut-s--Top-10/main/manifest.json
   ```
4. Allez dans **Catalogue** et installez "Carousel Layout"
5. Redémarrez le serveur Jellyfin

### Option 2 : Installation manuelle

1. **Téléchargez** le dernier fichier DLL depuis les [Releases](https://github.com/peterdu1109/Nouveaut-s--Top-10/releases)

2. **Copiez** le fichier dans le dossier plugins de Jellyfin :
   - Windows : `C:\ProgramData\Jellyfin\Server\plugins\CarouselLayout\`
   - Linux : `/var/lib/jellyfin/plugins/CarouselLayout/`
   - Docker : `/config/plugins/CarouselLayout/`

3. **Redémarrez** le serveur Jellyfin

4. **Vérifiez** l'installation :
   - Dashboard → Plugins
   - "Carousel Layout" doit apparaître dans la liste

## 🛠️ Compilation depuis les sources

```powershell
# Cloner le repository
git clone https://github.com/peterdu1109/Nouveaut-s--Top-10.git
cd Nouveaut-s--Top-10

# Compiler le plugin
dotnet build -c Release

# Le fichier DLL sera dans : bin/Release/net9.0/JellyfinCarouselPlugin.dll
```

## ⚙️ Configuration

1. Ouvrez le **Dashboard Jellyfin**
2. Allez dans **Plugins** → **Carousel Layout**
3. Cliquez sur les **trois points** → **Settings**
4. Configurez selon vos préférences :
   - Activer/désactiver les catégories
   - Activer/désactiver les badges
   - Nombre d'éléments par carrousel
   - Thème et animations

5. **Sauvegardez** et **rechargez** la page web

## 📸 Captures d'écran

_À venir après les tests..._

## 🔧 Dépannage

### Le plugin n'apparaît pas dans la liste

- Vérifiez que le dossier `CarouselLayout` existe dans le répertoire plugins
- Vérifiez les permissions du fichier DLL
- Consultez les logs Jellyfin : Dashboard → Logs

### Les carrousels ne s'affichent pas

- Ouvrez la console du navigateur (F12)
- Vérifiez qu'il n'y a pas d'erreurs JavaScript
- Assurez-vous que le plugin est activé dans la configuration
- Videz le cache du navigateur (Ctrl + F5)

### Erreur "Plugin target ABI mismatch"

- Vérifiez la version de votre serveur Jellyfin (doit être 10.11.x)
- Téléchargez la version compatible du plugin

### Les styles ne s'appliquent pas

- Vérifiez que le fichier `carousel-styles.css` est présent dans `Web/`
- Assurez-vous que le chemin du plugin est correct
- Redémarrez le serveur Jellyfin

## 🌐 Compatibilité

### ✅ Compatible
- Interface web Jellyfin (navigateurs modernes)
- Jellyfin Desktop (basé sur Electron)
- Clients mobiles utilisant webview

### ❌ Non compatible
- Applications natives Android TV
- Applications natives iOS/tvOS
- Clients tiers (Kodi, Plex, etc.)

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amelioration`)
3. Commit vos changements (`git commit -m 'Ajout fonctionnalité'`)
4. Push vers la branche (`git push origin feature/amelioration`)
5. Ouvrir une Pull Request

## 📝 Changelog

### Version 1.0.0 (2026-02-05)

- 🎉 Version initiale
- Affichage en carrousels horizontaux
- Catégories prédéfinies et par genre
- Badges dynamiques
- Thème sombre Netflix-style
- Page de configuration

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🙏 Remerciements

- Équipe Jellyfin pour leur excellent travail sur le serveur média
- Inspiration design : Netflix

## 📧 Support

Pour toute question ou problème :
- Ouvrez une [Issue](https://github.com/peterdu1109/Nouveaut-s--Top-10/issues)
- Consultez la [documentation Jellyfin](https://jellyfin.org/docs/)

---

**Note** : Ce plugin modifie l'interface web Jellyfin côté client. Il n'affecte pas les fonctionnalités du serveur.
