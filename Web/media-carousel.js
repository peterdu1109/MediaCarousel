/*
 * Media Carousel — rangées « Top 10 » façon Netflix sur la page d'accueil Jellyfin.
 *
 * Jellyfin ne propose aucun point d'extension serveur pour la page d'accueil : ses sections
 * sont une énumération fermée rendue par le client web. Ce script est donc la seule façon
 * d'y ajouter une rangée. Il reste volontairement minimal : il ne remplace pas la page
 * d'accueil, ne masque rien, et se contente d'insérer ses rangées sous les bibliothèques.
 *
 * Toutes les données viennent du backend du plugin, déjà calculées et mises en cache :
 * ce script ne fait aucun calcul et n'interroge jamais la bibliothèque directement.
 */
(function () {
    'use strict';

    var LOG_PREFIX = '[MediaCarousel]';
    var ROW_CLASS = 'mc-row';
    var STYLE_ID = 'mc-styles';
    var RETRY_DELAYS = [0, 400, 1200, 3000];

    var options = null;
    var rendering = false;
    var scheduled = null;
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

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    function injectStyles(accent) {
        var existing = document.getElementById(STYLE_ID);
        if (existing) {
            existing.textContent = buildCss(accent);
            return;
        }

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = buildCss(accent);
        document.head.appendChild(style);
    }

    function buildCss(accent) {
        return [
            ':root{--mc-accent:' + accent + ';}',

            '.mc-row{margin:0 0 2.4em;}',
            '.mc-row-header{display:flex;align-items:center;gap:.6em;}',
            '.mc-row-header .mc-row-title{margin:0;}',
            '.mc-row-badge{font-size:.62em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;',
            'padding:.25em .6em;border-radius:3px;background:var(--mc-accent);color:#fff;white-space:nowrap;}',

            '.mc-strip-wrap{position:relative;}',
            '.mc-strip{display:flex;gap:.7em;overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;',
            'padding:1.6em 3.4vw 1.2em;scrollbar-width:none;-ms-overflow-style:none;}',
            '.mc-strip::-webkit-scrollbar{display:none;}',

            /* Carte : le chiffre géant est en retrait derrière l'affiche, comme sur Netflix. */
            '.mc-card{position:relative;display:flex;align-items:flex-end;flex:0 0 auto;',
            'text-decoration:none;color:inherit;transition:transform .18s ease;transform-origin:center bottom;}',
            '.mc-card:hover,.mc-card:focus-visible{transform:scale(1.06);z-index:2;outline:none;}',

            /* La couleur pleine sert de repli : sans -webkit-text-stroke, le chiffre reste lisible. */
            '.mc-rank{font-size:8.5rem;line-height:.72;font-weight:900;font-style:italic;',
            'color:rgba(255,255,255,.16);-webkit-text-stroke:3px rgba(255,255,255,.62);',
            'margin:0 -.28em 0 0;user-select:none;pointer-events:none;flex:0 0 auto;}',
            '.mc-card:hover .mc-rank{-webkit-text-stroke-color:var(--mc-accent);}',
            '.mc-rank-10{letter-spacing:-.06em;}',

            '.mc-poster{position:relative;width:120px;height:180px;border-radius:5px;overflow:hidden;',
            'background:rgba(255,255,255,.07);box-shadow:0 4px 14px rgba(0,0,0,.45);flex:0 0 auto;}',
            '.mc-poster img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-card:hover .mc-poster{box-shadow:0 8px 22px rgba(0,0,0,.6);}',

            /* Repli quand aucune affiche n'est disponible. */
            '.mc-fallback{display:flex;align-items:center;justify-content:center;height:100%;',
            'padding:.6em;text-align:center;font-size:.78em;line-height:1.25;opacity:.85;}',

            '.mc-unavailable .mc-poster{opacity:.55;}',
            '.mc-unavailable .mc-poster::after{content:attr(data-label);position:absolute;left:0;right:0;bottom:0;',
            'padding:.3em;font-size:.62em;text-align:center;background:rgba(0,0,0,.72);}',

            /* Flèches de défilement, masquées au tactile. */
            '.mc-arrow{position:absolute;top:0;bottom:0;width:3.2vw;min-width:34px;border:0;cursor:pointer;',
            'background:rgba(0,0,0,.45);color:#fff;font-size:1.5em;line-height:1;opacity:0;',
            'transition:opacity .18s ease;z-index:3;}',
            '.mc-arrow-prev{left:0;}',
            '.mc-arrow-next{right:0;}',
            '.mc-strip-wrap:hover .mc-arrow{opacity:1;}',
            '.mc-arrow:disabled{opacity:0!important;pointer-events:none;}',

            '@media (max-width:800px){',
            '.mc-rank{font-size:5.6rem;-webkit-text-stroke-width:2px;}',
            '.mc-poster{width:88px;height:132px;}',
            '.mc-strip{padding:1.1em 3.4vw .9em;}',
            '}',

            '@media (hover:none){.mc-arrow{display:none;}.mc-card:hover{transform:none;}}',

            '@media (prefers-reduced-motion:reduce){',
            '.mc-card{transition:none;}.mc-strip{scroll-behavior:auto;}',
            '}'
        ].join('');
    }

    // ------------------------------------------------------------------
    // Rendu
    // ------------------------------------------------------------------

    function buildCard(entry, serverId) {
        var item = entry.Item;
        var inLibrary = !!item;
        var title = escapeHtml(inLibrary ? item.Name : entry.Name);
        var rank = entry.Rank;

        var poster = '';
        if (inLibrary && item.ImageTags && item.ImageTags.Primary) {
            poster = '<img loading="lazy" alt="" src="' + escapeHtml(window.ApiClient.getImageUrl(item.Id, {
                type: 'Primary',
                maxWidth: 300,
                tag: item.ImageTags.Primary
            })) + '">';
        } else if (!inLibrary && entry.PosterUrl) {
            poster = '<img loading="lazy" alt="" src="' + escapeHtml(entry.PosterUrl) + '">';
        } else {
            poster = '<div class="mc-fallback">' + title + '</div>';
        }

        var attributes = 'class="mc-card' + (inLibrary ? '' : ' mc-unavailable') + '"'
            + ' title="' + title + (entry.ProductionYear ? ' (' + entry.ProductionYear + ')' : '') + '"';

        var inner = '<span class="mc-rank' + (rank >= 10 ? ' mc-rank-10' : '') + '" aria-hidden="true">' + rank + '</span>'
            + '<span class="mc-poster"' + (inLibrary ? '' : ' data-label="Absent"') + '>' + poster + '</span>';

        if (inLibrary) {
            return '<a ' + attributes + ' href="#/details?id=' + encodeURIComponent(item.Id)
                + '&serverId=' + encodeURIComponent(item.ServerId || serverId || '') + '">' + inner + '</a>';
        }

        // Titre absent de la bibliothèque : carte non cliquable plutôt qu'un lien mort.
        return '<span ' + attributes + '>' + inner + '</span>';
    }

    function buildRow(title, badge, entries, serverId) {
        var section = document.createElement('div');
        section.className = 'verticalSection ' + ROW_CLASS;

        var cards = entries.map(function (entry) {
            return buildCard(entry, serverId);
        }).join('');

        section.innerHTML =
            '<div class="mc-row-header padded-left">'
            + '<h2 class="sectionTitle sectionTitle-cards mc-row-title">' + escapeHtml(title) + '</h2>'
            + (badge ? '<span class="mc-row-badge">' + escapeHtml(badge) + '</span>' : '')
            + '</div>'
            + '<div class="mc-strip-wrap">'
            + '<button type="button" class="mc-arrow mc-arrow-prev" aria-label="Précédent">&#10094;</button>'
            + '<div class="mc-strip">' + cards + '</div>'
            + '<button type="button" class="mc-arrow mc-arrow-next" aria-label="Suivant">&#10095;</button>'
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

        // Les images arrivent après coup : l'état des flèches doit être recalculé.
        window.setTimeout(refresh, 0);
        window.setTimeout(refresh, 800);
    }

    // ------------------------------------------------------------------
    // Insertion dans la page d'accueil
    // ------------------------------------------------------------------

    /**
     * Repère le conteneur des sections de l'onglet Accueil visible.
     * Jellyfin construit `.homeSectionsContainer` avec un div `.section{N}` par section.
     */
    function findSectionsContainer() {
        var tabs = document.querySelectorAll('#homeTab .homeSectionsContainer, .homeSectionsContainer');

        for (var i = 0; i < tabs.length; i++) {
            var candidate = tabs[i];
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
                anchor = row;
            } else {
                container.insertBefore(row, container.firstChild);
                anchor = row;
            }
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

    function loadTop(path, limit) {
        return getJson(path, { limit: limit }).then(function (result) {
            return (result && result.Items) || [];
        }, function () {
            // Un classement indisponible ne doit pas empêcher l'autre de s'afficher.
            return [];
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
            if (!opts.EnableHomeRows || (!opts.ShowLocalRow && !opts.ShowGlobalRow)) {
                return null;
            }

            injectStyles(opts.HighlightColor || '#e50914');

            return Promise.all([
                opts.ShowLocalRow ? loadTop('MediaCarousel/Top/Local', opts.LocalRowSize || 10) : [],
                opts.ShowGlobalRow ? loadTop('MediaCarousel/Top/Global', opts.GlobalRowSize || 10) : []
            ]).then(function (results) {
                var target = findSectionsContainer();
                if (!target || target.querySelector('.' + ROW_CLASS)) {
                    return null;
                }

                var serverId = window.ApiClient.serverId ? window.ApiClient.serverId() : '';
                var rows = [];

                if (results[0].length) {
                    rows.push(buildRow(opts.LocalRowTitle || 'Top 10 sur ce serveur', 'Top 10', results[0], serverId));
                }

                if (results[1].length) {
                    rows.push(buildRow(opts.GlobalRowTitle || 'Top 10 mondial', 'Monde', results[1], serverId));
                }

                if (rows.length) {
                    insertRows(target, rows);
                }

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
