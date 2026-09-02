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
     * Types que `appRouter` ouvre sur une fiche, même lorsqu'ils sont des dossiers.
     * L'ordre reproduit celui de `getRouteUrl` pour que la comparaison reste lisible.
     */
    var DETAIL_TYPES = [
        'Series', 'Season', 'Episode',
        'Playlist', 'TvChannel', 'Program', 'BoxSet',
        'MusicAlbum', 'MusicArtist', 'Person', 'Recording'
    ];

    /**
     * Reproduit les règles de `appRouter.getRouteUrl` de jellyfin-web pour les types que
     * nos rangées affichent.
     *
     * Ces règles ne se devinent pas depuis le DTO. Une série porte `IsFolder: true`, mais
     * elle s'ouvre sur sa **fiche** — router au dossier menait à la liste nue de ses
     * saisons, sans synopsis, sans distribution, sans bouton de lecture. Un studio et un
     * genre, eux, s'ouvrent sur une liste filtrée par `studioId` ou `genreId` : `parentId`
     * n'a aucun sens pour eux, ils ne sont le parent de rien, et la page arrivait vide.
     *
     * Toute nouvelle rangée qui afficherait un type absent de cette fonction doit d'abord
     * être confrontée à `getRouteUrl` : le repli sur `IsFolder` n'est correct que pour les
     * vrais conteneurs.
     */
    function routeUrl(item) {
        var id = encodeURIComponent(item.Id);
        var suffix = '&serverId=' + encodeURIComponent(item.ServerId || serverId() || '');

        if (item.Type === 'Genre') {
            return '#/list?genreId=' + id + suffix;
        }

        if (item.Type === 'MusicGenre') {
            return '#/list?musicGenreId=' + id + suffix;
        }

        if (item.Type === 'Studio') {
            return '#/list?studioId=' + id + suffix;
        }

        if (DETAIL_TYPES.indexOf(item.Type) !== -1) {
            return '#/details?id=' + id + suffix;
        }

        if (item.IsFolder) {
            return '#/list?parentId=' + id + suffix;
        }

        return '#/details?id=' + id + suffix;
    }

    /**
     * Résout l'adresse d'une affiche du Top mondial.
     *
     * Le plugin relaie les affiches externes par sa propre route, et la renvoie **relative**
     * pour que `ApiClient.getUrl` y applique le chemin de base du serveur : une adresse
     * absolue commençant par une barre tombe en 404 dès que Jellyfin est servi sous un
     * sous-chemin. Une adresse déjà absolue — un instantané enregistré par une version
     * antérieure, ou une source que le relais ne prend pas en charge — passe telle quelle.
     */
    function posterUrl(value) {
        if (!value) {
            return null;
        }

        return /^https?:\/\//i.test(value) ? value : window.ApiClient.getUrl(value);
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
     * Elle ne dimensionne RIEN. Nos cartes portent le balisage et les classes de
     * `cardBuilder` : `.card`, `.overflowPortraitCard`, `.cardBox`, `.cardScalable`,
     * `.cardPadder`, `.cardImageContainer`, `.cardText`. Leur largeur, leurs marges et
     * leur typographie viennent donc de jellyfin-web et du thème actif — ElegantFin
     * calcule `--cardWidth` à partir d'un `--cardCount` révisé sur une quinzaine de
     * paliers. Toute dimension réinventée ici finit par diverger du reste de la page
     * d'accueil : c'était le défaut de la version précédente, dont les affiches en
     * pixels fixes ne ressemblaient à aucune rangée native.
     *
     * Ne restent que les trois choses qui n'existent pas dans Jellyfin : le chiffre du
     * rang, la bande défilante, et les flèches de confort.
     */
    function buildCss(accent) {
        return [
            '.mc-row{',
            '--mc-accent:' + safeAccent(accent) + ';',
            /* Repris du thème quand il l'expose ; sinon la valeur de `.padded-left`. */
            '--mc-side-padding:var(--sidePadding,3.3%);',
            '--mc-ease:cubic-bezier(.22,.61,.36,1);--mc-dur:.28s;',
            '--mc-rank-stroke:hsl(214,13%,40%);',
            /* Largeur d'affiche des rangees classees. Elle est MESUREE sur une affiche
               non classee de la page et publiee dans `--mc-measured` : la calculer depuis
               `--mc-cardWidth` supposerait de connaitre le modele de boite, le padding de
               `.card` et la marge de `.cardBox`, que chaque theme redefinit. Le repli ne
               sert que si la page ne contient aucune affiche de reference. */
            '--mc-poster-width:var(--mc-measured,calc(var(--cardWidth,15.5vw) - 1.95em));',

            '--mc-scrim:rgba(0,0,0,.45);',
            '}',

            /* Aucune marge propre : `.verticalSection` est déjà espacée par Jellyfin et
               par le thème, exactement comme les sections natives voisines. */

            /* Entrée des rangées : opacité et translation seules — les deux propriétés
               que le compositeur traite sans repasser par la mise en page, donc les
               seules tenables sur le processeur d'un téléviseur. */
            '@keyframes mc-rise{from{opacity:0;transform:translate3d(0,16px,0);}',
            'to{opacity:1;transform:translate3d(0,0,0);}}',
            '.verticalSection.mc-row{animation:mc-rise .45s var(--mc-ease) both;}',

            '.mc-row .mc-strip-wrap{position:relative;}',
            /* La bande porte `scrollX` — la classe que `allowSwipe()` de jellyfin-web
               cherche pour ne pas prendre un défilement horizontal pour un changement
               d'onglet — et `itemsContainer`, pour hériter du `column-gap` du thème.
               Le retrait de .375em compense le padding que `.card` porte lui-même,
               exactement comme le fait `.emby-scroller` de Jellyfin. */
            '.mc-row .mc-strip{display:flex;flex-wrap:nowrap;align-items:flex-start;',
            'overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;',
            'padding-left:calc(var(--mc-side-padding) - .375em);',
            'scroll-snap-type:x proximity;',
            'scroll-padding-left:calc(var(--mc-side-padding) - .375em);}',
            /* La respiration de fin de bande est une CALE, pas un `padding-right`.
               Deux raisons. D'abord `--cardWidth` contient un pourcentage (`3.3%`),
               qui se résout contre la boîte de CONTENU de la bande : un padding la
               rétrécit, et nos affiches sortaient alors un demi-pixel plus larges que
               celles des sections natives — les thèmes, ElegantFin compris, ne padent
               que le côté gauche. Ensuite un `padding-right` en fin de conteneur à
               défilement horizontal est ignoré par plusieurs moteurs ; une cale, elle,
               est une boîte, et tient partout. */
            '.mc-row .mc-strip::after{content:"";flex:0 0 var(--mc-side-padding);}',
            '.mc-row .mc-strip>*{scroll-snap-align:start;}',
            '.mc-row .mc-strip::-webkit-scrollbar{display:none;}',
            /* Une carte native a une largeur fixe ; sans cela, flexbox la comprime dès
               que la bande déborde. */
            '.mc-row .mc-strip>.card{flex:0 0 auto;}',

            /* ------------------------------------------------------------------
               Chiffre du rang.

               En SVG, et non en `-webkit-text-stroke` sur du texte HTML : ce dernier
               donne un contour d'épaisseur FIXE en pixels, qui mangeait la hampe du
               « 1 » et resserrait le « 10 », et qui ne suivait pas la taille de la
               carte. Le SVG porte son propre repère — le glyphe et son contour
               grandissent ensemble avec l'affiche, du téléphone au téléviseur, sans un
               seul point de rupture.
               ------------------------------------------------------------------ */
            /* Le chiffre n'est plus une superposition : il vit dans sa propre colonne,
               en frère de `.cardScalable`. Il n'a donc plus rien à déborder, ni aucun
               z-index à arbitrer — ce qui règle du même coup le `contain: strict` de
               `.cardImageContainer`, qui rognait tout ce qu'on y plaçait. */
            /* La carte prend la largeur de son contenu : le chiffre y ajoute sa part
               sans qu'aucune formule n'ait a etre ajustee palier par palier. */
            '.mc-row .mc-ranked{width:auto!important;}',
            /* Alignement par le HAUT, et non par le bas : la colonne contient l'affiche
               ET son libellé, alors que le chiffre doit se caler sur la seule affiche.
               Aligné par le bas, il descendait de toute la hauteur du libellé et venait
               le chevaucher. Par le haut, ses deux bords tombent sur ceux de l'affiche,
               puisqu'il en a exactement la hauteur. */
            '.mc-row .mc-rank-row{display:flex;align-items:flex-start;}',
            /* L'affiche garde EXACTEMENT la largeur d'une affiche non classee. */
            '.mc-row .mc-rank-col{flex:0 0 var(--mc-poster-width);min-width:0;}',
            /* Marge negative : l'affiche mord sur le chiffre, comme chez Netflix. */
            '.mc-row .mc-rank{flex:0 0 auto;height:calc(var(--mc-poster-width) * 1.5);',
            'margin-right:calc(var(--mc-poster-width) * -.46);',
            'overflow:visible;pointer-events:none;user-select:none;}',
            /* La police est posée EXPLICITEMENT, jamais héritée. Un texte SVG dont aucun
               ancêtre ne déclare `font-family` retombe sur la police par défaut du moteur,
               qui est un SERIF : les chiffres se couvraient alors d'empattements — une barre
               sous le « 1 », des talons sur le « 4 » et le « 10 » — qu'on prend pour un
               défaut de tracé. Jellyfin pose bien une police sur `body`, mais rien ne le
               garantit sous tous les thèmes, et le défaut ne se voit qu'à ce moment-là. */
            '.mc-row .mc-rank text{font-family:"Noto Sans",-apple-system,BlinkMacSystemFont,',
            '"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
            'font-size:108px;font-weight:900;',
            'font-variant-numeric:tabular-nums;font-feature-settings:"tnum";}',

            /* Chiffre evide : contour seul, sans remplissage. Il n'est plus pose SUR
               l'affiche mais a cote, donc il n'a plus rien a contraster — le fond de la
               page suffit, et le voile degrade qui l'accompagnait devient inutile. */
            '.mc-row .mc-rank-glyph{fill:none;stroke:var(--mc-rank-stroke);stroke-width:5;',
            'stroke-linejoin:round;transition:stroke var(--mc-dur) var(--mc-ease);}',
            '.mc-row .card:hover .mc-rank-glyph,.mc-row .card:focus .mc-rank-glyph{',
            'stroke:var(--mc-accent);}',

            /* Titre présent chez la source externe mais absent du serveur : la carte
               n'est pas cliquable, l'affiche est atténuée, la seconde ligne le dit. */
            '.mc-row .mc-unavailable .cardImageContainer{opacity:.55;}',

            /* Logo de studio : contenu dans la vignette, jamais recadré. */
            '.mc-row .mc-tile-logo{max-width:82%;max-height:74%;object-fit:contain;',
            'display:block;opacity:0;transition:opacity .35s var(--mc-ease);}',
            '.mc-row .mc-tile-logo.mc-ready{opacity:1;}',

            /* Silhouettes d attente : la pulsation ne touche que l opacité, seule
               animation qu un téléviseur encaisse sans broncher. */
            '@keyframes mc-pulse{0%,100%{opacity:.45;}50%{opacity:.9;}}',
            '.mc-row .mc-skeleton .cardPadder{animation:mc-pulse 1.4s ease-in-out infinite;}',

            '.mc-row .mc-empty{padding:0 var(--mc-side-padding) 1em;opacity:.6;font-size:.85em;}',

            /* Seule règle hors de notre arbre : elle vise les sections de Jellyfin et
               doit primer sur le `display` du thème. */
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

            /* Repli clavier : jellyfin-web ne stylise le focus que sur les cartes
               marquées `show-focus`, posées uniquement en mode téléviseur. */
            '.mc-row .card:focus{outline:none;}',
            '.mc-row .card:focus .cardScalable{outline:3px solid var(--mc-accent);outline-offset:3px;}',
            '.mc-row .card:focus:not(:focus-visible) .cardScalable{outline:none;}',

            /* Fond clair, détecté en JS sur la couleur réelle de la page : les blancs
               translucides du chiffre y sont invisibles, tout passe en sombre. */
            '.mc-row.mc-on-light{',
            /* Sur fond clair, le gris du contour disparaitrait : il fonce. */
            '--mc-rank-stroke:hsl(214,13%,62%);',
            '--mc-scrim:rgba(0,0,0,.55);',
            '}',

            '@media (hover:none){.mc-row .mc-arrow{display:none;}}',

            '@media (prefers-reduced-motion:reduce){',
            '.verticalSection.mc-row,.mc-row .mc-skeleton .cardPadder{animation:none;}',
            '.mc-row .mc-rank-glyph,.mc-row .mc-tile-logo{transition:none;}',
            '.mc-row .mc-strip{scroll-behavior:auto;}',
            '}',

            '@media (prefers-contrast:more){',
            '.mc-row{--mc-rank-stroke:hsl(214,13%,58%);}',
            '}'
        ].join('');
    }

    // ------------------------------------------------------------------
    // Cartes
    // ------------------------------------------------------------------

    /**
     * Classes que jellyfin-web pose sur ses propres cartes selon la plateforme.
     *
     * `card-hoverable` porte l'effet de survol du bureau, `show-focus` le cadre de
     * focus du mode téléviseur. Les reprendre telles quelles est ce qui fait que nos
     * cartes réagissent exactement comme leurs voisines — y compris sous un thème,
     * ElegantFin stylant `.card-hoverable:hover .cardScalable`.
     */
    function layoutCardClass() {
        var flags = document.documentElement.className + ' ' + (document.body ? document.body.className : '');

        if (flags.indexOf('layout-tv') !== -1) {
            return ' show-focus';
        }

        return flags.indexOf('layout-mobile') !== -1 ? '' : ' card-hoverable';
    }

    /**
     * Prépare une URL destinée à `url('…')` dans un attribut `style` : guillemets et
     * parenthèses y refermeraient la fonction CSS.
     */
    function cssUrl(value) {
        return String(value == null ? '' : value).replace(/["'()\\]/g, encodeURIComponent);
    }

    /**
     * Carte au format natif de Jellyfin.
     *
     * Le balisage reproduit celui de `cardBuilder.buildCard` : mêmes classes, même
     * imbrication. C'est la seule façon d'obtenir exactement la taille, les marges et
     * la typographie des rangées natives — elles sont pilotées par `.card`,
     * `.overflowPortraitCard` et `.cardText`, que jellyfin-web dimensionne et que les
     * thèmes redéfinissent. Une géométrie réinventée ici finirait par diverger.
     *
     * L'affiche est un fond CSS et non une balise `img`, comme chez Jellyfin :
     * `.cardImageContainer` est déjà en `background-size:cover`, et le rapport
     * hauteur/largeur vient de `.cardPadder`, pas de l'image.
     */
    function nativeCard(opts) {
        var shape = opts.shape || 'overflowPortrait';
        var label = opts.ariaLabel || opts.name || '';
        var imageClasses = 'cardImageContainer cardContent' + (opts.contain ? '' : ' coveredImage');
        var style = opts.imageUrl
            ? ' style="background-image:url(&#39;' + escapeHtml(cssUrl(opts.imageUrl)) + '&#39;)"'
            : '';

        var inner = opts.inner || '';

        if (!inner && !opts.imageUrl && opts.name) {
            inner = '<div class="cardText cardDefaultText">' + escapeHtml(opts.name) + '</div>';
        }

        // La décoration s'ajoute toujours, sans jamais tenir lieu de contenu : le voile
        // d'une carte classée ne doit pas empêcher le repli textuel quand l'affiche
        // manque, ni s'ajouter au logo d'un studio comme un second libellé.
        inner += opts.decoration || '';

        var body = opts.href
            ? '<a href="' + escapeHtml(opts.href) + '" data-action="link" class="' + imageClasses
                + ' itemAction"' + style + ' aria-label="' + escapeHtml(label) + '">' + inner + '</a>'
            : '<div class="' + imageClasses + '"' + style + '>' + inner + '</div>';

        // Une seconde ligne vide plutôt qu'absente : deux cartes voisines dont l'une
        // porte une année et l'autre non finiraient sinon à des hauteurs différentes.
        var footer = opts.showText === false
            ? ''
            : '<div class="cardFooter cardFooter-transparent">'
                + '<div class="cardText cardTextCentered cardText-first"><bdi>'
                + escapeHtml(opts.name || '') + '</bdi></div>'
                + '<div class="cardText cardTextCentered cardText-secondary"><bdi>'
                + (opts.secondary ? escapeHtml(opts.secondary) : '&#160;') + '</bdi></div>'
                + '</div>';

        var scalable = '<div class="cardScalable">'
            + '<div class="cardPadder cardPadder-' + shape + '"></div>'
            + body
            + (opts.overlay || '')
            + '</div>';

        // `beside` place un element en frere de l'affiche, dans une ligne flex : c'est la
        // geometrie des rangees classees, ou le chiffre occupe sa propre colonne.
        //
        // Le libelle entre dans la colonne de l'affiche, pas sous la carte entiere : la
        // carte etant elargie par le chiffre, un libelle centre sur elle se retrouverait
        // decale, a cheval sur le chiffre.
        if (opts.beside) {
            scalable = '<div class="mc-rank-row">' + opts.beside
                + '<div class="mc-rank-col">' + scalable + footer + '</div></div>';
            footer = '';
        }

        return '<div class="card ' + shape + 'Card' + layoutCardClass() + ' card-withuserdata'
            + (opts.cardClass ? ' ' + opts.cardClass : '') + '"'
            + (opts.ariaHidden ? ' aria-hidden="true"' : ' role="listitem"')
            + (opts.itemId ? ' data-id="' + escapeHtml(opts.itemId) + '"' : '')
            + (opts.serverId ? ' data-serverid="' + escapeHtml(opts.serverId) + '"' : '')
            + (opts.itemType ? ' data-type="' + escapeHtml(opts.itemType) + '"' : '')
            + ' data-isfolder="' + (opts.isFolder ? 'true' : 'false') + '">'
            + '<div class="cardBox' + (footer ? ' cardBox-bottompadded' : '') + '">'
            + scalable
            + footer
            + '</div></div>';
    }

    /**
     * Chiffre du rang, dessiné en SVG.
     *
     * Un `-webkit-text-stroke` sur du texte HTML donnait un contour d'épaisseur fixe en
     * pixels : il rongeait la hampe du « 1 », resserrait le « 10 », et ne suivait pas
     * la taille de la carte, qui varie d'un facteur quatre entre un téléphone et un
     * téléviseur. Le SVG porte son propre repère : une seule règle CSS et le glyphe
     * garde exactement les mêmes proportions partout.
     *
     * Le repere est resserre sur le glyphe. Un viewBox de 128 unites de haut, hauteur
     * d'em habituelle, laisse pres de quarante pour cent de vide au-dessus des capitales
     * et sous la ligne de base : le chiffre ne remplissait alors jamais la hauteur qu'on
     * lui donnait, et paraissait deux fois plus petit que demande.
     *
     * La largeur du repère suit le nombre de chiffres, pour que « 1 » et « 10 »
     * occupent la même hauteur sans que le second soit comprimé.
     */
    function rankBadge(rank) {
        var text = String(rank);
        var width = 8 + (text.length * 62);

        return '<svg class="mc-rank" viewBox="0 30 ' + width + ' 84" aria-hidden="true"'
            + ' focusable="false" preserveAspectRatio="xMaxYMax meet">'
            + '<text class="mc-rank-glyph" x="' + (width / 2) + '" y="110" text-anchor="middle">'
            + text + '</text></svg>';
    }

    function buildRankedCard(entry) {
        var item = entry.Item;
        var inLibrary = !!item;
        var name = (inLibrary ? item.Name : entry.Name) || '';
        var year = (inLibrary ? item.ProductionYear : entry.ProductionYear) || entry.ProductionYear;

        return nativeCard({
            name: name,
            // Un titre que la source externe classe mais que le serveur n'a pas : la
            // seconde ligne le dit, plutôt qu'un lien mort ou une carte muette.
            secondary: inLibrary ? (year ? String(year) : '') : 'Absent de la bibliothèque',
            imageUrl: inLibrary ? imageUrl(item, 'Primary', 400) : posterUrl(entry.PosterUrl),
            href: inLibrary ? routeUrl(item) : null,
            itemId: inLibrary ? item.Id : null,
            serverId: inLibrary ? (item.ServerId || serverId()) : null,
            itemType: inLibrary ? item.Type : null,
            isFolder: inLibrary && item.IsFolder,
            ariaLabel: 'Numéro ' + entry.Rank + ' : ' + name + (year ? ' (' + year + ')' : '')
                + (inLibrary ? '' : ' — absent de la bibliothèque'),
            cardClass: 'mc-ranked' + (inLibrary ? '' : ' mc-unavailable'),
            beside: rankBadge(entry.Rank)
        });
    }

    /**
     * Carte de studio : format paysage, logo contenu et non recadré — c'est ce que
     * fait Jellyfin pour ses propres vignettes de chaîne.
     */
    function buildTileCard(entry) {
        var item = entry.Item;
        var name = entry.Name || (item && item.Name) || '';
        var logo = item ? (imageUrl(item, 'Logo', 400) || imageUrl(item, 'Thumb', 400)) : null;

        // Le décompte n'est pas affiché : il agrège toutes les variantes du studio,
        // alors que le lien ne mène qu'à l'une d'elles. Il sert au classement.
        return nativeCard({
            shape: 'overflowBackdrop',
            name: name,
            contain: true,
            inner: logo
                ? '<img class="mc-tile-logo" loading="lazy" alt="" src="' + escapeHtml(logo) + '">'
                : '<div class="cardText cardDefaultText">' + escapeHtml(name) + '</div>',
            href: item ? routeUrl(item) : null,
            itemId: item ? item.Id : null,
            serverId: item ? (item.ServerId || serverId()) : null,
            itemType: item ? item.Type : null,
            isFolder: !!(item && item.IsFolder),
            cardClass: 'mc-tile'
        });
    }

    function buildPlainCard(item) {
        return nativeCard({
            name: item.Name || '',
            secondary: item.ProductionYear ? String(item.ProductionYear) : '',
            imageUrl: imageUrl(item, 'Primary', 400),
            href: routeUrl(item),
            itemId: item.Id,
            serverId: item.ServerId || serverId(),
            itemType: item.Type,
            isFolder: item.IsFolder
        });
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
            // En-tête au format natif : le thème stylise `.sectionTitleContainer` et
            // `.sectionTitle-cards`, pas un conteneur inventé pour l'occasion.
            '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left mc-row-header">'
            + '<h2 id="' + headingId + '" class="sectionTitle sectionTitle-cards">' + escapeHtml(title) + '</h2>'
            + '</div>'
            + '<div class="mc-strip-wrap">'
            + '<button type="button" class="mc-arrow mc-arrow-prev" tabindex="-1" aria-hidden="true">&#10094;</button>'
            // `scrollX` est la classe que `allowSwipe()` de Jellyfin cherche pour ne pas
            // interpréter un défilement horizontal comme un changement d'onglet ;
            // `itemsContainer` apporte la gouttière entre cartes définie par le thème.
            + '<div class="mc-strip itemsContainer scrollSlider focuscontainer-x scrollX hiddenScrollX smoothScrollX"'
            + ' role="list">' + (cardsHtml || '') + '</div>'
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

    /**
     * Indique si les nœuds gérés apparaissent déjà dans le conteneur, dans cet ordre.
     *
     * La contiguïté n'est pas exigée : si un autre plugin a glissé sa rangée entre deux des
     * nôtres, l'ordre reste celui demandé et il vaut mieux le laisser tranquille que de le
     * déplacer à chaque rendu.
     */
    function alreadyOrdered(container, managed) {
        var present = [];
        var kids = container.children;
        var i;

        for (i = 0; i < kids.length; i++) {
            if (managed.indexOf(kids[i]) !== -1) {
                present.push(kids[i]);
            }
        }

        if (present.length !== managed.length) {
            return false;
        }

        for (i = 0; i < managed.length; i++) {
            if (present[i] !== managed[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Décalage entre l'index d'une section dans les préférences du compte et l'index
     * de l'élément qui la porte dans le DOM.
     *
     * `getAllSectionsToShow` de jellyfin-web ajoute une section de bibliothèques EN TÊTE
     * sur les interfaces téléviseur quand l'ordre du compte n'en contient aucune : tout
     * glisse alors d'un cran, et `native:nextup` désignait la section voisine. Le
     * conteneur porte onze `.section{N}` sur ces interfaces contre dix ailleurs, ce qui
     * suffit à les reconnaître.
     */
    function nativeOffset(container, nativeLayout) {
        if (!container.querySelector('.section10')) {
            return 0;
        }

        var libraries = Object.prototype.hasOwnProperty.call(nativeLayout, 'smalllibrarytiles')
            || Object.prototype.hasOwnProperty.call(nativeLayout, 'librarybuttons');

        return libraries ? 0 : 1;
    }

    /**
     * Place nos rangées et les sections natives dans l'ordre configuré.
     *
     * Les nœuds concernés sont regroupés en un bloc contigu, à l'emplacement du premier
     * d'entre eux. Ce qui n'est pas géré — la rangée d'un autre plugin, par exemple — n'est
     * jamais déplacé ni supprimé, mais se retrouve après ce bloc s'il était intercalé :
     * dès lors que l'administrateur fixe un ordre, il faut bien que cet ordre soit contigu.
     *
     * Déplacer une section native est sans risque : `loadSection` de jellyfin-web la
     * retrouve par `querySelector('.section' + i)` sur le conteneur, où qu'elle s'y trouve.
     */
    /**
     * Déplace un nœud du conteneur en préservant la liaison aux données des sections
     * natives qu'il contient.
     *
     * `emby-itemscontainer.detachedCallback` met `fetchData`, `getItemsHtml` et
     * `parentContainer` à **null**. Or `loadSection` de jellyfin-web ne les assigne qu'une
     * seule fois, au montage de la page : rien ne les réassigne jamais. Un simple
     * `insertBefore`, qui détache puis rattache le nœud, suffit donc à rendre la section
     * définitivement incapable de se charger — elle reste avec sa classe `hide` et aucune
     * carte, et `resume()` n'y peut rien puisqu'il commence par `if (!this.fetchData)`.
     *
     * C'est ce qui vidait « À suivre » dès que l'ordre configuré la déplaçait.
     */
    function moveSection(container, node, before) {
        var containers = node.querySelectorAll('.itemsContainer');
        var saved = [];
        var i;

        for (i = 0; i < containers.length; i++) {
            saved.push({
                element: containers[i],
                fetchData: containers[i].fetchData,
                getItemsHtml: containers[i].getItemsHtml,
                parentContainer: containers[i].parentContainer
            });
        }

        container.insertBefore(node, before);

        for (i = 0; i < saved.length; i++) {
            var entry = saved[i];

            // Rien à restaurer si la liaison n'existait pas encore : la section n'avait pas
            // fini d'être montée, et jellyfin-web la renseignera lui-même.
            if (!entry.fetchData || entry.element.fetchData) {
                continue;
            }

            entry.element.fetchData = entry.fetchData;
            entry.element.getItemsHtml = entry.getItemsHtml;
            entry.element.parentContainer = entry.parentContainer;

            // La section n'avait peut-être jamais eu le temps de charger avant d'être
            // déplacée : `resume` relance la récupération, et ne fait rien si elle a
            // déjà eu lieu.
            if (typeof entry.element.resume === 'function') {
                entry.element.resume();
            }
        }
    }

    /**
     * Mesure la largeur d'une affiche NON classée et la publie dans `--mc-measured`.
     *
     * Les rangées classées placent leur chiffre à côté de l'affiche, et cette affiche
     * doit garder très exactement la taille de toutes les autres de la page. La calculer
     * est un piège : elle vaut la largeur de carte moins le padding de `.card`, moins la
     * marge de `.cardBox`, le tout dépendant du modèle de boîte — que le thème bascule
     * de `content-box` à `border-box` selon la présence de `aspect-ratio`. Trois valeurs
     * qu'un thème peut redéfinir, et une formule fausse d'un thème à l'autre.
     *
     * On lit donc la vraie valeur dans la page, sur une carte non classée : les nôtres
     * comme celles de Jellyfin conviennent, elles ont toutes la largeur native.
     *
     * C'est `.cardScalable` qui est mesuré, et non l'affiche elle-même : notre colonne
     * de rang tient la place d'un `.cardScalable`, et c'est donc SA largeur qu'il faut
     * reproduire. ElegantFin borde `.cardScalable` d'un pixel — mesurer l'affiche, qui
     * vit à l'intérieur, aurait rendu chaque affiche classée deux pixels trop étroite.
     */
    function measurePosterWidth(container) {
        var reference = container.querySelector('.card:not(.mc-ranked) .cardScalable');

        if (!reference) {
            return;
        }

        var width = reference.getBoundingClientRect().width;

        // Une carte encore masquée mesure zéro : mieux vaut garder le repli que publier
        // une largeur nulle, qui ferait disparaître toutes les affiches classées.
        if (width > 0) {
            container.style.setProperty('--mc-measured', (Math.round(width * 100) / 100) + 'px');
        }
    }

    function placeRows(container, rows, order, nativeLayout) {
        var byId = {};

        rows.forEach(function (row) {
            byId[row.mcRowId] = byId[row.mcRowId] || [];
            byId[row.mcRowId].push(row);
        });

        var managed = [];
        var offset = nativeOffset(container, nativeLayout);

        order.forEach(function (id) {
            if (byId[id]) {
                managed = managed.concat(byId[id]);
                return;
            }

            if (id.indexOf(NATIVE_PREFIX) !== 0) {
                return;
            }

            var type = id.substring(NATIVE_PREFIX.length);
            if (!Object.prototype.hasOwnProperty.call(nativeLayout, type)) {
                return;
            }

            // Absente de la page de cet utilisateur : simplement ignorée.
            var section = container.querySelector('.section' + (nativeLayout[type] + offset));
            if (section && section.parentNode === container) {
                managed.push(section);
            }
        });

        if (!managed.length) {
            return null;
        }

        // Le bloc prend la place du nœud géré qui vient en PREMIER DANS LE DOM — pas du
        // premier de l'ordre demandé. Le bloc occupe alors l'espace qu'il occupe déjà, et
        // ce nœud-là n'a pas à bouger : ancrer sur le premier de l'ordre le ferait au
        // contraire glisser derrière tous ceux qui le précèdent. Comme la section des
        // bibliothèques est presque toujours la première de la page, c'est elle que cela
        // laisse tranquille — et c'est celle que les autres plugins surveillent.
        var anchor = null;
        var kids = container.children;
        for (var i = 0; i < kids.length && !anchor; i++) {
            if (managed.indexOf(kids[i]) !== -1) {
                anchor = kids[i];
            }
        }

        if (!anchor) {
            // Aucune native identifiée : on retombe sur la disposition historique, juste
            // APRÈS les bibliothèques — les placer avant les ferait descendre.
            var library = findLibrarySection(container);
            anchor = library ? library.nextSibling : container.firstChild;
        }

        // Rien à faire si l'ordre voulu est déjà celui du DOM. Chaque déplacement produit
        // des mutations dans le conteneur, et d'autres plugins y réagissent pour réinjecter
        // leur propre contenu : ne bouger que ce qui doit l'être leur évite de repartir
        // pour rien à chaque retour sur l'accueil.
        if (alreadyOrdered(container, managed)) {
            return findLibrarySection(container);
        }

        // Placement à déplacement minimal : un nœud déjà à sa place n'est pas touché.
        //
        // Ce n'est pas une optimisation, c'est une correction. Un MutationObserver rapporte
        // un nœud DÉPLACÉ dans addedNodes, comme s'il venait d'apparaître. Le plugin
        // Editor's Choice relance son injection dès qu'un nœud portant « section0 » est
        // ajouté ; réinsérer la section des bibliothèques alors qu'elle était déjà bien
        // placée lui faisait donc afficher une deuxième bannière.
        var before = anchor;

        managed.forEach(function (node) {
            if (node === before) {
                before = before.nextSibling;
                return;
            }

            moveSection(container, node, before);
        });

        // Décalage d'entrée : nos rangées arrivent l'une après l'autre plutôt que toutes
        // d'un bloc. Plafonné, sinon la dernière attendrait trop longtemps.
        rows.forEach(function (row, index) {
            row.style.animationDelay = Math.min(index * 55, 400) + 'ms';
        });

        measurePosterWidth(container);

        return findLibrarySection(container);
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

    /** Silhouettes d'attente, aux dimensions exactes des cartes qu'elles précèdent. */
    function skeletonCards(count) {
        var html = '';
        for (var i = 0; i < count; i++) {
            html += nativeCard({ name: '', cardClass: 'mc-skeleton', ariaHidden: true });
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
            opts.ShowAllTimeRow ? loadCached('MediaCarousel/Top/AllTime', { limit: opts.AllTimeRowSize || 10 }) : [],
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
                alltime: function () {
                    addRanked(results[1], opts.AllTimeRowTitle || 'Les plus regardés de tous les temps');
                },
                global: function () {
                    addRanked(results[2], opts.GlobalRowTitle || 'Top 10 mondial');
                },
                returning: function () {
                    addPlain(results[3], opts.ReturningRowTitle || 'De retour cette semaine');
                },
                neverplayed: function () {
                    addPlain(results[4], opts.NeverPlayedRowTitle || 'Jamais vu');
                },
                // Rangée personnalisée : absente tant que l'utilisateur n'a terminé aucun
                // film, ou si aucun autre titre ne partage ses genres.
                because: function () {
                    if (results[7] && results[7].items.length) {
                        rows.push(buildRow(
                            becauseTitle(opts.BecauseRowTitle, results[7].seed.Name),
                            results[7].items.map(buildPlainCard).join('')));
                    }
                },
                studios: function () {
                    if (results[5].length) {
                        rows.push(buildRow(
                            opts.StudioRowTitle || 'Par studio',
                            results[5].map(buildTileCard).join('')));
                    }
                },
                genres: function () {
                    results[6].forEach(function (genre) {
                        // Des silhouettes occupent la bande en attendant le chargement
                        // differe : une rangee titree mais vide ressemble a une panne.
                        var row = buildRow(genre.Name, skeletonCards(6));
                        rows.push(row);
                        deferGenreRow(row, genre, opts.GenreRowItemCount || 20);
                    });
                }
            };

            var order = rowOrder(opts.RowOrder, opts.ManageNativeSections === true);

            order.forEach(function (id) {
                if (!Object.prototype.hasOwnProperty.call(builders, id)) {
                    // Une section native : elle existe déjà dans la page, rien à construire.
                    return;
                }

                var before = rows.length;
                builders[id]();

                // Les rangées de genre sont plusieurs sous un même identifiant.
                for (var i = before; i < rows.length; i++) {
                    rows[i].mcRowId = id;
                }
            });

            return { rows: rows, order: order };
        });
    }

    /* Préfixe des sections construites par Jellyfin lui-même. */
    var NATIVE_PREFIX = 'native:';

    /* Nos rangées seules : l'ordre de référence quand les natives ne sont pas gérées. */
    var PLUGIN_ROW_ORDER = ['local', 'alltime', 'global', 'returning', 'neverplayed', 'because', 'studios', 'genres'];

    /**
     * Ordre de référence quand les natives sont gérées : les bibliothèques, nos rangées,
     * puis les autres sections. C'est la disposition par défaut de Jellyfin, complétée.
     */
    var FULL_ROW_ORDER = [
        'native:smalllibrarytiles', 'native:librarybuttons',
        'local', 'alltime', 'global', 'returning', 'neverplayed', 'because', 'studios', 'genres',
        'native:activerecordings', 'native:resume', 'native:resumeaudio', 'native:resumebook',
        'native:livetv', 'native:nextup', 'native:latestmedia'
    ];

    /* Ce que Jellyfin place dans homesection{i} quand l'utilisateur n'a rien choisi.
       Doit rester aligné sur DEFAULT_SECTIONS de jellyfin-web. */
    /* Ordre par défaut du compte, repris de DEFAULT_SECTIONS
       (jellyfin-web/src/types/homeSectionType.ts). */
    var NATIVE_DEFAULT_LAYOUT = [
        'smalllibrarytiles', 'resume', 'resumeaudio', 'resumebook',
        'livetv', 'nextup', 'latestmedia', 'none'
    ];

    /* jellyfin-web rend DIX sections (`userSectionCount = 10` dans homesections.js),
       alors que l'ordre par défaut n'en nomme que huit : un compte qui a descendu
       « À suivre » en neuvième ou dixième position l'a bien dans ses préférences, et
       s'arrêter à huit revenait à ne pas la voir du tout. */
    var NATIVE_SECTION_COUNT = 10;

    /**
     * Normalise l'ordre configuré : les identifiants inconnus sont ignorés, et les entrées
     * absentes sont réinsérées **à leur place par défaut**, pas à la fin.
     *
     * C'est ce qui rend les mises à jour indolores : une configuration enregistrée avant
     * que les sections natives soient déplaçables ne cite aucune d'elles, et les remettre
     * à la fin les ferait toutes basculer sous nos rangées — la disposition de
     * l'utilisateur changerait sans qu'il ait rien demandé.
     */
    function rowOrder(configured, manageNatives) {
        var reference = manageNatives ? FULL_ROW_ORDER : PLUGIN_ROW_ORDER;
        var order = [];
        var parts = String(configured || '').toLowerCase().split(',');
        var i;

        for (i = 0; i < parts.length; i++) {
            var id = parts[i].replace(/^\s+|\s+$/g, '');
            if (reference.indexOf(id) !== -1 && order.indexOf(id) === -1) {
                order.push(id);
            }
        }

        for (i = 0; i < reference.length; i++) {
            if (order.indexOf(reference[i]) === -1) {
                order.splice(Math.min(i, order.length), 0, reference[i]);
            }
        }

        return order;
    }

    /**
     * Associe chaque type de section native à son indice dans la page de l'utilisateur.
     *
     * `.section0`, `.section1`… sont purement positionnels : jellyfin-web n'écrit aucun
     * type dans le DOM. Le type vit dans les préférences d'affichage du compte
     * (`homesection{i}`), qui sont propres à chaque utilisateur — d'où cette requête.
     */
    function loadNativeLayout() {
        if (typeof window.ApiClient.getDisplayPreferences !== 'function') {
            return Promise.resolve({});
        }

        return window.ApiClient
            .getDisplayPreferences('usersettings', window.ApiClient.getCurrentUserId(), 'emby')
            .then(function (prefs) {
                var custom = (prefs && prefs.CustomPrefs) || {};
                var map = {};

                for (var i = 0; i < NATIVE_SECTION_COUNT; i++) {
                    var type = custom['homesection' + i] || NATIVE_DEFAULT_LAYOUT[i] || '';

                    // Valeur héritée d'anciennes versions de Jellyfin. `homesections.js` la
                    // traduit en la section 0 par défaut avant de rendre quoi que ce soit ;
                    // sans la même traduction ici, l'entrée `native:smalllibrarytiles` de
                    // l'ordre ne désigne aucune section et les bibliothèques ne sont pas
                    // placées — pour ce compte-là seulement, donc sans rien de reproductible.
                    if (type === 'folders') {
                        type = NATIVE_DEFAULT_LAYOUT[0];
                    }

                    // Un type répété ne peut désigner qu'une section : la première gagne.
                    if (type && type !== 'none' && !Object.prototype.hasOwnProperty.call(map, type)) {
                        map[type] = i;
                    }
                }

                return map;
            }, function () {
                // Sans préférences lisibles, les natives restent où Jellyfin les a mises.
                return {};
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

            injectStyles(opts.HighlightColor);
            onLightBackground = isLightBackground();

            var natives = opts.ManageNativeSections === true
                ? loadNativeLayout()
                : Promise.resolve({});

            return Promise.all([collectRows(opts), natives]).then(function (results) {
                var collected = results[0];
                var nativeLayout = results[1];
                var target = findSectionsContainer();

                // La page a pu être reconstruite pendant le chargement des données.
                if (!target || target.querySelector('.' + ROW_CLASS) || !collected.rows.length) {
                    return null;
                }

                var librarySection = placeRows(target, collected.rows, collected.order, nativeLayout);

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

        // La largeur d'affiche change à chaque palier de la grille : elle doit être
        // remesurée, sinon les rangées classées gardent celle du palier précédent.
        //
        // Le regroupement se fait sur la trame d'affichage plutôt que sur un délai :
        // la rafale d'événements d'un redimensionnement est absorbée de la même façon,
        // mais la nouvelle taille est en place dès la première image rendue — un délai,
        // lui, laisserait voir la taille de l'ancien palier le temps qu'il s'écoule.
        var scheduled = false;
        window.addEventListener('resize', function () {
            if (scheduled) {
                return;
            }

            scheduled = true;
            requestAnimationFrame(function () {
                scheduled = false;
                var container = findSectionsContainer();

                if (container) {
                    measurePosterWidth(container);
                }
            });
        }, { passive: true });
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
