/*
 * Media Carousel — rangées d'accueil façon Netflix pour Jellyfin.
 *
 * Jellyfin ne propose aucun point d'extension serveur pour la page d'accueil : ses sections
 * sont une énumération fermée rendue par le client web. Ce script est donc la seule façon
 * d'y ajouter une rangée. Il reste volontairement minimal : il ne remplace pas la page
 * d'accueil, ne masque rien, et se contente d'insérer ses rangées sous les bibliothèques.
 *
 * Les classements et catalogues viennent du backend du plugin, déjà calculés et mis en cache.
 * Seules les rangées par genre interrogent l'API native de Jellyfin, page par page : ce sont
 * des requêtes indexées et filtrées par utilisateur, exactement ce que fait la page d'accueil
 * native pour ses propres rangées.
 */
(function () {
    'use strict';

    var LOG_PREFIX = '[MediaCarousel]';
    var ROW_CLASS = 'mc-row';
    var STYLE_ID = 'mc-styles';
    var RETRY_DELAYS = [0, 400, 1200, 3000];

    // Les classements ne sont recalculés que toutes les quelques heures côté serveur.
    // Sans ce cache, chaque retour sur l'accueil relancerait les quatre requêtes, alors que
    // jellyfin-web reconstruit le conteneur à chaque affichage.
    var CACHE_TTL = 5 * 60 * 1000;

    var cache = {};
    var options = null;
    var rendering = false;
    var scheduled = null;
    var sequence = 0;
    var supportsSmoothScroll = typeof document.documentElement.style.scrollBehavior === 'string';

    // ------------------------------------------------------------------
    // Utilitaires
    // ------------------------------------------------------------------

    function log(message, error) {
        if (error) {
            console.error(LOG_PREFIX + ' ' + message, error);
        }
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function ready() {
        return typeof window.ApiClient !== 'undefined'
            && window.ApiClient
            && typeof window.ApiClient.getUrl === 'function'
            && !!window.ApiClient.getCurrentUserId();
    }

    function getJson(path, params) {
        return window.ApiClient.getJSON(window.ApiClient.getUrl(path, params || {}));
    }

    function serverId() {
        return window.ApiClient.serverId ? window.ApiClient.serverId() : '';
    }

    /**
     * Reproduit les règles de routage de appRouter pour les types que nous affichons.
     * Un dossier ouvre une liste filtrée, tout le reste ouvre une fiche.
     */
    function routeUrl(item) {
        var suffix = '&serverId=' + encodeURIComponent(item.ServerId || serverId() || '');

        if (item.IsFolder) {
            return '#/list?parentId=' + encodeURIComponent(item.Id) + suffix;
        }

        return '#/details?id=' + encodeURIComponent(item.Id) + suffix;
    }

    function imageUrl(item, type, maxWidth) {
        var tags = item.ImageTags || {};

        if (!tags[type]) {
            return null;
        }

        return window.ApiClient.getImageUrl(item.Id, {
            type: type,
            maxWidth: maxWidth,
            tag: tags[type]
        });
    }

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    function injectStyles(accent) {
        var css = buildCss(accent);
        var existing = document.getElementById(STYLE_ID);

        if (existing) {
            if (existing.textContent !== css) {
                existing.textContent = css;
            }
            return;
        }

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function buildCss(accent) {
        return [
            ':root{--mc-accent:' + accent + ';}',

            /* Ne pas dependre de la remise a zero du client hote pour nos propres dimensions. */
            '.mc-row *,.mc-row *::before,.mc-row *::after{box-sizing:border-box;}',

            '.mc-row{margin:0 0 2.4em;}',
            '.mc-row-header{display:flex;align-items:center;gap:.6em;flex-wrap:wrap;}',
            '.mc-row-header .mc-row-title{margin:0;}',
            '.mc-row-badge{font-size:.62em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;',
            'padding:.25em .6em;border-radius:3px;background:var(--mc-accent);color:#fff;white-space:nowrap;}',

            '.mc-strip-wrap{position:relative;}',
            /* Repli si les classes natives scrollX/hiddenScrollX venaient a manquer. */
            '.mc-strip{display:flex;gap:.7em;overflow-x:auto;overflow-y:hidden;',
            'padding:1.6em 3.4vw 1.2em;scrollbar-width:none;-ms-overflow-style:none;}',
            '.mc-strip::-webkit-scrollbar{display:none;}',

            /* Carte classée : le chiffre géant est en retrait derrière l'affiche. */
            '.mc-card{position:relative;display:flex;align-items:flex-end;flex:0 0 auto;',
            'text-decoration:none;color:inherit;transition:transform .18s ease;transform-origin:center bottom;}',
            '.mc-card:hover,.mc-card:focus-visible{transform:scale(1.06);z-index:2;}',
            '.mc-card:focus-visible{outline:3px solid var(--mc-accent);outline-offset:3px;border-radius:6px;}',

            /* La couleur pleine sert de repli : sans -webkit-text-stroke, le chiffre reste lisible. */
            '.mc-rank{font-size:8.5rem;line-height:.72;font-weight:900;font-style:italic;',
            'color:rgba(255,255,255,.16);-webkit-text-stroke:3px rgba(255,255,255,.62);',
            'margin:0 -.28em 0 0;user-select:none;pointer-events:none;flex:0 0 auto;}',
            '.mc-card:hover .mc-rank{-webkit-text-stroke-color:var(--mc-accent);}',
            '.mc-rank-10{letter-spacing:-.06em;}',

            /* display:block est indispensable : hors conteneur flex, un span reste inline
               et ignore width/height, ce qui aplatit les cartes des rangées de genre. */
            '.mc-poster{position:relative;display:block;width:120px;height:180px;border-radius:5px;overflow:hidden;',
            'background:rgba(255,255,255,.07);box-shadow:0 4px 14px rgba(0,0,0,.45);flex:0 0 auto;}',
            '.mc-poster img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-card:hover .mc-poster{box-shadow:0 8px 22px rgba(0,0,0,.6);}',

            '.mc-fallback{display:flex;align-items:center;justify-content:center;height:100%;',
            'padding:.6em;text-align:center;font-size:.78em;line-height:1.25;opacity:.85;}',

            '.mc-unavailable .mc-poster{opacity:.55;}',
            '.mc-unavailable .mc-poster::after{content:attr(data-label);position:absolute;left:0;right:0;bottom:0;',
            'padding:.3em;font-size:.62em;text-align:center;background:rgba(0,0,0,.72);}',

            /* Carte de studio : vignette large centrée sur le logo. */
            '.mc-tile{flex:0 0 auto;width:172px;height:104px;border-radius:6px;overflow:hidden;position:relative;',
            'display:flex;align-items:center;justify-content:center;padding:.9em;text-align:center;',
            'background:rgba(255,255,255,.07);text-decoration:none;color:inherit;',
            'transition:transform .18s ease,background .18s ease;}',
            '.mc-tile:hover,.mc-tile:focus-visible{transform:scale(1.05);background:rgba(255,255,255,.13);z-index:2;}',
            '.mc-tile:focus-visible{outline:3px solid var(--mc-accent);outline-offset:3px;}',
            '.mc-tile img{max-width:100%;max-height:100%;object-fit:contain;display:block;}',
            '.mc-tile-name{font-size:.86em;font-weight:600;line-height:1.2;}',
            '.mc-tile-count{position:absolute;right:.5em;bottom:.35em;font-size:.62em;opacity:.65;}',

            /* Carte simple, utilisée par les rangées de genre. */
            '.mc-plain{flex:0 0 auto;width:120px;text-decoration:none;color:inherit;',
            'transition:transform .18s ease;}',
            '.mc-plain:hover,.mc-plain:focus-visible{transform:scale(1.06);z-index:2;}',
            '.mc-plain:focus-visible{outline:3px solid var(--mc-accent);outline-offset:3px;border-radius:6px;}',
            '.mc-plain .mc-poster{width:120px;}',
            '.mc-plain-name{margin-top:.4em;font-size:.78em;line-height:1.25;',
            'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',

            '.mc-empty{padding:0 3.4vw 1em;opacity:.6;font-size:.85em;}',

            /* Flèches de défilement : confort souris, masquées au clavier et au tactile. */
            '.mc-arrow{position:absolute;top:0;bottom:0;width:3.2vw;min-width:34px;border:0;cursor:pointer;',
            'background:rgba(0,0,0,.45);color:#fff;font-size:1.5em;line-height:1;opacity:0;',
            'transition:opacity .18s ease;z-index:3;}',
            '.mc-arrow-prev{left:0;}',
            '.mc-arrow-next{right:0;}',
            '.mc-strip-wrap:hover .mc-arrow{opacity:1;}',
            '.mc-arrow:disabled{opacity:0!important;pointer-events:none;}',

            '@media (max-width:800px){',
            '.mc-rank{font-size:5.6rem;-webkit-text-stroke-width:2px;}',
            '.mc-poster,.mc-plain,.mc-plain .mc-poster{width:88px;}',
            '.mc-poster{height:132px;}',
            '.mc-tile{width:132px;height:80px;}',
            '.mc-strip{padding:1.1em 3.4vw .9em;}',
            '}',

            '@media (hover:none){.mc-arrow{display:none;}',
            '.mc-card:hover,.mc-tile:hover,.mc-plain:hover{transform:none;}}',

            '@media (prefers-reduced-motion:reduce){',
            '.mc-card,.mc-tile,.mc-plain{transition:none;}.mc-strip{scroll-behavior:auto;}',
            '}',

            '@media (prefers-contrast:more){',
            '.mc-rank{color:rgba(255,255,255,.5);}',
            '.mc-tile,.mc-poster{background:rgba(255,255,255,.2);}',
            '}'
        ].join('');
    }

    // ------------------------------------------------------------------
    // Cartes
    // ------------------------------------------------------------------

    function buildRankedCard(entry) {
        var item = entry.Item;
        var inLibrary = !!item;
        var name = inLibrary ? item.Name : entry.Name;
        var label = name + (entry.ProductionYear ? ' (' + entry.ProductionYear + ')' : '');
        var poster;

        if (inLibrary) {
            var url = imageUrl(item, 'Primary', 300);
            poster = url
                ? '<img loading="lazy" alt="" src="' + escapeHtml(url) + '">'
                : '<div class="mc-fallback">' + escapeHtml(name) + '</div>';
        } else if (entry.PosterUrl) {
            poster = '<img loading="lazy" alt="" src="' + escapeHtml(entry.PosterUrl) + '">';
        } else {
            poster = '<div class="mc-fallback">' + escapeHtml(name) + '</div>';
        }

        var inner = '<span class="mc-rank' + (entry.Rank >= 10 ? ' mc-rank-10' : '') + '" aria-hidden="true">' + entry.Rank + '</span>'
            + '<span class="mc-poster"' + (inLibrary ? '' : ' data-label="Absent"') + '>' + poster + '</span>';

        var aria = escapeHtml('Numéro ' + entry.Rank + ' : ' + label);

        if (inLibrary) {
            return '<a role="listitem" class="mc-card" href="' + escapeHtml(routeUrl(item)) + '"'
                + ' aria-label="' + aria + '">' + inner + '</a>';
        }

        // Titre absent de la bibliothèque : carte non cliquable plutôt qu'un lien mort.
        return '<span role="listitem" class="mc-card mc-unavailable" aria-label="' + aria
            + escapeHtml(' — absent de la bibliothèque') + '">' + inner + '</span>';
    }

    function buildTileCard(entry) {
        var item = entry.Item;
        var name = entry.Name || (item && item.Name) || '';
        var logo = item ? (imageUrl(item, 'Logo', 300) || imageUrl(item, 'Thumb', 300)) : null;

        var content = logo
            ? '<img loading="lazy" alt="" src="' + escapeHtml(logo) + '">'
            : '<span class="mc-tile-name">' + escapeHtml(name) + '</span>';

        var count = entry.ItemCount
            ? '<span class="mc-tile-count" aria-hidden="true">' + entry.ItemCount + '</span>'
            : '';

        var aria = escapeHtml(name + (entry.ItemCount ? ' — ' + entry.ItemCount + ' titres' : ''));
        var href = item ? routeUrl(item) : '#';

        return '<a role="listitem" class="mc-tile" href="' + escapeHtml(href) + '"'
            + ' aria-label="' + aria + '">' + content + count + '</a>';
    }

    function buildPlainCard(item) {
        var url = imageUrl(item, 'Primary', 300);
        var poster = url
            ? '<img loading="lazy" alt="" src="' + escapeHtml(url) + '">'
            : '<div class="mc-fallback">' + escapeHtml(item.Name) + '</div>';

        return '<a role="listitem" class="mc-plain" href="' + escapeHtml(routeUrl(item)) + '"'
            + ' aria-label="' + escapeHtml(item.Name) + '">'
            + '<span class="mc-poster">' + poster + '</span>'
            + '<span class="mc-plain-name">' + escapeHtml(item.Name) + '</span>'
            + '</a>';
    }

    // ------------------------------------------------------------------
    // Rangées
    // ------------------------------------------------------------------

    function buildRow(title, badge, cardsHtml) {
        var section = document.createElement('div');
        var headingId = 'mc-row-title-' + (++sequence);

        section.className = 'verticalSection ' + ROW_CLASS;
        section.setAttribute('aria-labelledby', headingId);

        section.innerHTML =
            '<div class="mc-row-header padded-left">'
            + '<h2 id="' + headingId + '" class="sectionTitle sectionTitle-cards mc-row-title">' + escapeHtml(title) + '</h2>'
            + (badge ? '<span class="mc-row-badge">' + escapeHtml(badge) + '</span>' : '')
            + '</div>'
            + '<div class="mc-strip-wrap">'
            + '<button type="button" class="mc-arrow mc-arrow-prev" tabindex="-1" aria-hidden="true">&#10094;</button>'
            // scrollX est la classe que allowSwipe() de Jellyfin recherche pour ne pas
            // interpréter un défilement horizontal comme un changement d'onglet.
            + '<div class="mc-strip scrollX hiddenScrollX smoothScrollX" role="list">' + (cardsHtml || '') + '</div>'
            + '<button type="button" class="mc-arrow mc-arrow-next" tabindex="-1" aria-hidden="true">&#10095;</button>'
            + '</div>';

        wireArrows(section);
        return section;
    }

    function wireArrows(section) {
        var strip = section.querySelector('.mc-strip');
        var previous = section.querySelector('.mc-arrow-prev');
        var next = section.querySelector('.mc-arrow-next');

        function refresh() {
            previous.disabled = strip.scrollLeft <= 4;
            next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;
        }

        function scrollBy(direction) {
            var amount = direction * Math.round(strip.clientWidth * 0.8);

            // Les moteurs anciens exposent scrollBy(x, y) sans accepter d'objet d'options :
            // passer un objet y produirait un défilement NaN plutôt qu'une erreur.
            if (supportsSmoothScroll) {
                strip.scrollBy({ left: amount, behavior: 'smooth' });
            } else {
                strip.scrollLeft += amount;
            }
        }

        previous.addEventListener('click', function () { scrollBy(-1); });
        next.addEventListener('click', function () { scrollBy(1); });
        strip.addEventListener('scroll', refresh, { passive: true });

        section.refreshArrows = refresh;

        // Les images arrivent après coup : l'état des flèches doit être recalculé.
        window.setTimeout(refresh, 0);
        window.setTimeout(refresh, 800);
    }

    function fillRow(section, cardsHtml, emptyMessage) {
        var strip = section.querySelector('.mc-strip');

        if (cardsHtml) {
            strip.innerHTML = cardsHtml;
        } else {
            strip.innerHTML = '';
            var empty = document.createElement('p');
            empty.className = 'mc-empty';
            empty.textContent = emptyMessage;
            section.appendChild(empty);
        }

        if (section.refreshArrows) {
            section.refreshArrows();
        }
    }

    // ------------------------------------------------------------------
    // Insertion dans la page d'accueil
    // ------------------------------------------------------------------

    /**
     * Repère le conteneur des sections de l'onglet Accueil visible.
     * Jellyfin construit `.homeSectionsContainer` avec un div `.section{N}` par section.
     */
    function findSectionsContainer() {
        var candidates = document.querySelectorAll('#homeTab .homeSectionsContainer, .homeSectionsContainer');

        for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];

            // Ignore l'onglet Favoris et toute section masquée.
            if (candidate.closest('#favoritesTab')) {
                continue;
            }

            if (candidate.offsetParent !== null || candidate.children.length > 0) {
                return candidate;
            }
        }

        return null;
    }

    /**
     * Repère la section « Mes médias » : elle contient soit les boutons de bibliothèque,
     * soit des cartes de type CollectionFolder / UserView.
     */
    function findLibrarySection(container) {
        var sections = container.children;

        for (var i = 0; i < sections.length; i++) {
            var section = sections[i];

            if (section.classList.contains(ROW_CLASS)) {
                continue;
            }

            if (section.querySelector('.homeLibraryButton, .card[data-type="CollectionFolder"], .card[data-type="UserView"]')) {
                return section;
            }
        }

        return null;
    }

    function insertRows(container, rows) {
        var anchor = findLibrarySection(container);

        // Les rangées sont insérées à la suite, dans l'ordre, juste sous les bibliothèques.
        rows.forEach(function (row) {
            if (anchor) {
                anchor.insertAdjacentElement('afterend', row);
            } else {
                container.insertBefore(row, container.firstChild);
            }
            anchor = row;
        });
    }

    // ------------------------------------------------------------------
    // Chargement des données
    // ------------------------------------------------------------------

    function loadOptions() {
        if (options) {
            return Promise.resolve(options);
        }

        return getJson('MediaCarousel/ClientOptions').then(function (result) {
            options = result || {};
            return options;
        });
    }

    function loadList(path, params) {
        return getJson(path, params).then(function (result) {
            return (result && result.Items) || [];
        }, function () {
            // Une section indisponible ne doit pas empêcher les autres de s'afficher.
            return [];
        });
    }

    /**
     * Mémorise le résultat d'une requête pendant CACHE_TTL. Un échec n'est jamais mémorisé :
     * une panne passagère ne doit pas condamner la rangée pour cinq minutes.
     */
    function loadCached(path, params) {
        var key = path + '|' + JSON.stringify(params || {});
        var entry = cache[key];
        var now = Date.now();

        if (entry && now - entry.time < CACHE_TTL) {
            return Promise.resolve(entry.value);
        }

        return loadList(path, params).then(function (value) {
            if (value.length) {
                cache[key] = { time: now, value: value };
            }
            return value;
        });
    }

    /**
     * Charge les titres d'un genre depuis l'API native de Jellyfin : requête indexée,
     * paginée et déjà filtrée selon les droits de l'utilisateur courant.
     */
    function loadCachedGenreItems(genreId, limit) {
        return loadCached('Items', {
            UserId: window.ApiClient.getCurrentUserId(),
            GenreIds: genreId,
            IncludeItemTypes: 'Movie,Series',
            Recursive: true,
            Limit: limit,
            SortBy: 'Random',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary',
            EnableTotalRecordCount: false
        });
    }

    /**
     * Les rangées de genre sont remplies quand elles approchent du champ de vision,
     * pour ne pas déclencher toutes les requêtes au chargement de la page.
     */
    function deferGenreRow(section, genre, limit) {
        var loaded = false;

        function load() {
            if (loaded) {
                return;
            }
            loaded = true;

            loadCachedGenreItems(genre.Id, limit).then(function (items) {
                fillRow(section, items.map(buildPlainCard).join(''), 'Aucun titre dans ce genre.');
            });
        }

        if (typeof window.IntersectionObserver !== 'function') {
            load();
            return;
        }

        var observer = new window.IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting) {
                    observer.disconnect();
                    load();
                    return;
                }
            }
        }, { rootMargin: '400px 0px' });

        observer.observe(section);
    }

    // ------------------------------------------------------------------
    // Rendu
    // ------------------------------------------------------------------

    function collectRows(opts) {
        var requests = [
            opts.ShowLocalRow ? loadCached('MediaCarousel/Top/Local', { limit: opts.LocalRowSize || 10 }) : [],
            opts.ShowGlobalRow ? loadCached('MediaCarousel/Top/Global', { limit: opts.GlobalRowSize || 10 }) : [],
            opts.ShowStudioRow ? loadCached('MediaCarousel/Studios', { limit: opts.StudioRowSize || 20 }) : [],
            opts.ShowGenreRows ? loadCached('MediaCarousel/Genres', { limit: opts.GenreRowCount || 6 }) : []
        ];

        return Promise.all(requests).then(function (results) {
            var rows = [];

            if (results[0].length) {
                rows.push(buildRow(
                    opts.LocalRowTitle || 'Top 10 sur ce serveur',
                    'Top 10',
                    results[0].map(buildRankedCard).join('')));
            }

            if (results[1].length) {
                rows.push(buildRow(
                    opts.GlobalRowTitle || 'Top 10 mondial',
                    'Monde',
                    results[1].map(buildRankedCard).join('')));
            }

            if (results[2].length) {
                rows.push(buildRow(
                    opts.StudioRowTitle || 'Par studio',
                    null,
                    results[2].map(buildTileCard).join('')));
            }

            results[3].forEach(function (genre) {
                var row = buildRow(genre.Name, null, '');
                rows.push(row);
                deferGenreRow(row, genre, opts.GenreRowItemCount || 20);
            });

            return rows;
        });
    }

    function render() {
        if (rendering || !ready()) {
            return Promise.resolve();
        }

        var container = findSectionsContainer();
        if (!container || container.querySelector('.' + ROW_CLASS)) {
            return Promise.resolve();
        }

        rendering = true;

        return loadOptions().then(function (opts) {
            if (!opts.EnableHomeRows) {
                return null;
            }

            injectStyles(opts.HighlightColor || '#e50914');

            return collectRows(opts).then(function (rows) {
                var target = findSectionsContainer();

                // La page a pu être reconstruite pendant le chargement des données.
                if (!target || target.querySelector('.' + ROW_CLASS) || !rows.length) {
                    return null;
                }

                insertRows(target, rows);
                return null;
            });
        }).catch(function (error) {
            log('rendu impossible', error);
        }).then(function () {
            rendering = false;
        });
    }

    function schedule() {
        window.clearTimeout(scheduled);
        scheduled = window.setTimeout(render, 250);
    }

    // ------------------------------------------------------------------
    // Cycle de vie
    // ------------------------------------------------------------------

    function watch() {
        // Jellyfin reconstruit entièrement `.homeSectionsContainer` à chaque affichage
        // de l'accueil : on réagit aux mutations plutôt qu'à un évènement de navigation
        // dont le nom change selon les versions.
        var observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('hashchange', schedule);
        document.addEventListener('viewshow', schedule);
    }

    function start() {
        RETRY_DELAYS.forEach(function (delay) {
            window.setTimeout(render, delay);
        });
        watch();
    }

    function waitForJellyfin(attempt) {
        if (ready()) {
            start();
            return;
        }

        if (attempt > 300) {
            return;
        }

        window.setTimeout(function () {
            waitForJellyfin(attempt + 1);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { waitForJellyfin(0); });
    } else {
        waitForJellyfin(0);
    }
})();
