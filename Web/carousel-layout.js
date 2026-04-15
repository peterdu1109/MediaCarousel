/**
 * Jellyfin Carousel Layout Plugin
 * Transforme l'interface Jellyfin en layout type Netflix avec carrousels
 */

(function () {
    'use strict';

    const PLUGIN_ID = "191bd290-1054-4b55-a137-46c72181266b";
    let pluginConfig = null;

    // Tentative de chargement synchrone du cache pour éviter le "Flash" (FOUC)
    try {
        const cached = localStorage.getItem('MediaCarousel_Config');
        if (cached) pluginConfig = JSON.parse(cached);
    } catch(e) {}

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
        HideNativeHome: false,
        IncludedLibraries: [],
        EnableFavoritesButton: true,
        EnableHoverAnimations: true,
        HeroMode: 'Random',
        HighlightColor: '#00a4dc',
        EnableGroqAi: false,
        GroqApiKey: '',
        GroqModel: 'llama3-8b-8192',
        SectionOrder: 'hero,continue,latest,top10,recommended,genres,collections',
        CardStyle: 'poster',
        MinGenreItems: 3,
        MaxGenres: 12,
        CustomSectionsJson: '[]'
    };

    const CONFIG = {
        categories: [
            { id: 'continue', name: 'Continuer à regarder', filter: 'IsResumable', configKey: 'ShowContinueWatching' },
            { id: 'latest', name: 'Nouveautés', filter: 'Latest', configKey: 'ShowNewReleases' },
            { id: 'top10', name: 'Top 10', filter: 'MostPlayed', configKey: 'ShowTop10' },
            { id: 'recommended', name: 'Recommandés pour vous', filter: 'Recommended', configKey: 'ShowRecommended' },
            { id: 'collections', name: 'Collections', filter: 'BoxSets', configKey: 'ShowCollections' }
        ],
        genres: []
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
        try {
            const config = await ApiClient.getPluginConfiguration(PLUGIN_ID);
            pluginConfig = { ...DEFAULT_CONFIG, ...config };
            localStorage.setItem('MediaCarousel_Config', JSON.stringify(pluginConfig)); // Cache pour la prochaine fois
        } catch (e) {
            console.warn('MediaCarousel: Erreur lors du chargement de la configuration, utilisation du cache ou defaults.', e);
            if (!pluginConfig) pluginConfig = DEFAULT_CONFIG;
        }

        // Appliquer la couleur de surbrillance
        if (pluginConfig.HighlightColor) {
            document.documentElement.style.setProperty('--carousel-highlight', pluginConfig.HighlightColor);
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

    function createMediaCard(item, opts) {
        opts = opts || {};
        const isLandscape = pluginConfig.CardStyle === 'landscape';
        const card = document.createElement('div');
        card.className = isLandscape ? 'carousel-item carousel-item-landscape' : 'carousel-item';
        card.dataset.id = item.Id;
        card.dataset.type = item.Type;

        // Numéro de rang Top 10 (style Netflix : gros chiffre en filigrane)
        if (opts.rank) {
            const rank = document.createElement('span');
            rank.className = 'carousel-rank';
            rank.textContent = opts.rank;
            card.appendChild(rank);
            card.classList.add('carousel-item-ranked');
        }

        if (hasNewEpisodes(item)) {
            const newBadge = document.createElement('div');
            newBadge.className = 'badge-new-episodes';
            newBadge.textContent = 'Nouveaux épisodes';
            card.appendChild(newBadge);
        }

        // Barre de progression pour items resumables / partiellement vus
        const pct = item.UserData && item.UserData.PlayedPercentage;
        if (pct && pct > 1 && pct < 100) {
            const bar = document.createElement('div');
            bar.className = 'carousel-progress';
            const fill = document.createElement('div');
            fill.className = 'carousel-progress-fill';
            fill.style.width = Math.min(100, pct) + '%';
            bar.appendChild(fill);
            card.appendChild(bar);
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
        // Landscape uses Backdrop, poster uses Primary
        img.src = isLandscape
            ? (getImageUrl(item, 'Backdrop') || getImageUrl(item, 'Primary'))
            : (getImageUrl(item, 'Primary') || getImageUrl(item, 'Backdrop'));
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

    function createCarouselDOM(title, items, carouselId = null, opts = {}) {
        if (!items || items.length === 0) return null;

        // Utilise .verticalSection de Jellyfin pour s'intégrer nativement dans le layout
        const container = document.createElement('div');
        container.className = 'verticalSection carousel-section';
        if (carouselId) container.dataset.carouselId = carouselId;
        if (opts.ranked) container.classList.add('carousel-section-ranked');

        // .sectionTitle : classe native Jellyfin pour la typographie des sections
        const h2 = document.createElement('h2');
        h2.className = 'sectionTitle';
        h2.textContent = title;
        container.appendChild(h2);

        const carouselWrapper = document.createElement('div');
        carouselWrapper.className = 'carousel-container';

        const chevron = (dir) => '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
            '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="' +
            (dir === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6') + '"/></svg>';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'carousel-nav-button prev';
        prevBtn.setAttribute('aria-label', 'Précédent');
        prevBtn.innerHTML = chevron('prev');

        const nextBtn = document.createElement('button');
        nextBtn.className = 'carousel-nav-button next';
        nextBtn.setAttribute('aria-label', 'Suivant');
        nextBtn.innerHTML = chevron('next');

        const wrapper = document.createElement('div');
        wrapper.className = 'carousel-wrapper';

        items.forEach((item, idx) => {
            const cardOpts = opts.ranked ? { rank: idx + 1 } : {};
            wrapper.appendChild(createMediaCard(item, cardOpts));
        });

        prevBtn.addEventListener('click', () => {
            wrapper.scrollBy({ left: -wrapper.offsetWidth * 0.8, behavior: 'smooth' });
        });

        nextBtn.addEventListener('click', () => {
            wrapper.scrollBy({ left: wrapper.offsetWidth * 0.8, behavior: 'smooth' });
        });

        // Support tactile : glisser horizontalement pour naviguer
        let touchStartX = 0;
        let touchStartScrollLeft = 0;
        let isDragging = false;

        wrapper.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartScrollLeft = wrapper.scrollLeft;
            isDragging = false;
        }, { passive: true });

        wrapper.addEventListener('touchmove', (e) => {
            const dx = touchStartX - e.touches[0].clientX;
            if (Math.abs(dx) > 5) isDragging = true;
            wrapper.scrollLeft = touchStartScrollLeft + dx;
        }, { passive: true });

        wrapper.addEventListener('touchend', (e) => {
            if (isDragging) {
                e.preventDefault();
            }
        });

        carouselWrapper.appendChild(prevBtn);
        carouselWrapper.appendChild(wrapper);
        carouselWrapper.appendChild(nextBtn);

        container.appendChild(carouselWrapper);
        return container;
    }

    async function loadCustomSectionItems(configData, userId) {
        let params = {
            SortBy: 'DateCreated',
            SortOrder: 'Descending',
            IncludeItemTypes: 'Movie,Series',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ProductionYear,UserData',
            Limit: pluginConfig.ItemsPerCarousel,
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop,Banner,Thumb'
        };

        if (pluginConfig.IncludedLibraries && pluginConfig.IncludedLibraries.length > 0) {
            params.ParentId = pluginConfig.IncludedLibraries.join(',');
        }

        if (configData.type === 'Tags') params.Tags = configData.value;
        if (configData.type === 'Genres') params.Genres = configData.value;
        if (configData.type === 'Studios') params.Studios = configData.value;
        if (configData.type === 'SearchTerm') params.SearchTerm = configData.value;

        try {
            const data = await ApiClient.getJSON(ApiClient.getUrl('Users/' + userId + '/Items', params));
            return data.Items || [];
        } catch (e) {
            console.error('[MediaCarousel] Erreur loadCustomSectionItems:', e);
            return [];
        }
    }

    async function loadCategoryItems(category, userId) {
        try {
            // Cas spéciaux — API dédiées Jellyfin
            if (category.id === 'continue') {
                return await loadContinueWatching(userId);
            }
            if (category.id === 'recommended') {
                return await loadRecommended(userId);
            }

            const params = {
                UserId: userId,
                Recursive: true,
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

            if (category.id === 'latest') {
                params.SortBy = 'DateCreated';
                params.SortOrder = 'Descending';
                params.Filters = 'IsUnplayed';
            } else if (category.id === 'top10') {
                // Top 10 perso : items vraiment regardés par l'utilisateur
                params.Filters = 'IsPlayed';
                params.SortBy = 'PlayCount,DatePlayed';
                params.SortOrder = 'Descending';
                params.Limit = 10;
                const personal = await fetchItemsSafely(userId, params);
                if (personal && personal.length >= 3) return personal;
                // Fallback : items les plus lus globalement
                delete params.Filters;
                return await fetchItemsSafely(userId, params);
            } else if (category.id === 'collections') {
                params.SortBy = 'SortName';
                params.SortOrder = 'Ascending';
            }

            return await fetchItemsSafely(userId, params);
        } catch (error) {
            console.error('Erreur lors du chargement de la catégorie:', category.name, error);
            return [];
        }
    }

    // "À suivre" façon Jellyfin natif : prochains épisodes non vus + films/séries resumables
    async function loadContinueWatching(userId) {
        const limit = pluginConfig.ItemsPerCarousel || 20;
        const libs = pluginConfig.IncludedLibraries || [];
        const parentIds = libs.length > 0 ? libs : [null];

        const tasks = [];
        // NextUp — prochains épisodes par série
        parentIds.forEach(pid => {
            const p = {
                UserId: userId,
                Limit: limit,
                Fields: 'PrimaryImageAspectRatio,MediaStreams,UserData',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop,Thumb'
            };
            if (pid) p.ParentId = pid;
            tasks.push(ApiClient.getJSON(ApiClient.getUrl('Shows/NextUp', p))
                .then(r => (r && r.Items) ? r.Items : [])
                .catch(() => []));
        });
        // Resumable films (reprise en cours)
        parentIds.forEach(pid => {
            const p = {
                Recursive: true,
                Filters: 'IsResumable',
                IncludeItemTypes: 'Movie',
                SortBy: 'DatePlayed',
                SortOrder: 'Descending',
                Limit: limit,
                Fields: 'PrimaryImageAspectRatio,MediaStreams,UserData',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop'
            };
            if (pid) p.ParentId = pid;
            tasks.push(ApiClient.getItems(userId, p)
                .then(r => (r && r.Items) ? r.Items : [])
                .catch(() => []));
        });

        const results = await Promise.all(tasks);
        const merged = [].concat(...results);
        // Dédupe par Id
        const seen = new Set();
        const unique = merged.filter(it => {
            if (!it || !it.Id || seen.has(it.Id)) return false;
            seen.add(it.Id);
            return true;
        });
        // Tri par date lue desc (fallback sur DateCreated)
        unique.sort((a, b) => {
            const da = new Date(a.UserData?.LastPlayedDate || a.DateCreated || 0);
            const db = new Date(b.UserData?.LastPlayedDate || b.DateCreated || 0);
            return db - da;
        });
        return unique.slice(0, limit);
    }

    // Recommandations — API dédiée Jellyfin, fallback sur favoris/random
    async function loadRecommended(userId) {
        const limit = pluginConfig.ItemsPerCarousel || 20;
        try {
            const url = ApiClient.getUrl('Movies/Recommendations', {
                UserId: userId,
                ItemLimit: 8,
                CategoryLimit: 6,
                Fields: 'PrimaryImageAspectRatio,MediaStreams,UserData',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop'
            });
            const data = await ApiClient.getJSON(url);
            const cats = Array.isArray(data) ? data : (data?.Items || []);
            const merged = [];
            const seen = new Set();
            cats.forEach(cat => {
                (cat.Items || []).forEach(it => {
                    if (it && it.Id && !seen.has(it.Id)) {
                        seen.add(it.Id);
                        merged.push(it);
                    }
                });
            });
            if (merged.length > 0) return merged.slice(0, limit);
        } catch (e) {
            console.warn('[MediaCarousel] Movies/Recommendations indisponible, fallback', e);
        }
        // Fallback : favoris + random
        return await fetchItemsSafely(userId, {
            UserId: userId,
            Recursive: true,
            IncludeItemTypes: 'Movie,Series',
            Filters: 'IsFavorite',
            SortBy: 'Random',
            Limit: limit,
            Fields: 'PrimaryImageAspectRatio,MediaStreams,UserData',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop'
        });
    }

    async function loadGenreItems(genre, userId) {
        try {
            return await fetchItemsSafely(userId, {
                Recursive: true,
                Genres: genre,
                Limit: pluginConfig.ItemsPerCarousel || 20,
                Fields: 'PrimaryImageAspectRatio,MediaStreams,UserData',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop',
                IncludeItemTypes: 'Movie,Series',
                SortBy: 'DateCreated',
                SortOrder: 'Descending'
            });
        } catch (error) {
            console.error('Erreur lors du chargement du genre:', genre, error);
            return [];
        }
    }

    async function fetchItemsSafely(userId, baseParams) {
        if (!pluginConfig.IncludedLibraries || pluginConfig.IncludedLibraries.length === 0) {
            const res = await ApiClient.getItems(userId, baseParams);
            return (res && res.Items) ? res.Items : [];
        }

        let allItems = [];
        const promises = pluginConfig.IncludedLibraries.map(async (libId) => {
            const params = { ...baseParams, ParentId: libId };
            const res = await ApiClient.getItems(userId, params);
            return (res && res.Items) ? res.Items : [];
        });
        
        const results = await Promise.all(promises);
        results.forEach(items => allItems.push(...items));
        
        if (baseParams.SortBy === 'DateCreated') {
            allItems.sort((a, b) => (new Date(b.DateCreated) - new Date(a.DateCreated)));
        } else if (baseParams.SortBy === 'Random') {
            allItems.sort(() => 0.5 - Math.random());
        }

        if (baseParams.Limit) {
            allItems = allItems.slice(0, baseParams.Limit);
        }

        return allItems;
    }

    async function loadAiRecommendations(userId) {
        if (!pluginConfig.EnableGroqAi || !pluginConfig.GroqApiKey) return null;
        try {
            const recent = await ApiClient.getItems(userId, {
                Recursive: true,
                SortBy: 'DatePlayed', SortOrder: 'Descending',
                Filters: 'IsPlayed', Limit: 10,
                Fields: 'Genres', IncludeItemTypes: 'Movie,Series'
            });
            const history = (recent.Items || []).map(i =>
                `${i.Name} (${(i.Genres || []).slice(0, 2).join('/')})`
            );
            if (history.length === 0) return null;

            const prompt = `L'utilisateur a regardé récemment : ${history.join(', ')}. ` +
                `Genres disponibles dans la bibliothèque : ${CONFIG.genres.join(', ')}. ` +
                `Recommande exactement 3 genres à mettre en avant et écris un message d'accueil court et chaleureux (max 60 mots, tutoie l'utilisateur, en français). ` +
                `Réponds UNIQUEMENT en JSON valide sans markdown : {"genres":["g1","g2","g3"],"message":"..."}`;

            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${pluginConfig.GroqApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: pluginConfig.GroqModel || 'llama3-8b-8192',
                    messages: [
                        { role: 'system', content: 'Tu es un assistant de recommandation de films et séries. Réponds toujours en JSON valide, sans balises markdown.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 200,
                    temperature: 0.7
                })
            });

            if (!resp.ok) { console.warn('MediaCarousel: Groq API error', resp.status); return null; }
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content?.trim() || '{}';
            // Extraire JSON même si du texte entoure la réponse
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.warn('MediaCarousel: Groq indisponible', e);
            return null;
        }
    }

    function createAiBanner(message) {
        const banner = document.createElement('div');
        banner.className = 'carousel-ai-banner';
        banner.innerHTML = `<span class="carousel-ai-icon">🤖</span><span class="carousel-ai-text">${message}</span>`;
        return banner;
    }

    async function createHero(userId) {
        if (pluginConfig.HeroMode === 'None') return null;

        try {
            const params = {
                UserId: userId,
                Recursive: true,
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

            const items = await fetchItemsSafely(userId, params);

            if (items && items.length > 0) {
                const item = items[0];
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

    // Compteur de tentatives pour initCarouselLayout
    let _initRetryCount = 0;
    const MAX_INIT_RETRIES = 8;

    // Trouver le container de la page d'accueil avec de nombreux fallbacks
    function findHomeContainer() {
        // Sélecteurs dans l'ordre de priorité — couvre Jellyfin 10.10.x à 10.11.x
        const selectors = [
            '.homePage',
            '#indexPage .scrollSlider',
            '#indexPage .itemsContainer',
            '#indexPage .padded-left.padded-right',
            '#indexPage .sections',
            '#indexPage',
            '#homeTab',
            '[data-type="home"]',
            '.mainAnimatedPages .page:not(.hide)',
            '.view:not(.hide) .sections',
            '.view:not(.hide) .verticalSection',
            '.view:not(.hide)',
            '.mainAnimatedPages > div:not(.hide)',
            '#skinBody .page:not(.hide)'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                console.log('[MediaCarousel] Container trouvé via:', sel);
                return el;
            }
        }
        return null;
    }

    async function initCarouselLayout() {
        console.log('[MediaCarousel] initCarouselLayout() démarré (tentative ' + (_initRetryCount + 1) + '/' + MAX_INIT_RETRIES + ')');

        if (pluginConfig && pluginConfig.EnableCarouselLayout === false) {
            console.log('[MediaCarousel] Désactivé dans la configuration.');
            return;
        }

        const userId = ApiClient.getCurrentUserId();
        if (!userId) {
            console.warn('[MediaCarousel] Aucun utilisateur connecté, nouvelle tentative...');
            if (_initRetryCount < MAX_INIT_RETRIES) {
                _initRetryCount++;
                setTimeout(initCarouselLayout, 1000);
            }
            return;
        }

        // Vérifier qu'on est bien sur la page d'accueil
        const homeContainer = findHomeContainer();

        if (!homeContainer) {
            _initRetryCount++;
            if (_initRetryCount <= MAX_INIT_RETRIES) {
                const delay = Math.min(500 * _initRetryCount, 3000);
                console.log('[MediaCarousel] Container non trouvé, tentative ' + _initRetryCount + '/' + MAX_INIT_RETRIES + ' dans ' + delay + 'ms...');
                console.log('[MediaCarousel] DOM actuel — body classes:', document.body.className);
                console.log('[MediaCarousel] DOM actuel — éléments principaux:', [
                    '#indexPage', '.homePage', '#homeTab', '[data-type="home"]',
                    '.mainAnimatedPages', '.view:not(.hide)', '.page:not(.hide)'
                ].map(s => s + ':' + !!document.querySelector(s)).join(', '));
                setTimeout(initCarouselLayout, delay);
            } else {
                console.error('[MediaCarousel] Container introuvable après ' + MAX_INIT_RETRIES + ' tentatives. Vérifiez que vous êtes sur la page d\'accueil.');
            }
            return;
        }

        // Réinitialiser le compteur de tentatives
        _initRetryCount = 0;

        // Points d'injection natifs Jellyfin
        const homePage = document.querySelector('.homePage');
        const sectionsEl = homePage
            ? (homePage.querySelector('.sections') || homePage)
            : (document.querySelector('.mainAnimatedPages') || document.body);

        if (!sectionsEl) {
            console.error('[MediaCarousel] Container .sections introuvable. Abandon.');
            return;
        }

        // Nettoyage des injections précédentes
        sectionsEl.querySelectorAll('.carousel-section').forEach(el => el.remove());
        if (homePage) homePage.querySelectorAll('.carousel-hero-section').forEach(el => el.remove());

        // Marquer comme géré par le plugin (sert de garde contre double-init)
        sectionsEl.dataset.jcActive = 'true';

        // CardStyle : classe sur body pour CSS scope
        if (pluginConfig.CardStyle === 'landscape') {
            document.body.classList.add('carousel-landscape-mode');
        } else {
            document.body.classList.remove('carousel-landscape-mode');
        }

        // Container pour genres (lazy-loaded via IntersectionObserver)
        const genresContainer = document.createElement('div');
        genresContainer.className = 'verticalSection carousel-section carousel-genres-container';
        genresContainer.id = 'carousel-genres-lazy';

        // Initialiser le système intelligent de genres
        if (pluginConfig.ShowGenreCategories !== false) {
            try {
                const maxGenres = pluginConfig.MaxGenres || 12;
                const minItems = pluginConfig.MinGenreItems || 3;
                const genresResult = await ApiClient.getJSON(ApiClient.getUrl('Genres', {
                    UserId: userId,
                    SortBy: 'SortName',
                    SortOrder: 'Ascending',
                    Recursive: true,
                    Fields: 'ItemCounts',
                    Limit: 50
                }));
                if (genresResult && genresResult.Items) {
                    CONFIG.genres = genresResult.Items
                        .map(g => ({
                            name: g.Name,
                            count: (g.MovieCount || 0) + (g.SeriesCount || 0) + (g.EpisodeCount || 0)
                        }))
                        .filter(g => g.name && g.count >= minItems)
                        .sort((a, b) => b.count - a.count)
                        .slice(0, maxGenres)
                        .map(g => g.name);
                    console.log('[MediaCarousel] Genres:', CONFIG.genres.length, '(min:', minItems, ', max:', maxGenres, ')');
                }
            } catch (err) {
                console.warn('MediaCarousel: Erreur chargement genres intelligents', err);
            }
        }

        // Ordre des sections
        const sectionOrder = (pluginConfig.SectionOrder || 'hero,continue,latest,top10,recommended,genres,collections')
            .split(',').map(s => s.trim());

        // Parser les sections personnalisées (CustomSectionsJson)
        let customSections = [];
        try {
            customSections = JSON.parse(pluginConfig.CustomSectionsJson || '[]');
            if (!Array.isArray(customSections)) customSections = [];
        } catch (e) {
            console.warn('[MediaCarousel] CustomSectionsJson invalide', e);
            customSections = [];
        }
        const customById = {};
        customSections.forEach(cs => { if (cs && cs.id) customById[cs.id] = cs; });

        // Supprimer les sections natives dupliquées par nos carrousels
        removeNativeDuplicates();

        // Masquer tout le natif si HideNativeHome
        if (pluginConfig.HideNativeHome) {
            Array.from(sectionsEl.children).forEach(child => {
                if (!child.classList.contains('carousel-section')) {
                    child.setAttribute('data-jc-hidden', 'true');
                }
            });
        }

        // Lancer l'IA en parallèle — non bloquant
        const aiRecoPromise = loadAiRecommendations(userId);

        // Charger toutes les sections en parallèle, conserver l'ordre d'affichage
        const sectionData = await Promise.all(sectionOrder.map(async (sectionId) => {
            if (sectionId === 'hero') {
                return { id: 'hero', el: await createHero(userId) };
            } else if (sectionId === 'genres') {
                return pluginConfig.ShowGenreCategories !== false
                    ? { id: 'genres', el: genresContainer }
                    : null;
            } else if (customById[sectionId]) {
                const cs = customById[sectionId];
                const items = await loadCustomSectionItems(cs, userId);
                const el = createCarouselDOM(cs.name || 'Section', items);
                return el ? { id: sectionId, el } : null;
            } else {
                const category = CONFIG.categories.find(c => c.id === sectionId);
                if (!category || pluginConfig[category.configKey] === false) return null;
                const items = await loadCategoryItems(category, userId);
                const el = createCarouselDOM(category.name, items, null, { ranked: sectionId === 'top10' });
                return el ? { id: sectionId, el } : null;
            }
        }));

        // Injection native : hero avant .sections, reste dans .sections
        sectionData.forEach(section => {
            if (!section || !section.el) return;
            if (section.id === 'hero') {
                section.el.classList.add('carousel-hero-section');
                if (homePage && sectionsEl !== homePage && homePage.contains(sectionsEl)) {
                    homePage.insertBefore(section.el, sectionsEl);
                } else {
                    sectionsEl.insertBefore(section.el, sectionsEl.firstChild);
                }
            } else {
                sectionsEl.appendChild(section.el);
            }
        });

        document.body.classList.add('media-carousel-active');

        // Lazy loading des genres restants
        if (pluginConfig.ShowGenreCategories !== false) {
            setupLazyGenres(userId, genresContainer);
        }

        // IA : bannière + genres prioritaires insérés quand disponibles
        aiRecoPromise.then(aiReco => {
            if (!aiReco) return;
            if (aiReco.message) {
                // Bannière IA : avant le premier carrousel dans sectionsEl
                const firstCarousel = sectionsEl.querySelector('.carousel-section');
                const banner = createAiBanner(aiReco.message);
                if (firstCarousel) {
                    sectionsEl.insertBefore(banner, firstCarousel);
                } else {
                    sectionsEl.appendChild(banner);
                }
            }
            const aiGenres = (aiReco.genres || []).filter(g => CONFIG.genres.includes(g));
            (async () => {
                for (const genre of aiGenres) {
                    if (genresContainer.querySelector('[data-carousel-id="' + genre + '"]')) continue;
                    const items = await loadGenreItems(genre, userId);
                    const el = createCarouselDOM('🤖 ' + genre, items, genre);
                    if (el) genresContainer.insertBefore(el, genresContainer.firstChild);
                }
            })();
        }).catch(() => {});

        console.log('[MediaCarousel] ✅ Fusion native activée! Ordre:', sectionOrder.join(' → '));
    }

    function setupLazyGenres(userId, container) {
        let genresLoaded = false;
        const observer = new IntersectionObserver(async (entries, obs) => {
            if (entries[0].isIntersecting && !genresLoaded) {
                genresLoaded = true;
                obs.disconnect();

                for (const genre of CONFIG.genres) {
                    // Éviter doublon avec les genres déjà insérés (IA ou autre)
                    if (container.querySelector('[data-carousel-id="' + genre + '"]')) continue;
                    const items = await loadGenreItems(genre, userId);
                    const carousel = createCarouselDOM(genre, items, genre);
                    if (carousel) container.appendChild(carousel);
                }
            }
        }, { rootMargin: '200px' });

        observer.observe(container);
    }

    // Détection hybride : DOM + URL — couvre toutes les variantes Jellyfin
    function isOnHomePage() {
        const domMatch = !!document.querySelector(
            '#indexPage, .homePage, #homeTab, [data-type="home"], ' +
            '.view.homePage:not(.hide), .page.homePage:not(.hide)'
        );
        if (domMatch) return true;

        const hash = window.location.hash || '';
        const path = window.location.pathname || '';
        const urlMatch = hash === '' || hash === '#' || hash === '#!/home' ||
            hash === '#!/home.html' || hash.startsWith('#!/home?') ||
            path.endsWith('/web/index.html') && (hash === '' || hash === '#') ||
            hash === '#!/startup/finished';

        if (urlMatch && !hash.includes('details') && !hash.includes('config') &&
            !hash.includes('dashboard') && !hash.includes('search') &&
            !hash.includes('list') && !hash.includes('settings')) {
            return true;
        }

        return false;
    }
    
    // Fonction synchrone pour cacher IMMÉDIATEMENT les éléments superflus
    function applySyncLayoutStates() {
        if (!isOnHomePage() || !pluginConfig) return;
        
        document.body.classList.add('media-carousel-init');
        
        if (pluginConfig.HideNativeHome) {
            document.body.classList.add('mc-hide-all-native');
        }
        if (pluginConfig.ShowContinueWatching) {
            document.body.classList.add('mc-hide-native-resume');
        }
        if (pluginConfig.ShowNewReleases) {
            document.body.classList.add('mc-hide-native-latest');
        }
    }

    // Suppression via le texte (Robuste pour tout thème)
    function removeNativeDuplicates() {
        if (!pluginConfig) return;
        if (pluginConfig.HideNativeHome) return; // Déjà tout caché

        document.querySelectorAll('.homePage .sectionTitle').forEach(titleEl => {
            const section = titleEl.closest('.homePageSection') || titleEl.closest('.verticalSection');
            if (!section) return;
            // Ne jamais toucher à nos propres sections injectées
            if (section.classList.contains('carousel-section')) return;

            const txt = titleEl.textContent.toLowerCase();
            const isResume = txt.includes('continu') || txt.includes('resume') || txt.includes('watching') || txt.includes('suivant') || txt.includes('next up');
            const isLatest = txt.includes('nouveau') || txt.includes('latest') || txt.includes('recently') || txt.includes('ajout');

            if (pluginConfig.ShowContinueWatching && isResume) {
                section.setAttribute('data-jc-duplicate', 'true');
                section.style.display = 'none';
            }
            if (pluginConfig.ShowNewReleases && isLatest) {
                section.setAttribute('data-jc-duplicate', 'true');
                section.style.display = 'none';
            }
        });
    }

    function deactivateCarousel() {
        // Supprimer les sections injectées par le plugin
        document.querySelectorAll('.carousel-section, .carousel-hero-section, .carousel-ai-banner').forEach(el => el.remove());
        // Retirer le marqueur d'activation
        document.querySelectorAll('[data-jc-active]').forEach(el => delete el.dataset.jcActive);
        // Restaurer les sections natives masquées
        document.querySelectorAll('[data-jc-hidden="true"], [data-jc-duplicate="true"]').forEach(el => {
            el.removeAttribute('data-jc-hidden');
            el.removeAttribute('data-jc-duplicate');
            el.style.display = '';
        });
        document.body.classList.remove('media-carousel-active', 'media-carousel-init',
            'mc-hide-all-native', 'mc-hide-native-resume', 'mc-hide-native-latest');
    }

    let _layoutBusy = false;
    function triggerLayout() {
        if (_layoutBusy) return;
        if (!isOnHomePage()) {
            deactivateCarousel();
            return;
        }
        
        applySyncLayoutStates(); // Empêche le scintillement (FOUC) immédiatement

        _layoutBusy = true;
        ensureConfigLoaded().then(() => {
            if (document.querySelector('[data-jc-active]')) {
                document.body.classList.add('media-carousel-active');
                _layoutBusy = false;
            } else {
                initCarouselLayout().finally(() => { _layoutBusy = false; });
            }
        }).catch(() => { _layoutBusy = false; });
    }

    function observePageChanges() {
        // Stratégie 1 : événement natif Jellyfin « viewshow »
        document.addEventListener('viewshow', function (e) {
            const view = e.detail ? e.detail.view : e.target;
            if (!view) return;
            const onHome = view.id === 'indexPage' ||
                view.id === 'homeTab' ||
                (view.classList && view.classList.contains('homePage')) ||
                (view.dataset && view.dataset.type === 'home');
            console.log('[MediaCarousel] viewshow détecté — id=' + (view.id || '?') + ', onHome=' + onHome);
            if (onHome) {
                _initRetryCount = 0;
                setTimeout(triggerLayout, 100);
            } else if (view.id && view.id !== 'indexPage') {
                // Navigation hors accueil — vérifier le DOM après stabilisation
                setTimeout(() => { if (!isOnHomePage()) deactivateCarousel(); }, 200);
            }
        });

        // Stratégie 1b : événement Jellyfin « pageshow » (variante selon les versions)
        document.addEventListener('pageshow', function (e) {
            setTimeout(() => {
                if (isOnHomePage() && !document.querySelector('[data-jc-active]')) {
                    _initRetryCount = 0;
                    triggerLayout();
                }
            }, 300);
        });

        // Stratégie 2 : hashchange — détecte les navigations SPA
        window.addEventListener('hashchange', function () {
            setTimeout(() => {
                if (isOnHomePage()) {
                    if (!document.querySelector('[data-jc-active]')) {
                        _initRetryCount = 0;
                        triggerLayout();
                    }
                } else {
                    deactivateCarousel();
                }
            }, 300);
        });

        // Stratégie 3 : MutationObserver sur le body
        let _mutPending = null;
        new MutationObserver(() => {
            if (_mutPending) clearTimeout(_mutPending);
            _mutPending = setTimeout(() => {
                if (isOnHomePage() && !document.querySelector('[data-jc-active]')) {
                    triggerLayout();
                }
            }, 400);
        }).observe(document.body, { childList: true, subtree: true });

        // Stratégie 4 : polling toutes les 3 s (filet de sécurité absolu)
        setInterval(() => {
            if (isOnHomePage() && !document.querySelector('[data-jc-active]')) {
                console.log('[MediaCarousel] Polling: carousel manquant, réinitialisation...');
                _initRetryCount = 0;
                triggerLayout();
            }
        }, 3000);
    }

    waitForJellyfin(() => {
        console.log('[MediaCarousel] Jellyfin prêt — démarrage du plugin v2.0.0');
        console.log('[MediaCarousel] URL actuelle:', window.location.href);
        console.log('[MediaCarousel] Hash:', window.location.hash);

        const style = document.createElement('style');
        style.textContent = `
/* Carousel Layout Plugin v2.0.0 - Styles Netflix-like */
/* Thème sombre avec carrousels horizontaux */

:root {
    /* Variables avec fallbacks multi-couches pour compatibilité tous thèmes */
    --carousel-bg: transparent;
    --carousel-text: var(--theme-text, var(--body-color, var(--body-text-color, #e5e5e5)));
    --carousel-hover: var(--theme-text, var(--body-color, #ffffff));
    --carousel-text-secondary: var(--theme-text-secondary, var(--secondary-text-color, var(--body-muted-color, #b3b3b3)));
    --carousel-card-bg: var(--theme-background-secondary, var(--card-background-color, var(--paper-background-color, #202020)));
    --carousel-highlight: var(--theme-primary, var(--accent-color, var(--link-color, #00a4dc)));
    --carousel-shadow: rgba(0, 0, 0, 0.7);
    --carousel-transition: all 0.3s ease;
    --carousel-overlay-bg: var(--theme-background, var(--background-color, #141414));
}

/* Section carrousel — s'intègre dans .verticalSection de Jellyfin */
.carousel-section {
    /* Jellyfin gère l'espacement via .verticalSection — pas de padding supplémentaire */
}

/* Hero injecté avant .sections — pleine largeur */
.carousel-hero-section {
    width: 100%;
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

/* Carte de média — mode poster (défaut) : ratio portrait 2:3 */
.carousel-item {
    position: relative;
    min-width: 160px;
    max-width: 160px;
    height: 240px;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: var(--carousel-transition);
    background-color: var(--carousel-card-bg);
    flex-shrink: 0;
}

/* Mode paysage : ratio 16:9 */
.carousel-landscape-mode .carousel-item,
.carousel-item-landscape {
    min-width: 320px;
    max-width: 320px;
    height: 180px;
}

.carousel-item:hover {
    transform: translateY(-4px) scale(1.04);
    z-index: 10;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.3);
}

/* Image de la carte */
.carousel-item-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.35s cubic-bezier(.2,.7,.2,1), filter 0.35s ease;
}

.carousel-item:hover .carousel-item-image {
    filter: brightness(0.78);
    transform: scale(1.03);
}

/* Overlay avec informations — fondu doux au survol (plus de glissement clunky) */
.carousel-item-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.55) 55%, transparent 100%);
    padding: 1rem 0.9rem 0.9rem;
    opacity: 0;
    transition: opacity 0.28s ease;
    pointer-events: none;
}

.carousel-item:hover .carousel-item-overlay,
.carousel-item:focus-within .carousel-item-overlay {
    opacity: 1;
}

/* Titre du média */
.carousel-item-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--carousel-text);
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
    color: var(--carousel-text-secondary);
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

/* Boutons de navigation — chevrons circulaires glass */
.carousel-nav-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%) scale(0.92);
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 50%;
    background: rgba(18, 18, 18, 0.55);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #fff;
    cursor: pointer;
    z-index: 5;
    opacity: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    transition: opacity 0.25s ease, transform 0.25s ease, background 0.25s ease;
}

.carousel-nav-button svg { display: block; }

.carousel-container:hover .carousel-nav-button,
.carousel-container:focus-within .carousel-nav-button {
    opacity: 1;
    transform: translateY(-50%) scale(1);
}

.carousel-nav-button:hover {
    background: rgba(28, 28, 28, 0.82);
    transform: translateY(-50%) scale(1.08);
}

.carousel-nav-button:active {
    transform: translateY(-50%) scale(0.94);
}

.carousel-nav-button.prev { left: 8px; }
.carousel-nav-button.next { right: 8px; }

@media (hover: none) {
    .carousel-nav-button { display: none; }
}

/* Barre de progression sur les cartes partiellement vues */
.carousel-progress {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 8px;
    height: 3px;
    background: rgba(255, 255, 255, 0.18);
    border-radius: 2px;
    overflow: hidden;
    z-index: 3;
    pointer-events: none;
}
.carousel-progress-fill {
    height: 100%;
    background: var(--carousel-highlight, #00a4dc);
    border-radius: 2px;
    transition: width 0.4s ease;
}

/* Numéro de rang Top 10 — chiffre géant en bordure */
.carousel-item-ranked {
    position: relative;
    padding-left: 2.4em;
}
.carousel-rank {
    position: absolute;
    left: -0.15em;
    bottom: -0.15em;
    font-size: 5.2em;
    font-weight: 900;
    line-height: 0.85;
    color: transparent;
    -webkit-text-stroke: 3px rgba(255, 255, 255, 0.92);
    letter-spacing: -0.08em;
    font-family: 'Helvetica Neue', 'Arial Black', sans-serif;
    z-index: 1;
    pointer-events: none;
    text-shadow: 4px 6px 16px rgba(0, 0, 0, 0.55);
}
.carousel-section-ranked .carousel-wrapper { gap: 1.2rem; }

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
    background: linear-gradient(to top, var(--carousel-overlay-bg) 0%, transparent 100%);
}

/* Responsive */
@media (max-width: 1400px) {
    .carousel-item {
        min-width: 140px;
        max-width: 140px;
        height: 210px;
    }
}

@media (max-width: 800px) {
    .carousel-item {
        min-width: 120px;
        max-width: 120px;
        height: 180px;
    }

    .carousel-category-title {
        font-size: 1.2rem;
    }

    .carousel-hero-content {
        width: 60%;
    }

    .carousel-hero-title {
        font-size: 2rem;
    }

    .carousel-hero-description {
        font-size: 1rem;
    }

    .carousel-hero-button {
        padding: 0.6rem 1.2rem;
        font-size: 1rem;
    }
}

@media (max-width: 500px) {
    .carousel-item {
        min-width: 100px;
        max-width: 100px;
        height: 150px;
    }

    .carousel-main-container {
        padding: 10px 2%;
    }

    .carousel-hero {
        height: 70vw;
        max-height: 280px;
    }

    .carousel-hero-content {
        width: 90%;
        bottom: 20%;
    }

    .carousel-hero-title {
        font-size: 1.4rem;
        margin-bottom: 0.5rem;
    }

    .carousel-hero-description {
        display: none;
    }

    .carousel-hero-button {
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
    }

    .carousel-category-title {
        font-size: 1rem;
        padding-left: 2%;
    }

    .carousel-wrapper {
        padding: 0.5rem 2%;
        gap: 0.4rem;
    }
}

/* Appareils tactiles : toujours afficher overlay, favori et boutons de navigation */
@media (hover: none) {
    .carousel-item-overlay {
        opacity: 1;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.82) 0%, transparent 70%);
    }

    .carousel-favorite-btn {
        opacity: 1;
    }

    .carousel-item:hover {
        transform: none;
    }
}

/* Bannière IA Groq */
.carousel-ai-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(168,85,247,0.2) 100%);
    border: 1px solid rgba(168,85,247,0.4);
    border-radius: 8px;
    padding: 1rem 1.5rem;
    margin: 0 4% 2rem;
    color: var(--carousel-text);
    font-size: 1rem;
    line-height: 1.5;
}

.carousel-ai-icon {
    font-size: 1.8rem;
    flex-shrink: 0;
}

.carousel-ai-text {
    flex: 1;
    font-style: italic;
}

/* =========================================================================
   COMPATIBILITÉ ET MASQUAGE DES SECTIONS NATIVES/ENHANCED
   ========================================================================= */

/* Masquer uniquement les éléments explicitement marqués par le plugin via JS. */
[data-jc-hidden="true"], [data-jc-duplicate="true"] {
    display: none !important;
}

/* 1. HIDE ALL NATIVE: activé uniquement si HideNativeHome = true
   Ne pas cacher .sections (notre container d'injection), exclure .carousel-section */
body.mc-hide-all-native .homePage .sections > :not(.carousel-section):not(.carousel-hero-section):not(#carousel-genres-lazy),
body.mc-hide-all-native .homePage > .verticalSection:not(.carousel-section),
body.mc-hide-all-native .homePage .hss-section,
body.mc-hide-all-native .homePage .homePageSection {
    display: none !important;
}

/* 2. DUPLICATES HIDING SYNCHRONE: prévient le flash avant JS parsing */
body.mc-hide-native-resume .sectionResume,
body.mc-hide-native-resume .homePageSection[data-type="resumable"] {
    display: none !important;
}

body.mc-hide-native-latest .sectionLatest,
body.mc-hide-native-latest .homePageSection[data-type="latest"] {
    display: none !important;
}
`;
        document.head.appendChild(style);

        // Au lancement direct, on tente l'application synchrone grace au localStorage
        if (pluginConfig) applySyncLayoutStates();

        // Premier chargement : tentatives progressives 0, 300, 800, 1500, 3000 ms
        triggerLayout();
        setTimeout(triggerLayout, 300);
        setTimeout(triggerLayout, 800);
        setTimeout(triggerLayout, 1500);
        setTimeout(triggerLayout, 3000);
        observePageChanges();
        console.log('[MediaCarousel] Observation active — en attente de la page d\'accueil');
    });
})();
