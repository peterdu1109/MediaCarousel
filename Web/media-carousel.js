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

    // Hauteur du chiffre, en fraction de la hauteur d'affiche. Doit rester synchronisé avec
    // PluginConfiguration.RankNumberScale. À 1, c'est la proportion de Netflix, et le rendu
    // validé à l'écran — au prix d'une rangée qui occupe près du double d'une rangée
    // ordinaire. Le réglage permet de la resserrer.
    var DEFAULT_RANK_SCALE = 1;

    // Échelle en vigueur, relue à chaque rendu depuis les réglages du serveur.
    var rankScale = DEFAULT_RANK_SCALE;
    // Les sections que Jellyfin construit lui-même : `<div class="verticalSection section0">`.
    var NATIVE_SECTION = /(^|\s)section\d+(\s|$)/;

    // Les classements ne sont recalculés que toutes les quelques heures côté serveur.
    // Sans ce cache, chaque retour sur l'accueil relancerait les quatre requêtes, alors que
    // jellyfin-web reconstruit le conteneur à chaque affichage.
    var CACHE_TTL = 5 * 60 * 1000;

    // Premier délai avant de réessayer un accueil resté sans rangée. Il double à chaque
    // rendu vide, jusqu'à CACHE_TTL ; une navigation le lève — voir render().
    var EMPTY_RETRY_DELAY = 2000;

    var cache = {};
    var options = null;
    // Compte auquel appartiennent `cache` et `options` : voir scopeMemoryToUser().
    var memoryUser = null;
    // Demandes à Seerr : proposées ou non par le serveur, et dernier état connu de chaque
    // titre absent, par clé `type:identifiant TMDB` — voir refreshSeerrStates().
    var seerrEnabled = false;
    var seerrAdvanced = false;
    var seerrStates = {};
    var rendering = false;
    var scheduled = null;
    // Rendus d'affilée qui n'ont posé aucune rangée, et heure avant laquelle ne pas en
    // relancer un sans navigation : voir render().
    var emptyStreak = 0;
    var emptyUntil = 0;
    var sequence = 0;
    var supportsSmoothScroll = typeof document.documentElement.style.scrollBehavior === 'string';

    // ------------------------------------------------------------------
    // Utilitaires
    // ------------------------------------------------------------------

    function log(message, error) {
        console.error(LOG_PREFIX + ' ' + message, error === undefined ? '' : error);
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

    function injectStyles(accent, rankScale) {
        var css = buildCss(accent, rankScale);
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
    /**
     * Hauteur du chiffre, en fraction de la hauteur d'affiche.
     *
     * Bornée à l'intervalle utile : sous 40 % le chiffre passe entièrement derrière
     * l'affiche, au-delà de 100 % il dépasse du cadre de sa carte.
     */
    function normalizeRankScale(percent) {
        var value = Number(percent);

        if (!isFinite(value) || value <= 0) {
            return DEFAULT_RANK_SCALE;
        }

        return Math.min(100, Math.max(40, Math.round(value))) / 100;
    }

    function buildCss(accent, rankScale) {
        var scale = rankScale || DEFAULT_RANK_SCALE;

        return [
            /* Le panneau de personnalisation est accroché au corps du document, hors de
               toute rangée : sans lui dans ce sélecteur, il n'héritait d'aucune de ces
               couleurs, et son bouton « Enregistrer » perdait son fond tandis que ses
               contours de focus disparaissaient — invisibles à la télécommande. */
            '.mc-row,.mc-prefs-backdrop,.mc-seerr-backdrop{',
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
            /* --------------------------------------------------------------
               La bande peut deborder du document.

               En « version pour ordinateur » sur telephone, Chrome pose un
               document de 980 px et en AFFICHE 1645 : le reste de l'ecran
               montre ce qui deborde du document. Les rangees de Jellyfin ne
               rognent pas — leurs cartes debordent de leur conteneur et
               restent visibles jusqu'au bord de l'ecran. La notre, elle,
               porte `overflow-x:auto` pour son defilement, et ce reglage
               DECOUPE net a 980. Mesure sur l'appareil : nos rangees
               s'arretaient a 59,6 % de la largeur affichee pendant que
               celles de Jellyfin allaient au bord.

               La largeur cible est donc posee par le script, qui seul connait
               la largeur reellement affichee. Le repli `auto` garde le
               comportement normal partout ailleurs.
               -------------------------------------------------------------- */
            /* `border-box` avec la largeur : la valeur posee est une largeur
               EXTERIEURE. Sans cela le retrait lateral du theme — 92 px chez
               ElegantFin — s'y ajoute, et la bande depassait de 1737 px pour
               1645 demandes. Sur une largeur `auto`, le modele de boite ne
               change rien : la regle est donc sans effet partout ailleurs. */
            '.mc-row .mc-strip{width:var(--mc-strip-width,auto);box-sizing:border-box;}',

            /* --------------------------------------------------------------
               Bande sonde : l'etalon de mesure des rangees classees.

               `measurePosterWidth` a besoin d'une affiche NON classee pour
               relever la largeur que le theme donne aux cartes. Quand les
               seules rangees activees sont classees, cette affiche ne peut
               venir que d'une section native — qui se remplit par sa propre
               requete. Si notre rendu gagne la course, il n'y a rien a
               mesurer ; et comme la mesure n'avait lieu qu'une fois, plus
               rien ne rattrapait ensuite : les affiches gardaient le repli
               theorique jusqu'au rechargement de la page. C'est le defaut
               « la rangee apparait en petit, un rechargement la remet ».

               Chaque rangee classee emporte donc sa propre reference. Elle
               vit dans une bande JUMELLE de la vraie — memes classes, donc
               meme retrait et memes regles de theme — pour que le pourcentage
               contenu dans `--cardWidth` se resolve contre une boite de
               contenu identique. Une position absolue ne conviendrait pas :
               le pourcentage se resoudrait alors contre la boite de PADDING,
               soit une reference plus large que la vraie.

               `height:0` la retire de la page sans la retirer de la mise en
               page : les largeurs restent celles d'une vraie carte.
               `align-items:flex-start` n'est pas cosmetique — etiree par le
               `stretch` par defaut, la carte prendrait la hauteur nulle de sa
               bande, et le controle de proportion 2:3 rejetterait l'etalon.
               -------------------------------------------------------------- */
            '.mc-row .mc-probe-strip{display:flex;flex-wrap:nowrap;align-items:flex-start;',
            'height:0;overflow:hidden;pointer-events:none;',
            'padding-left:calc(var(--mc-side-padding) - .375em);}',
            '.mc-row .mc-probe-strip>.card{flex:0 0 auto;}',

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
            /* Alignement par le HAUT, et non par le bas : la colonne contient l'affiche
               ET son libellé, alors que le chiffre doit se caler sur la seule affiche.
               Aligné par le bas, il descendait de toute la hauteur du libellé et venait
               le chevaucher. Par le haut, ses deux bords tombent sur ceux de l'affiche,
               puisqu'il en a exactement la hauteur. */
            '.mc-row .mc-rank-row{display:flex;align-items:flex-start;}',
            /* Au survol, les thèmes agrandissent l'affiche — ElegantFin la met à 1,06. Dans
               une rangée classée, les cartes sont JOINTIVES : leur largeur vaut exactement
               celle de leur contenu, sans marge de manœuvre. Ce débordement tombe donc pile
               sur la carte voisine qui, peinte après, recouvre l'affiche agrandie et la
               rogne sur sa droite.
               Les thèmes posent bien un `z-index` sur `.cardBox`, mais il ne vaut que si
               cet élément est positionné, ce que rien ne garantit. On pose donc le plan
               nous-mêmes, sur notre propre carte. `:focus-within` couvre la télécommande,
               qui déplace le focus sans jamais survoler. */
            /* `contain: content` — la valeur que jellyfin-web pose sur `.card` — inclut le
               confinement de PEINTURE, qui découpe net tout ce qui dépasse de la carte. Une
               carte classée fait exactement la largeur de son contenu : l'agrandissement au
               survol tombe donc pile sur cette lame et l'affiche est tranchée sur sa droite.
               On retire la peinture et on garde le reste : `layout` et `style` apportent
               l'essentiel du gain, sans rien découper. */
            '.mc-row .mc-ranked{contain:layout style;}',
            /* Et la carte survolée passe devant ses voisines : elles sont jointives, donc
               l'agrandissement empiète sur elles. `:focus-within` couvre la télécommande,
               qui déplace le focus sans jamais survoler. */
            '.mc-row .mc-ranked:hover,.mc-row .mc-ranked:focus-within{',
            'position:relative;z-index:3;}',
            /* L'affiche garde EXACTEMENT la largeur d'une affiche non classee. */
            '.mc-row .mc-rank-col{flex:0 0 var(--mc-poster-width);min-width:0;}',
            /* Marge negative : l'affiche mord sur le chiffre, comme chez Netflix. */
            /* Le chevauchement suit l'échelle. À valeur fixe, un chiffre réduit finirait
               presque entièrement caché derrière l'affiche : la part visible fondrait deux
               fois plus vite que le chiffre lui-même. Proportionnel, le rendu garde ses
               proportions à toutes les tailles.
               La marge du haut recale le chiffre réduit sur le BAS de l'affiche : sans
               elle, il resterait accroché en haut, l'alignement de la ligne se faisant par
               le haut pour ne pas suivre la hauteur du libellé. */
            '.mc-row .mc-rank{flex:0 0 auto;',
            'height:calc(var(--mc-poster-width) * ' + (1.5 * scale) + ');',
            'margin-top:calc(var(--mc-poster-width) * ' + (1.5 * (1 - scale)) + ');',
            'margin-right:calc(var(--mc-poster-width) * ' + (-0.46 * scale) + ');',
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

            /* Bouton de demande à Seerr, à la manière de Jellyfin Enhanced : même voile en
               dégradé au bas de l'affiche, mêmes couleurs, mêmes icônes, et un ▼ quand une
               série ouvre le choix des saisons. Comme chez lui, il n'apparaît qu'au survol ou
               au focus — et en permanence sur un écran sans survol, tactile ou téléviseur. Le
               tout est posé DANS l'affiche, et non dessous : la carte garde la hauteur de ses
               voisines, et la rangée celle des rangées natives. Masqué tant que l'état du
               titre n'est pas connu — proposer « Demander » pour un titre déjà demandé serait
               faux. */
            '.mc-row .mc-unavailable .cardScalable{position:relative;}',
            '.mc-row .mc-seerr-zone{position:absolute;left:0;top:0;right:0;bottom:0;z-index:2;',
            'display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;',
            'box-sizing:border-box;padding:0 7% 7%;pointer-events:none;border-radius:inherit;',
            'background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.78) 80%,rgba(0,0,0,.92) 100%);',
            'opacity:0;transition:opacity .18s ease;}',
            '.mc-row .cardScalable:hover .mc-seerr-zone,.mc-row .cardScalable:focus-within .mc-seerr-zone{opacity:1;}',
            '.mc-row .mc-seerr-zone[data-state="loading"]{visibility:hidden;}',
            '.mc-row .mc-seerr{pointer-events:auto;display:flex;align-items:center;justify-content:center;',
            'box-sizing:border-box;width:100%;margin:0;padding:.55em .5em;border:0;border-radius:8px;',
            'font:inherit;font-size:.8em;font-weight:600;line-height:1.2;text-align:center;',
            'white-space:normal;overflow-wrap:break-word;color:#fff;cursor:pointer;background:#5a3fb8;',
            /* Seul le soulèvement au survol s'anime : une transition sur le fond ferait passer
               chaque bouton par le violet avant sa vraie couleur, à chaque affichage. */
            'transition:transform .2s;}',
            /* Pas de `gap` : les moteurs Tizen d'avant Chromium 84 l'ignorent en flexbox. */
            '.mc-row .mc-seerr .material-icons{font-size:1.25em;line-height:1;margin-right:.35em;flex:0 0 auto;}',
            '.mc-row .mc-seerr[aria-haspopup="dialog"]::after{content:"▼";margin-left:.45em;font-size:.7em;opacity:.8;}',
            '.mc-row .mc-seerr-spinner{flex:0 0 auto;width:.9em;height:.9em;margin-left:.45em;',
            'box-sizing:border-box;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;',
            'border-radius:50%;animation:mc-spin .8s linear infinite;}',
            '@keyframes mc-spin{to{transform:rotate(360deg);}}',
            '.mc-row .mc-seerr[aria-disabled="true"]{cursor:default;}',
            '.mc-row .mc-seerr[aria-disabled="false"]:hover{transform:translate3d(0,-2px,0);',
            'box-shadow:0 4px 12px rgba(90,63,184,.4);filter:brightness(1.12);}',
            /* Un anneau blanc cerné de noir : lisible sur n'importe quelle affiche. */
            '.mc-row .mc-seerr:focus{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(0,0,0,.7);}',
            '.mc-row .mc-seerr:focus:not(:focus-visible){box-shadow:none;}',
            /* Les couleurs de Jellyfin Enhanced, état par état. */
            '.mc-row .mc-seerr[data-tone="request"]{background:#5a3fb8;}',
            '.mc-row .mc-seerr[data-tone="pending"]{background:#b45309;}',
            '.mc-row .mc-seerr[data-tone="processing"]{background:#581c87;}',
            '.mc-row .mc-seerr[data-tone="partial"]{background:#4ca46c;}',
            '.mc-row .mc-seerr[data-tone="available"]{background:#16a34a;}',
            '.mc-row .mc-seerr[data-tone="blocked"]{background:#78350f;}',
            '.mc-row .mc-seerr[data-tone="error"]{background:#dc3545;}',

            /* Fenêtre de demande : celle de Jellyfin Enhanced, relevée règle par règle — voile
               flouté, en-tête illustré sous un voile sombre, titre en dégradé, une carte par
               saison avec son interrupteur et sa pastille, options avancées, pied « Annuler /
               Demander ». En HTML nu, comme le panneau de personnalisation, et pour la même
               raison. Pas de `gap` en flexbox (Tizen) : des marges ; la grille, elle, porte le sien.
               z-index 10000, comme chez Jellyfin Enhanced : jellyfin-web 12.1 place son en-tête
               dans un conteneur `sticky` à z-index 1099, qui cachait le haut d'un voile à 1000. */
            '.mc-seerr-backdrop{position:fixed;left:0;right:0;top:0;bottom:0;z-index:10000;',
            'display:flex;align-items:center;justify-content:center;background:rgba(0,10,20,.85);',
            '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}',
            '.mc-seerr-dialog{display:flex;flex-direction:column;box-sizing:border-box;width:90%;max-width:700px;',
            'max-height:80vh;overflow:hidden;color:#e2e8f0;border-radius:16px;',
            'background:linear-gradient(145deg,#1e293b 0%,#0f172a 100%);border:1px solid rgba(148,163,184,.1);',
            'box-shadow:0 25px 80px rgba(0,0,0,.8),0 0 0 1px rgba(148,163,184,.05);}',
            '.mc-seerr-dialog:focus{outline:none;}',
            '.mc-seerr-head{position:relative;flex:0 0 auto;box-sizing:border-box;height:8em;',
            'padding:24px;padding:min(24px,5vw);',
            'overflow:hidden;border-radius:16px 16px 0 0;background-color:#1e293b;',
            'background-image:linear-gradient(45deg,#3b82f6,#8b5cf6);background-size:cover;background-position:center;}',
            '.mc-seerr-head::before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;',
            'background:rgba(0,0,0,.8);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);}',
            '.mc-seerr-title{position:relative;margin:0 0 6px;font-size:1.8rem;font-weight:700;line-height:1.2;',
            'color:#8b5cf6;background:linear-gradient(45deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;',
            'background-clip:text;-webkit-text-fill-color:transparent;}',
            '.mc-seerr-subtitle{position:relative;margin:0;font-size:1.4rem;font-weight:500;',
            'color:rgba(255,255,255,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            /* Sur un écran étroit, marges et colonnes se resserrent : `min()` plutôt qu'un point
               de rupture, la valeur de Jellyfin Enhanced d'abord pour les moteurs qui l'ignorent. */
            '.mc-seerr-body{flex:1 1 auto;overflow-y:auto;padding:24px;padding:min(24px,5vw);}',
            '.mc-seerr-seasons{display:grid;grid-row-gap:4px;margin-bottom:24px;}',
            /* `1fr` : la colonne du nom ne descend jamais sous son plus long mot ; sur un écran
               étroit, c'est la pastille qui passe sur deux lignes. */
            '.mc-seerr-season{display:grid;grid-template-columns:40px 1fr auto auto;',
            'grid-column-gap:16px;grid-column-gap:min(16px,3vw);align-items:center;',
            'padding:16px 20px;padding:16px min(20px,4vw);border-radius:12px;cursor:pointer;',
            'background:rgba(30,41,59,.4);border:1px solid rgba(51,65,85,.3);',
            'transition:background-color .2s ease,border-color .2s ease;}',
            '.mc-seerr-season:not(.mc-seerr-season-locked):hover{background:rgba(30,41,59,.7);',
            'border-color:rgba(59,130,246,.3);}',
            '.mc-seerr-season.mc-seerr-season-locked{cursor:default;opacity:.6;background:rgba(15,23,42,.6);',
            'border-color:rgba(51,65,85,.2);}',
            '.mc-seerr-season.mc-seerr-all-row{grid-template-columns:40px 1fr;margin-bottom:8px;',
            'padding:12px 20px;padding:12px min(20px,4vw);',
            'background:rgba(51,65,85,.3);border-color:rgba(71,85,105,.4);}',
            '.mc-seerr-all-label{font-size:.95rem;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#cbd5e1;}',
            '.mc-seerr-toggle{-webkit-appearance:none;appearance:none;position:relative;box-sizing:border-box;',
            'width:40px;min-width:40px;height:22px;margin:0;border:0;border-radius:999px;cursor:pointer;',
            'background:rgba(71,85,105,.6);transition:background-color .2s ease;}',
            '.mc-seerr-toggle::before{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;',
            'border-radius:50%;background:#fff;transition:transform .2s ease;}',
            '.mc-seerr-toggle:checked{background:#4f46e5;}',
            '.mc-seerr-toggle:checked::before{transform:translateX(18px);}',
            '.mc-seerr-toggle:disabled{opacity:.4;cursor:not-allowed;}',
            '.mc-seerr-toggle:focus{outline:2px solid rgba(59,130,246,.8);outline-offset:2px;}',
            '.mc-seerr-toggle:focus:not(:focus-visible){outline:none;}',
            /* Sans le `min-width:0` de Jellyfin Enhanced : c'est lui qui laisse, sur un écran
               étroit, un mot long déborder sur la colonne des épisodes. */
            '.mc-seerr-season-info{display:flex;flex-direction:column;}',
            '.mc-seerr-season-name{font-size:1rem;font-weight:600;color:#e2e8f0;}',
            '.mc-seerr-season-year{margin-top:4px;font-size:.875rem;color:#94a3b8;}',
            '.mc-seerr-season-episodes{min-width:70px;min-width:min(70px,11vw);text-align:right;font-size:.875rem;',
            'font-weight:500;color:#64748b;}',
            '.mc-seerr-season-state{box-sizing:border-box;min-width:110px;min-width:min(110px,22vw);',
            'padding:6px 12px;border-radius:20px;',
            'text-align:center;font-size:.75rem;font-weight:700;letter-spacing:.5px;text-transform:uppercase;',
            'color:#818cf8;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);}',
            '.mc-seerr-season-state[data-state="requested"],.mc-seerr-season-state[data-state="processing"]{',
            'color:#a855f7;background:rgba(147,51,234,.15);border-color:rgba(147,51,234,.3);}',
            '.mc-seerr-season-state[data-state="available"],.mc-seerr-season-state[data-state="partial"]{',
            'color:#4ade80;background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.3);}',
            '.mc-seerr-season-state[data-state="blocked"]{color:#f87171;background:rgba(239,68,68,.15);',
            'border-color:rgba(239,68,68,.3);}',
            '.mc-seerr-dialog .mc-seerr-note{margin:.6em 0;font-size:.9em;color:#94a3b8;}',
            '.mc-seerr-advanced{margin-top:1em;padding-top:1em;border-top:1px solid rgba(148,163,184,.1);}',
            '.mc-seerr-advanced[hidden]{display:none;}',
            '.mc-seerr-advanced h3{margin:0 0 1em;font-size:1.17em;}',
            '.mc-seerr-row{display:flex;margin:0 -.5em 1em;}',
            '.mc-seerr-field{flex:1 1 0;min-width:0;margin:0 .5em;}',
            '.mc-seerr-field label{display:block;margin-bottom:.5em;font-weight:600;color:#e2e8f0;}',
            '.mc-seerr-field select{box-sizing:border-box;width:100%;padding:12px 40px 12px 16px;border-radius:8px;',
            'border:1px solid rgba(51,65,85,.5);background-color:rgba(30,41,59,.7);color:#e2e8f0;font:inherit;',
            'font-size:.95rem;cursor:pointer;-webkit-appearance:none;appearance:none;',
            'background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22',
            ' viewBox=%220 0 16 16%22%3E%3Cpath fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%222%22',
            ' d=%22M3 6l5 5 5-5%22/%3E%3C/svg%3E");background-repeat:no-repeat;',
            'background-position:right 14px center;background-size:14px;}',
            '.mc-seerr-field select:hover{border-color:rgba(59,130,246,.4);background-color:#1e293b;}',
            '.mc-seerr-field select:focus{outline:none;border-color:rgba(59,130,246,.8);',
            'box-shadow:0 0 0 3px rgba(59,130,246,.1);}',
            '.mc-seerr-field option{background:#1e293b;color:#e2e8f0;}',
            '.mc-seerr-dialog .mc-seerr-message{min-height:1.2em;margin:.8em 0 0;font-size:.9em;color:#f87171;}',
            '.mc-seerr-foot{flex:0 0 auto;display:flex;justify-content:flex-end;padding:20px 24px;',
            'background:rgba(15,23,42,.3);border-top:1px solid rgba(51,65,85,.3);}',
            '.mc-seerr-foot button{min-width:120px;margin-left:12px;padding:12px 24px;border:0;border-radius:8px;',
            'font:inherit;font-size:.875rem;font-weight:600;cursor:pointer;transition:transform .2s ease;}',
            '.mc-seerr-foot .mc-seerr-send{color:#fff;background:linear-gradient(135deg,#4f46e5,#7c3aed);',
            'box-shadow:0 4px 12px rgba(79,70,229,.3);}',
            '.mc-seerr-foot .mc-seerr-send:hover:not([disabled]){background:linear-gradient(135deg,#4338ca,#6d28d9);',
            'transform:translate3d(0,-1px,0);}',
            '.mc-seerr-foot .mc-seerr-send[disabled]{opacity:.6;cursor:not-allowed;}',
            '.mc-seerr-foot .mc-seerr-cancel{color:#e2e8f0;background:rgba(71,85,105,.8);',
            'border:1px solid rgba(148,163,184,.2);}',
            '.mc-seerr-foot .mc-seerr-cancel:hover{background:rgba(71,85,105,1);}',
            '.mc-seerr-foot button:focus{outline:2px solid var(--mc-accent);outline-offset:2px;}',
            '.mc-seerr-foot button:focus:not(:focus-visible){outline:none;}',
            '.mc-toast{position:fixed;left:50%;bottom:2em;z-index:10001;max-width:90vw;box-sizing:border-box;',
            'padding:.7em 1.1em;border-radius:8px;background:#1c1c1f;color:#fff;',
            'box-shadow:0 6px 24px rgba(0,0,0,.5);opacity:0;pointer-events:none;',
            'transform:translate3d(-50%,1em,0);transition:opacity .2s,transform .2s;}',
            '.mc-toast.mc-toast-visible{opacity:1;transform:translate3d(-50%,0,0);}',

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

            /* ------------------------------------------------------------------
               Panneau de personnalisation.

               Il ne réutilise aucun composant de jellyfin-web : `dialogHelper` et
               `emby-checkbox` attendent d'être enregistrés par le client, ce qui n'est
               garanti sur aucune page. Tout est donc en HTML nu, stylé ici.
               ------------------------------------------------------------------ */
            '.mc-prefs-open{margin-left:auto;border:0;background:transparent;color:inherit;',
            'cursor:pointer;font-size:1.1em;line-height:1;padding:.2em .4em;border-radius:4px;',
            'opacity:.55;transition:opacity var(--mc-dur) var(--mc-ease);}',
            '.mc-prefs-open:hover,.mc-prefs-open:focus{opacity:1;}',
            '.mc-row.mc-prefs-only .sectionTitle{opacity:.6;font-size:1em;}',
            '.mc-prefs-open:focus{outline:2px solid var(--mc-accent);outline-offset:2px;}',

            '.mc-prefs-backdrop{position:fixed;left:0;right:0;top:0;bottom:0;z-index:10000;',
            'background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;',
            'padding:1em;}',
            '.mc-prefs{background:#1c1c1f;color:#fff;border-radius:8px;padding:1.2em;',
            'width:100%;max-width:420px;max-height:86vh;overflow-y:auto;',
            'box-shadow:0 12px 40px rgba(0,0,0,.6);}',
            '.mc-prefs h2{margin:0 0 .2em;font-size:1.2em;}',
            '.mc-prefs .mc-prefs-hint{margin:0 0 1em;opacity:.7;font-size:.85em;line-height:1.35;}',
            '.mc-prefs ul{list-style:none;margin:0 0 1em;padding:0;}',
            '.mc-prefs li{display:flex;align-items:center;padding:.3em 0;}',
            '.mc-prefs li label{flex:1 1 auto;display:flex;align-items:center;cursor:pointer;',
            'min-width:0;}',
            '.mc-prefs li label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.mc-prefs li input[type=checkbox]{margin:0 .6em 0 0;flex:0 0 auto;}',
            '.mc-prefs .mc-prefs-move{flex:0 0 auto;margin-left:.3em;border:0;border-radius:4px;',
            'background:rgba(255,255,255,.12);color:#fff;cursor:pointer;width:2em;height:2em;',
            'line-height:1;}',
            '.mc-prefs .mc-prefs-move[disabled]{opacity:.3;cursor:default;}',
            '.mc-prefs .mc-prefs-field{display:flex;align-items:center;',
            'justify-content:space-between;margin-bottom:.8em;}',
            '.mc-prefs .mc-prefs-field input[type=color]{width:3em;height:2em;padding:0;border:0;',
            'background:transparent;}',
            '.mc-prefs .mc-prefs-actions{display:flex;flex-wrap:wrap;margin-top:1.2em;}',
            '.mc-prefs .mc-prefs-actions button{margin-right:.5em;margin-top:.4em;border:0;',
            'border-radius:4px;padding:.55em 1em;cursor:pointer;font-size:.95em;}',
            '.mc-prefs .mc-prefs-save{background:var(--mc-accent);color:#fff;}',
            '.mc-prefs .mc-prefs-reset,.mc-prefs .mc-prefs-close{',
            'background:rgba(255,255,255,.12);color:#fff;}',
            '.mc-prefs .mc-prefs-actions button:focus{outline:2px solid var(--mc-accent);',
            'outline-offset:2px;}',

            /* Flèches de défilement : confort souris, masquées au clavier et au tactile. */
            '.mc-row .mc-arrow{position:absolute;top:0;bottom:0;width:3.2vw;min-width:34px;max-width:72px;',
            'border:0;cursor:pointer;background:var(--mc-scrim);color:#fff;font-size:1.5em;line-height:1;',
            'opacity:0;transition:opacity var(--mc-dur) var(--mc-ease),transform var(--mc-dur) var(--mc-ease);',
            'z-index:3;}',
            /* Fondu seul, sans glissement : décalée de 6 px vers l'extérieur au repos, la
               flèche « suivant » dépassait du bord de la page, invisible mais comptée dans
               sa largeur défilable — 6 px de défilement horizontal sur tout thème qui ne le
               masque pas, comme le fait `body{overflow-x:hidden}` de jellyfin-web. */
            '.mc-row .mc-arrow-prev{left:0;}',
            '.mc-row .mc-arrow-next{right:0;}',
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

            '@media (hover:none){.mc-row .mc-arrow{display:none;}.mc-row .mc-seerr-zone{opacity:1;}}',

            '@media (prefers-reduced-motion:reduce){',
            '.verticalSection.mc-row,.mc-row .mc-skeleton .cardPadder{animation:none;}',
            '.mc-row .mc-rank-glyph,.mc-row .mc-tile-logo,.mc-row .mc-seerr,.mc-row .mc-seerr-zone,.mc-toast{',
            'transition:none;}',
            '.mc-row .mc-seerr-spinner{animation:none;}',
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
        var inlineStyle = '';

        if (opts.beside) {
            scalable = '<div class="mc-rank-row">' + opts.beside
                + '<div class="mc-rank-col">' + scalable + footer + '</div></div>';
            footer = '';

            // La largeur est posée EN LIGNE, et pas par une règle de notre feuille.
            //
            // Une carte classée doit s'élargir pour loger son chiffre. Or les thèmes posent
            // `width: var(--cardWidth) !important` sur `.card`, et il suffit qu'un thème le
            // fasse depuis un sélecteur un peu plus spécifique que le nôtre pour qu'il
            // l'emporte : la carte reste alors à la largeur d'une affiche pendant que son
            // contenu en réclame le double. L'affiche déborde de sa carte, la carte suivante
            // est peinte par-dessus, et il ne reste qu'une lamelle de chaque affiche —
            // mesuré sur un serveur réel : carte de 200 px pour un contenu de 430.
            //
            // Un style en ligne marqué `!important` prime sur TOUTE feuille de style de la
            // page, quelle que soit sa spécificité. C'est la seule façon de ne pas dépendre
            // de ce qu'un thème présent ou futur voudra imposer.
            // `box-sizing` est imposé en même temps que la largeur, et pas par hasard :
            // la valeur calculée est une largeur de CONTENU. Sous `border-box`, le padding
            // de `.card` la rognerait par l'intérieur, et l'affiche ressortirait de sa
            // carte de la valeur de ce padding — le défaut qu'on vient de corriger, en
            // plus petit. ElegantFin déclare bien `content-box`, mais rien ne dit que le
            // thème suivant le fera.
            // `border-box` : la valeur posée est la largeur EXTÉRIEURE de la carte. Elle
            // vaut la place du chiffre et de l'affiche, plus l'habillage mesuré — padding de
            // la carte et marges de son `.cardBox`. Sans ce dernier terme, le contenu
            // dépassait de la carte et la voisine venait le recouvrir : c'est ce qui rognait
            // les affiches sur leur droite.
            inlineStyle = ' style="box-sizing:border-box !important;'
                + 'width:calc(var(--mc-poster-width) * '
                + (opts.besideFactor || rankCardFactor(1, rankScale))
                + ' + var(--mc-card-chrome, 0px)) !important"';
        }

        return '<div class="card ' + shape + 'Card' + layoutCardClass() + ' card-withuserdata'
            + (opts.cardClass ? ' ' + opts.cardClass : '') + '"'
            + (opts.ariaHidden ? ' aria-hidden="true"' : ' role="listitem"')
            + (opts.itemId ? ' data-id="' + escapeHtml(opts.itemId) + '"' : '')
            + (opts.serverId ? ' data-serverid="' + escapeHtml(opts.serverId) + '"' : '')
            + (opts.itemType ? ' data-type="' + escapeHtml(opts.itemType) + '"' : '')
            + ' data-isfolder="' + (opts.isFolder ? 'true' : 'false') + '"'
            + inlineStyle + '>'
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
    /**
     * Largeur du repère SVG du chiffre, en unités de ce repère.
     *
     * Le repère est resserré sur le glyphe : sa hauteur vaut 84, sa largeur suit le nombre
     * de chiffres. C'est de ce rapport que découle toute la largeur de la carte.
     */
    function rankViewBoxWidth(rank) {
        return 8 + String(rank).length * 62;
    }

    /**
     * Largeur d'une carte classée, en multiples de la largeur d'affiche.
     *
     * Elle est CALCULÉE, et non laissée à `width: auto`. Le navigateur doit alors deviner
     * la largeur « max-content » de la carte, et la marge négative du chiffre le trompe :
     * mesuré sur un serveur réel, il proposait 342 px pour un contenu qui en réclamait 433,
     * et l'affiche se retrouvait rognée de 91 px sur sa droite par la carte suivante.
     *
     * Les trois termes sont pourtant connus : le chiffre, haut d'une affiche entière donc
     * large de `1,5 × largeurDuRepère / 84` ; le chevauchement, qui retire 0,46 ; et
     * l'affiche elle-même, soit 1.
     */
    function rankCardFactor(rank, scale) {
        var s = scale || DEFAULT_RANK_SCALE;
        return Math.round((s * (1.5 * (rankViewBoxWidth(rank) / 84) - 0.46) + 1) * 1000) / 1000;
    }

    function rankBadge(rank) {
        var text = String(rank);
        var width = rankViewBoxWidth(rank);

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
            overlay: inLibrary ? '' : seerrButton(entry),
            beside: rankBadge(entry.Rank),
            besideFactor: rankCardFactor(entry.Rank, rankScale)
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

    /**
     * Bande jumelle portant une seule affiche non classée, invisible.
     *
     * Elle sert d'étalon à `measurePosterWidth`. Les classes reprennent celles de la
     * vraie bande — `itemsContainer` et `scrollX` — parce que ce sont elles que les
     * thèmes visent : ElegantFin pose son retrait sur `.scrollX`, et une règle du
     * genre `.itemsContainer .card{width:…}` doit mordre ici exactement comme sur une
     * carte native. Un étalon soustrait aux règles du thème mentirait.
     */
    function probeStrip() {
        return '<div class="mc-probe-strip itemsContainer scrollX" aria-hidden="true">'
            + nativeCard({ name: '', ariaHidden: true, cardClass: 'mc-probe' })
            + '</div>';
    }

    // ------------------------------------------------------------------
    // Demandes à Seerr
    // ------------------------------------------------------------------

    /**
     * États du bouton, repris de Jellyfin Enhanced : mêmes libellés, mêmes couleurs, mêmes
     * icônes, pour qu'un serveur qui l'utilise retrouve le même bouton au même geste.
     *
     * `tone` choisit la couleur et `icon` l'icône Material que jellyfin-web fournit déjà.
     * `acts` dit pour quels types le bouton agit : un film se demande d'un clic, une série
     * ouvre le choix des saisons. « En attente d'approbation » n'agit pas : le serveur ne
     * l'annonce, pour une série, que lorsqu'il ne reste plus aucune saison à demander. Une
     * erreur marquée `retry` rend la main au bout de SEERR_RETRY_DELAY ; les autres
     * persistent, puisqu'un nouvel essai échouerait de la même façon.
     */
    var SEERR_STATES = {
        loading: { label: '', tone: 'request' },
        request: { label: 'Demander', tone: 'request', icon: 'file_download', acts: 'movie tv' },
        'request-more': { label: 'Demander plus', tone: 'request', icon: 'file_download', acts: 'tv' },
        'request-missing': { label: 'Demander manquant', tone: 'partial', icon: 'file_download', acts: 'tv' },
        sending: { label: 'Demande en cours', tone: 'request', spinner: true },
        pending: { label: 'En attente d\'approbation', tone: 'pending', icon: 'pending' },
        requested: { label: 'Demandé', tone: 'pending', icon: 'schedule' },
        processing: { label: 'Traitement', tone: 'processing', spinner: true },
        partial: { label: 'Partiellement disponible', tone: 'partial', icon: 'task_alt' },
        available: { label: 'Disponible', tone: 'available', icon: 'download_done' },
        blocked: { label: 'Bloqué', tone: 'blocked', icon: 'cancel' },
        offline: { label: 'Seerr hors ligne', tone: 'error', icon: 'cloud_off', retry: true },
        error: { label: 'Erreur', tone: 'error', icon: 'error', retry: true },
        'user-not-found': {
            label: 'Utilisateur non trouvé',
            tone: 'error',
            icon: 'person_off',
            hint: 'Ce compte n\'existe pas dans Seerr : l\'administrateur doit l\'importer depuis Jellyfin.'
        },
        forbidden: {
            label: 'Pas de permission pour faire des demandes',
            tone: 'error',
            icon: 'error',
            hint: 'Ce compte Seerr n\'a pas le droit de faire des demandes, ou son quota est atteint.'
        }
    };

    // État d'une saison dans le choix des saisons, avec les libellés de Jellyfin Enhanced.
    var SEASON_STATES = {
        'not-requested': 'Non demandé',
        requested: 'Demandé',
        processing: 'Traitement',
        partial: 'Partiel',
        available: 'Disponible',
        blocked: 'Bloqué'
    };

    // Taille maximale d'un lot côté serveur : au-delà, les titres sont répartis en plusieurs.
    var SEERR_BATCH = 20;
    var SEERR_RETRY_DELAY = 4000;
    var TOAST_DELAY = 4000;
    var toastTimer = null;

    function has(table, key) {
        return Object.prototype.hasOwnProperty.call(table, key);
    }

    function seerrKey(mediaType, tmdbId) {
        return mediaType + ':' + parseInt(tmdbId, 10);
    }

    /**
     * Bouton d'un titre absent, dans son voile, ou rien.
     *
     * Il faut le type ET l'identifiant TMDB : films et séries sont numérotés séparément, le
     * 1399 d'une série n'est pas celui d'un film. Un classement calculé avant cette version
     * ne porte pas le type — pas de bouton jusqu'au recalcul suivant.
     */
    function seerrButton(entry) {
        var tmdbId = parseInt(entry.TmdbId, 10);

        if (!seerrEnabled || !(tmdbId > 0) || (entry.MediaType !== 'movie' && entry.MediaType !== 'tv')) {
            return '';
        }

        return '<div class="mc-seerr-zone" data-state="loading">'
            + '<button type="button" class="mc-seerr" data-state="loading" data-tone="request"'
            + ' aria-disabled="true" data-media="' + entry.MediaType + '" data-tmdb="' + tmdbId + '"'
            + ' data-name="' + escapeHtml(entry.Name || '') + '"></button></div>';
    }

    function seerrActs(button, state) {
        var spec = has(SEERR_STATES, state) ? SEERR_STATES[state] : null;

        return !!(spec && spec.acts
            && (' ' + spec.acts + ' ').indexOf(' ' + button.getAttribute('data-media') + ' ') !== -1);
    }

    function applySeerrState(button, state) {
        var known = has(SEERR_STATES, state) ? state : 'loading';
        var spec = SEERR_STATES[known];
        var name = button.getAttribute('data-name') || '';
        var acts = seerrActs(button, known);
        var zone = button.parentNode;

        button.setAttribute('data-state', known);
        button.setAttribute('data-tone', spec.tone);

        if (zone && zone.classList && zone.classList.contains('mc-seerr-zone')) {
            zone.setAttribute('data-state', known);
        }

        // L'icône vient de la police Material de jellyfin-web, comme dans tout le client.
        button.innerHTML = (spec.icon ? '<span class="material-icons ' + spec.icon + '" aria-hidden="true"></span>' : '')
            + '<span class="mc-seerr-label">' + escapeHtml(spec.label) + '</span>'
            + (spec.spinner ? '<span class="mc-seerr-spinner" aria-hidden="true"></span>' : '');

        // `aria-disabled` et non `disabled` : un bouton désactivé perd le focus, et la
        // télécommande qui venait de le presser ne serait plus nulle part.
        button.setAttribute('aria-disabled', acts ? 'false' : 'true');
        button.setAttribute('aria-label', spec.label ? spec.label + ' : ' + name : name);

        // Une série ouvre le choix des saisons : le bouton l'annonce, et le montre par un ▼,
        // comme chez Jellyfin Enhanced.
        if (acts && button.getAttribute('data-media') === 'tv') {
            button.setAttribute('aria-haspopup', 'dialog');
        } else {
            button.removeAttribute('aria-haspopup');
        }

        if (spec.hint) {
            button.setAttribute('title', spec.hint);
        } else {
            button.removeAttribute('title');
        }
    }

    function seerrButtons(root) {
        return Array.prototype.slice.call(root.querySelectorAll('.mc-seerr'));
    }

    function seerrButtonKey(button) {
        return seerrKey(button.getAttribute('data-media'), button.getAttribute('data-tmdb'));
    }

    /** Pose l'état déjà connu de chaque titre : un retour sur l'accueil ne clignote pas. */
    function showKnownSeerrStates(root) {
        seerrButtons(root).forEach(function (button) {
            applySeerrState(button, seerrStates[seerrButtonKey(button)] || 'loading');
        });
    }

    function seerrPost(action, body) {
        return window.ApiClient.ajax({
            type: 'POST',
            url: window.ApiClient.getUrl('MediaCarousel/Seerr/' + action),
            data: JSON.stringify(body),
            contentType: 'application/json',
            dataType: 'json'
        });
    }

    /**
     * Relit l'état des titres absents auprès de Seerr, par lots, puis met les boutons à jour.
     *
     * Un titre dont l'état n'a pas pu être lu — Seerr injoignable, clé refusée, titre sorti
     * du classement — perd son bouton. L'accueil est la page la plus vue du serveur : une
     * panne de Seerr ne doit pas le couvrir d'erreurs. Une erreur ne s'affiche qu'en réponse
     * à un geste, sur le bouton qui l'a provoquée.
     */
    function refreshSeerrStates(root) {
        var buttons = seerrButtons(root);
        var seen = {};
        var items = [];
        var batches = [];

        buttons.forEach(function (button) {
            var key = seerrButtonKey(button);

            if (!seen[key]) {
                seen[key] = true;
                items.push({
                    MediaType: button.getAttribute('data-media'),
                    TmdbId: parseInt(button.getAttribute('data-tmdb'), 10)
                });
            }
        });

        for (var i = 0; i < items.length; i += SEERR_BATCH) {
            batches.push(items.slice(i, i + SEERR_BATCH));
        }

        return Promise.all(batches.map(function (batch) {
            return seerrPost('Status', batch).then(function (answers) {
                var fresh = {};

                (answers || []).forEach(function (answer) {
                    if (answer && answer.State && !answer.Error) {
                        fresh[seerrKey(answer.MediaType, answer.TmdbId)] = answer.State;
                    }
                });

                batch.forEach(function (item) {
                    var key = seerrKey(item.MediaType, item.TmdbId);

                    if (fresh[key]) {
                        seerrStates[key] = fresh[key];
                    } else {
                        delete seerrStates[key];
                    }
                });
            }, function () {
                batch.forEach(function (item) {
                    delete seerrStates[seerrKey(item.MediaType, item.TmdbId)];
                });
            });
        })).then(function () {
            buttons.forEach(function (button) {
                // Une demande partie entre-temps a le dernier mot : sa réponse est plus récente.
                if (button.getAttribute('data-state') !== 'sending') {
                    applySeerrState(button, seerrStates[seerrButtonKey(button)] || 'loading');
                }
            });
        });
    }

    /**
     * Traduit un refus du serveur en état du bouton. `ApiClient.ajax` rejette avec la
     * réponse elle-même ; une panne réseau, elle, n'a pas de statut.
     */
    function seerrFailure(response) {
        var status = response && response.status;

        if (status === 404) {
            return Promise.resolve('user-not-found');
        }

        if (status === 403) {
            return Promise.resolve('forbidden');
        }

        // 502 : Seerr a mal répondu ou pas du tout, et le serveur précise lequel des deux.
        if (status === 502 && typeof response.json === 'function') {
            return response.json().then(function (body) {
                return body && body.Error === 'offline' ? 'offline' : 'error';
            }, function () {
                return 'error';
            });
        }

        // 503 : l'intégration a été désactivée depuis l'affichage de la page.
        return Promise.resolve(status === 503 ? 'offline' : 'error');
    }

    function showSeerrFailure(button, failure) {
        applySeerrState(button, failure);

        if (SEERR_STATES[failure].retry) {
            window.setTimeout(function () {
                if (button.getAttribute('data-state') === failure) {
                    applySeerrState(button, 'request');
                }
            }, SEERR_RETRY_DELAY);
        }
    }

    /** Un film se demande d'un clic ; il est alors « Demandé », comme chez Jellyfin Enhanced. */
    function requestMovie(button) {
        var tmdbId = parseInt(button.getAttribute('data-tmdb'), 10);
        var key = seerrKey('movie', tmdbId);

        applySeerrState(button, 'sending');

        return seerrPost('Request', { MediaType: 'movie', TmdbId: tmdbId }).then(function (answer) {
            var state = answer && answer.State;

            seerrStates[key] = has(SEERR_STATES, state) ? state : 'requested';
            applySeerrState(button, seerrStates[key]);
        }, function (response) {
            return seerrFailure(response).then(function (failure) {
                showSeerrFailure(button, failure);
            });
        });
    }

    /** Message bref en bas de l'écran, comme les confirmations de Jellyfin Enhanced. */
    function showToast(text) {
        var toast = document.querySelector('.mc-toast');

        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'mc-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }

        toast.textContent = text;
        toast.classList.add('mc-toast-visible');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () {
            toast.classList.remove('mc-toast-visible');
        }, TOAST_DELAY);
    }

    function closeSeasonDialog() {
        var open = document.querySelector('.mc-seerr-backdrop');

        if (!open) {
            return;
        }

        var origin = open.mcOrigin;
        open.parentNode.removeChild(open);

        // Le focus revient au bouton qui a ouvert la fenêtre : la télécommande reprend là où
        // elle en était, au lieu de repartir du haut de la page.
        if (origin && document.body.contains(origin)) {
            origin.focus();
        }
    }

    function seasonLabel(season) {
        if (season.Name) {
            return season.Name;
        }

        return season.Number === 0 ? 'Épisodes spéciaux' : 'Saison ' + season.Number;
    }

    /** Espace libre d'un dossier, écrit comme chez Jellyfin Enhanced : « 3.98 TB ». */
    function formatBytes(bytes) {
        var units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        var value = bytes;
        var unit = 0;

        if (!(bytes > 0)) {
            return '0 Bytes';
        }

        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }

        return parseFloat(value.toFixed(2)) + ' ' + units[unit];
    }

    function advancedField(id, label, className) {
        return '<div class="mc-seerr-field"><label for="' + id + '">' + label + '</label>'
            + '<select id="' + id + '" class="' + className + '"></select></div>';
    }

    /**
     * Fenêtre de demande, celle de Jellyfin Enhanced : en-tête illustré, choix des saisons pour
     * une série, options avancées quand l'administrateur les propose, puis « Annuler » et
     * « Demander ». Un film ne l'ouvre qu'avec les options avancées ; sans elles, il se
     * demande d'un clic, comme chez lui.
     *
     * Le choix des saisons suit deux réglages de Seerr, lus par le serveur : sans demandes
     * partielles, la série se demande en entier — les interrupteurs montrent ce qui partira,
     * sans pouvoir être changés ; les épisodes spéciaux n'apparaissent que si Seerr les accepte.
     */
    function openRequestDialog(button) {
        closeSeasonDialog();
        closePreferences();

        var mediaType = button.getAttribute('data-media');
        var isTv = mediaType === 'tv';
        var name = button.getAttribute('data-name') || '';
        var tmdbId = parseInt(button.getAttribute('data-tmdb'), 10);
        var id = 'mc-seerr-' + (++sequence);
        var poster = button.closest('.cardScalable').querySelector('.cardImageContainer');
        var backdrop = document.createElement('div');
        var loads = [];

        backdrop.className = 'mc-seerr-backdrop';
        backdrop.mcOrigin = button;
        backdrop.innerHTML = '<div class="mc-seerr-dialog" role="dialog" aria-modal="true"'
            + ' aria-labelledby="' + id + '-title" tabindex="-1">'
            + '<div class="mc-seerr-head">'
            + '<h2 id="' + id + '-title" class="mc-seerr-title">'
            + (isTv ? 'Demander une série' : 'Demander un film') + '</h2>'
            + '<p class="mc-seerr-subtitle">' + escapeHtml(name) + '</p></div>'
            + '<div class="mc-seerr-body">'
            + (isTv ? '<div class="mc-seerr-seasons" aria-busy="true">'
                + '<p class="mc-seerr-note">Chargement des saisons…</p></div>' : '')
            + (seerrAdvanced ? '<div class="mc-seerr-advanced" hidden><h3>Options avancées</h3>'
                + '<div class="mc-seerr-row">'
                + advancedField(id + '-server', 'Serveur de destination', 'mc-seerr-server')
                + advancedField(id + '-profile', 'Profil de qualité', 'mc-seerr-profile')
                + '</div><div class="mc-seerr-row">'
                + advancedField(id + '-folder', 'Dossier racine', 'mc-seerr-folder')
                + '</div></div>' : '')
            + '<p class="mc-seerr-message" role="alert"></p>'
            + '</div>'
            + '<div class="mc-seerr-foot">'
            + '<button type="button" class="mc-seerr-cancel">Annuler</button>'
            + '<button type="button" class="mc-seerr-send"' + (isTv ? ' disabled' : '') + '>Demander</button>'
            + '</div></div>';

        // L'affiche du titre sert de fond à l'en-tête, sous le même voile sombre que chez
        // Jellyfin Enhanced : elle est déjà relayée par le serveur, TMDB ne voit pas le visiteur.
        if (poster && poster.style.backgroundImage) {
            backdrop.querySelector('.mc-seerr-head').style.backgroundImage = poster.style.backgroundImage;
        }

        document.body.appendChild(backdrop);
        wireRequestDialog(backdrop, button, mediaType, tmdbId, name);
        backdrop.querySelector('.mc-seerr-dialog').focus();

        if (isTv) {
            loads.push(loadSeasons(backdrop, tmdbId));
        }

        if (seerrAdvanced) {
            loads.push(loadAdvanced(backdrop, mediaType));
        }

        return Promise.all(loads).then(function () {
            if (backdrop.parentNode) {
                focusFirst(backdrop);
            }
        });
    }

    /** Premier contrôle visible et actif de la fenêtre, pour le clavier et la télécommande. */
    function focusFirst(backdrop) {
        var candidates = backdrop.querySelectorAll('.mc-seerr-body input:not([disabled]),'
            + ' .mc-seerr-body select, .mc-seerr-send:not([disabled]), .mc-seerr-cancel');

        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].offsetParent !== null) {
                candidates[i].focus();
                return;
            }
        }
    }

    function loadSeasons(backdrop, tmdbId) {
        return seerrPost('Seasons', { MediaType: 'tv', TmdbId: tmdbId }).then(function (choice) {
            if (backdrop.parentNode) {
                renderSeasons(backdrop, choice);
            }
        }, function (response) {
            return seerrFailure(response).then(function (failure) {
                if (!backdrop.parentNode) {
                    return;
                }

                var list = backdrop.querySelector('.mc-seerr-seasons');
                list.removeAttribute('aria-busy');
                list.innerHTML = '<p class="mc-seerr-note">' + (failure === 'offline'
                    ? 'Seerr hors ligne' : 'Impossible de charger les informations de saison') + '</p>';
            });
        });
    }

    function renderSeasons(backdrop, choice) {
        var partial = !!(choice && choice.PartialRequests);
        var seasons = (choice && choice.Seasons) || [];
        var list = backdrop.querySelector('.mc-seerr-seasons');
        var send = backdrop.querySelector('.mc-seerr-send');
        var requestable = seasons.filter(function (season) { return season.Requestable; });
        var html = '';

        if (partial && requestable.length) {
            html += '<label class="mc-seerr-season mc-seerr-all-row">'
                + '<input type="checkbox" class="mc-seerr-toggle mc-seerr-all">'
                + '<span class="mc-seerr-all-label">Sélectionner toutes les saisons</span></label>';
        }

        seasons.forEach(function (season) {
            var state = has(SEASON_STATES, season.State) ? season.State : 'not-requested';
            var enabled = partial && season.Requestable;
            // Sans demandes partielles, partent toutes les saisons ordinaires encore
            // demandables — jamais les spéciaux, comme chez Jellyfin Enhanced.
            var checked = !partial && season.Requestable && season.Number > 0;

            html += '<label class="mc-seerr-season' + (enabled ? '' : ' mc-seerr-season-locked') + '">'
                + '<input type="checkbox" class="mc-seerr-toggle mc-seerr-pick" value="' + parseInt(season.Number, 10) + '"'
                + (season.Number === 0 ? ' data-special="true"' : '')
                + (checked ? ' checked' : '') + (enabled ? '' : ' disabled') + '>'
                + '<span class="mc-seerr-season-info">'
                + '<span class="mc-seerr-season-name">' + escapeHtml(seasonLabel(season)) + '</span>'
                + (season.Year ? '<span class="mc-seerr-season-year">' + escapeHtml(season.Year) + '</span>' : '')
                + '</span>'
                + '<span class="mc-seerr-season-episodes">' + parseInt(season.Episodes, 10) + ' ép.</span>'
                + '<span class="mc-seerr-season-state" data-state="' + state + '">'
                + SEASON_STATES[state] + '</span></label>';
        });

        if (!seasons.length) {
            html = '<p class="mc-seerr-note">Impossible de charger les informations de saison</p>';
        } else if (!requestable.length) {
            html += '<p class="mc-seerr-note">Toutes les saisons sont déjà demandées ou disponibles.</p>';
        }

        list.removeAttribute('aria-busy');
        list.innerHTML = html;
        send.disabled = !requestable.length;
    }

    function loadAdvanced(backdrop, mediaType) {
        return seerrPost('Options', { MediaType: mediaType }).then(function (options) {
            if (backdrop.parentNode) {
                fillServers(backdrop, (options && options.Servers) || []);
            }
        }, function () {
            // Sans options, la section reste cachée : la demande part avec les réglages par
            // défaut de Seerr, comme lorsque l'administrateur ne les propose pas.
        });
    }

    function fillServers(backdrop, servers) {
        var section = backdrop.querySelector('.mc-seerr-advanced');
        var sorted = servers.slice().sort(function (a, b) {
            return String(a.Name || '').localeCompare(String(b.Name || ''));
        });

        if (!sorted.length) {
            return;
        }

        // Seerr désigne un serveur par défaut pour les demandes ordinaires, un autre pour la
        // 4K : c'est le premier qui est présélectionné, comme chez Jellyfin Enhanced.
        var preferred = sorted.filter(function (server) { return server.IsDefault && !server.Is4k; })[0] || sorted[0];

        section.querySelector('.mc-seerr-server').innerHTML = sorted.map(function (server) {
            return '<option value="' + parseInt(server.Id, 10) + '"' + (server === preferred ? ' selected' : '') + '>'
                + escapeHtml(server.Name) + '</option>';
        }).join('');

        backdrop.mcServers = sorted;
        fillServerDetails(backdrop);
        section.hidden = false;
    }

    function fillServerDetails(backdrop) {
        var section = backdrop.querySelector('.mc-seerr-advanced');
        var id = parseInt(section.querySelector('.mc-seerr-server').value, 10);
        var server = (backdrop.mcServers || []).filter(function (candidate) { return candidate.Id === id; })[0];
        var profiles = (server && server.Profiles) || [];
        var folders = (server && server.RootFolders) || [];

        section.querySelector('.mc-seerr-profile').innerHTML = profiles.map(function (profile) {
            return '<option value="' + parseInt(profile.Id, 10) + '"'
                + (profile.Id === server.ActiveProfileId ? ' selected' : '') + '>' + escapeHtml(profile.Name) + '</option>';
        }).join('');

        section.querySelector('.mc-seerr-folder').innerHTML = folders.map(function (folder) {
            var label = typeof folder.FreeSpace === 'number'
                ? folder.Path + ' (' + formatBytes(folder.FreeSpace) + ')' : folder.Path;

            return '<option value="' + escapeHtml(folder.Path) + '"'
                + (folder.Path === server.ActiveDirectory ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
        }).join('');
    }

    /** Serveur, profil et dossier choisis, ou rien si la section n'a pas pu se remplir. */
    function chosenOptions(backdrop) {
        var section = backdrop.querySelector('.mc-seerr-advanced');

        if (!section || section.hidden) {
            return null;
        }

        var server = section.querySelector('.mc-seerr-server').value;
        var profile = section.querySelector('.mc-seerr-profile').value;
        var folder = section.querySelector('.mc-seerr-folder').value;

        return server !== '' && profile !== '' && folder !== ''
            ? { ServerId: parseInt(server, 10), ProfileId: parseInt(profile, 10), RootFolder: folder }
            : null;
    }

    // Cases que l'utilisateur peut cocher ; `regular` écarte les épisodes spéciaux, que
    // « tout sélectionner » ne coche pas, comme chez Jellyfin Enhanced.
    function seasonPicks(backdrop, regular) {
        return Array.prototype.slice.call(backdrop.querySelectorAll('.mc-seerr-pick:not([disabled])'))
            .filter(function (box) { return !regular || box.getAttribute('data-special') !== 'true'; });
    }

    function syncSelectAll(backdrop) {
        var all = backdrop.querySelector('.mc-seerr-all');

        if (!all) {
            return;
        }

        var boxes = seasonPicks(backdrop, true);
        var checked = boxes.filter(function (box) { return box.checked; }).length;

        all.checked = checked > 0 && checked === boxes.length;
        all.indeterminate = checked > 0 && checked < boxes.length;
    }

    function wireRequestDialog(backdrop, button, mediaType, tmdbId, name) {
        backdrop.addEventListener('click', function (event) {
            // Un clic hors de la fenêtre la ferme, comme n'importe quelle boîte de dialogue.
            if (event.target === backdrop || event.target.classList.contains('mc-seerr-cancel')) {
                closeSeasonDialog();
                return;
            }

            if (event.target.classList.contains('mc-seerr-send')) {
                sendRequest(backdrop, button, mediaType, tmdbId, name);
            }
        });

        backdrop.addEventListener('change', function (event) {
            if (event.target.classList.contains('mc-seerr-server')) {
                fillServerDetails(backdrop);
                return;
            }

            if (event.target.classList.contains('mc-seerr-all')) {
                seasonPicks(backdrop, true).forEach(function (box) {
                    box.checked = event.target.checked;
                });
            }

            syncSelectAll(backdrop);
        });

        backdrop.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeSeasonDialog();
            }
        });
    }

    function sendRequest(backdrop, button, mediaType, tmdbId, name) {
        var send = backdrop.querySelector('.mc-seerr-send');
        var message = backdrop.querySelector('.mc-seerr-message');
        var key = seerrKey(mediaType, tmdbId);
        var body = { MediaType: mediaType, TmdbId: tmdbId };
        var options = chosenOptions(backdrop);
        var seasons = null;

        if (mediaType === 'tv') {
            seasons = Array.prototype.slice.call(backdrop.querySelectorAll('.mc-seerr-pick:checked'))
                .map(function (box) { return parseInt(box.value, 10); });

            if (!seasons.length) {
                message.textContent = 'Veuillez sélectionner au moins une saison';
                return;
            }

            body.Seasons = seasons;
        }

        if (options) {
            body.ServerId = options.ServerId;
            body.ProfileId = options.ProfileId;
            body.RootFolder = options.RootFolder;
        }

        message.textContent = '';
        send.disabled = true;
        send.textContent = 'Demande en cours…';

        seerrPost('Request', body).then(function (answer) {
            var state = answer && answer.State;

            seerrStates[key] = has(SEERR_STATES, state) ? state : 'requested';
            applySeerrState(button, seerrStates[key]);
            closeSeasonDialog();

            if (seasons) {
                showToast('Demandé ' + seasons.length + ' saison(s) de « ' + name + ' »');
            }
        }, function (response) {
            return seerrFailure(response).then(function (failure) {
                if (!backdrop.parentNode) {
                    return;
                }

                message.textContent = failure === 'user-not-found' || failure === 'forbidden' || failure === 'offline'
                    ? SEERR_STATES[failure].label
                    : (seasons ? 'Échec de la demande de saisons' : 'Erreur');
                send.disabled = false;
                send.textContent = 'Demander';
            });
        }).catch(function (error) {
            log('demande impossible', error);
        });
    }

    function wireSeerr(section) {
        section.addEventListener('click', function (event) {
            var button = event.target.closest ? event.target.closest('.mc-seerr') : null;

            if (!button) {
                return;
            }

            // La carte d'un titre absent n'a pas de lien, mais jellyfin-web écoute les clics
            // de toute la page : celui-ci ne doit rien déclencher d'autre.
            event.preventDefault();
            event.stopPropagation();

            if (!seerrActs(button, button.getAttribute('data-state'))) {
                return;
            }

            // Une série ouvre toujours la fenêtre ; un film, seulement avec les options avancées.
            if (button.getAttribute('data-media') === 'tv' || seerrAdvanced) {
                openRequestDialog(button).catch(function (error) {
                    log('fenêtre de demande impossible', error);
                });
            } else {
                requestMovie(button).catch(function (error) {
                    log('demande à Seerr impossible', error);
                });
            }
        });
    }

    // ------------------------------------------------------------------
    // Rangées
    // ------------------------------------------------------------------

    function buildRow(title, cardsHtml, withProbe) {
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
            // L'étalon d'abord : il doit exister avant même que la bande soit remplie.
            + (withProbe ? probeStrip() : '')
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
        var reference = findReference(container);

        if (!reference) {
            return false;
        }

        publishMetrics(reference, container);
        observePoster(reference, container);
        return true;
    }

    /**
     * Choisit l'affiche qui servira d'étalon.
     *
     * Notre propre sonde passe EN PREMIER. Elle est posée par la rangée classée
     * elle-même, donc présente dès l'insertion, alors qu'une carte native dépend d'une
     * requête qui peut n'avoir pas encore abouti — c'est cette course qui faisait
     * apparaître les rangées en petit une fois sur deux.
     *
     * La référence doit avoir la MÊME FORME que nos cartes classées. Prendre la
     * première carte venue ne marche pas : nos rangées sont insérées juste après
     * « Mes médias », dont les vignettes de bibliothèque sont au format PAYSAGE et
     * précèdent donc tout le reste dans le DOM. Leur largeur, copiée sur une affiche
     * 2:3, la gonflait de moitié — et le chiffre, qui se calcule à partir d'elle,
     * d'autant. « Continuer à regarder » pose le même piège.
     */
    function findReference(container) {
        var groupes = [
            container.querySelectorAll('.mc-probe .cardScalable'),
            container.querySelectorAll(
                '.overflowPortraitCard:not(.mc-ranked):not(.mc-probe) .cardScalable')
        ];

        for (var g = 0; g < groupes.length; g++) {
            for (var i = 0; i < groupes[g].length; i++) {
                var boite = groupes[g][i].getBoundingClientRect();

                // Une carte encore masquée mesure zéro : mieux vaut garder le repli que
                // publier une largeur nulle, qui ferait disparaître toutes les affiches.
                if (boite.width <= 0) {
                    continue;
                }

                // Second barrage, au cas où un thème réutiliserait la classe pour autre
                // chose : une affiche est haute d'une fois et demie sa largeur.
                var rapport = boite.height / boite.width;

                if (rapport > 1.3 && rapport < 1.7) {
                    return groupes[g][i];
                }
            }
        }

        return null;
    }

    /**
     * Mesure, et réessaie tant que rien n'a pu être relevé.
     *
     * La sonde rend l'échec très improbable, mais elle ne le rend pas impossible : une
     * feuille de thème qui arrive après nous, une rangée encore masquée, et le relevé
     * tombe à côté. Abandonner en silence, comme le faisait la version précédente,
     * condamnait la page entière jusqu'à son rechargement — la mesure n'ayant lieu
     * qu'une fois et `render()` refusant de rejouer tant qu'une rangée est en place.
     *
     * Les délais sont courts puis espacés : on rattrape la trame suivante sans faire
     * travailler un téléviseur pendant plusieurs secondes.
     */
    function ensureMeasured(container) {
        if (measureRetry !== null) {
            window.clearTimeout(measureRetry);
            measureRetry = null;
        }

        if (measurePosterWidth(container)) {
            return;
        }

        var restants = MEASURE_RETRIES.slice();

        (function reessayer() {
            if (!restants.length) {
                return;
            }

            measureRetry = window.setTimeout(function () {
                measureRetry = null;
                var cible = findSectionsContainer();

                if (!cible || !measurePosterWidth(cible)) {
                    reessayer();
                }
            }, restants.shift());
        })();
    }

    /**
     * Publie les deux mesures dont dépendent les rangées classées.
     *
     * `--mc-measured` est la largeur d'affiche. `--mc-card-chrome` est tout ce qui, dans une
     * carte, sépare son bord extérieur de l'affiche : le padding de `.card` et les marges de
     * `.cardBox`. Ces valeurs appartiennent au thème — ElegantFin met 0,375 em et 0,6 em, un
     * autre thème mettra autre chose — et les oublier suffit à faire ressortir l'affiche de
     * sa carte, où la carte voisine vient la recouvrir.
     */
    function publishMetrics(reference, container) {
        var carte = reference.closest('.card');
        var poster = reference.getBoundingClientRect().width;
        var chrome = carte ? carte.getBoundingClientRect().width - poster : 0;

        container.style.setProperty('--mc-measured', (Math.round(poster * 100) / 100) + 'px');
        container.style.setProperty(
            '--mc-card-chrome', (Math.round(Math.max(chrome, 0) * 100) / 100) + 'px');
    }

    var posterObserver = null;
    var posterObserved = null;
    var measureRetry = null;
    /* Délais de reprise de la mesure, en millisecondes. */
    var MEASURE_RETRIES = [80, 300, 900, 2500];

    /**
     * Surveille la carte de référence, et remesure dès que SA taille change.
     *
     * Le redimensionnement de fenêtre ne suffit pas. La feuille du thème est chargée par le
     * Custom CSS de Jellyfin, et rien ne garantit qu'elle soit arrivée quand nous mesurons :
     * si elle atterrit après, elle change la taille des cartes sans qu'aucun événement de
     * fenêtre ne se produise, et les rangées classées gardent la largeur d'avant. Une police
     * qui finit de charger, un panneau latéral qu'on replie, un changement d'onglet
     * produisent le même décalage.
     *
     * `ResizeObserver` manque sur les moteurs les plus anciens ; l'écouteur de
     * redimensionnement reste alors le seul filet, ce qui était le comportement précédent.
     */
    function observePoster(reference, container) {
        if (!window.ResizeObserver || posterObserved === reference) {
            return;
        }

        if (posterObserver) {
            posterObserver.disconnect();
        }

        posterObserved = reference;
        posterObserver = new ResizeObserver(function () {
            var boite = reference.getBoundingClientRect();

            // La référence n'est pas classée : les valeurs qu'on publie ne peuvent pas la
            // modifier en retour, donc pas de boucle à craindre.
            if (boite.width > 0) {
                publishMetrics(reference, container);
            }
        });
        posterObserver.observe(reference);
    }

    /**
     * Étend la bande jusqu'au bord réellement affiché, quand le navigateur montre
     * plus large que le document.
     *
     * Le critère n'est pas une comparaison de fenêtres — `window.innerWidth` contre
     * `documentElement.clientWidth` — mais le symptôme lui-même : notre bande
     * s'arrête-t-elle avant le bord visible ? C'est ce qui se mesure, et c'est ce que
     * l'utilisateur voit. La marge de 8 px évite de réagir à un arrondi ou à une barre
     * de défilement, et laisse donc une page ordinaire strictement inchangée.
     *
     * Seules les bandes CLASSÉES sont étendues. Leurs cartes portent une largeur en
     * pixels, posée en ligne : élargir leur conteneur ne les redimensionne pas. Une
     * carte ordinaire, elle, tient sa largeur d'un pourcentage que le thème résout
     * contre ce conteneur — l'élargir la ferait grossir et diverger des rangées
     * natives, soit l'inverse du but recherché.
     */
    function stretchStrips(container) {
        var bandes = container.querySelectorAll('.mc-row .mc-strip');

        for (var i = 0; i < bandes.length; i++) {
            var bande = bandes[i];

            if (!bande.querySelector('.mc-ranked')) {
                continue;
            }

            var boite = bande.getBoundingClientRect();
            // `visualViewport` et non `innerWidth` : ce dernier compte la barre de
            // défilement verticale, et les ~15 px qu'elle occupe sur un PC suffisaient à
            // étirer la bande sur une page ordinaire. `visualViewport` l'exclut, tout en
            // rendant bien la largeur affichée en « version pour ordinateur » sur
            // téléphone. Faute de mieux, la largeur du document : aucune extension.
            var affichee = window.visualViewport
                ? window.visualViewport.width
                : document.documentElement.clientWidth;
            var visible = affichee - boite.left;
            var rangee = bande.closest('.mc-row');

            if (!rangee) {
                continue;
            }

            if (visible - boite.width > 8) {
                rangee.style.setProperty('--mc-strip-width', Math.round(visible) + 'px');
            } else {
                rangee.style.removeProperty('--mc-strip-width');
            }
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

        ensureMeasured(container);
        stretchStrips(container);

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
        // Le compte fait partie de la clé : ces listes sont filtrées pour chaque appelant.
        var key = (window.ApiClient.getCurrentUserId() || '') + '|' + path + '|'
            + JSON.stringify(params || {});
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
                    // `true` : une rangée classée emporte son propre étalon de mesure.
                    var row = buildRow(title, entries.map(buildRankedCard).join(''), true);

                    if (row.querySelector('.mc-seerr')) {
                        wireSeerr(row);
                        showKnownSeerrStates(row);
                    }

                    rows.push(row);
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

    // ------------------------------------------------------------------
    // Panneau de personnalisation
    //
    // La page de configuration du plugin vit dans le tableau de bord : elle est réservée
    // aux administrateurs. Ce panneau est donc le seul endroit où un compte ordinaire peut
    // régler ses propres rangées, et c'est pour cela qu'il vit ici plutôt que là-bas.
    //
    // Ce qu'il montre est déjà la valeur EFFECTIVE de ce compte : le serveur a fusionné ses
    // choix avec les réglages de l'administrateur avant de répondre. Enregistrer fige donc
    // ce qui est affiché ; « Réinitialiser » efface tout et rend le compte au serveur.
    // ------------------------------------------------------------------

    var ROW_LABELS = {
        local: 'Top du serveur',
        alltime: 'Les plus regardés de tous les temps',
        global: 'Top mondial',
        returning: 'De retour cette semaine',
        neverplayed: 'Jamais vu',
        because: 'Parce que tu as regardé…',
        studios: 'Par studio',
        genres: 'Par genre',
        'native:smalllibrarytiles': 'Jellyfin — Mes médias',
        'native:librarybuttons': 'Jellyfin — Mes médias (petit)',
        'native:activerecordings': 'Jellyfin — Enregistrements actifs',
        'native:resume': 'Jellyfin — Continuer de regarder',
        'native:resumeaudio': 'Jellyfin — Reprendre l’écoute',
        'native:resumebook': 'Jellyfin — Reprendre la lecture',
        'native:livetv': 'Jellyfin — TV en direct',
        'native:nextup': 'Jellyfin — À suivre',
        'native:latestmedia': 'Jellyfin — Médias récemment ajoutés'
    };

    /* Rangée du plugin -> champ de ClientOptions qui décide de son affichage. Les entrées
       natives n'y figurent pas : leur visibilité ne dépend pas de nous. */
    var ROW_TOGGLES = {
        local: 'ShowLocalRow',
        alltime: 'ShowAllTimeRow',
        global: 'ShowGlobalRow',
        returning: 'ShowReturningRow',
        neverplayed: 'ShowNeverPlayedRow',
        because: 'ShowBecauseRow',
        studios: 'ShowStudioRow',
        genres: 'ShowGenreRows'
    };

    function sendPreferences(method, body) {
        var request = {
            type: method,
            url: window.ApiClient.getUrl('MediaCarousel/UserPreferences')
        };

        if (body) {
            request.data = JSON.stringify(body);
            request.contentType = 'application/json';
        }

        return window.ApiClient.ajax(request);
    }

    /**
     * Rejoue un rendu complet après un changement de préférences.
     *
     * Les réglages et les listes sont mémorisés : sans cette remise à zéro, le panneau
     * enregistrerait le choix et la page continuerait d'afficher l'ancien.
     */
    function rerender() {
        options = null;
        cache = {};
        emptyUntil = 0;

        var container = findSectionsContainer();

        if (container) {
            var rows = container.querySelectorAll('.' + ROW_CLASS);
            for (var i = 0; i < rows.length; i++) {
                rows[i].parentNode.removeChild(rows[i]);
            }

            // Une section masquée au rendu précédent doit réapparaître si le compte vient
            // de décocher le masquage : sinon elle resterait invisible jusqu'au prochain
            // rechargement de la page.
            var hidden = container.querySelectorAll('.mc-hidden-native');
            for (var j = 0; j < hidden.length; j++) {
                hidden[j].classList.remove('mc-hidden-native');
            }
        }

        render();
    }

    function closePreferences() {
        var open = document.querySelector('.mc-prefs-backdrop');
        if (open) {
            open.parentNode.removeChild(open);
        }
    }

    /**
     * Construit le panneau à partir des valeurs effectives du compte.
     */
    function openPreferences(opts) {
        closePreferences();

        var order = rowOrder(opts.RowOrder, opts.ManageNativeSections === true);
        var backdrop = document.createElement('div');
        var html = '<div class="mc-prefs" role="dialog" aria-modal="true"'
            + ' aria-labelledby="mc-prefs-title" tabindex="-1">'
            + '<h2 id="mc-prefs-title">Mes rangées</h2>'
            + '<p class="mc-prefs-hint">Ces choix ne valent que pour ce compte.'
            + ' « Réinitialiser » les efface et vous rend aux réglages du serveur.</p>'
            + '<ul>';

        order.forEach(function (id, index) {
            var label = ROW_LABELS[id] || id;
            var toggle = ROW_TOGGLES[id];
            // Une section native est déplaçable mais pas masquable ici : c'est Jellyfin
            // qui décide de sa présence, dans les préférences du compte.
            var checked = toggle ? (opts[toggle] !== false) : true;

            html += '<li data-row="' + escapeHtml(id) + '">'
                + '<label>'
                + '<input type="checkbox"' + (checked ? ' checked' : '')
                + (toggle ? '' : ' disabled')
                + ' aria-label="' + escapeHtml('Afficher : ' + label) + '">'
                + '<span>' + escapeHtml(label) + '</span>'
                + '</label>'
                + '<button type="button" class="mc-prefs-move mc-prefs-up"'
                + ' aria-label="' + escapeHtml('Monter : ' + label) + '"'
                + (index === 0 ? ' disabled' : '') + '>&#9650;</button>'
                + '<button type="button" class="mc-prefs-move mc-prefs-down"'
                + ' aria-label="' + escapeHtml('Descendre : ' + label) + '"'
                + (index === order.length - 1 ? ' disabled' : '') + '>&#9660;</button>'
                + '</li>';
        });

        html += '</ul>'
            + '<div class="mc-prefs-field">'
            + '<label for="mc-prefs-color">Couleur d’accentuation</label>'
            + '<input type="color" id="mc-prefs-color" value="'
            + escapeHtml(safeAccent(opts.HighlightColor)) + '">'
            + '</div>'
            + '<div class="mc-prefs-field">'
            + '<label for="mc-prefs-scale">Taille du chiffre</label>'
            // `normalizeRankScale` rend une FRACTION (1 pour 100 %) : donnée telle quelle à
            // un curseur borné à partir de 25, elle était ramenée à 25, et enregistrer le
            // panneau sans y toucher réduisait le chiffre au plancher. Les bornes sont
            // celles du rendu : au-delà, le curseur bougeait sans rien changer.
            + '<input type="range" id="mc-prefs-scale" min="40" max="100" step="5" value="'
            + Math.round(normalizeRankScale(opts.RankNumberScale) * 100) + '">'
            + '</div>'
            + '<div class="mc-prefs-field">'
            + '<label for="mc-prefs-hide">Masquer les sections de Jellyfin</label>'
            + '<input type="checkbox" id="mc-prefs-hide"'
            + (opts.HideNativeSections ? ' checked' : '') + '>'
            + '</div>'
            + '<div class="mc-prefs-actions">'
            + '<button type="button" class="mc-prefs-save">Enregistrer</button>'
            + '<button type="button" class="mc-prefs-reset">Réinitialiser</button>'
            + '<button type="button" class="mc-prefs-close">Fermer</button>'
            + '</div>'
            + '</div>';

        backdrop.className = 'mc-prefs-backdrop';
        backdrop.innerHTML = html;
        document.body.appendChild(backdrop);

        wirePreferences(backdrop, order);

        var dialog = backdrop.querySelector('.mc-prefs');
        if (dialog) {
            dialog.focus();
        }
    }

    /**
     * Un seul écouteur sur le panneau : les lignes sont réordonnées par déplacement de
     * nœuds, des écouteurs posés par bouton survivraient mal à ce remaniement.
     */
    function wirePreferences(backdrop, order) {
        backdrop.addEventListener('click', function (event) {
            // Un clic hors du panneau le ferme, comme n'importe quelle boîte de dialogue.
            if (event.target === backdrop) {
                closePreferences();
                return;
            }

            var move = event.target.closest ? event.target.closest('.mc-prefs-move') : null;

            if (move && !move.disabled) {
                moveRow(backdrop, move);
                return;
            }

            if (event.target.classList.contains('mc-prefs-close')) {
                closePreferences();
                return;
            }

            if (event.target.classList.contains('mc-prefs-reset')) {
                sendPreferences('DELETE').then(function () {
                    closePreferences();
                    rerender();
                }, function (error) {
                    log('réinitialisation impossible', error);
                });
                return;
            }

            if (event.target.classList.contains('mc-prefs-save')) {
                sendPreferences('POST', collectPreferences(backdrop)).then(function () {
                    closePreferences();
                    rerender();
                }, function (error) {
                    log('enregistrement impossible', error);
                });
            }
        });

        backdrop.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closePreferences();
            }
        });

        // `order` n'est utile qu'à la construction ; le DOM porte l'ordre courant ensuite.
        void order;
    }

    function moveRow(backdrop, button) {
        var item = button.closest('li');
        var up = button.classList.contains('mc-prefs-up');
        var sibling = up ? item.previousElementSibling : item.nextElementSibling;

        if (!sibling) {
            return;
        }

        if (up) {
            item.parentNode.insertBefore(item, sibling);
        } else {
            item.parentNode.insertBefore(sibling, item);
        }

        refreshMoveButtons(backdrop);
        var same = item.querySelector(up ? '.mc-prefs-up' : '.mc-prefs-down');
        if (same && !same.disabled) {
            same.focus();
        }
    }

    /**
     * Les extrémités ne peuvent pas se déplacer plus loin : leurs boutons sont désactivés.
     */
    function refreshMoveButtons(backdrop) {
        var items = backdrop.querySelectorAll('.mc-prefs li');

        for (var i = 0; i < items.length; i++) {
            items[i].querySelector('.mc-prefs-up').disabled = i === 0;
            items[i].querySelector('.mc-prefs-down').disabled = i === items.length - 1;
        }
    }

    /**
     * Lit le panneau et en fait des préférences.
     *
     * Tout ce que le panneau montre devient un choix EXPLICITE : le compte cesse de suivre
     * l'administrateur sur ces points-là, et le reste — titres, tailles, source externe —
     * continue de le suivre. C'est « Réinitialiser » qui rend le compte au serveur.
     */
    function collectPreferences(backdrop) {
        var items = backdrop.querySelectorAll('.mc-prefs li');
        var ids = [];
        var preferences = {
            RowOrder: '',
            HighlightColor: backdrop.querySelector('#mc-prefs-color').value,
            RankNumberScale: parseInt(backdrop.querySelector('#mc-prefs-scale').value, 10),
            HideNativeSections: backdrop.querySelector('#mc-prefs-hide').checked
        };

        for (var i = 0; i < items.length; i++) {
            var id = items[i].getAttribute('data-row');
            var toggle = ROW_TOGGLES[id];

            ids.push(id);

            if (toggle) {
                preferences[toggle] = items[i].querySelector('input[type=checkbox]').checked;
            }
        }

        preferences.RowOrder = ids.join(',');
        return preferences;
    }

    /**
     * Pose le bouton d'ouverture dans l'en-tête de la première rangée du plugin.
     *
     * Une seule fois, et sur une rangée à nous : l'en-tête d'une section native appartient
     * à Jellyfin, qui la reconstruit quand bon lui semble.
     */
    function attachPreferencesButton(row, opts) {
        var header = row && row.querySelector('.mc-row-header');

        if (!header || header.querySelector('.mc-prefs-open')) {
            return;
        }

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'mc-prefs-open';
        button.title = 'Personnaliser mes rangées';
        button.setAttribute('aria-label', 'Personnaliser mes rangées');
        button.innerHTML = '&#9881;';
        button.addEventListener('click', function () {
            openPreferences(opts);
        });

        header.appendChild(button);
    }

    /**
     * Rattache la mémoire du script au compte connecté, et l'oublie quand il change.
     *
     * jellyfin-web est une application d'une seule page : sa déconnexion NAVIGUE vers
     * l'écran de connexion au lieu de recharger (lu dans le code de jellyfin-web 12.1), si
     * bien que le script survit d'un compte à l'autre. Or les classements sont filtrés pour
     * chaque appelant — visibilité, contrôle parental — et les réglages portent les choix
     * personnels du compte. Servis depuis la mémoire, ils montraient au compte suivant ce
     * qui avait été calculé pour le précédent : titres et affiches d'une bibliothèque qui
     * lui est interdite pendant cinq minutes, réglages d'autrui jusqu'au rechargement.
     */
    function scopeMemoryToUser() {
        var user = window.ApiClient.getCurrentUserId();

        if (user !== memoryUser) {
            memoryUser = user;
            options = null;
            cache = {};
            seerrStates = {};
            emptyStreak = 0;
            emptyUntil = 0;
        }
    }

    /** Vrai quand toutes les rangées du plugin sont masquées, par le compte ou par le serveur. */
    function allRowsHidden(opts) {
        return Object.keys(ROW_TOGGLES).every(function (id) {
            return opts[ROW_TOGGLES[id]] === false;
        });
    }

    /**
     * Seul point d'entrée restant quand toutes les rangées sont masquées : un en-tête
     * discret qui porte le bouton du panneau, à l'endroit où les rangées apparaîtraient.
     */
    function insertPreferencesEntry(container, opts) {
        var section = document.createElement('div');
        section.className = 'verticalSection ' + ROW_CLASS + ' mc-prefs-only';
        section.innerHTML = '<div class="sectionTitleContainer sectionTitleContainer-cards'
            + ' padded-left mc-row-header">'
            + '<h2 class="sectionTitle sectionTitle-cards">Mes rangées</h2></div>';

        var library = findLibrarySection(container);
        container.insertBefore(section, library ? library.nextSibling : container.firstChild);
        attachPreferencesButton(section, opts);
    }

    function render() {
        if (rendering || !ready()) {
            return Promise.resolve();
        }

        scopeMemoryToUser();

        var container = findSectionsContainer();
        if (!container || container.querySelector('.' + ROW_CLASS)) {
            return Promise.resolve();
        }

        // Toute mutation de la page relance un rendu tant qu'aucune rangée n'est posée.
        // Sans ce délai, un serveur en échec recevait une salve de requêtes à chacune, sans
        // fin : 4 388 erreurs en une journée sur une prod passée en Jellyfin 12 avec la
        // build 10.11. Une navigation repart aussitôt ; sur le même affichage, les essais
        // s'espacent.
        if (Date.now() < emptyUntil) {
            return Promise.resolve();
        }

        rendering = true;

        return loadOptions().then(function (opts) {
            if (!opts.EnableHomeRows) {
                return null;
            }

            rankScale = normalizeRankScale(opts.RankNumberScale);
            seerrEnabled = opts.SeerrRequests === true;
            seerrAdvanced = seerrEnabled && opts.SeerrAdvanced === true;
            injectStyles(opts.HighlightColor, rankScale);
            onLightBackground = isLightBackground();

            var natives = opts.ManageNativeSections === true
                ? loadNativeLayout()
                : Promise.resolve({});

            return Promise.all([collectRows(opts), natives]).then(function (results) {
                var collected = results[0];
                var nativeLayout = results[1];
                var target = findSectionsContainer();

                // La page a pu être reconstruite pendant le chargement des données.
                if (!target || target.querySelector('.' + ROW_CLASS)) {
                    return null;
                }

                if (!collected.rows.length) {
                    // Le bouton du panneau vit sur une rangée du plugin : un compte qui les a
                    // toutes masquées n'avait plus aucun moyen de revenir sur son choix.
                    if (opts.AllowUserPreferences && allRowsHidden(opts)) {
                        insertPreferencesEntry(target, opts);
                    }

                    return null;
                }

                var librarySection = placeRows(target, collected.rows, collected.order, nativeLayout);

                if (opts.HideNativeSections) {
                    hideNativeSections(target, librarySection);
                }

                if (opts.AllowUserPreferences) {
                    attachPreferencesButton(collected.rows[0], opts);
                }

                // Sans attendre : les rangées sont déjà là, seuls les boutons attendent Seerr.
                if (seerrEnabled) {
                    refreshSeerrStates(target).catch(function (error) {
                        log('état des demandes Seerr illisible', error);
                    });
                }

                return null;
            });
        }).catch(function (error) {
            log('rendu impossible', error);
        }).then(function () {
            rendering = false;
            noteRenderOutcome();
        });
    }

    /** Espace les rendus suivants quand celui-ci n'a posé aucune rangée : voir render(). */
    function noteRenderOutcome() {
        var container = findSectionsContainer();

        if (!container) {
            return;
        }

        if (container.querySelector('.' + ROW_CLASS)) {
            emptyStreak = 0;
            emptyUntil = 0;
            return;
        }

        emptyStreak += 1;
        emptyUntil = Date.now()
            + Math.min(EMPTY_RETRY_DELAY * Math.pow(2, emptyStreak - 1), CACHE_TTL);
    }

    function schedule() {
        window.clearTimeout(scheduled);
        scheduled = window.setTimeout(render, 250);
    }

    /** Un nouvel affichage a droit à son essai, quel qu'ait été le sort du précédent. */
    function onNavigation() {
        emptyUntil = 0;
        schedule();
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

        window.addEventListener('hashchange', onNavigation);
        document.addEventListener('viewshow', onNavigation);

        // Le panneau est accroché au corps du document : sans cela, un retour arrière le
        // laissait au-dessus de la page suivante.
        window.addEventListener('hashchange', closePreferences);
        window.addEventListener('popstate', closePreferences);
        window.addEventListener('hashchange', closeSeasonDialog);
        window.addEventListener('popstate', closeSeasonDialog);

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
                    stretchStrips(container);
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


    // L'observation démarre tout de suite, connecté ou non : `render()` attend lui-même
    // qu'un compte soit connecté. L'ancienne attente cessait au bout de trente secondes,
    // et quiconque se connectait plus tard — l'écran de connexion est la première page de
    // tout utilisateur non connecté — n'avait aucune rangée jusqu'au rechargement.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
