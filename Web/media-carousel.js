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
    // Doit rester synchronisé avec PluginConfiguration.HighlightColor.
    var DEFAULT_ACCENT = '#775BF4';
    // Les sections que Jellyfin construit lui-même : `<div class="verticalSection section0">`.
    var NATIVE_SECTION = /(^|\s)section\d+(\s|$)/;

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

    /* Vrai quand le theme hote peint un fond clair. Renseigne par render(). */
    var onLightBackground = false;

    /**
     * Determine si le fond effectif de la page est clair.
     *
     * Les chiffres du rang sont des blancs translucides : invisibles sur un theme
     * clair. Aucun media query ne peut le dire — les themes Jellyfin ne suivent pas
     * prefers-color-scheme — donc la couleur est lue sur la page elle-meme, en
     * remontant jusqu'au premier fond opaque.
     */
    function isLightBackground() {
        try {
            var el = document.body;
            while (el) {
                var raw = window.getComputedStyle(el).backgroundColor || '';
                var match = raw.match(/rgba?\(([^)]+)\)/);
                if (match) {
                    var parts = match[1].split(',');
                    var alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
                    if (alpha > 0.1) {
                        var luminance = 0.2126 * parseFloat(parts[0])
                            + 0.7152 * parseFloat(parts[1])
                            + 0.0722 * parseFloat(parts[2]);
                        return luminance > 140;
                    }
                }
                el = el.parentElement;
            }
        } catch (error) {
            // Une couleur illisible n'est pas une raison de casser le rendu.
        }

        // Le theme par defaut de Jellyfin est sombre.
        return false;
    }

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

    /* La couleur est interpolée dans une feuille de style : une valeur inattendue y
       injecterait du CSS. Le champ de configuration est un sélecteur de couleur, mais
       l'API de configuration de Jellyfin accepte n'importe quelle chaîne. */
    function safeAccent(value) {
        return /^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? value : DEFAULT_ACCENT;
    }

    /**
     * Feuille de style de nos rangées.
     *
     * Deux règles de cohabitation avec les thèmes (ElegantFin, Custom CSS de Jellyfin) :
     *
     * 1. Tout est réglé par des variables portées par `.mc-row`, jamais par `:root`.
     *    Quand le thème hôte expose déjà un jeton — `--sidePadding`, `--itemColumnGap`,
     *    `--smallRadius` — on l'adopte, avec la valeur native de Jellyfin en repli.
     *    Un thème ou l'administrateur peut redéfinir n'importe quel `--mc-*` sans
     *    avoir à surcharger nos règles.
     *
     * 2. Nos sélecteurs portent toujours deux classes. Nos rangées réutilisent
     *    volontairement `verticalSection`, `sectionTitle` et `scrollX` pour hériter du
     *    style natif — mais ElegantFin cible aussi ces classes, à égalité de
     *    spécificité. Sans ce doublement, le vainqueur dépendrait de l'ordre
     *    d'insertion des feuilles de style, qui n'est pas sous notre contrôle.
     */
    function buildCss(accent) {
        return [
            '.mc-row{',
            '--mc-accent:' + safeAccent(accent) + ';',
            /* Jetons repris du thème hôte quand il en expose. */
            '--mc-side-padding:var(--sidePadding,3.3%);',
            '--mc-gap:var(--itemColumnGap,.7em);',
            '--mc-radius:var(--smallRadius,5px);',
            /* Dimensions par défaut : ordinateur de bureau. Les points de rupture plus bas
               ne redéfinissent que ces jetons, jamais une règle. */
            '--mc-poster-width:124px;--mc-poster-height:186px;',
            '--mc-tile-width:172px;--mc-tile-height:104px;',
            '--mc-rank-size:7rem;--mc-rank-stroke:3px;',
            '--mc-label-size:.78em;--mc-strip-pad-y:1.6em;',
            /* Courbe et durée communes : une seule décélération pour tout le rendu. */
            '--mc-ease:cubic-bezier(.22,.61,.36,1);--mc-dur:.28s;',
            '--mc-rank-fill:rgba(255,255,255,.25);',
            '--mc-rank-outline:rgba(255,255,255,.85);',
            '--mc-surface:rgba(255,255,255,.07);',
            '--mc-surface-hover:rgba(255,255,255,.13);',
            '--mc-scrim:rgba(0,0,0,.45);',
            '--mc-shadow:0 4px 14px rgba(0,0,0,.45);',
            '--mc-shadow-hover:0 8px 22px rgba(0,0,0,.6);',
            '}',

            /* Ne pas dépendre de la remise à zéro du client hôte pour nos dimensions. */
            '.mc-row *,.mc-row *::before,.mc-row *::after{box-sizing:border-box;}',

            /* Entrée des rangées : opacité et translation seules — ce sont les deux
               propriétés que le compositeur traite sans repasser par la mise en page,
               donc les seules tenables sur le processeur d'un téléviseur. Le décalage
               par rangée est posé en JS, à l'insertion. */
            '@keyframes mc-rise{from{opacity:0;transform:translate3d(0,16px,0);}',
            'to{opacity:1;transform:translate3d(0,0,0);}}',
            '.verticalSection.mc-row{margin:0 0 2.4em;',
            'animation:mc-rise .45s var(--mc-ease) both;}',
            /* L'espacement passe par des marges, jamais par `gap` : la propriété n'arrive
               qu'avec Chromium 84 en flexbox, et les téléviseurs Tizen jusqu'à la 6.0
               tournent en Chromium 76 — les cartes s'y colleraient les unes aux autres. */
            '.mc-row .mc-row-header{display:flex;align-items:center;flex-wrap:wrap;}',
            '.mc-row .mc-row-header>*{margin-right:.6em;}',
            '.mc-row .mc-row-header>*:last-child{margin-right:0;}',
            '.mc-row .mc-row-header .mc-row-title{margin:0;}',

            '.mc-row .mc-strip-wrap{position:relative;}',
            /* Le padding est répété ici : ElegantFin impose son propre padding-left
               à `.scrollX`, que notre bande porte pour neutraliser le swipe d'onglet. */
            /* proximity plutot que mandatory : l'accroche aide en fin de geste sans
               confisquer un defilement libre a la molette ou au doigt. */
            '.mc-row .mc-strip{display:flex;overflow-x:auto;overflow-y:hidden;',
            'padding:var(--mc-strip-pad-y) var(--mc-side-padding);scrollbar-width:none;-ms-overflow-style:none;',
            'scroll-snap-type:x proximity;scroll-padding-left:var(--mc-side-padding);}',
            '.mc-row .mc-strip>*{scroll-snap-align:start;}',
            '.mc-row .mc-strip::-webkit-scrollbar{display:none;}',
            '.mc-row .mc-strip>*{margin-right:var(--mc-gap);}',
            '.mc-row .mc-strip>*:last-child{margin-right:0;}',

            /* Carte classée : le chiffre géant est en retrait derrière l'affiche. */
            '.mc-row .mc-card{position:relative;display:flex;align-items:flex-end;flex:0 0 auto;',
            'text-decoration:none;color:inherit;transform-origin:center bottom;',
            'transition:transform var(--mc-dur) var(--mc-ease);}',
            '.mc-row .mc-card:hover{transform:scale(1.045);z-index:2;}',

            /* La couleur pleine sert de repli : sans -webkit-text-stroke, le chiffre reste lisible. */
            /* Le chiffre passe DEVANT l'affiche. Sans `position`, il reste un élément
               statique là où `.mc-poster` est positionné : l'affiche peindrait par-dessus
               et la marge négative avalerait le glyphe — presque entièrement sur un « 1 »,
               qui est le plus étroit des chiffres. */
            '.mc-row .mc-rank{position:relative;z-index:1;',
            'font-size:var(--mc-rank-size);line-height:.72;font-weight:900;font-style:italic;',
            'color:var(--mc-rank-fill);-webkit-text-stroke:var(--mc-rank-stroke) var(--mc-rank-outline);',
            /* Chiffres à chasse fixe : le « 1 » occupe la même largeur que le « 8 »,
               sinon le recouvrement, constant, en mange une bien plus grande part. */
            'font-variant-numeric:tabular-nums;font-feature-settings:"tnum";',
            'margin:0 -.24em 0 0;user-select:none;pointer-events:none;flex:0 0 auto;',
            'transition:-webkit-text-stroke-color var(--mc-dur) var(--mc-ease);}',
            '.mc-row .mc-card:hover .mc-rank,.mc-row .mc-card:focus .mc-rank{',
            '-webkit-text-stroke-color:var(--mc-accent);}',
            '.mc-row .mc-rank-10{letter-spacing:-.06em;}',

            /* display:block est indispensable : hors conteneur flex, un span reste inline
               et ignore width/height, ce qui aplatit les cartes des rangées de genre. */
            '.mc-row .mc-poster{position:relative;display:block;overflow:hidden;flex:0 0 auto;',
            'width:var(--mc-poster-width);height:var(--mc-poster-height);',
            'border-radius:var(--mc-radius);background:var(--mc-surface);box-shadow:var(--mc-shadow);}',
            /* L'affiche est légèrement agrandie dans son cadre : deux échelles superposées
               donnent de la profondeur là où une seule paraît plate. */
            /* L'image nait transparente et se fond une fois chargee : le cadre colore
               tient la place, rien ne surgit. */
            '.mc-row .mc-poster img{width:100%;height:100%;object-fit:cover;display:block;',
            'opacity:0;transition:transform .45s var(--mc-ease),opacity .35s var(--mc-ease);}',
            '.mc-row .mc-poster img.mc-ready{opacity:1;}',
            '.mc-row .mc-card:hover .mc-poster img,.mc-row .mc-card:focus .mc-poster img,',
            '.mc-row .mc-plain:hover .mc-poster img,.mc-row .mc-plain:focus .mc-poster img{',
            'transform:scale(1.07);}',
            '.mc-row .mc-poster{transition:box-shadow var(--mc-dur) var(--mc-ease);}',
            '.mc-row .mc-card:hover .mc-poster,.mc-row .mc-card:focus .mc-poster{',
            'box-shadow:var(--mc-shadow-hover);}',

            '.mc-row .mc-fallback{display:flex;align-items:center;justify-content:center;height:100%;',
            'padding:.6em;text-align:center;font-size:var(--mc-label-size);line-height:1.25;opacity:.85;}',

            '.mc-row .mc-unavailable .mc-poster{opacity:.55;}',
            '.mc-row .mc-unavailable .mc-poster::after{content:attr(data-label);position:absolute;left:0;right:0;bottom:0;',
            'padding:.3em;font-size:.62em;text-align:center;background:rgba(0,0,0,.72);}',

            /* Carte de studio : vignette large centrée sur le logo. */
            '.mc-row .mc-tile{flex:0 0 auto;position:relative;overflow:hidden;',
            'width:var(--mc-tile-width);height:var(--mc-tile-height);border-radius:var(--mc-radius);',
            'display:flex;align-items:center;justify-content:center;padding:.9em;text-align:center;',
            'background:var(--mc-surface);text-decoration:none;color:inherit;',
            'transition:transform var(--mc-dur) var(--mc-ease),background var(--mc-dur) var(--mc-ease);}',
            '.mc-row .mc-tile:hover{transform:scale(1.05);background:var(--mc-surface-hover);z-index:2;}',
            '.mc-row .mc-tile img{max-width:100%;max-height:100%;object-fit:contain;display:block;',
            'opacity:0;transition:opacity .35s var(--mc-ease);}',
            '.mc-row .mc-tile img.mc-ready{opacity:1;}',
            '.mc-row .mc-tile-name{font-size:var(--mc-label-size);font-weight:600;line-height:1.2;}',

            /* Carte simple, utilisée par les rangées de genre. */
            '.mc-row .mc-plain{flex:0 0 auto;width:var(--mc-poster-width);text-decoration:none;',
            'color:inherit;transition:transform var(--mc-dur) var(--mc-ease);}',
            '.mc-row .mc-plain:hover{transform:scale(1.045);z-index:2;}',
            '.mc-row .mc-plain-name{margin-top:.4em;font-size:var(--mc-label-size);line-height:1.25;',
            'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',

            /* Focus : `:focus` d'abord, car `:focus-visible` n'arrive qu'avec Chromium 86 et
               qu'aucun téléviseur Tizen ne l'a — jusqu'à la 6.5, qui est en Chromium 85.
               Sans ce repli, la télécommande déplace un focus invisible. La règle suivante
               retire le contour au clic souris ; les moteurs qui ignorent `:focus-visible`
               la jugent invalide et l'écartent entièrement, ce qui est le comportement
               recherché. */
            '.mc-row .mc-card:focus,.mc-row .mc-tile:focus,.mc-row .mc-plain:focus{',
            'outline:3px solid var(--mc-accent);outline-offset:3px;border-radius:6px;z-index:2;}',
            '.mc-row .mc-card:focus,.mc-row .mc-plain:focus{transform:scale(1.045);}',
            '.mc-row .mc-tile:focus{transform:scale(1.05);background:var(--mc-surface-hover);}',
            '.mc-row .mc-card:focus:not(:focus-visible),',
            '.mc-row .mc-tile:focus:not(:focus-visible),',
            '.mc-row .mc-plain:focus:not(:focus-visible){outline:none;transform:none;}',

            /* Silhouettes d'attente des rangees differees : la pulsation ne touche que
               l'opacite, seule animation qu'un televiseur encaisse sans broncher. */
            '@keyframes mc-pulse{0%,100%{opacity:.45;}50%{opacity:.9;}}',
            '.mc-row .mc-skeleton .mc-poster{animation:mc-pulse 1.4s ease-in-out infinite;box-shadow:none;}',

            '.mc-row .mc-empty{padding:0 var(--mc-side-padding) 1em;opacity:.6;font-size:.85em;}',

            /* Seule règle hors de notre arbre : elle s'applique aux sections de Jellyfin,
               et doit l'emporter sur le display d'un thème. */
            '.mc-hidden-native{display:none!important;}',

            /* Flèches de défilement : confort souris, masquées au clavier et au tactile. */
            '.mc-row .mc-arrow{position:absolute;top:0;bottom:0;width:3.2vw;min-width:34px;max-width:72px;',
            'border:0;cursor:pointer;background:var(--mc-scrim);color:#fff;font-size:1.5em;line-height:1;',
            'opacity:0;transition:opacity var(--mc-dur) var(--mc-ease),transform var(--mc-dur) var(--mc-ease);',
            'z-index:3;}',
            '.mc-row .mc-arrow-prev{left:0;transform:translate3d(-6px,0,0);}',
            '.mc-row .mc-arrow-next{right:0;transform:translate3d(6px,0,0);}',
            '.mc-row .mc-strip-wrap:hover .mc-arrow{opacity:1;transform:translate3d(0,0,0);}',
            '.mc-row .mc-arrow:disabled{opacity:0!important;pointer-events:none;}',

            /* ------------------------------------------------------------------
               Dimensionnement adaptatif.

               Uniquement des points de rupture sur les jetons : `clamp()` serait plus
               concis mais demande Chromium 79, que les téléviseurs Tizen n'ont pas.
               ------------------------------------------------------------------ */

            /* Téléphone en portrait. */
            '@media (max-width:479px){',
            '.mc-row{--mc-poster-width:92px;--mc-poster-height:138px;',
            '--mc-tile-width:128px;--mc-tile-height:78px;',
            '--mc-rank-size:4.6rem;--mc-rank-stroke:2px;',
            '--mc-label-size:.72em;--mc-strip-pad-y:1em;}',
            '}',

            /* Téléphone en paysage, petite tablette. */
            '@media (min-width:480px) and (max-width:799px){',
            '.mc-row{--mc-poster-width:104px;--mc-poster-height:156px;',
            '--mc-tile-width:144px;--mc-tile-height:88px;',
            '--mc-rank-size:5.6rem;--mc-rank-stroke:2px;',
            '--mc-label-size:.75em;--mc-strip-pad-y:1.1em;}',
            '}',

            /* Grand écran de bureau. */
            '@media (min-width:1280px){',
            '.mc-row{--mc-poster-width:142px;--mc-poster-height:213px;',
            '--mc-tile-width:196px;--mc-tile-height:118px;',
            '--mc-rank-size:8.5rem;--mc-label-size:.8em;}',
            '}',

            '@media (min-width:1600px){',
            '.mc-row{--mc-poster-width:158px;--mc-poster-height:237px;',
            '--mc-tile-width:216px;--mc-tile-height:130px;',
            '--mc-rank-size:9.5rem;--mc-rank-stroke:4px;',
            '--mc-label-size:.84em;--mc-strip-pad-y:1.8em;}',
            '}',

            /* Téléviseur 1080p et grands moniteurs. Un téléviseur 4K sous Tizen déclare
               lui aussi 1920 pixels CSS : c'est ce palier qui le sert. Les libellés
               grossissent plus vite que les affiches — ils se lisent de loin. */
            '@media (min-width:1920px){',
            '.mc-row{--mc-poster-width:178px;--mc-poster-height:267px;',
            '--mc-tile-width:244px;--mc-tile-height:146px;',
            '--mc-rank-size:11rem;--mc-rank-stroke:5px;',
            '--mc-label-size:.95em;--mc-strip-pad-y:2.1em;}',
            '.verticalSection.mc-row{margin:0 0 3em;}',
            '}',

            '@media (min-width:2560px){',
            '.mc-row{--mc-poster-width:208px;--mc-poster-height:312px;',
            '--mc-tile-width:284px;--mc-tile-height:170px;',
            '--mc-rank-size:13rem;--mc-rank-stroke:6px;',
            '--mc-label-size:1.05em;--mc-strip-pad-y:2.4em;}',
            '}',

            /* Écran bas mais large : un téléviseur en 720p, ou une fenêtre aplatie.
               Les affiches sont ramenées à ce que la hauteur permet. */
            '@media (max-height:620px) and (min-width:800px){',
            '.mc-row{--mc-poster-width:112px;--mc-poster-height:168px;',
            '--mc-rank-size:6rem;--mc-strip-pad-y:1em;}',
            '.verticalSection.mc-row{margin:0 0 1.6em;}',
            '}',

            /* Fond clair, detecte en JS sur la couleur reelle de la page : les blancs
               translucides des chiffres y sont invisibles, tout passe en sombre. */
            '.mc-row.mc-on-light{',
            '--mc-rank-fill:rgba(0,0,0,.14);',
            '--mc-rank-outline:rgba(0,0,0,.65);',
            '--mc-surface:rgba(0,0,0,.06);',
            '--mc-surface-hover:rgba(0,0,0,.11);',
            '--mc-scrim:rgba(0,0,0,.55);',
            '--mc-shadow:0 3px 10px rgba(0,0,0,.18);',
            '--mc-shadow-hover:0 6px 16px rgba(0,0,0,.25);',
            '}',

            '@media (hover:none){.mc-row .mc-arrow{display:none;}',
            '.mc-row .mc-card:hover,.mc-row .mc-tile:hover,.mc-row .mc-plain:hover{transform:none;}}',

            /* Rien ne bouge quand le système le demande : ni entrée, ni survol, ni
               défilement animé. `animation:none` doit aussi retirer l'entrée des rangées,
               sans quoi elles resteraient figées sur l'image de départ, invisibles. */
            '@media (prefers-reduced-motion:reduce){',
            '.mc-row .mc-card,.mc-row .mc-tile,.mc-row .mc-plain,',
            '.mc-row .mc-poster,.mc-row .mc-poster img,.mc-row .mc-tile img,.mc-row .mc-arrow{transition:none;}',
            '.verticalSection.mc-row,.mc-row .mc-skeleton .mc-poster{animation:none;}',
            '.mc-row .mc-card:hover,.mc-row .mc-tile:hover,.mc-row .mc-plain:hover,',
            '.mc-row .mc-card:focus,.mc-row .mc-plain:focus{transform:none;}',
            '.mc-row .mc-card:hover .mc-poster img,.mc-row .mc-plain:hover .mc-poster img{transform:none;}',
            '.mc-row .mc-strip{scroll-behavior:auto;}',
            '}',

            '@media (prefers-contrast:more){',
            '.mc-row{--mc-rank-fill:rgba(255,255,255,.5);--mc-surface:rgba(255,255,255,.2);}',
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

        // Le décompte n'est pas affiché : il agrège toutes les variantes du studio, alors
        // que le lien mène à une seule d'entre elles. Il sert au classement, pas au rendu.
        var aria = escapeHtml(name);
        var href = item ? routeUrl(item) : '#';

        return '<a role="listitem" class="mc-tile" href="' + escapeHtml(href) + '"'
            + ' aria-label="' + aria + '">' + content + '</a>';
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

    function buildRow(title, cardsHtml) {
        var section = document.createElement('div');
        var headingId = 'mc-row-title-' + (++sequence);

        section.className = 'verticalSection ' + ROW_CLASS + (onLightBackground ? ' mc-on-light' : '');
        section.setAttribute('aria-labelledby', headingId);

        section.innerHTML =
            '<div class="mc-row-header padded-left">'
            + '<h2 id="' + headingId + '" class="sectionTitle sectionTitle-cards mc-row-title">' + escapeHtml(title) + '</h2>'
            + '</div>'
            + '<div class="mc-strip-wrap">'
            + '<button type="button" class="mc-arrow mc-arrow-prev" tabindex="-1" aria-hidden="true">&#10094;</button>'
            // scrollX est la classe que allowSwipe() de Jellyfin recherche pour ne pas
            // interpréter un défilement horizontal comme un changement d'onglet.
            + '<div class="mc-strip scrollX hiddenScrollX smoothScrollX" role="list">' + (cardsHtml || '') + '</div>'
            + '<button type="button" class="mc-arrow mc-arrow-next" tabindex="-1" aria-hidden="true">&#10095;</button>'
            + '</div>';

        wireArrows(section);
        watchImages(section.querySelector('.mc-strip'));
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

    /**
     * Fait apparaitre chaque image en fondu une fois chargee, au lieu de la laisser
     * surgir. L'evenement load ne remonte pas en bulle mais se capture ; une image
     * deja en cache est marquee immediatement, une image en erreur aussi — une
     * vignette cassee vaut mieux qu'une vignette invisible pour toujours.
     */
    function watchImages(root) {
        function ready(img) {
            img.className += img.className.indexOf('mc-ready') === -1 ? ' mc-ready' : '';
        }

        var images = root.querySelectorAll('img');
        for (var i = 0; i < images.length; i++) {
            if (images[i].complete) {
                ready(images[i]);
            }
        }

        if (!root.mcWatchesImages) {
            root.mcWatchesImages = true;
            root.addEventListener('load', function (event) {
                if (event.target && event.target.tagName === 'IMG') {
                    ready(event.target);
                }
            }, true);
            root.addEventListener('error', function (event) {
                if (event.target && event.target.tagName === 'IMG') {
                    ready(event.target);
                }
            }, true);
        }
    }

    function fillRow(section, cardsHtml, emptyMessage) {
        var strip = section.querySelector('.mc-strip');

        if (cardsHtml) {
            strip.innerHTML = cardsHtml;
            watchImages(strip);
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

    /**
     * Masque les sections natives de Jellyfin pour ne laisser que les bibliothèques et nos
     * rangées. N'est appliqué qu'une fois nos rangées en place : si elles n'ont pas pu être
     * chargées, la page d'accueil reste celle de Jellyfin plutôt que de se retrouver vide.
     *
     * Seuls les conteneurs `.section{N}` construits par `loadSections()` sont visés. Un
     * autre plugin qui insère son propre élément dans ce conteneur n'est jamais masqué :
     * ce réglage sert à écarter les sections de Jellyfin, pas celles des voisins.
     */
    function hideNativeSections(container, librarySection) {
        var sections = container.children;

        for (var i = 0; i < sections.length; i++) {
            var section = sections[i];

            if (section === librarySection
                || section.classList.contains(ROW_CLASS)
                || !NATIVE_SECTION.test(section.className)) {
                continue;
            }

            section.classList.add('mc-hidden-native');
        }
    }

    function insertRows(container, rows) {
        var anchor = findLibrarySection(container);

        // Les rangées sont insérées à la suite, dans l'ordre, juste sous les bibliothèques.
        var librarySection = anchor;

        rows.forEach(function (row, index) {
            // Décalage d'entrée : les rangées arrivent l'une après l'autre plutôt que
            // toutes d'un bloc. Plafonné, sinon la dernière attendrait trop longtemps.
            row.style.animationDelay = Math.min(index * 55, 400) + 'ms';

            if (anchor) {
                anchor.insertAdjacentElement('afterend', row);
            } else {
                container.insertBefore(row, container.firstChild);
            }
            anchor = row;
        });

        return librarySection;
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
     * Repère le dernier film terminé par l'utilisateur courant.
     *
     * Volontairement limité aux films : Jellyfin ne considère une série lue que si tous ses
     * épisodes le sont, si bien qu'une série entamée puis abandonnée passerait pour le
     * dernier titre regardé. Le tri par DatePlayed exige un utilisateur, qui est bien fourni.
     */
    function loadLastWatched() {
        return loadCached('Items', {
            UserId: window.ApiClient.getCurrentUserId(),
            IncludeItemTypes: 'Movie',
            IsPlayed: true,
            Recursive: true,
            Limit: 1,
            SortBy: 'DatePlayed',
            SortOrder: 'Descending',
            Fields: 'Genres',
            EnableImages: false,
            EnableUserData: false,
            EnableTotalRecordCount: false
        }).then(function (items) {
            var item = items[0];
            return item && item.Genres && item.Genres.length ? item : null;
        });
    }

    /**
     * Charge d'autres titres partageant les genres du film indiqué.
     *
     * Deux genres au plus : au-delà, le filtre devient si large qu'il ne recommande plus
     * rien de particulier. Le film de départ est exclu de sa propre rangée.
     */
    function loadBecauseItems(seed, limit) {
        return loadCached('Items', {
            UserId: window.ApiClient.getCurrentUserId(),
            Genres: seed.Genres.slice(0, 2).join('|'),
            ExcludeItemIds: seed.Id,
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
     * Compose le titre de la rangée à partir du gabarit configuré.
     * Un gabarit sans {0} est laissé tel quel.
     */
    function becauseTitle(template, name) {
        var pattern = template || 'Parce que tu as regardé {0}';
        return pattern.indexOf('{0}') === -1 ? pattern : pattern.replace('{0}', name);
    }

    /** Silhouettes d'attente, aux dimensions exactes des cartes qu'elles precedent. */
    function skeletonCards(count) {
        var html = '';
        for (var i = 0; i < count; i++) {
            html += '<span class="mc-plain mc-skeleton" aria-hidden="true"><span class="mc-poster"></span></span>';
        }
        return html;
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

    /**
     * Enchaîne les deux requêtes de la rangée personnalisée. Renvoie null dès que l'une
     * des deux ne donne rien : la rangée est alors simplement absente.
     */
    function loadBecause(opts) {
        return loadLastWatched().then(function (seed) {
            if (!seed) {
                return null;
            }

            return loadBecauseItems(seed, opts.BecauseRowSize || 20).then(function (items) {
                return items.length ? { seed: seed, items: items } : null;
            });
        }).then(null, function () {
            return null;
        });
    }

    function collectRows(opts) {
        var requests = [
            opts.ShowLocalRow ? loadCached('MediaCarousel/Top/Local', { limit: opts.LocalRowSize || 10 }) : [],
            opts.ShowGlobalRow ? loadCached('MediaCarousel/Top/Global', { limit: opts.GlobalRowSize || 10 }) : [],
            opts.ShowReturningRow ? loadCached('MediaCarousel/Rows/Returning', { limit: opts.ReturningRowSize || 20 }) : [],
            opts.ShowNeverPlayedRow ? loadCached('MediaCarousel/Rows/NeverPlayed', { limit: opts.NeverPlayedRowSize || 20 }) : [],
            opts.ShowStudioRow ? loadCached('MediaCarousel/Studios', { limit: opts.StudioRowSize || 20 }) : [],
            opts.ShowGenreRows ? loadCached('MediaCarousel/Genres', { limit: opts.GenreRowCount || 6 }) : [],
            opts.ShowBecauseRow ? loadBecause(opts) : null
        ];

        return Promise.all(requests).then(function (results) {
            var rows = [];

            function addRanked(entries, title) {
                if (entries.length) {
                    rows.push(buildRow(title, entries.map(buildRankedCard).join('')));
                }
            }

            function addPlain(entries, title) {
                if (entries.length) {
                    rows.push(buildRow(title, entries.map(function (entry) {
                        return entry.Item ? buildPlainCard(entry.Item) : '';
                    }).join('')));
                }
            }

            // Un constructeur par identifiant de rangée : l'ordre d'affichage vient de la
            // configuration, plus du code.
            var builders = {
                local: function () {
                    addRanked(results[0], opts.LocalRowTitle || 'Top 10 sur ce serveur');
                },
                global: function () {
                    addRanked(results[1], opts.GlobalRowTitle || 'Top 10 mondial');
                },
                returning: function () {
                    addPlain(results[2], opts.ReturningRowTitle || 'De retour cette semaine');
                },
                neverplayed: function () {
                    addPlain(results[3], opts.NeverPlayedRowTitle || 'Jamais vu');
                },
                // Rangée personnalisée : absente tant que l'utilisateur n'a terminé aucun
                // film, ou si aucun autre titre ne partage ses genres.
                because: function () {
                    if (results[6] && results[6].items.length) {
                        rows.push(buildRow(
                            becauseTitle(opts.BecauseRowTitle, results[6].seed.Name),
                            results[6].items.map(buildPlainCard).join('')));
                    }
                },
                studios: function () {
                    if (results[4].length) {
                        rows.push(buildRow(
                            opts.StudioRowTitle || 'Par studio',
                            results[4].map(buildTileCard).join('')));
                    }
                },
                genres: function () {
                    results[5].forEach(function (genre) {
                        // Des silhouettes occupent la bande en attendant le chargement
                        // differe : une rangee titree mais vide ressemble a une panne.
                        var row = buildRow(genre.Name, skeletonCards(6));
                        rows.push(row);
                        deferGenreRow(row, genre, opts.GenreRowItemCount || 20);
                    });
                }
            };

            rowOrder(opts.RowOrder).forEach(function (id) {
                builders[id]();
            });

            return rows;
        });
    }

    /* L'ordre par défaut sert aussi de liste de référence : ce qui n'y est pas n'existe pas. */
    var DEFAULT_ROW_ORDER = ['local', 'global', 'returning', 'neverplayed', 'because', 'studios', 'genres'];

    /**
     * Normalise l'ordre configuré : les identifiants inconnus sont ignorés, les rangées
     * absentes sont ajoutées à la fin dans l'ordre par défaut. Une valeur enregistrée par
     * une version précédente reste ainsi valable quand une rangée nouvelle apparaît, au
     * lieu de la faire silencieusement disparaître.
     */
    function rowOrder(configured) {
        var order = [];
        var parts = String(configured || '').toLowerCase().split(',');
        var i;

        for (i = 0; i < parts.length; i++) {
            var id = parts[i].replace(/^\s+|\s+$/g, '');
            if (DEFAULT_ROW_ORDER.indexOf(id) !== -1 && order.indexOf(id) === -1) {
                order.push(id);
            }
        }

        for (i = 0; i < DEFAULT_ROW_ORDER.length; i++) {
            if (order.indexOf(DEFAULT_ROW_ORDER[i]) === -1) {
                order.push(DEFAULT_ROW_ORDER[i]);
            }
        }

        return order;
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

            injectStyles(opts.HighlightColor);
            onLightBackground = isLightBackground();

            return collectRows(opts).then(function (rows) {
                var target = findSectionsContainer();

                // La page a pu être reconstruite pendant le chargement des données.
                if (!target || target.querySelector('.' + ROW_CLASS) || !rows.length) {
                    return null;
                }

                var librarySection = insertRows(target, rows);

                if (opts.HideNativeSections) {
                    hideNativeSections(target, librarySection);
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
