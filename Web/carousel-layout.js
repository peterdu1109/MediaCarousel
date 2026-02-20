/**
 * Jellyfin Carousel Layout Plugin
 * Transforme l'interface Jellyfin en layout type Netflix avec carrousels
 */

(function () {
    'use strict';

    const PLUGIN_ID = "191bd290-1054-4b55-a137-46c72181266b";
    let pluginConfig = null;

    // Configuration par défaut
    const DEFAULT_CONFIG = {
        ItemsPerCarousel: 20,
        ShowContinueWatching: true,
        ShowNewReleases: true,
        ShowTop10: true,
        ShowRecommended: true,
        ShowGenreCategories: true,
        ShowCollections: true,
        ShowNewEpisodesBadge: true,
        ShowQualityBadge: true,
        EnableFavoritesButton: true,
        EnableHoverAnimations: true,
        HeroMode: 'Random', // 'Random', 'Latest', 'Resume'
        HighlightColor: '#00a4dc'
    };

    const CONFIG = {
        categories: [
            { id: 'continue', name: 'Continuer à regarder', filter: 'IsResumable', configKey: 'ShowContinueWatching' },
            { id: 'latest', name: 'Nouveautés', filter: 'Latest', configKey: 'ShowNewReleases' },
            { id: 'top10', name: 'Top 10', filter: 'MostPlayed', configKey: 'ShowTop10' },
            { id: 'recommended', name: 'Recommandés pour vous', filter: 'Recommended', configKey: 'ShowRecommended' },
            { id: 'collections', name: 'Collections', filter: 'BoxSets', configKey: 'ShowCollections' }
        ],
        genres: ['Action', 'Comédie', 'Drame', 'Science-Fiction', 'Animation', 'Horreur']
    };

    // Attendre que Jellyfin soit chargé
    function waitForJellyfin(callback) {
        if (window.ApiClient && window.Dashboard) {
            callback();
        } else {
            setTimeout(() => waitForJellyfin(callback), 100);
        }
    }

    async function ensureConfigLoaded() {
        if (!pluginConfig) {
            try {
                const config = await ApiClient.getPluginConfiguration(PLUGIN_ID);
                pluginConfig = { ...DEFAULT_CONFIG, ...config };
            } catch (e) {
                console.warn('MediaCarousel: Erreur lors du chargement de la configuration, utilisation des valeurs par défaut.', e);
                pluginConfig = DEFAULT_CONFIG;
            }

            // Appliquer la couleur de surbrillance
            if (pluginConfig.HighlightColor) {
                document.documentElement.style.setProperty('--carousel-highlight', pluginConfig.HighlightColor);
            }
        }
        return pluginConfig;
    }

    function getImageUrl(item, type = 'Primary') {
        if (!item.Id) return '';
        return `${ApiClient.getUrl('/Items/' + item.Id + '/Images/' + type)}?maxWidth=500`;
    }

    function getQualityBadge(item) {
        if (!pluginConfig.ShowQualityBadge) return null;
        if (item.MediaStreams && item.MediaStreams.length > 0) {
            const videoStream = item.MediaStreams.find(s => s.Type === 'Video');
            if (videoStream) {
                const span = document.createElement('span');
                span.className = 'carousel-badge';
                if (videoStream.Width >= 3840) {
                    span.classList.add('badge-4k');
                    span.textContent = '4K';
                    return span;
                }
                if (videoStream.Width >= 1920) {
                    span.classList.add('badge-hd');
                    span.textContent = 'HD';
                    return span;
                }
            }
        }
        return null;
    }

    function hasNewEpisodes(item) {
        return pluginConfig.ShowNewEpisodesBadge && item.Type === 'Series' && item.UserData && item.UserData.UnplayedItemCount > 0;
    }

    async function toggleFavorite(e, item, btn) {
        e.stopPropagation(); // Ne pas déclencher le clic sur la carte

        // Prevent concurrent clicks
        if (btn.disabled || btn.classList.contains('is-loading')) return;

        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.style.opacity = '0.5';

        const userId = ApiClient.getCurrentUserId();
        try {
            const isFav = await ApiClient.FavoriteManager.updateFavoriteStatus(userId, item.Id, !item.UserData.IsFavorite);
            item.UserData.IsFavorite = isFav.IsFavorite;
            if (isFav.IsFavorite) {
                btn.classList.add('is-favorite');
                btn.innerHTML = '♥';
            } else {
                btn.classList.remove('is-favorite');
                btn.innerHTML = '♡';
            }
        } catch (error) {
            console.error('Erreur lors du changement de favori:', error);
        } finally {
            btn.disabled = false;
            btn.classList.remove('is-loading');
            btn.style.opacity = '';
        }
    }

    function createMediaCard(item) {
        const card = document.createElement('div');
        card.className = 'carousel-item';
        card.dataset.id = item.Id;
        card.dataset.type = item.Type;

        if (hasNewEpisodes(item)) {
            const newBadge = document.createElement('div');
            newBadge.className = 'badge-new-episodes';
            newBadge.textContent = 'Nouveaux épisodes';
            card.appendChild(newBadge);
        }

        if (pluginConfig.EnableFavoritesButton && item.UserData) {
            const favBtn = document.createElement('button');
            favBtn.className = 'carousel-favorite-btn';
            const isFav = item.UserData.IsFavorite;
            if (isFav) {
                favBtn.classList.add('is-favorite');
                favBtn.innerHTML = '♥';
            } else {
                favBtn.innerHTML = '♡';
            }
            favBtn.title = isFav ? "Retirer des favoris" : "Ajouter aux favoris";
            favBtn.onclick = (e) => toggleFavorite(e, item, favBtn);
            card.appendChild(favBtn);
        }

        const img = document.createElement('img');
        img.className = 'carousel-item-image';
        img.src = getImageUrl(item, 'Primary') || getImageUrl(item, 'Backdrop');
        img.alt = item.Name || 'Sans titre';
        img.loading = 'lazy';
        card.appendChild(img);

        const overlay = document.createElement('div');
        overlay.className = 'carousel-item-overlay';

        const title = document.createElement('div');
        title.className = 'carousel-item-title';
        title.textContent = item.Name || 'Sans titre';
        overlay.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'carousel-item-meta';
        if (item.ProductionYear) {
            const year = document.createElement('span');
            year.textContent = item.ProductionYear;
            meta.appendChild(year);
        }
        const qualityBadge = getQualityBadge(item);
        if (qualityBadge) meta.appendChild(qualityBadge);
        overlay.appendChild(meta);

        card.appendChild(overlay);

        card.addEventListener('click', function () {
            Dashboard.navigate('details?id=' + item.Id);
        });

        return card;
    }

    function createCarouselDOM(title, items) {
        if (!items || items.length === 0) return null;

        const container = document.createElement('div');
        container.className = 'carousel-category';

        const h2 = document.createElement('h2');
        h2.className = 'carousel-category-title';
        h2.textContent = title;
        container.appendChild(h2);

        const carouselWrapper = document.createElement('div');
        carouselWrapper.className = 'carousel-container';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'carousel-nav-button prev';
        prevBtn.setAttribute('aria-label', 'Précédent');
        prevBtn.textContent = '‹';

        const nextBtn = document.createElement('button');
        nextBtn.className = 'carousel-nav-button next';
        nextBtn.setAttribute('aria-label', 'Suivant');
        nextBtn.textContent = '›';

        const wrapper = document.createElement('div');
        wrapper.className = 'carousel-wrapper';

        items.forEach(item => {
            wrapper.appendChild(createMediaCard(item));
        });

        prevBtn.addEventListener('click', () => {
            wrapper.scrollBy({ left: -wrapper.offsetWidth * 0.8, behavior: 'smooth' });
        });

        nextBtn.addEventListener('click', () => {
            wrapper.scrollBy({ left: wrapper.offsetWidth * 0.8, behavior: 'smooth' });
        });

        carouselWrapper.appendChild(prevBtn);
        carouselWrapper.appendChild(wrapper);
        carouselWrapper.appendChild(nextBtn);

        container.appendChild(carouselWrapper);
        return container;
    }

    async function loadCategoryItems(category, userId) {
        try {
            const params = {
                UserId: userId,
                Limit: pluginConfig.ItemsPerCarousel || 20,
                Fields: 'PrimaryImageAspectRatio,MediaStreams,UserData',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop'
            };

            if (category.id === 'collections') {
                params.IncludeItemTypes = 'BoxSet';
            } else {
                params.IncludeItemTypes = 'Movie,Series';
            }

            if (category.id === 'continue') {
                params.Filters = 'IsResumable';
                params.SortBy = 'DatePlayed';
                params.SortOrder = 'Descending';
            } else if (category.id === 'latest') {
                params.SortBy = 'DateCreated';
                params.SortOrder = 'Descending';
            } else if (category.id === 'top10') {
                params.SortBy = 'PlayCount';
                params.SortOrder = 'Descending';
                params.Limit = 10;
            } else if (category.id === 'collections') {
                params.SortBy = 'SortName';
                params.SortOrder = 'Ascending';
            }

            const result = await ApiClient.getItems(userId, params);
            return result.Items || [];
        } catch (error) {
            console.error('Erreur lors du chargement de la catégorie:', category.name, error);
            return [];
        }
    }

    async function loadGenreItems(genre, userId) {
        try {
            const result = await ApiClient.getItems(userId, {
                UserId: userId,
                Genres: genre,
                Limit: pluginConfig.ItemsPerCarousel || 20,
                Fields: 'PrimaryImageAspectRatio,MediaStreams,UserData',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop',
                IncludeItemTypes: 'Movie,Series',
                SortBy: 'DateCreated',
                SortOrder: 'Descending'
            });
            return result.Items || [];
        } catch (error) {
            console.error('Erreur lors du chargement du genre:', genre, error);
            return [];
        }
    }

    async function createHero(userId) {
        try {
            const params = {
                UserId: userId,
                Limit: 1,
                Fields: 'Overview,PrimaryImageAspectRatio',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Backdrop',
                IncludeItemTypes: 'Movie,Series'
            };

            if (pluginConfig.HeroMode === 'Latest') {
                params.SortBy = 'DateCreated';
                params.SortOrder = 'Descending';
            } else if (pluginConfig.HeroMode === 'Resume') {
                params.Filters = 'IsResumable';
                params.SortBy = 'DatePlayed';
                params.SortOrder = 'Descending';
            } else {
                // Random
                params.SortBy = 'Random';
            }

            const result = await ApiClient.getItems(userId, params);

            if (result.Items && result.Items.length > 0) {
                const item = result.Items[0];
                const backdropUrl = getImageUrl(item, 'Backdrop');
                const title = item.Name || '';
                const overview = item.Overview || '';

                const hero = document.createElement('div');
                hero.className = 'carousel-hero';
                hero.style.backgroundImage = `url('${backdropUrl}')`;

                const content = document.createElement('div');
                content.className = 'carousel-hero-content';

                const h1 = document.createElement('h1');
                h1.className = 'carousel-hero-title';
                h1.textContent = title;
                content.appendChild(h1);

                const p = document.createElement('p');
                p.className = 'carousel-hero-description';
                p.textContent = overview.length > 200 ? overview.substring(0, 200) + '...' : overview;
                content.appendChild(p);

                const buttons = document.createElement('div');
                buttons.className = 'carousel-hero-buttons';

                const playBtn = document.createElement('button');
                playBtn.className = 'carousel-hero-button play';
                playBtn.textContent = '▶ Lecture';
                playBtn.onclick = () => Dashboard.navigate('details?id=' + item.Id);
                buttons.appendChild(playBtn);

                const infoBtn = document.createElement('button');
                infoBtn.className = 'carousel-hero-button info';
                infoBtn.textContent = 'ⓘ Plus d\'infos';
                infoBtn.onclick = () => Dashboard.navigate('details?id=' + item.Id);
                buttons.appendChild(infoBtn);

                content.appendChild(buttons);
                hero.appendChild(content);

                return hero;
            }
        } catch (error) {
            console.error('Erreur lors de la création du hero:', error);
        }
        return null;
    }

    async function initCarouselLayout() {
        console.log('Initialisation du Carousel Layout Plugin avec conf:', pluginConfig);

        if (pluginConfig && pluginConfig.EnableCarouselLayout === false) {
            console.log('Carousel Layout est désactivé dans la configuration.');
            return;
        }

        const userId = ApiClient.getCurrentUserId();
        if (!userId) {
            console.error('Aucun utilisateur connecté');
            return;
        }

        const mainContent = document.querySelector('.homePage') || document.querySelector('#indexPage .scrollSlider') || document.querySelector('#indexPage');
        if (!mainContent) {
            console.log('Container principal non trouvé, retentative...');
            setTimeout(initCarouselLayout, 500);
            return;
        }

        const carouselContainer = document.createElement('div');
        carouselContainer.className = 'carousel-main-container';
        carouselContainer.id = 'jellyfin-carousel-layout';

        // Add hero
        const heroDOM = await createHero(userId);
        if (heroDOM) carouselContainer.appendChild(heroDOM);

        // Add main categories synchronously for immediate display
        for (const category of CONFIG.categories) {
            if (pluginConfig[category.configKey] !== false) { // Default true if undefined
                const items = await loadCategoryItems(category, userId);
                const carousel = createCarouselDOM(category.name, items);
                if (carousel) carouselContainer.appendChild(carousel);
            }
        }

        // Add a container for genres that will be lazy-loaded
        const genresContainer = document.createElement('div');
        genresContainer.id = 'carousel-genres-lazy';
        carouselContainer.appendChild(genresContainer);

        // Set layout in UI (Prepend inside the home scroll container)
        const existingContainer = document.getElementById('jellyfin-carousel-layout');
        if (existingContainer) {
            existingContainer.remove(); // Remove old one if any
        }
        mainContent.insertBefore(carouselContainer, mainContent.firstChild);
        document.body.classList.add('media-carousel-active');

        // Setup Intersection Observer for Lazy Loading Genres
        if (pluginConfig.ShowGenreCategories !== false) {
            setupLazyGenres(userId, genresContainer);
        }

        console.log('Carousel Layout initialisé avec succès!');
    }

    function setupLazyGenres(userId, container) {
        let genresLoaded = false;
        const observer = new IntersectionObserver(async (entries, obs) => {
            if (entries[0].isIntersecting && !genresLoaded) {
                genresLoaded = true;
                obs.disconnect(); // Stop observing once loaded

                for (const genre of CONFIG.genres) {
                    const items = await loadGenreItems(genre, userId);
                    const carousel = createCarouselDOM(genre, items);
                    if (carousel) container.appendChild(carousel);
                }
            }
        }, { rootMargin: '200px' }); // Load a bit before it enters the screen

        observer.observe(container);
    }

    function isCurrentPageHome() {
        return window.location.hash === '#/home.html' ||
            window.location.hash === '' ||
            window.location.pathname.includes('home.html');
    }

    function triggerLayout() {
        if (!isCurrentPageHome()) {
            document.body.classList.remove('media-carousel-active');
            return;
        }

        ensureConfigLoaded().then(() => {
            if (!document.getElementById('jellyfin-carousel-layout')) {
                // Ensure page container is available before injecting
                if (document.querySelector('.homePage') || document.querySelector('#indexPage')) {
                    initCarouselLayout();
                } else {
                    // Retry slightly after
                    setTimeout(initCarouselLayout, 300);
                }
            } else {
                // Already exists, just ensure active class is there
                document.body.classList.add('media-carousel-active');
            }
        });
    }

    function observePageChanges() {
        // Method 1: Jellyfin native routing events (Emby Router)
        document.addEventListener('viewshow', function (e) {
            const view = e.detail ? e.detail.view : e.target;
            if (view && (view.id === 'indexPage' || view.classList.contains('homePage'))) {
                setTimeout(triggerLayout, 100);
            } else {
                document.body.classList.remove('media-carousel-active');
            }
        });

        // Method 2: MutationObserver Fallback for dynamic navigation
        let initTimeout = null;
        const observer = new MutationObserver((mutations) => {
            if (isCurrentPageHome()) {
                if (!document.getElementById('jellyfin-carousel-layout') && document.querySelector('#indexPage')) {
                    if (initTimeout) clearTimeout(initTimeout);
                    initTimeout = setTimeout(triggerLayout, 500);
                }
            } else {
                document.body.classList.remove('media-carousel-active');
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    waitForJellyfin(() => {
        console.log('Jellyfin détecté, initialisation du plugin Carousel...');

        const style = document.createElement('style');
        style.textContent = `
/* Carousel Layout Plugin - Styles Netflix-like */
/* Thème sombre avec carrousels horizontaux */

:root {
    /* Utilisation des variables natives Jellyfin */
    --carousel-bg: transparent;
    --carousel-text: var(--theme-text);
    --carousel-hover: var(--theme-text);
    --carousel-card-bg: var(--theme-background-secondary, #202020);
    --carousel-highlight: var(--theme-primary, #00a4dc);
    --carousel-shadow: rgba(0, 0, 0, 0.7);
    --carousel-transition: all 0.3s ease;
}

/* Container principal */
.carousel-main-container {
    background-color: transparent;
    color: var(--theme-text);
    padding: 20px 4%;
    min-height: 100vh;
}

/* En-tête de catégorie */
.carousel-category {
    margin-bottom: 3rem;
}

.carousel-category-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--theme-text);
    margin-bottom: 1rem;
    padding-left: 4%;
}

/* Container du carrousel */
.carousel-container {
    position: relative;
    overflow: hidden;
}

/* Wrapper scrollable */
.carousel-wrapper {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    padding: 1rem 4%;
    scrollbar-width: none;
    /* Firefox */
    -ms-overflow-style: none;
    /* IE/Edge */
}

.carousel-wrapper::-webkit-scrollbar {
    display: none;
    /* Chrome/Safari */
}

/* Carte de média */
.carousel-item {
    position: relative;
    min-width: 250px;
    max-width: 250px;
    height: 140px;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    transition: var(--carousel-transition);
    background-color: var(--carousel-card-bg);
}

.carousel-item:hover {
    transform: scale(1.05);
    z-index: 10;
    box-shadow: 0 8px 24px var(--carousel-shadow);
}

/* Image de la carte */
.carousel-item-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: var(--carousel-transition);
}

.carousel-item:hover .carousel-item-image {
    filter: brightness(0.7);
}

/* Overlay avec informations */
.carousel-item-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, transparent 100%);
    padding: 1rem;
    transform: translateY(100%);
    transition: var(--carousel-transition);
}

.carousel-item:hover .carousel-item-overlay {
    transform: translateY(0);
}

/* Titre du média */
.carousel-item-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
    margin-bottom: 0.5rem;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
}

/* Métadonnées */
.carousel-item-meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.85rem;
    color: var(--theme-text-secondary, #b3b3b3);
}

/* Badges */
.carousel-badge {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
}

.badge-new {
    background-color: var(--carousel-highlight);
    color: #fff;
}

.badge-4k {
    background-color: #46d369;
    color: white;
}

.badge-hd {
    background-color: #0080ff;
    color: white;
}

/* Badge "NOUVEAUX ÉPISODES" */
.badge-new-episodes {
    position: absolute;
    top: 10px;
    left: 10px;
    background-color: var(--carousel-highlight);
    color: white;
    padding: 0.3rem 0.6rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 700;
    z-index: 2;
    text-transform: uppercase;
}

/* Bouton Favori */
.carousel-favorite-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
    opacity: 0;
    transition: var(--carousel-transition);
    font-size: 1.2rem;
}

.carousel-item:hover .carousel-favorite-btn {
    opacity: 1;
}

.carousel-favorite-btn:hover {
    background: rgba(0, 0, 0, 0.9);
    color: var(--carousel-highlight);
    transform: scale(1.1);
}

.carousel-favorite-btn.is-favorite {
    color: var(--carousel-highlight);
    opacity: 1;
}

/* Boutons de navigation */
.carousel-nav-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    border: none;
    width: 50px;
    height: 140px;
    cursor: pointer;
    z-index: 5;
    opacity: 0;
    transition: opacity 0.3s ease;
    font-size: 2rem;
}

.carousel-container:hover .carousel-nav-button {
    opacity: 1;
}

.carousel-nav-button:hover {
    background-color: rgba(0, 0, 0, 0.95);
}

.carousel-nav-button.prev {
    left: 0;
}

.carousel-nav-button.next {
    right: 0;
}

/* Hero section (premier élément en grand) */
.carousel-hero {
    height: 56.25vw;
    max-height: 600px;
    position: relative;
    margin-bottom: 2rem;
    background-size: cover;
    background-position: center;
}

.carousel-hero-content {
    position: absolute;
    bottom: 35%;
    left: 4%;
    width: 36%;
    z-index: 2;
}

.carousel-hero-title {
    font-size: 3rem;
    font-weight: 700;
    margin-bottom: 1rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9);
}

.carousel-hero-description {
    font-size: 1.2rem;
    line-height: 1.4;
    margin-bottom: 1.5rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9);
}

.carousel-hero-buttons {
    display: flex;
    gap: 1rem;
}

.carousel-hero-button {
    padding: 0.75rem 2rem;
    font-size: 1.2rem;
    font-weight: 600;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: var(--carousel-transition);
}

.carousel-hero-button.play {
    background-color: white;
    color: black;
}

.carousel-hero-button.play:hover {
    background-color: rgba(255, 255, 255, 0.8);
}

.carousel-hero-button.info {
    background-color: rgba(109, 109, 110, 0.7);
    color: white;
}

.carousel-hero-button.info:hover {
    background-color: rgba(109, 109, 110, 0.4);
}

/* Gradient overlay pour hero */
.carousel-hero::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 14.7vw;
    background: linear-gradient(to top, var(--theme-background, #141414) 0%, transparent 100%);
}

/* Responsive design */
@media (max-width: 1400px) {
    .carousel-item {
        min-width: 200px;
        max-width: 200px;
        height: 112px;
    }
}

@media (max-width: 800px) {
    .carousel-item {
        min-width: 150px;
        max-width: 150px;
        height: 84px;
    }

    .carousel-category-title {
        font-size: 1.2rem;
    }

    .carousel-hero-content {
        width: 50%;
    }

    .carousel-hero-title {
        font-size: 2rem;
    }

    .carousel-hero-description {
        font-size: 1rem;
    }
}

@media (max-width: 500px) {
    .carousel-item {
        min-width: 120px;
        max-width: 120px;
        height: 67px;
    }

    .carousel-hero-content {
        width: 80%;
    }

    .carousel-hero-title {
        font-size: 1.5rem;
    }
}

/* =========================================================================
   COMPATIBILITÉ ET MASQUAGE DES SECTIONS NATIVES/ENHANCED
   ========================================================================= */

/* Masquer les sections natives et plugin Enhanced quand notre plugin est actif */
body.media-carousel-active .homePage .sections,
body.media-carousel-active .homePage .verticalSection,
body.media-carousel-active .homePage .hss-section,
body.media-carousel-active .homePage .section0,
body.media-carousel-active .homePage .section1,
body.media-carousel-active .homePage .section2,
body.media-carousel-active .homePage .section3,
body.media-carousel-active .homePage .section4,
body.media-carousel-active .homePage .section5,
body.media-carousel-active .homePage .section6,
body.media-carousel-active .homePage .section7,
body.media-carousel-active .homePage .section8,
body.media-carousel-active .homePage .section9,
body.media-carousel-active .homePage .homePageSection {
    display: none !important;
}

/* Cache tout le reste de l'accueil pour forcer l'exclusivité du carrousel */
body.media-carousel-active .homePage>div:not(#jellyfin-carousel-layout),
body.media-carousel-active #indexPage>div:not(#jellyfin-carousel-layout) {
    display: none !important;
}
`;
        document.head.appendChild(style);

        // First load
        setTimeout(triggerLayout, 800);
        observePageChanges();
    });
})();
