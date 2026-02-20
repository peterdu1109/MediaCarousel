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

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/plugins/JellyfinCarouselPlugin/Web/carousel-styles.css';
        document.head.appendChild(link);

        // First load
        setTimeout(triggerLayout, 800);
        observePageChanges();
    });
})();
