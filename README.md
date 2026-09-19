<h1 align="center">Media Carousel — Jellyfin 12</h1>

<p align="center">
  <b>This branch builds Media Carousel for Jellyfin 12.</b><br>
  <i>Cette branche compile Media Carousel pour Jellyfin 12.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Jellyfin-12.x-blueviolet" alt="Jellyfin">
  <img src="https://img.shields.io/badge/.NET-10.0-purple" alt=".NET">
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpeterdu1109%2FMediaCarousel%2Frefs%2Fheads%2Fjellyfin-12%2Frepository-12.json&query=%24%5B0%5D.versions%5B0%5D.version&label=version&color=blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

Same plugin, same features as the Jellyfin 10.11 build — a separate branch only because one binary cannot target both versions at once.

*Même plugin, mêmes fonctionnalités que la version Jellyfin 10.11 — une branche séparée uniquement parce qu'un même binaire ne peut pas viser les deux à la fois.*

## Repository / Dépôt

Add this in **Dashboard → Plugins → Repositories**, then install **Media Carousel (Jellyfin 12)** from the catalog.

*À ajouter dans **Tableau de bord → Extensions → Dépôts**, puis installez **Media Carousel (Jellyfin 12)** depuis le catalogue.*

```
https://raw.githubusercontent.com/peterdu1109/MediaCarousel/refs/heads/jellyfin-12/repository-12.json
```

> [!WARNING]
> **Do not use the main repository on Jellyfin 12.** Its 3.x builds install, show as *Active*, then fail on every row: Jellyfin 12 changed a method they call.
>
> ***N'utilisez pas le dépôt principal sur Jellyfin 12.** Ses versions 3.x s'installent, apparaissent « Actives », puis échouent sur chaque rangée : Jellyfin 12 a modifié une méthode qu'elles appellent.*

## 📖 Documentation

Everything else — features, rows, configuration, troubleshooting — is in the main README. It is kept in one place on purpose: this page once carried a copy of it, and that copy pointed Jellyfin 12 servers at the wrong repository.

*Tout le reste — fonctionnalités, rangées, configuration, dépannage — se trouve dans le README principal. Il est maintenu à un seul endroit délibérément : cette page en portait une copie, et cette copie envoyait les serveurs Jellyfin 12 vers le mauvais dépôt.*

**→ [github.com/peterdu1109/MediaCarousel](https://github.com/peterdu1109/MediaCarousel#readme)**
