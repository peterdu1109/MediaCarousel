/**
 * Jellyfin Carousel Layout Plugin
 * Transforme l'interface Jellyfin en layout type Netflix avec carrousels
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        itemsPerRow: 6,
        categories: [
            { id: 'continue', name: 'Continuer à regarder', filter: 'IsResumable' },
            { id: 'latest', name: 'Nouveautés', filter: 'Latest' },
            { id: 'top10', name: 'Top 10', filter: 'MostPlayed' },
            { id: 'recommended', name: 'Recommandés pour vous', filter: 'Recommended' }
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

    // Obtenir l'URL de l'image
    function getImageUrl(item, type = 'Primary') {
        if (!item.Id) return '';
        const serverId = ApiClient.serverId();
        return `${ApiClient.getUrl('/Items/' + item.Id + '/Images/' + type)}?maxWidth=500`;
    }

    // Obtenir le badge de qualité
    function getQualityBadge(item) {
        if (item.MediaStreams && item.MediaStreams.length > 0) {
            const videoStream = item.MediaStreams.find(s => s.Type === 'Video');
            if (videoStream) {
                if (videoStream.Width >= 3840) return '<span class="carousel-badge badge-4k">4K</span>';
                if (videoStream.Width >= 1920) return '<span class="carousel-badge badge-hd">HD</span>';
            }
        }
        return '';
    }

    // Vérifier si l'item a de nouveaux épisodes
    function hasNewEpisodes(item) {
        return item.Type === 'Series' && item.UserData && item.UserData.UnplayedItemCount > 0;
    }

    // Créer une carte de média
    function createMediaCard(item) {
        const imageUrl = getImageUrl(item, 'Primary') || getImageUrl(item, 'Backdrop');
        const title = item.Name || 'Sans titre';
        const year = item.ProductionYear || '';
        const qualityBadge = getQualityBadge(item);
        const newEpisodesBadge = hasNewEpisodes(item) ? 
            '<div class="badge-new-episodes">Nouveaux épisodes</div>' : '';

        return `
            <div class="carousel-item" data-id="${item.Id}" data-type="${item.Type}">
                ${newEpisodesBadge}
                <img class="carousel-item-image" src="${imageUrl}" alt="${title}" loading="lazy">
                <div class="carousel-item-overlay">
                    <div class="carousel-item-title">${title}</div>
                    <div class="carousel-item-meta">
                        ${year ? `<span>${year}</span>` : ''}
                        ${qualityBadge}
                    </div>
                </div>
            </div>
        `;
    }

    // Créer un carrousel
    function createCarousel(title, items) {
        const carouselId = 'carousel-' + Math.random().toString(36).substr(2, 9);
        const cardsHtml = items.map(item => createMediaCard(item)).join('');

        return `
            <div class="carousel-category">
                <h2 class="carousel-category-title">${title}</h2>
                <div class="carousel-container" id="${carouselId}">
                    <button class="carousel-nav-button prev" aria-label="Précédent">‹</button>
                    <div class="carousel-wrapper">
                        ${cardsHtml}
                    </div>
                    <button class="carousel-nav-button next" aria-label="Suivant">›</button>
                </div>
            </div>
        `;
    }

    // Ajouter les événements de navigation
    function addNavigationEvents(carouselId) {
        const container = document.getElementById(carouselId);
        if (!container) return;

        const wrapper = container.querySelector('.carousel-wrapper');
        const prevBtn = container.querySelector('.prev');
        const nextBtn = container.querySelector('.next');

        if (prevBtn && wrapper) {
            prevBtn.addEventListener('click', () => {
                wrapper.scrollBy({ left: -wrapper.offsetWidth * 0.8, behavior: 'smooth' });
            });
        }

        if (nextBtn && wrapper) {
            nextBtn.addEventListener('click', () => {
                wrapper.scrollBy({ left: wrapper.offsetWidth * 0.8, behavior: 'smooth' });
            });
        }
    }

    // Ajouter les événements de clic sur les cartes
    function addCardClickEvents() {
        document.querySelectorAll('.carousel-item').forEach(card => {
            card.addEventListener('click', function() {
                const itemId = this.dataset.id;
                const itemType = this.dataset.type;
                if (itemId) {
                    // Naviguer vers la page de détails de l'item
                    Dashboard.navigate('details?id=' + itemId);
                }
            });
        });
    }

    // Charger les items pour une catégorie
    async function loadCategoryItems(category, userId) {
        try {
            const params = {
                UserId: userId,
                Limit: 20,
                Fields: 'PrimaryImageAspectRatio,MediaStreams,UserData',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop',
                IncludeItemTypes: 'Movie,Series'
            };

            // Filtres spécifiques selon la catégorie
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
            }

            const result = await ApiClient.getItems(userId, params);
            return result.Items || [];
        } catch (error) {
            console.error('Erreur lors du chargement de la catégorie:', category.name, error);
            return [];
        }
    }

    // Charger les items par genre
    async function loadGenreItems(genre, userId) {
        try {
            const result = await ApiClient.getItems(userId, {
                UserId: userId,
                Genres: genre,
                Limit: 20,
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

    // Créer le hero (grand bandeau en haut)
    async function createHero(userId) {
        try {
            const result = await ApiClient.getItems(userId, {
                UserId: userId,
                Limit: 1,
                Fields: 'Overview,PrimaryImageAspectRatio',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Backdrop',
                IncludeItemTypes: 'Movie,Series',
                SortBy: 'Random'
            });

            if (result.Items && result.Items.length > 0) {
                const item = result.Items[0];
                const backdropUrl = getImageUrl(item, 'Backdrop');
                const title = item.Name || '';
                const overview = item.Overview || '';

                return `
                    <div class="carousel-hero" style="background-image: url('${backdropUrl}');">
                        <div class="carousel-hero-content">
                            <h1 class="carousel-hero-title">${title}</h1>
                            <p class="carousel-hero-description">${overview.substring(0, 200)}${overview.length > 200 ? '...' : ''}</p>
                            <div class="carousel-hero-buttons">
                                <button class="carousel-hero-button play" onclick="Dashboard.navigate('details?id=${item.Id}')">
                                    ▶ Lecture
                                </button>
                                <button class="carousel-hero-button info" onclick="Dashboard.navigate('details?id=${item.Id}')">
                                    ⓘ Plus d'infos
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Erreur lors de la création du hero:', error);
        }
        return '';
    }

    // Initialiser le layout carrousel
    async function initCarouselLayout() {
        console.log('Initialisation du Carousel Layout Plugin...');

        // Obtenir l'utilisateur actuel
        const userId = ApiClient.getCurrentUserId();
        if (!userId) {
            console.error('Aucun utilisateur connecté');
            return;
        }

        // Trouver le container principal
        const mainContent = document.querySelector('.mainAnimatedPage, #indexPage, .page');
        if (!mainContent) {
            console.log('Container principal non trouvé, retentative...');
            setTimeout(initCarouselLayout, 500);
            return;
        }

        // Créer le container carrousel
        const carouselContainer = document.createElement('div');
        carouselContainer.className = 'carousel-main-container';
        carouselContainer.id = 'jellyfin-carousel-layout';

        // Ajouter le hero
        const heroHtml = await createHero(userId);
        carouselContainer.innerHTML = heroHtml;

        // Charger et ajouter les catégories
        for (const category of CONFIG.categories) {
            const items = await loadCategoryItems(category, userId);
            if (items.length > 0) {
                const carouselHtml = createCarousel(category.name, items);
                carouselContainer.innerHTML += carouselHtml;
            }
        }

        // Charger et ajouter les genres
        for (const genre of CONFIG.genres) {
            const items = await loadGenreItems(genre, userId);
            if (items.length > 0) {
                const carouselHtml = createCarousel(genre, items);
                carouselContainer.innerHTML += carouselHtml;
            }
        }

        // Remplacer le contenu existant
        mainContent.innerHTML = '';
        mainContent.appendChild(carouselContainer);

        // Ajouter les événements de navigation
        document.querySelectorAll('.carousel-container').forEach(container => {
            addNavigationEvents(container.id);
        });

        // Ajouter les événements de clic
        addCardClickEvents();

        console.log('Carousel Layout initialisé avec succès!');
    }

    // Observer les changements de page
    function observePageChanges() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    const pageContainer = document.querySelector('.mainAnimatedPage, #indexPage');
                    if (pageContainer && !document.getElementById('jellyfin-carousel-layout')) {
                        // Vérifier si on est sur la page d'accueil
                        if (window.location.hash === '#/home.html' || 
                            window.location.hash === '' || 
                            window.location.pathname.includes('home.html')) {
                            initCarouselLayout();
                        }
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Point d'entrée principal
    waitForJellyfin(() => {
        console.log('Jellyfin détecté, initialisation du plugin...');
        
        // Injecter les styles
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/plugins/JellyfinCarouselPlugin/Web/carousel-styles.css';
        document.head.appendChild(link);

        // Initialiser sur la page actuelle
        if (window.location.hash === '#/home.html' || 
            window.location.hash === '' || 
            window.location.pathname.includes('home.html')) {
            setTimeout(initCarouselLayout, 1000);
        }

        // Observer les changements de page
        observePageChanges();
    });
})();
