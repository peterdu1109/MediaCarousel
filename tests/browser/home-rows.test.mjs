import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');

const script = fs.readFileSync(path.join(repo, 'Web', 'media-carousel.js'), 'utf8');
const browser = await chromium.launch(process.env.MC_CHROMIUM ? { executablePath: process.env.MC_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  // Les URL d'images de la fixture sont factices : on ignore leurs echecs de chargement.
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text());
});

await page.goto('file://' + path.join(here, 'home.html'));

const stub = () => {
  window.__calls = [];
  const ranked = (n) => Array.from({ length: n }, (_, i) => ({
    Rank: i + 1, Score: 30 - i, Name: 'Film <' + (i + 1) + '>', ProductionYear: 2020,
    Item: { Id: 'id' + (i + 1), Name: 'Film <' + (i + 1) + '>', ServerId: 'server-1', Type: 'Movie', IsFolder: false, ImageTags: { Primary: 'tag' } }
  }));

  window.ApiClient = {
    getCurrentUserId: () => 'user-1',
    // Enregistrement des preferences : on retient la requete telle qu'elle part.
    ajax: (request) => {
      window.__ajax = window.__ajax || [];
      window.__ajax.push({
        type: request.type,
        url: request.url,
        body: request.data ? JSON.parse(request.data) : null
      });
      return Promise.resolve({});
    },
    // Disposition native de CE compte : section0 bibliotheques, 1 reprise,
    // 2 derniers ajouts, 3 prochainement.
    getDisplayPreferences: () => {
      window.__prefsCalls = (window.__prefsCalls || 0) + 1;
      return Promise.resolve({
      CustomPrefs: window.__customPrefs || {
        homesection0: 'smalllibrarytiles',
        homesection1: 'resume',
        homesection2: 'latestmedia',
        homesection3: 'nextup'
        }
      });
    },
    serverId: () => 'server-1',
    getUrl: (path, params) => path + '?' + new URLSearchParams(params || {}).toString(),
    getImageUrl: (id, o) => 'img://' + id + '/' + o.type,
    getJSON: (url) => {
      window.__calls.push(url);
      if (url.includes('ClientOptions')) {
        return Promise.resolve({
          EnableHomeRows: true, ShowLocalRow: true, ShowGlobalRow: true,
          ShowStudioRow: true, ShowGenreRows: true,
          ShowReturningRow: true, ShowNeverPlayedRow: true,
          ShowBecauseRow: true, BecauseRowTitle: 'Parce que tu as regardé {0}', BecauseRowSize: 12,
          ShowAllTimeRow: true, AllTimeRowTitle: 'Les plus regardés de tous les temps', AllTimeRowSize: 10,
          ReturningRowTitle: 'De retour cette semaine', ReturningRowSize: 20,
          NeverPlayedRowTitle: 'Jamais vu', NeverPlayedRowSize: 20,
          AllowUserPreferences: window.__allowPrefs === true,
          RowOrder: window.__rowOrder,
          ManageNativeSections: window.__manageNatives === true,
          HideNativeSections: window.__hideNative === true,
          LocalRowTitle: 'Top 10 sur ce serveur', GlobalRowTitle: 'Top 10 mondial',
          StudioRowTitle: 'Par studio',
          HighlightColor: window.__accent === undefined ? '#775BF4' : window.__accent,
          LocalRowSize: 10, GlobalRowSize: 10, StudioRowSize: 20,
          GenreRowCount: 3, GenreRowItemCount: 12
        });
      }
      if (url.includes('Top/AllTime')) return Promise.resolve({ Items: ranked(3) });
      // Dix entrees, pour que le rang « 10 » — le cas ou le chiffre change de largeur — soit couvert.
      if (url.includes('Top/Local')) return Promise.resolve({ Items: ranked(10) });
      if (url.includes('Top/Global')) return Promise.resolve({
        Items: [
          { Rank: 1, Name: 'Absent & "cité"', ProductionYear: 2024, PosterUrl: 'https://img/x.jpg', Item: null },
          { Rank: 2, Name: 'Present', Item: { Id: 'idg', Name: 'Present', ServerId: 'server-1', IsFolder: false, ImageTags: { Primary: 't' } } }
        ]
      });
      if (url.includes('Rows/Returning')) return Promise.resolve({
        Items: [1, 2].map(i => ({
          Rank: i, Name: 'Serie ' + i,
          // Une serie est un DOSSIER qui s'ouvre pourtant sur sa fiche : c'est cette
          // combinaison, absente du banc jusqu'ici, qui revelait le mauvais routage.
          Item: {
            Id: 'r' + i, Name: 'Serie ' + i, ServerId: 'server-1',
            Type: 'Series', IsFolder: true, ImageTags: { Primary: 'p' }
          }
        }))
      });
      if (url.includes('Rows/NeverPlayed')) return Promise.resolve({
        Items: [1, 2, 3].map(i => ({
          Rank: i, Score: 8.5, Name: 'Pepite ' + i,
          Item: { Id: 'n' + i, Name: 'Pepite ' + i, ServerId: 'server-1', IsFolder: false, ImageTags: { Primary: 'p' } }
        }))
      });
      if (url.includes('MediaCarousel/Studios')) return Promise.resolve({
        Items: [
          { Id: 's1', Name: 'A24', ItemCount: 12, Item: { Id: 's1', Name: 'A24', ServerId: 'server-1', Type: 'Studio', IsFolder: false, ImageTags: { Logo: 'lg' } } },
          { Id: 's2', Name: 'Studio <sans logo>', ItemCount: 5, Item: { Id: 's2', Name: 'Studio <sans logo>', ServerId: 'server-1', Type: 'Studio', IsFolder: false, ImageTags: {} } }
        ]
      });
      if (url.includes('MediaCarousel/Genres')) return Promise.resolve({
        Items: [
          { Id: 'g1', Name: 'Science-fiction', ItemCount: 40 },
          { Id: 'g2', Name: 'Comédie', ItemCount: 30 },
          { Id: 'g3', Name: 'Vide', ItemCount: 6 }
        ]
      });
      if (url.startsWith('Items?')) {
        const q = new URLSearchParams(url.split('?')[1]);

        // Dernier film termine par l'utilisateur, point de depart de la recommandation.
        if (q.get('SortBy') === 'DatePlayed') {
          return Promise.resolve({
            Items: window.__noHistory
              ? []
              : [{ Id: 'seed1', Name: 'Blade <Runner>', Genres: ['Science-fiction', 'Thriller', 'Drame'] }]
          });
        }

        // Titres partageant les genres du film de depart.
        if (q.get('Genres')) {
          return Promise.resolve({
            Items: Array.from({ length: 5 }, (_, i) => ({
              Id: 'b' + i, Name: 'Voisin ' + i, ServerId: 'server-1',
              IsFolder: false, ImageTags: { Primary: 'p' }
            }))
          });
        }

        const genre = q.get('GenreIds');
        if (genre === 'g3') return Promise.resolve({ Items: [] });
        return Promise.resolve({
          Items: Array.from({ length: 6 }, (_, i) => ({
            Id: genre + '-' + i, Name: 'Titre ' + genre + ' ' + i, ServerId: 'server-1',
            IsFolder: false, ImageTags: { Primary: 'p' }
          }))
        });
      }
      return Promise.reject(new Error('route inattendue ' + url));
    }
  };
};

await page.evaluate(stub);
await page.evaluate(script);
await page.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });

// Avant tout defilement, les rangees de genre differees montrent des silhouettes.
const beforeScroll = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.mc-row'));
  const genreRow = rows[rows.length - 1];
  return {
    skeletons: genreRow.querySelectorAll('.mc-skeleton').length,
    skeletonHidden: genreRow.querySelector('.mc-skeleton')?.getAttribute('aria-hidden')
  };
});

// Les rangees de genre se remplissent au defilement : on parcourt la page.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForFunction(
  () => document.querySelectorAll('.mc-row .card').length >= 12
     || document.querySelectorAll('.mc-empty').length >= 1,
  { timeout: 8000 });
await page.waitForTimeout(600);

const result = await page.evaluate(() => {
  const container = document.querySelector('#homeTab .homeSectionsContainer');
  const rows = Array.from(container.querySelectorAll('.mc-row'));

  // Reproduction fidele de allowSwipe() de jellyfin-web/src/components/maintabsmanager.js
  function allowSwipe(target) {
    let parent = target;
    while (parent != null) {
      const cl = parent.classList;
      if (cl && (cl.contains('scrollX') || cl.contains('animatedScrollX'))) return false;
      parent = parent.parentNode;
    }
    return true;
  }

  const card = rows[0].querySelector('.mc-ranked');

  const measure = (el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
  };

  return {
    order: Array.from(container.children).map(k =>
      k.className.split(' ').filter(c => c.startsWith('section') || c === 'mc-row').join('')),
    titles: rows.map(r => r.querySelector('.sectionTitle-cards').textContent),
    swipeBlocked: allowSwipe(card) === false,
    stripClasses: rows[0].querySelector('.mc-strip').className,
    noBadges: document.querySelectorAll('.mc-row-badge').length,
    noTileCounts: document.querySelectorAll('.mc-tile-count').length,
    allTimeCards: rows[1].querySelectorAll('.mc-ranked').length,
    returningCards: rows[3].querySelectorAll('.card').length,
    neverPlayedCards: rows[4].querySelectorAll('.card').length,
    becauseTitle: rows[5].querySelector('.sectionTitle-cards').textContent,
    becauseCards: rows[5].querySelectorAll('.card').length,
    becauseExcludesSeed: window.__calls.some(c => c.startsWith('Items?') && c.includes('ExcludeItemIds=seed1')),
    becauseGenreCount: (() => {
      const call = window.__calls.find(c => c.startsWith('Items?') && c.includes('Genres='));
      return call ? new URLSearchParams(call.split('?')[1]).get('Genres').split('|').length : 0;
    })(),
    studioLogo: !!rows[6].querySelector('.mc-tile-logo'),
    studioFallbackName: rows[6].querySelectorAll('.mc-tile .cardDefaultText').length,
    studioEscaped: rows[6].querySelector('.mc-tile .cardDefaultText')?.textContent,
    genreCards: rows[7].querySelectorAll('.card').length,
    genreEmptyMessage: rows[9].querySelector('.mc-empty')?.textContent,
    nativeVisible: Array.from(container.children)
      .filter(c => !c.classList.contains('mc-row') && !c.classList.contains('mc-hidden-native')).length,
    labelledBy: rows.every(r => {
      const id = r.getAttribute('aria-labelledby');
      return id && r.querySelector('#' + id);
    }),
    cardAria: card.querySelector('[aria-label]').getAttribute('aria-label'),
    // Routage : `appRouter.getRouteUrl` ouvre une serie sur sa FICHE bien qu'elle soit un
    // dossier, et un studio sur une liste filtree par `studioId`, jamais par `parentId`.
    movieHref: card.querySelector('a').getAttribute('href'),
    seriesHref: rows[3].querySelector('.card a').getAttribute('href'),
    studioHref: rows[6].querySelector('.mc-tile a').getAttribute('href'),
    arrowsHidden: Array.from(rows[0].querySelectorAll('.mc-arrow'))
      .every(a => a.getAttribute('tabindex') === '-1' && a.getAttribute('aria-hidden') === 'true'),
    listRoles: rows[0].querySelector('.mc-strip').getAttribute('role') === 'list'
      && card.getAttribute('role') === 'listitem',
    unavailableIsLink: !!rows[2].querySelector('.mc-unavailable a'),
    skeletonsLeft: document.querySelectorAll('.mc-row .mc-skeleton').length,
    // Parite avec une carte NATIVE presente sur la page. C'est le seul invariant
    // de dimension qui vaille desormais : la geometrie vient entierement de
    // jellyfin-web et du theme, plus d'un jeu de pixels que nous inventions.
    // La parite porte sur l'AFFICHE, plus sur la carte : une carte classee est
    // volontairement plus large, le chiffre occupant sa propre colonne a cote.
    box: measure(rows[0].querySelector('.mc-ranked .cardImageContainer')),
    nativeBox: measure(document.querySelector('#nativeReference .cardImageContainer')),
    textBox: measure(rows[0].querySelector('.mc-ranked .cardText-first')),
    nativeTextBox: measure(document.querySelector('#nativeReference .cardText-first')),
    rankStroke: getComputedStyle(rows[0]).getPropertyValue('--mc-rank-stroke').trim(),
    // Le chiffre est a COTE de l'affiche : il la chevauche par une marge negative,
    // et sa hauteur vaut celle de l'affiche.
    rankOverlap: (() => {
      const g = rows[0].querySelector('.mc-rank').getBoundingClientRect();
      const p = rows[0].querySelector('.mc-ranked .cardImageContainer').getBoundingClientRect();
      return { chevauche: Math.round(g.right - p.left) > 0, aGauche: Math.round(g.left) < Math.round(p.left) };
    })(),
    accentDefault: getComputedStyle(rows[0]).getPropertyValue('--mc-accent').trim(),
    genreBox: measure(rows[7].querySelector('.cardImageContainer')),
    // La largeur publiee dans `--mc-measured`, et les deux formes en presence.
    mesuree: getComputedStyle(document.querySelector('.sections'))
      .getPropertyValue('--mc-measured').trim(),
    afficheNativePortrait: Math.round(document.querySelector(
      '#nativeReference .cardScalable').getBoundingClientRect().width * 100) / 100,
    // Le piege : une carte PAYSAGE, native, placee AVANT nos rangees dans le DOM.
    piegePaysage: (() => {
      const b = document.querySelector('.overflowBackdropCard .cardScalable');
      const r = document.querySelector('.mc-row');
      if (!b || !r) return null;
      const avant = b.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING;
      return { present: !!avant,
        largeur: Math.round(b.getBoundingClientRect().width * 100) / 100 };
    })(),
    // Les vignettes de studio prennent la forme paysage native, pas un format maison.
    tileIsBackdrop: rows[6].querySelector('.mc-tile').classList.contains('overflowBackdropCard'),
    shapeClasses: rows[0].querySelector('.card').className.indexOf('overflowPortraitCard') !== -1
  };
});

// Compte les seules requetes des rangees de genre : la rangee personnalisee passe
// aussi par Items?, et la confondre avec elles laisserait passer une regression du
// chargement differe.
const genreCallsAtRest = await page.evaluate(
  () => window.__calls.filter(c => c.startsWith('Items?') && c.includes('GenreIds=')).length);
const becauseCallsAtRest = await page.evaluate(
  () => window.__calls.filter(c => c.startsWith('Items?') && !c.includes('GenreIds=')).length);
const callsBeforeRebuild = await page.evaluate(() => window.__calls.slice());

await page.evaluate(() => { document.body.appendChild(document.createElement('div')); });
await page.waitForTimeout(900);
const afterMutation = await page.evaluate(() => document.querySelectorAll('.mc-row').length);

await page.evaluate(() => {
  const c = document.querySelector('#homeTab .homeSectionsContainer');
  c.innerHTML = '<div class="verticalSection section0"><div class="card" data-type="CollectionFolder">Films</div></div>'
              + '<div class="verticalSection section1"></div>';
});
await page.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
const afterRebuild = await page.evaluate(() => document.querySelectorAll('.mc-row').length);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(900);
const callsAfterRebuild = await page.evaluate(() => window.__calls.slice());

await page.evaluate(() => {
  document.body.style.background = '#101010';
  document.body.style.color = '#fff';
  document.body.style.fontFamily = 'Noto Sans, sans-serif';
});

// D1 : une couleur invalide ne doit pas atterrir telle quelle dans la feuille de style.
const injection = await browser.newPage({ viewport: { width: 1280, height: 900 } });
injection.on('pageerror', e => errors.push('pageerror(injection): ' + e.message));
await injection.addInitScript(() => {
  window.__accent = 'red;} body{display:none} .x{color:red';
});
await injection.goto('file://' + path.join(here, 'home.html'));
await injection.evaluate(stub);
await injection.evaluate(script);
await injection.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });

const accent = await injection.evaluate(() => {
  const row = document.querySelector('.mc-row');
  return {
    css: document.getElementById('mc-styles').textContent,
    applied: getComputedStyle(row).getPropertyValue('--mc-accent').trim(),
    bodyVisible: getComputedStyle(document.body).display !== 'none'
  };
});
await injection.close();

// Troisieme passage : un theme charge APRES nos styles, comme le Custom CSS de Jellyfin.
const themed = await browser.newPage({ viewport: { width: 1280, height: 900 } });
themed.on('pageerror', e => errors.push('pageerror(theme): ' + e.message));
await themed.goto('file://' + path.join(here, 'home.html'));
await themed.evaluate(stub);
await themed.evaluate(script);
await themed.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
await themed.addStyleTag({ path: path.join(here, 'theme-excerpt.css') });
await themed.waitForTimeout(300);

const theme = await themed.evaluate(() => {
  const row = document.querySelector('.mc-row');
  const strip = row.querySelector('.mc-strip');
  const poster = row.querySelector('.cardScalable');
  const styleTag = document.getElementById('mc-styles');
  const themeTag = document.querySelector('style:last-of-type');
  return {
    themeLoadedAfter: styleTag.compareDocumentPosition(themeTag) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false,
    // Le jeton du theme doit etre adopte : 10 % de la largeur de la bande.
    stripPadding: getComputedStyle(strip).paddingLeft,
    // Le retrait de .375em (6 px) compense le padding porte par `.card`.
    expectedPadding: (strip.clientWidth * 0.10 - 6).toFixed(0),
    // Notre rangee SUIT desormais la regle .verticalSection du theme, comme les
    // sections natives : c'est ce qui la fait respirer au meme rythme qu'elles.
    rowMarginBottom: getComputedStyle(row).marginBottom,
    // Sous un theme aussi, nos cartes restent identiques aux cartes natives.
    cardWidth: Math.round(
      row.querySelector('.card .cardImageContainer').getBoundingClientRect().width * 10) / 10,
    nativeCardWidth: Math.round(
      document.querySelector('#nativeReference .cardImageContainer').getBoundingClientRect().width * 10) / 10,
    cardRadius: getComputedStyle(poster.querySelector('.cardImageContainer')).borderTopLeftRadius,
    nativeCardRadius: getComputedStyle(
      document.querySelector('#nativeReference .cardImageContainer')).borderTopLeftRadius,
    nativeRowMargin: getComputedStyle(document.getElementById('nativeReference')).marginBottom,
    // `--cardWidth` de Jellyfin contient un POURCENTAGE, resolu contre la boite de
    // contenu de la bande. Les themes ne padent qu'a gauche : la moindre respiration
    // ajoutee a droite retrecit notre boite et elargit toutes nos affiches. La
    // respiration de fin doit donc etre une cale, jamais un padding.
    // Une carte classee doit s'ELARGIR pour loger son chiffre, et son affiche ne doit
    // jamais deborder de sa carte : la carte suivante serait peinte par-dessus.
    carteClassee: Math.round(row.querySelector('.mc-ranked').getBoundingClientRect().width),
    carteNative: Math.round(
      document.querySelector('#nativeReference .card').getBoundingClientRect().width),
    afficheDeborde: (() => {
      const c = row.querySelector('.mc-ranked').getBoundingClientRect();
      const p = row.querySelector('.mc-ranked .cardImageContainer').getBoundingClientRect();
      return Math.round(p.right - c.right) > 1;
    })(),
    stripPaddingRight: getComputedStyle(strip).paddingRight,
    caleDeFin: getComputedStyle(strip, '::after').content,
    // Et le bord gauche de la premiere carte doit tomber sur celui de la reference.
    bordGauche: (() => {
      const n = document.querySelector('#nativeReference .card').getBoundingClientRect().left;
      const o = strip.querySelector('.card').getBoundingClientRect().left;
      return Math.round(Math.abs(n - o) * 100) / 100;
    })()
  };
});
await themed.close();

// Les cartes classees sont JOINTIVES : leur largeur vaut exactement celle de leur
// contenu. L'agrandissement au survol — 1,06 chez ElegantFin — deborde donc sur la carte
// voisine, qui est peinte apres et recouvrait l'affiche agrandie en la rognant a droite.
const survol = await browser.newPage({ viewport: { width: 1280, height: 900 } });
survol.on('pageerror', e => errors.push('pageerror(survol): ' + e.message));
await survol.goto('file://' + path.join(here, 'home.html'));
await survol.evaluate(stub);
await survol.evaluate(script);
await survol.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
await survol.addStyleTag({ path: path.join(here, 'theme-excerpt.css') });
// Le theme d'essai agrandit l'affiche au survol, comme le font les vrais.
await survol.addStyleTag({
  content: '.card-hoverable:hover .cardScalable{transform:scale(1.06);}'
});
await survol.waitForTimeout(250);
await survol.hover('.mc-row .mc-ranked');
await survol.waitForTimeout(250);

const hover = await survol.evaluate(() => {
  const carte = document.querySelector('.mc-row .mc-ranked');
  const cs = getComputedStyle(carte);
  const voisine = carte.nextElementSibling;
  return {
    // La carte survolee doit passer DEVANT ses voisines, sinon l'agrandissement est rogne.
    zIndex: cs.zIndex,
    positionnee: cs.position !== 'static',
    agrandie: getComputedStyle(carte.querySelector('.cardScalable')).transform !== 'none',
    // Et la voisine ne doit pas, elle, se hisser au meme plan.
    zIndexVoisine: voisine ? getComputedStyle(voisine).zIndex : 'aucune',
    // `contain: content` inclut la PEINTURE, qui decoupe net ce qui depasse de la carte.
    // Une carte classee fait exactement la largeur de son contenu : l'agrandissement au
    // survol est alors tranche sur sa droite.
    confinement: cs.contain,
    peintureConfinee: cs.contain.split(' ').some(v => v === 'paint' || v === 'content'
      || v === 'strict')
  };
});
await survol.close();


// Un theme qui declare la gouttiere « 0 », SANS UNITE. La valeur reste valide pour
// `margin-right` mais elle est invalide dans un `calc()` : tant que notre gouttiere
// large en dependait, la marge des rangees sans rang retombait a zero, en silence.
const zeroGapPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
zeroGapPage.on('pageerror', e => errors.push('pageerror(zerogap): ' + e.message));
await zeroGapPage.goto('file://' + path.join(here, 'home.html'));
await zeroGapPage.evaluate(stub);
await zeroGapPage.evaluate(script);
await zeroGapPage.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
await zeroGapPage.addStyleTag({ content: ':root{--itemColumnGap:0;--sidePadding:0}' });
await zeroGapPage.waitForTimeout(200);
const zeroGap = await zeroGapPage.evaluate(() => ({
  // Plus aucune de nos regles ne lit `--itemColumnGap` : un theme qui le declare
  // « 0 », sans unite, ne peut plus rendre un `calc()` invalide chez nous.
  readsColumnGapToken: document.getElementById('mc-styles').textContent.indexOf('--itemColumnGap') !== -1,
  cardWidth: document.querySelector('.mc-row .card').getBoundingClientRect().width,
  stripPadding: parseFloat(getComputedStyle(document.querySelector('.mc-row .mc-strip')).paddingLeft)
}));
await zeroGapPage.close();

// Un compte sans historique : la rangee personnalisee doit simplement ne pas exister,
// plutot que d'afficher un titre vide ou une bande sans carte.
const fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
fresh.on('pageerror', e => errors.push('pageerror(fresh): ' + e.message));
await fresh.addInitScript(() => { window.__noHistory = true; });
await fresh.goto('file://' + path.join(here, 'home.html'));
await fresh.evaluate(stub);
await fresh.evaluate(script);
await fresh.waitForFunction(() => document.querySelectorAll('.mc-row').length === 9, { timeout: 8000 });

const freshRows = await fresh.evaluate(() => ({
  titles: Array.from(document.querySelectorAll('.mc-row .sectionTitle-cards')).map(t => t.textContent),
  // Les rangees de genre sont volontairement vides tant qu'elles n'ont pas defile ;
  // ce qui compte ici est qu'aucune rangee ne porte un titre vide ou tronque.
  blankTitles: Array.from(document.querySelectorAll('.mc-row .sectionTitle-cards'))
    .filter(t => !t.textContent.trim()).length
}));
await fresh.close();

// Ordre configure : le rendu doit le suivre, ignorer les identifiants inconnus et
// ajouter en fin les rangees absentes de la liste.
const ordered = await browser.newPage({ viewport: { width: 1280, height: 900 } });
ordered.on('pageerror', e => errors.push('pageerror(ordered): ' + e.message));
await ordered.addInitScript(() => {
  window.__rowOrder = 'genres,local,global,returning,neverplayed,because,studios,inconnue';
});
await ordered.goto('file://' + path.join(here, 'home.html'));
await ordered.evaluate(stub);
await ordered.evaluate(script);
await ordered.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
const orderedTitles = await ordered.evaluate(
  () => Array.from(document.querySelectorAll('.mc-row .sectionTitle-cards')).map(t => t.textContent));
// Sans gestion des natives, celles-ci gardent leur place et nos rangees restent groupees.
const orderedNative = await ordered.evaluate(() => {
  const kids = Array.from(document.querySelector('#homeTab .homeSectionsContainer').children);
  const seen = [];
  kids.forEach(k => {
    const tag = k.classList.contains('mc-row') ? 'mc-row'
      : (k.className.match(/section\d+/) || [null])[0];
    if (tag && (tag !== 'mc-row' || seen[seen.length - 1] !== 'mc-row')) seen.push(tag);
  });
  return seen;
});
await ordered.close();

// Gestion des natives : l'ordre configure vaut pour tout le monde.
//
// On installe AVANT le rendu le meme observateur qu'Editor's Choice : il relance son
// injection des qu'un noeud portant « section0 » est ajoute, et un MutationObserver
// rapporte un noeud DEPLACE comme ajoute. Reinserer une section deja bien placee lui
// faisait donc afficher une deuxieme banniere.
const nativePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
nativePage.on('pageerror', e => errors.push('pageerror(native): ' + e.message));
await nativePage.addInitScript(() => {
  window.__section0Readds = 0;
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(records => {
      records.forEach(r => {
        Array.prototype.forEach.call(r.addedNodes, n => {
          if (n.classList && n.classList.contains('section0')) {
            window.__section0Readds++;
          }
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  });
  window.__manageNatives = true;
  // Reprise en tete, puis les bibliotheques, nos rangees, prochainement, derniers ajouts.
  window.__rowOrder = 'native:resume,local,native:smalllibrarytiles,global,returning,'
    + 'neverplayed,because,studios,genres,native:nextup,native:latestmedia';
});
await nativePage.goto('file://' + path.join(here, 'home.html'));
await nativePage.evaluate(stub);
await nativePage.evaluate(script);
await nativePage.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
await nativePage.evaluate(() => {
  const c = document.querySelector('#homeTab .homeSectionsContainer');
  const foreign = document.createElement('div');
  foreign.className = 'verticalSection otherPluginRow';
  c.appendChild(foreign);
});
// Un second rendu ne doit produire aucun deplacement : les mutations du conteneur
// font reagir d'autres plugins, qui reinjectent alors leur contenu pour rien.
const movesOnSecondRender = await nativePage.evaluate(() => new Promise(resolve => {
  const c = document.querySelector('#homeTab .homeSectionsContainer');
  let moves = 0;
  const observer = new MutationObserver(records => {
    records.forEach(r => { moves += r.addedNodes.length + r.removedNodes.length; });
  });
  observer.observe(c, { childList: true });
  // Force un nouveau passage du script sans reconstruire le conteneur.
  window.dispatchEvent(new Event('hashchange'));
  setTimeout(() => { observer.disconnect(); resolve(moves); }, 1200);
}));

const nativeOrder = await nativePage.evaluate(() => ({
  layout: Array.from(document.querySelector('#homeTab .homeSectionsContainer').children)
    .map(k => k.classList.contains('mc-row') ? 'mc-row'
      : (k.className.match(/section\d+/) || ['autre'])[0])
    .filter(t => t !== 'autre'),
  prefsRequested: window.__prefsCalls === 1,
  foreignSurvives: !!document.querySelector('.otherPluginRow'),
  section0Readds: window.__section0Readds
}));
nativeOrder.movesOnSecondRender = movesOnSecondRender;
await nativePage.close();

// jellyfin-web rend DIX sections, pas huit : une section descendue en neuvieme
// position existe bel et bien dans les preferences du compte.
const deepPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
deepPage.on('pageerror', e => errors.push('pageerror(deep): ' + e.message));
await deepPage.addInitScript(() => {
  window.__manageNatives = true;
  window.__customPrefs = {
    homesection0: 'smalllibrarytiles', homesection1: 'resume', homesection2: 'resumeaudio',
    homesection3: 'resumebook', homesection4: 'livetv', homesection5: 'latestmedia',
    homesection6: 'none', homesection7: 'none', homesection8: 'nextup', homesection9: 'none'
  };
  window.__rowOrder = 'native:nextup,native:smalllibrarytiles,local,alltime,global,'
    + 'returning,neverplayed,because,studios,genres';
});
await deepPage.goto('file://' + path.join(here, 'home.html'));
await deepPage.evaluate(() => {
  const c = document.querySelector('#homeTab .homeSectionsContainer');
  for (let i = 4; i < 10; i++) {
    const d = document.createElement('div');
    d.className = 'verticalSection section' + i;
    c.appendChild(d);
  }
});
await deepPage.evaluate(stub);
await deepPage.evaluate(script);
await deepPage.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
const deepFirst = await deepPage.evaluate(() =>
  document.querySelector('#homeTab .homeSectionsContainer').firstElementChild.className);
await deepPage.close();

// Une section native DEPLACEE doit conserver sa liaison aux donnees.
//
// `emby-itemscontainer.detachedCallback` met `fetchData` a null, et `loadSection` de
// jellyfin-web ne la reassigne jamais : un simple insertBefore rendait la section
// definitivement incapable de se charger. C'est ce qui vidait « A suivre ».
const bindingPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
bindingPage.on('pageerror', e => errors.push('pageerror(binding): ' + e.message));
await bindingPage.addInitScript(() => {
  window.__manageNatives = true;
  window.__customPrefs = { homesection0: 'smalllibrarytiles', homesection1: 'resume', homesection2: 'nextup' };
  // « nextup » est demande en DERNIER : la section doit donc etre deplacee.
  window.__rowOrder = 'native:smalllibrarytiles,local,alltime,global,returning,'
    + 'neverplayed,because,studios,genres,native:resume,native:nextup';
});
await bindingPage.goto('file://' + path.join(here, 'home.html'));
// `disconnectedCallback` est SYNCHRONE : un MutationObserver ne le simule pas
// fidelement. Un vrai element personnalise est le seul moyen de reproduire l'ordre
// des operations que subit `emby-itemscontainer` pendant un insertBefore.
await bindingPage.evaluate(() => {
  window.__resumed = 0;
  class FakeItemsContainer extends HTMLDivElement {
    disconnectedCallback() {
      this.fetchData = null;
      this.getItemsHtml = null;
      this.parentContainer = null;
    }
    resume() { window.__resumed++; }
  }
  customElements.define('mc-fake-itemscontainer', FakeItemsContainer, { extends: 'div' });

  const section = document.querySelector('#homeTab .homeSectionsContainer .section2');
  section.innerHTML = '<h2 class="sectionTitle">A suivre</h2>'
    + '<div is="mc-fake-itemscontainer" class="itemsContainer"></div>';
  const ic = section.querySelector('.itemsContainer');
  ic.fetchData = () => Promise.resolve({ Items: [] });
  ic.getItemsHtml = () => '';
  ic.parentContainer = section;
});
await bindingPage.evaluate(stub);
await bindingPage.evaluate(script);
await bindingPage.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
await bindingPage.waitForTimeout(300);
const binding = await bindingPage.evaluate(() => {
  const ic = document.querySelector('#homeTab .homeSectionsContainer .section2 .itemsContainer');
  return { deplacee: !!ic, liaison: typeof (ic && ic.fetchData), relancee: window.__resumed > 0 };
});
await bindingPage.close();

// Valeur heritee : un compte ancien peut porter `folders` la ou Jellyfin ecrit
// aujourd'hui `smalllibrarytiles`. jellyfin-web la traduit avant de rendre
// (`homesections.js`) ; nous devons faire de meme, sinon `native:smalllibrarytiles`
// ne designe aucune section et les bibliotheques ne sont jamais placees.
// L'ordre place les bibliotheques APRES deux de nos rangees : il faut donc que la
// section soit reellement DEPLACEE. Un ordre qui la laisserait en tete passerait
// aussi bien avec qu'sans la traduction, et ne prouverait rien.
const legacyOrder = 'local,alltime,native:smalllibrarytiles,global,returning,'
  + 'neverplayed,because,studios,genres';

async function nativeOrderWith(section0) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push('pageerror(legacy): ' + e.message));
  await page.addInitScript(([first, order]) => {
    window.__manageNatives = true;
    window.__customPrefs = { homesection0: first, homesection1: 'resume', homesection2: 'latestmedia' };
    window.__rowOrder = order;
  }, [section0, legacyOrder]);
  await page.goto('file://' + path.join(here, 'home.html'));
  await page.evaluate(stub);
  await page.evaluate(script);
  await page.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
  const shape = await page.evaluate(() =>
    Array.from(document.querySelector('#homeTab .homeSectionsContainer').children)
      .map(k => k.classList.contains('mc-row') ? 'mc-row' : (k.className.match(/section\d+/) || ['?'])[0])
      .join(','));
  await page.close();
  return shape;
}

const modernFolders = await nativeOrderWith('smalllibrarytiles');
const legacyFolders = await nativeOrderWith('folders');

// Interface televiseur : getAllSectionsToShow prepend une section de bibliotheques
// quand l'ordre du compte n'en contient aucune, et tout glisse d'un cran. Onze
// `.section{N}` au lieu de dix : c'est ce qui permet de le reconnaitre.
const tvPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
tvPage.on('pageerror', e => errors.push('pageerror(tv): ' + e.message));
await tvPage.addInitScript(() => {
  window.__manageNatives = true;
  window.__customPrefs = { homesection0: 'resume', homesection1: 'nextup' };
  window.__rowOrder = 'native:nextup,local,alltime,global,returning,neverplayed,'
    + 'because,studios,genres,native:resume';
});
await tvPage.goto('file://' + path.join(here, 'home.html'));
await tvPage.evaluate(() => {
  const c = document.querySelector('#homeTab .homeSectionsContainer');
  for (let i = 4; i < 11; i++) {
    const d = document.createElement('div');
    d.className = 'verticalSection section' + i;
    c.appendChild(d);
  }
});
await tvPage.evaluate(stub);
await tvPage.evaluate(script);
await tvPage.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
const tvLayout = await tvPage.evaluate(() =>
  Array.from(document.querySelector('#homeTab .homeSectionsContainer').children)
    .map(k => k.classList.contains('mc-row') ? 'mc-row' : (k.className.match(/section\d+/) || ['autre'])[0]));
await tvPage.close();

// Personnalisation par compte. La page de configuration du plugin est reservee aux
// administrateurs : ce panneau est le seul endroit ou un compte ordinaire peut regler
// ses rangees, il doit donc s'ouvrir depuis la page d'accueil elle-meme.
const prefsPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
prefsPage.on('pageerror', e => errors.push('pageerror(prefs): ' + e.message));
await prefsPage.addInitScript(() => { window.__allowPrefs = true; });
await prefsPage.goto('file://' + path.join(here, 'home.html'));
await prefsPage.evaluate(stub);
await prefsPage.evaluate(script);
await prefsPage.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });

const prefs = await prefsPage.evaluate(() => ({
  boutons: document.querySelectorAll('.mc-prefs-open').length,
  surNotreRangee: !!document.querySelector('.mc-row .mc-row-header .mc-prefs-open'),
  panneauAvant: document.querySelectorAll('.mc-prefs').length
}));

// Ouverture, puis une ligne par rangee ordonnee.
await prefsPage.click('.mc-prefs-open');
const ouvert = await prefsPage.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.mc-prefs li'));
  return {
    lignes: items.length,
    premiere: items[0].getAttribute('data-row'),
    monterDesactive: items[0].querySelector('.mc-prefs-up').disabled,
    descendreDesactive: items[items.length - 1].querySelector('.mc-prefs-down').disabled,
    modal: document.querySelector('.mc-prefs').getAttribute('aria-modal')
  };
});

// On decoche la premiere rangee, on descend la deuxieme, puis on enregistre.
await prefsPage.evaluate(() => {
  document.querySelector('.mc-prefs li input[type=checkbox]').checked = false;
  document.querySelectorAll('.mc-prefs li')[1].querySelector('.mc-prefs-down').click();
});
await prefsPage.click('.mc-prefs-save');
await prefsPage.waitForFunction(() => (window.__ajax || []).length === 1, { timeout: 4000 });

const enregistre = await prefsPage.evaluate(() => {
  const call = window.__ajax[0];
  return {
    methode: call.type,
    route: call.url,
    premiereMasquee: call.body.ShowLocalRow,
    ordre: call.body.RowOrder,
    couleur: call.body.HighlightColor,
    echelle: call.body.RankNumberScale,
    ferme: document.querySelectorAll('.mc-prefs').length === 0
  };
});

// Reinitialisation : le compte revient aux reglages du serveur.
await prefsPage.waitForSelector('.mc-prefs-open');
await prefsPage.click('.mc-prefs-open');
await prefsPage.click('.mc-prefs-reset');
await prefsPage.waitForFunction(() => (window.__ajax || []).length === 2, { timeout: 4000 });
const reinitialise = await prefsPage.evaluate(() => window.__ajax[1].type);

// Sans l'autorisation du serveur, aucun bouton n'est propose.
const sansPrefs = await browser.newPage({ viewport: { width: 1280, height: 900 } });
sansPrefs.on('pageerror', e => errors.push('pageerror(sansprefs): ' + e.message));
await sansPrefs.goto('file://' + path.join(here, 'home.html'));
await sansPrefs.evaluate(stub);
await sansPrefs.evaluate(script);
await sansPrefs.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
const prefsInterdites = await sansPrefs.evaluate(() => document.querySelectorAll('.mc-prefs-open').length);
await sansPrefs.close();
await prefsPage.close();

// Un theme clair : la couleur est lue sur la page, pas sur un media query que les
// themes Jellyfin ne declenchent jamais.
const light = await browser.newPage({ viewport: { width: 1280, height: 900 } });
light.on('pageerror', e => errors.push('pageerror(light): ' + e.message));
await light.goto('file://' + path.join(here, 'home.html'));
await light.evaluate(() => { document.body.style.background = '#f2f2f2'; });
await light.evaluate(stub);
await light.evaluate(script);
await light.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
const lightMode = await light.evaluate(() => {
  const row = document.querySelector('.mc-row');
  return {
    flagged: document.querySelectorAll('.mc-row.mc-on-light').length,
    // Le chiffre est pose sur le voile, pas sur la page : il reste blanc quel que soit
    // le theme. C'est tout l'interet du voile, et ce que les anciens contour et halo,
    // qui devaient s'inverser, ne savaient pas faire.
    contourFonce: (() => {
      const v = getComputedStyle(row).getPropertyValue('--mc-rank-stroke');
      const m = v.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/);
      return m ? Number(m[1]) > 50 : false;
    })(),
    // Seule la COULEUR du contour suit la page claire. La geometrie, elle, ne bouge
    // pas : l'affiche garde sa taille native et le chiffre son chevauchement. C'est ce
    // qui distingue un reglage de teinte d'une mise en page qui se reorganise.
    aucunVoileResiduel: document.querySelectorAll('.mc-rank-scrim').length === 0,
    afficheIntacte: (() => {
      const a = row.querySelector('.mc-ranked .cardImageContainer').getBoundingClientRect();
      const n = document.querySelector('#nativeReference .cardImageContainer').getBoundingClientRect();
      return Math.abs(a.width - n.width) < 0.5;
    })()
  };
});
await light.close();

// Second passage, sections natives masquees.
const hidePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
hidePage.on('pageerror', e => errors.push('pageerror(hide): ' + e.message));
await hidePage.addInitScript(() => { window.__hideNative = true; });
await hidePage.goto('file://' + path.join(here, 'home.html'));
await hidePage.evaluate(stub);
await hidePage.evaluate(script);
await hidePage.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });

// Un autre plugin insere son propre element dans le conteneur de l'accueil.
await hidePage.evaluate(() => {
  const container = document.querySelector('#homeTab .homeSectionsContainer');
  const foreign = document.createElement('div');
  foreign.className = 'verticalSection otherPluginRow';
  foreign.textContent = 'Rangee d un autre plugin';
  container.appendChild(foreign);
});
await hidePage.evaluate(() => {
  // Force un nouveau rendu pour que le masquage soit reapplique.
  document.querySelector('#homeTab .homeSectionsContainer').appendChild(document.createElement('span'));
});
await hidePage.waitForTimeout(700);

const hidden = await hidePage.evaluate(() => {
  const container = document.querySelector('#homeTab .homeSectionsContainer');
  const kids = Array.from(container.children);
  const library = kids.find(k => k.querySelector('.card[data-type="CollectionFolder"]'));
  return {
    libraryVisible: !library.classList.contains('mc-hidden-native'),
    libraryDisplayed: getComputedStyle(library).display !== 'none',
    nativeHidden: kids.filter(k => k.classList.contains('mc-hidden-native')).length,
    ourRowsVisible: kids.filter(k => k.classList.contains('mc-row')
      && !k.classList.contains('mc-hidden-native')).length,
    foreignVisible: !document.querySelector('.otherPluginRow').classList.contains('mc-hidden-native')
  };
});

// ---------------------------------------------------------------------------
// Dimensionnement adaptatif et compatibilite Tizen.
//
// La feuille de styles est un tableau de chaines JS assemble par join('') : une
// accolade oubliee la casse entierement, sans erreur visible. Ces controles la
// font parser par le navigateur et verifient qu'elle produit bien des regles.
// ---------------------------------------------------------------------------

const sizing = await browser.newPage({ viewport: { width: 1280, height: 900 } });
sizing.on('pageerror', e => errors.push('pageerror(sizing): ' + e.message));
await sizing.goto('file://' + path.join(here, 'home.html'));
await sizing.evaluate(stub);
await sizing.evaluate(script);
await sizing.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });

// Largeur d'affiche reellement rendue a chaque palier.
const widths = {};
for (const [label, size] of [
  ['phonePortrait', { width: 380, height: 800 }],
  ['phoneLandscape', { width: 700, height: 500 }],
  ['desktop', { width: 1280, height: 900 }],
  ['wide', { width: 1600, height: 1000 }],
  ['tv1080', { width: 1920, height: 1080 }],
  ['tv4k', { width: 2560, height: 1440 }]
]) {
  await sizing.setViewportSize(size);
  await sizing.waitForTimeout(120);
  widths[label] = await sizing.evaluate(() => [
    document.querySelector('.mc-row .card .cardImageContainer').getBoundingClientRect().width,
    document.querySelector('#nativeReference .cardImageContainer').getBoundingClientRect().width
  ]);
}

// Ecran large mais bas : un televiseur 720p, ou une fenetre aplatie.
await sizing.setViewportSize({ width: 1280, height: 560 });
await sizing.waitForTimeout(120);
widths.shortScreen = await sizing.evaluate(() => [
  document.querySelector('.mc-row .card .cardImageContainer').getBoundingClientRect().width,
  document.querySelector('#nativeReference .cardImageContainer').getBoundingClientRect().width
]);

await sizing.setViewportSize({ width: 1280, height: 900 });
await sizing.waitForTimeout(120);

// Les logos de studio sont en `loading="lazy"` et la rangee est sous la ligne de
// flottaison : sans cela, l'image n'est jamais demandee, donc jamais marquee prete,
// et la mesure suivante tombe sur un element inexistant. On force le chargement
// plutot que de dependre de la position du defilement.
await sizing.evaluate(() => {
  Array.prototype.forEach.call(document.querySelectorAll('.mc-row img'), img => {
    img.loading = 'eager';
    img.src = img.src;
  });
});
await sizing.waitForTimeout(800);

const styling = await sizing.evaluate(() => {
  const sheet = document.getElementById('mc-styles');
  const css = sheet.textContent;
  const strip = document.querySelector('.mc-row .mc-strip');
  const cards = strip.querySelectorAll('.mc-ranked');
  const poster = document.querySelector('.mc-row .cardScalable');

  return {
    // Une accolade manquante ferait chuter ce nombre sans rien signaler.
    ruleCount: sheet.sheet ? sheet.sheet.cssRules.length : 0,
    mediaCount: sheet.sheet
      ? Array.prototype.filter.call(sheet.sheet.cssRules, r => r.type === CSSRule.MEDIA_RULE).length
      : 0,
    bracesBalanced: (css.match(/{/g) || []).length === (css.match(/}/g) || []).length,

    // Tizen <= 6.0 est en Chromium 76 : `gap` en flexbox n'y existe pas.
    stripUsesGapProperty: /\.mc-strip\{[^}]*gap:/.test(css),
    // L'espacement entre cartes vient du padding que `.card` porte lui-meme, chez
    // Jellyfin comme chez nous : rien a mesurer de notre cote.
    cardPadding: parseFloat(getComputedStyle(cards[0]).paddingRight),
    nativeCardPadding: parseFloat(
      getComputedStyle(document.querySelector('#nativeReference .card')).paddingRight),

    // Tizen n'a pas `:focus-visible` : le contour doit tenir sur `:focus` seul.
    hasPlainFocusRule: /\.mc-row \.card:focus[^{]*\{[^}]*outline:/.test(css),
    focusVisibleOnlyGuard: css.indexOf(':focus:not(:focus-visible)') !== -1,

    posterRatio: poster.getBoundingClientRect().height / poster.getBoundingClientRect().width,

    // Fondu des images : meme en erreur (les src de ce banc sont factices), chaque
    // image doit etre marquee prete, sinon elle resterait transparente a jamais.
    // Les affiches sont des fonds CSS, comme chez Jellyfin ; seuls les logos de
    // studio restent des balises `img`, et ce sont eux qui se fondent.
    imagesTotal: document.querySelectorAll('.mc-row img').length,
    imagesReady: document.querySelectorAll('.mc-row img.mc-ready').length,
    readyOpacity: getComputedStyle(document.querySelector('.mc-row img.mc-ready')).opacity,
    postersAreBackgrounds: Array.prototype.every.call(
      document.querySelectorAll('.mc-row .mc-ranked .cardImageContainer'),
      el => getComputedStyle(el).backgroundImage !== 'none'),

    snapType: getComputedStyle(document.querySelector('.mc-row .mc-strip')).scrollSnapType,

    // Fond sombre : pas de mode clair.
    lightRows: document.querySelectorAll('.mc-row.mc-on-light').length
  };
});

// Le chiffre du rang doit rester entierement visible, « 1 » compris.
const rank = await sizing.evaluate(() => {
  const cards = document.querySelectorAll('.mc-row .mc-ranked');
  const one = cards[0].querySelector('.mc-rank');
  const two = cards[1].querySelector('.mc-rank');
  const ten = (function () {
    const glyphs = document.querySelectorAll('.mc-row .mc-rank-glyph');
    for (let i = 0; i < glyphs.length; i++) {
      if (glyphs[i].textContent === '10') return glyphs[i].parentNode;
    }
    return null;
  })();
  const oneBox = one.getBoundingClientRect();
  const twoBox = two.getBoundingClientRect();
  const tenBox = ten && ten.getBoundingClientRect();
  const cardBox = cards[0].getBoundingClientRect();
  const posterBox = cards[0].querySelector('.cardScalable').getBoundingClientRect();
  const glyphBox = cards[0].querySelector('.mc-rank-glyph').getBoundingClientRect();

  return {
    text: one.querySelector('.mc-rank-glyph').textContent,
    tenText: ten ? ten.querySelector('.mc-rank-glyph').textContent : null,
    isSvg: one.tagName.toLowerCase() === 'svg',
    // Le repere SVG ne depend que du nombre de chiffres : « 1 » et « 2 » ont donc
    // exactement la meme boite, ce que `-webkit-text-stroke` ne garantissait pas.
    sameWidth: Math.abs(oneBox.width - twoBox.width) < 0.5,
    // « 10 » est plus large, mais exactement aussi haut : il n'est pas comprime.
    tenWider: tenBox ? tenBox.width > oneBox.width + 8 : false,
    tenSameHeight: tenBox ? Math.abs(tenBox.height - oneBox.height) < 0.5 : false,
    // Le chiffre ne deborde pas sur la carte voisine.
    withinCard: oneBox.left >= cardBox.left - 1 && oneBox.right <= cardBox.right + 1,
    // Il couvre le bas de l'affiche sans l'avaler.
    coverage: Math.round((oneBox.height / posterBox.height) * 100) / 100,
    // Position REELLE du glyphe, en pourcentage de l'affiche. C'est la seule qui
    // compte : le repere SVG porte sa propre marge, si bien que les valeurs CSS ne
    // disent rien de ce qu'on voit. Le chiffre etant desormais A COTE de l'affiche,
    // l'ecart de gauche est NEGATIF — il commence avant elle — et celui du bas doit
    // tomber a zero, les deux bords du glyphe epousant ceux de l'affiche.
    encartGauche: +(((glyphBox.left - posterBox.left) / posterBox.width) * 100).toFixed(1),
    // Le pied se mesure sur la boite SVG, pas sur celle du `<text>` : cette derniere
    // reserve la place des jambages sous la ligne de base, que les chiffres n'occupent
    // pas — elle depasse donc de pres de 30 % ce que l'oeil voit. Le `viewBox` etant
    // resserre sur le glyphe et ancre en `yMax`, le bas de la boite SVG, lui, tombe sur
    // le pied du chiffre.
    encartBas: +(((posterBox.bottom - oneBox.bottom) / posterBox.height) * 100).toFixed(1),
    // Le chiffre occupe sa propre colonne, en frere de l'affiche.
    colonnes: cards[0].querySelectorAll('.mc-rank-row > .mc-rank').length,
    // Le rang 10 porte DEUX chiffres : son repere est deux fois plus large, donc sa carte
    // aussi. C'est le cas ou une largeur de carte calculee de travers se voit le plus —
    // l'affiche y ressortirait de sa carte, et la voisine la recouvrirait.
    dixieme: (() => {
      const dix = cards[9];
      if (!dix) { return null; }
      const p1 = cards[0].querySelector('.cardImageContainer').getBoundingClientRect();
      const p10 = dix.querySelector('.cardImageContainer').getBoundingClientRect();
      const c10 = dix.getBoundingClientRect();
      return {
        memeAffiche: Math.abs(p10.width - p1.width) < 0.5,
        carteElargie: c10.width > cards[0].getBoundingClientRect().width * 1.3,
        afficheDedans: Math.round(p10.right - c10.right) <= 1
      };
    })(),
    // La police doit etre posee explicitement. Un texte SVG dont aucun ancetre ne
    // declare `font-family` retombe sur le defaut du moteur, qui est un SERIF : les
    // chiffres se couvrent alors d'empattements qu'on prend pour un defaut de trace.
    fontFamily: getComputedStyle(one.querySelector('.mc-rank-glyph')).fontFamily,
    declaresFont: /\.mc-rank text\{[^}]*font-family:/.test(
      document.getElementById('mc-styles').textContent)
  };
});

// Animations : presence, decalage par rangee, et arret complet si le systeme le demande.
const motion = await sizing.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.mc-row'));
  return {
    name: getComputedStyle(rows[0]).animationName,
    delays: rows.slice(0, 4).map(r => r.style.animationDelay),
    glyphTransition: getComputedStyle(document.querySelector('.mc-row .mc-rank-glyph')).transitionProperty
  };
});
await sizing.close();

const calm = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
calm.on('pageerror', e => errors.push('pageerror(calm): ' + e.message));
await calm.goto('file://' + path.join(here, 'home.html'));
await calm.evaluate(stub);
await calm.evaluate(script);
await calm.waitForFunction(() => document.querySelectorAll('.mc-row').length === 10, { timeout: 8000 });
const reduced = await calm.evaluate(() => {
  const row = document.querySelector('.mc-row');
  return {
    animationName: getComputedStyle(row).animationName,
    glyphTransition: getComputedStyle(row.querySelector('.mc-rank-glyph')).transitionProperty,
    // Une rangee figee sur l'image de depart de l'animation serait invisible.
    rowOpacity: getComputedStyle(row).opacity,
    rowVisible: row.getBoundingClientRect().height > 0
  };
});
await calm.close();

// ---------------------------------------------------------------------------
// COURSE : la mesure ne doit pas dependre de l'arrivee des sections natives.
//
// Configuration reelle d'un serveur ou SEULES les rangees classees sont activees :
// aucune de nos rangees ne fournit alors d'affiche non classee, et les seules
// references possibles sont les cartes des sections natives, qui se remplissent
// par leur propre requete. Quand notre rendu gagnait cette course, la mesure
// n'avait pas lieu, ne se rejouait jamais, et les affiches gardaient le repli
// theorique jusqu'au rechargement de la page — le defaut « la rangee apparait
// en petit ». La sonde embarquee doit rendre le resultat identique dans les
// deux sens de la course.
// ---------------------------------------------------------------------------
const CARTE_NATIVE = '<div class="card overflowPortraitCard card-hoverable">'
  + '<div class="cardBox cardBox-bottompadded"><div class="cardScalable">'
  + '<div class="cardPadder cardPadder-overflowPortrait"></div>'
  + '<div class="cardImageContainer coveredImage cardContent"></div></div>'
  + '<div class="cardFooter cardFooter-transparent">'
  + '<div class="cardText cardTextCentered cardText-first"><bdi>x</bdi></div>'
  + '<div class="cardText cardTextCentered cardText-secondary"><bdi>2024</bdi></div>'
  + '</div></div></div>';

async function courseDeMesure(referenceAvantLeRendu) {
  const vue = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  vue.on('pageerror', e => errors.push('pageerror(course): ' + e.message));
  await vue.goto('file://' + path.join(here, 'home.html'));
  await vue.addStyleTag({ path: path.join(here, 'theme-excerpt.css') });

  const remplirNative = () => vue.evaluate((carte) => {
    document.querySelector('#homeTab .homeSectionsContainer .section2').innerHTML =
      '<h2 class="sectionTitle">Derniers films</h2>'
      + '<div is="emby-scroller" class="emby-scroller scrollX">'
      + '<div class="itemsContainer scrollSlider">' + carte.repeat(6) + '</div></div>';
  }, CARTE_NATIVE);

  if (referenceAvantLeRendu) { await remplirNative(); }

  // Seules les deux rangees classees sont activees.
  await vue.addInitScript(() => { window.__seulementClassees = true; });
  await vue.evaluate(() => {
    const r = n => Array.from({ length: n }, (_, i) => ({
      Rank: i + 1, Name: 'Film ' + (i + 1), ProductionYear: 2020,
      Item: { Id: 'c' + i, Name: 'Film', ServerId: 'server-1', Type: 'Movie', IsFolder: false, ImageTags: { Primary: 't' } }
    }));
    window.ApiClient = {
      getCurrentUserId: () => 'user-1', serverId: () => 'server-1',
      getUrl: (p, q) => p + '?' + new URLSearchParams(q || {}).toString(),
      getImageUrl: (id) => 'img://' + id,
      getJSON: (url) => url.includes('ClientOptions')
        ? Promise.resolve({
            EnableHomeRows: true, ShowLocalRow: true, ShowGlobalRow: true,
            ShowAllTimeRow: false, ShowStudioRow: false, ShowGenreRows: false,
            ShowReturningRow: false, ShowNeverPlayedRow: false, ShowBecauseRow: false,
            LocalRowTitle: 'Top 10 sur ce serveur', GlobalRowTitle: 'Top 10 mondial',
            LocalRowSize: 10, GlobalRowSize: 10, RankNumberScale: 100
          })
        : url.includes('Top/') ? Promise.resolve({ Items: r(10) }) : Promise.resolve({ Items: [] })
    };
  });
  await vue.evaluate(script);
  await vue.waitForSelector('.mc-ranked', { timeout: 8000 });
  await vue.waitForTimeout(400);

  if (!referenceAvantLeRendu) { await remplirNative(); await vue.waitForTimeout(1200); }

  const releve = await vue.evaluate(() => {
    const c = document.querySelector('#homeTab .homeSectionsContainer');
    const classee = document.querySelector('.mc-ranked .mc-rank-col .cardScalable');
    const native = document.querySelector('.section2 .overflowPortraitCard .cardScalable');
    const bande = document.querySelector('.mc-row .mc-strip');
    const sonde = document.querySelector('.mc-row .mc-probe-strip');
    return {
      mesuree: c.style.getPropertyValue('--mc-measured') || '',
      affiche: classee ? classee.getBoundingClientRect().width : null,
      native: native ? native.getBoundingClientRect().width : null,
      // La sonde ne doit ni occuper de hauteur, ni entrer dans la bande visible.
      // Tolerant a l'absence : ce test doit ECHOUER proprement si la sonde
      // disparait, pas exploser sur un null et masquer les autres verdicts.
      hauteurSonde: sonde ? sonde.getBoundingClientRect().height : null,
      cartesVisibles: bande.querySelectorAll('.card').length,
      sondeMasquee: sonde ? sonde.getAttribute('aria-hidden') === 'true' : false,
      sondeHorsBande: bande.querySelector('.mc-probe') === null
    };
  });
  await vue.close();
  return releve;
}

const coursePerdue = await courseDeMesure(false);
const courseGagnee = await courseDeMesure(true);

// ---------------------------------------------------------------------------
// DEBORDEMENT : la bande doit aller jusqu'au bord REELLEMENT affiche.
//
// En « version pour ordinateur » sur telephone, Chrome pose un document plus
// etroit que ce qu'il affiche : mesure sur l'appareil, document 980 px pour
// 1645 px montres. Les rangees de Jellyfin ne rognent pas — leurs cartes
// debordent du conteneur et restent visibles jusqu'au bord de l'ecran. La
// notre porte `overflow-x:auto` pour son defilement, ce qui DECOUPE net a 980 :
// elle s'arretait a 59,6 % de la largeur affichee, trois cartes au lieu de huit.
//
// On reproduit le symptome — bande plus etroite que la fenetre — et on verifie
// que l'extension ne touche NI la taille d'affiche, NI la mesure, NI les
// rangees ordinaires, dont les cartes tiennent leur largeur d'un pourcentage
// resolu contre ce meme conteneur.
// ---------------------------------------------------------------------------
async function debordement(documentEtroit) {
  const ctx = await browser.newContext({ viewport: { width: 1645, height: 900 }, hasTouch: true });
  const vue = await ctx.newPage();
  vue.on('pageerror', e => errors.push('pageerror(debordement): ' + e.message));
  await vue.goto('file://' + path.join(here, 'home.html'));
  if (documentEtroit) { await vue.addStyleTag({ content: 'body{width:980px;overflow-x:hidden}' }); }
  await vue.addStyleTag({ path: path.join(here, 'theme-excerpt.css') });
  await vue.evaluate(() => {
    const r = n => Array.from({ length: n }, (_, i) => ({
      Rank: i + 1, Name: 'Titre ' + (i + 1), ProductionYear: 2020,
      Item: { Id: 'd' + i, Name: 'Titre', ServerId: 'server-1', Type: 'Movie', IsFolder: false, ImageTags: { Primary: 't' } }
    }));
    window.ApiClient = {
      getCurrentUserId: () => 'user-1', serverId: () => 'server-1',
      getUrl: (p, q) => p + '?' + new URLSearchParams(q || {}).toString(),
      getImageUrl: (id) => 'img://' + id,
      getJSON: (url) => url.includes('ClientOptions')
        ? Promise.resolve({
            EnableHomeRows: true, ShowLocalRow: true, ShowGlobalRow: false,
            ShowAllTimeRow: false, ShowStudioRow: false, ShowGenreRows: false,
            ShowReturningRow: false, ShowNeverPlayedRow: true, ShowBecauseRow: false,
            LocalRowTitle: 'Top 10 sur ce serveur', NeverPlayedRowTitle: 'Jamais vu',
            LocalRowSize: 10, NeverPlayedRowSize: 10, RankNumberScale: 100
          })
        : (url.includes('Top/') || url.includes('NeverPlayed'))
          ? Promise.resolve({ Items: r(10) }) : Promise.resolve({ Items: [] })
    };
  });
  await vue.evaluate(script);
  await vue.waitForSelector('.mc-ranked', { timeout: 8000 });
  await vue.waitForTimeout(500);
  const releve = await vue.evaluate(() => {
    const bande = document.querySelector('.mc-row .mc-strip');
    const rb = bande.getBoundingClientRect();
    const ordinaire = [...document.querySelectorAll('.mc-row')].find(r => !r.querySelector('.mc-ranked'));
    const poster = document.querySelector('.mc-ranked .mc-rank-col .cardScalable');
    let visibles = 0;
    bande.querySelectorAll(':scope > .card').forEach(c => {
      const r = c.getBoundingClientRect();
      if (r.left < rb.right && r.right > rb.left) { visibles++; }
    });
    return {
      fenetre: window.innerWidth,
      finitA: rb.right,
      cartesVisibles: visibles,
      affiche: poster.getBoundingClientRect().width,
      mesuree: document.querySelector('#homeTab .homeSectionsContainer')
        .style.getPropertyValue('--mc-measured'),
      bandeOrdinaire: ordinaire
        ? ordinaire.querySelector('.mc-strip').getBoundingClientRect().width : null
    };
  });
  await vue.close(); await ctx.close();
  return releve;
}

const etroit = await debordement(true);
const large = await debordement(false);

// ---------------------------------------------------------------------------
// AUDIT DU 2026-09-25. Chaque scenario rejoue un defaut constate — au banc ou sur un
// vrai serveur 12.1 — et a ete vu echouer contre le code d'avant son correctif.
//
// Le faux serveur est au plus pres du vrai : il FILTRE chaque liste pour l'appelant,
// borne l'echelle comme UserPreferenceRules et fusionne les preferences enregistrees.
// ---------------------------------------------------------------------------
const serveurParCompte = () => {
  window.__appels = [];
  window.__prefs = {};
  const listes = {
    A: ['Film reserve aux adultes', 'Serie interdite -12', 'Horreur 18+'],
    B: ['Dessin anime', 'Film famille', 'Documentaire animaux']
  };
  const bascules = ['ShowLocalRow', 'ShowAllTimeRow', 'ShowGlobalRow', 'ShowReturningRow',
    'ShowNeverPlayedRow', 'ShowBecauseRow', 'ShowStudioRow', 'ShowGenreRows'];
  window.ApiClient = {
    getCurrentUserId: () => window.__user,
    serverId: () => 'server-1',
    getUrl: (p, q) => p + '?' + new URLSearchParams(q || {}).toString(),
    getImageUrl: (id) => 'img://' + id,
    getJSON: (url) => {
      window.__appels.push(window.__user + ' ' + url.split('?')[0]);
      if (url.includes('ClientOptions')) {
        const o = {
          EnableHomeRows: true, ShowLocalRow: true, LocalRowTitle: 'Top 10 du serveur',
          LocalRowSize: 10, RankNumberScale: 100, AllowUserPreferences: true,
          HighlightColor: window.__user === 'A' ? '#ff0000' : '#775BF4'
        };
        const choix = window.__prefs[window.__user];
        if (choix) {
          bascules.forEach((b) => { if (choix[b] != null) { o[b] = choix[b]; } });
          if (choix.RankNumberScale != null && choix.RankNumberScale >= 40) {
            o.RankNumberScale = Math.min(choix.RankNumberScale, 100);
          }
        }
        return Promise.resolve(o);
      }
      if (url.includes('Top/Local')) {
        return Promise.resolve({ Items: (listes[window.__user] || []).map((nom, i) => ({
          Rank: i + 1, Name: nom,
          Item: { Id: window.__user + i, Name: nom, ServerId: 'server-1', Type: 'Movie', IsFolder: false, ImageTags: { Primary: 't' } }
        })) });
      }
      return Promise.resolve({ Items: [] });
    },
    ajax: (req) => {
      const corps = req.data ? JSON.parse(req.data) : null;
      window.__appels.push(window.__user + ' ' + req.type + ' ' + req.url.split('?')[0]);
      if (req.type === 'POST') { window.__prefs[window.__user] = corps; }
      if (req.type === 'DELETE') { delete window.__prefs[window.__user]; }
      return Promise.resolve({});
    }
  };
};

async function pageAudit(reglages = {}) {
  const vue = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  vue.on('pageerror', e => errors.push('pageerror(audit): ' + e.message));
  if (reglages.horloge) { await vue.clock.install(); }
  await vue.goto('file://' + path.join(here, 'home.html'));
  await vue.evaluate((compte) => { window.__user = compte; }, reglages.compte === undefined ? 'A' : reglages.compte);
  await vue.evaluate(serveurParCompte);
  await vue.evaluate(script);
  return vue;
}

const titresClasses = (vue) => vue.evaluate(() =>
  Array.from(document.querySelectorAll('.mc-ranked .cardText-first')).map(e => e.textContent));

// BASCULE — jellyfin-web 12.1 deconnecte en NAVIGUANT vers l'ecran de connexion, sans
// recharger : le script survit d'un compte a l'autre, avec sa memoire.
const bascule = await pageAudit();
await bascule.waitForSelector('.mc-ranked');
const vuParA = await titresClasses(bascule);
await bascule.evaluate(() => { window.__user = null; document.querySelectorAll('.mc-row').forEach(r => r.remove()); });
await bascule.waitForTimeout(400);
await bascule.evaluate(() => {
  window.__user = 'B';
  window.__appels = [];
  document.querySelector('.homeSectionsContainer').appendChild(document.createElement('div'));
});
await bascule.waitForSelector('.mc-ranked', { timeout: 5000 });
await bascule.waitForTimeout(300);
const vuParB = await titresClasses(bascule);
const basculeB = await bascule.evaluate(() => ({
  accent: getComputedStyle(document.querySelector('.mc-row')).getPropertyValue('--mc-accent').trim(),
  reglagesDemandes: window.__appels.filter(a => a === 'B MediaCarousel/ClientOptions').length,
  classementDemande: window.__appels.filter(a => a === 'B MediaCarousel/Top/Local').length
}));
await bascule.close();

// CURSEUR — enregistrer le panneau sans toucher au curseur ne doit rien changer.
const curseur = await pageAudit();
await curseur.waitForSelector('.mc-prefs-open');
const chiffreAvant = await curseur.evaluate(() => document.querySelector('.mc-ranked .mc-rank').getBoundingClientRect().height);
await curseur.click('.mc-prefs-open');
const curseurOuvert = await curseur.evaluate(() => {
  const c = document.querySelector('#mc-prefs-scale');
  return { valeur: c.value, min: c.min, max: c.max };
});
await curseur.click('.mc-prefs-save');
await curseur.waitForFunction(() => window.__appels.filter(a => a === 'A MediaCarousel/ClientOptions').length >= 2, { timeout: 5000 });
await curseur.waitForSelector('.mc-ranked', { timeout: 5000 });
await curseur.waitForTimeout(400);
const curseurApres = await curseur.evaluate(() => ({
  envoye: window.__prefs.A.RankNumberScale,
  chiffre: document.querySelector('.mc-ranked .mc-rank').getBoundingClientRect().height
}));
await curseur.close();

// CONNEXION TARDIVE — l'ecran de connexion reste affiche une minute avant que le compte
// se connecte. L'horloge est simulee : la minute passe en un instant. `runFor` et non
// `fastForward` : ce dernier saute dans le temps en declenchant chaque minuterie une
// seule fois, alors que l'ancienne attente etait une CHAINE de trois cents minuteries —
// avec lui, ce test passait sur le code defectueux.
const tardive = await pageAudit({ horloge: true, compte: null });
await tardive.clock.runFor(60000);
await tardive.evaluate(() => {
  window.__user = 'A';
  document.querySelector('.homeSectionsContainer').appendChild(document.createElement('div'));
});
await tardive.clock.runFor(2000);
await tardive.waitForSelector('.mc-ranked', { timeout: 3000 }).catch(() => {});
const connexionTardive = await tardive.evaluate(() => document.querySelectorAll('.mc-ranked').length);
await tardive.close();

// CUL-DE-SAC — un compte qui masque toutes ses rangees doit pouvoir revenir en arriere.
const culDeSac = await pageAudit();
await culDeSac.waitForSelector('.mc-prefs-open');
await culDeSac.click('.mc-prefs-open');
await culDeSac.evaluate(() => {
  document.querySelectorAll('.mc-prefs li input[type=checkbox]:not([disabled])').forEach((c) => { c.checked = false; });
});
await culDeSac.click('.mc-prefs-save');
await culDeSac.waitForFunction(() => window.__appels.filter(a => a === 'A MediaCarousel/ClientOptions').length >= 2, { timeout: 5000 });
await culDeSac.waitForTimeout(600);
const toutMasque = await culDeSac.evaluate(() => ({
  rangees: document.querySelectorAll('.mc-row:not(.mc-prefs-only)').length,
  boutons: document.querySelectorAll('.mc-prefs-open').length
}));
let rangeesRevenues = 0;
if (toutMasque.boutons === 1) {
  await culDeSac.click('.mc-prefs-open');
  await culDeSac.evaluate(() => { document.querySelector('.mc-prefs li[data-row="local"] input[type=checkbox]').checked = true; });
  await culDeSac.click('.mc-prefs-save');
  await culDeSac.waitForSelector('.mc-ranked', { timeout: 5000 }).catch(() => {});
  rangeesRevenues = await culDeSac.evaluate(() => document.querySelectorAll('.mc-ranked').length);
}
await culDeSac.close();

// NAVIGATION — le panneau ne doit pas survivre a un changement de page.
const navigation = await pageAudit();
await navigation.waitForSelector('.mc-prefs-open');
await navigation.click('.mc-prefs-open');
await navigation.focus('.mc-prefs-save');
const panneauStyle = await navigation.evaluate(() => {
  const enregistrer = getComputedStyle(document.querySelector('.mc-prefs-save'));
  return {
    accent: getComputedStyle(document.querySelector('.mc-prefs')).getPropertyValue('--mc-accent').trim(),
    fondEnregistrer: enregistrer.backgroundColor,
    contourFocus: enregistrer.outlineStyle
  };
});
await navigation.evaluate(() => { location.hash = '#/details?id=abc'; });
await navigation.waitForTimeout(300);
const panneauApresNavigation = await navigation.evaluate(() => !!document.querySelector('.mc-prefs-backdrop'));
await navigation.close();

// BARRE DE DEFILEMENT — un PC ordinaire, barre verticale classique de 15 px. Le style
// `::-webkit-scrollbar` la rend deterministe sur tous les systemes, CI Linux comprise.
const avecBarres = await chromium.launch({
  ignoreDefaultArgs: ['--hide-scrollbars'],
  ...(process.env.MC_CHROMIUM ? { executablePath: process.env.MC_CHROMIUM } : {})
});
const pc = await avecBarres.newPage({ viewport: { width: 1280, height: 700 } });
pc.on('pageerror', e => errors.push('pageerror(barre): ' + e.message));
await pc.goto('file://' + path.join(here, 'home.html'));
await pc.addStyleTag({ content: 'html{overflow-y:scroll}::-webkit-scrollbar{width:15px;height:15px}' });
await pc.evaluate(() => { window.__user = 'A'; });
await pc.evaluate(serveurParCompte);
await pc.evaluate(script);
await pc.waitForSelector('.mc-ranked');
await pc.waitForTimeout(400);
const barreClassique = await pc.evaluate(() => ({
  barre: window.innerWidth - document.documentElement.clientWidth,
  etiree: document.querySelector('.mc-ranked').closest('.mc-row').style.getPropertyValue('--mc-strip-width') || '',
  pageDeborde: document.documentElement.scrollWidth > document.documentElement.clientWidth
}));
await avecBarres.close();

// DOCUMENTATION — l'exemple de Custom CSS du README est applique TEL QUEL.
const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
const variablesDocumentees = [...new Set(readme.match(/--mc-[a-z-]+/g) || [])];
const variablesFantomes = variablesDocumentees.filter(v => !script.includes(v));
const blocReadme = (readme.split('**Vous pouvez tout ajuster**')[1] || '').match(/```css\n([\s\S]*?)```/);
const exempleReadme = blocReadme ? blocReadme[1] : '';
const doc = await browser.newPage({ viewport: { width: 1280, height: 900 } });
doc.on('pageerror', e => errors.push('pageerror(doc): ' + e.message));
await doc.goto('file://' + path.join(here, 'home.html'));
await doc.addStyleTag({ path: path.join(here, 'theme-excerpt.css') });
await doc.evaluate(() => { window.__user = 'A'; });
await doc.evaluate(serveurParCompte);
await doc.evaluate(script);
await doc.waitForSelector('.mc-ranked');
// Le Custom CSS de Jellyfin est charge APRES notre feuille.
if (exempleReadme) { await doc.addStyleTag({ content: exempleReadme }); }
await doc.waitForTimeout(400);
const exempleApplique = await doc.evaluate(() => ({
  afficheClassee: document.querySelector('.mc-ranked .mc-rank-col .cardScalable').getBoundingClientRect().width,
  afficheNative: document.querySelector('#nativeReference .cardScalable').getBoundingClientRect().width,
  contourAuRepos: getComputedStyle(document.querySelector('.mc-ranked .mc-rank-glyph')).stroke
}));
await doc.close();

// ---------------------------------------------------------------------------
// SEERR — le bouton « Demander » des titres absents du Top mondial, a la maniere de
// Jellyfin Enhanced : un film se demande d'un clic, une serie ouvre le choix des saisons.
//
// Le faux serveur repond comme SeerrController : l'etat d'un lot de titres sous la forme
// { MediaType, TmdbId, State, Error }, et une demande refusee REJETTE avec la reponse,
// comme le fait `ApiClient.ajax` sur un statut d'erreur.
// ---------------------------------------------------------------------------
const serveurSeerr = () => {
  window.__appels = [];
  window.__clicsDocument = 0;
  document.addEventListener('click', () => { window.__clicsDocument++; });
  const absent = (rang, nom, type, tmdb) =>
    ({ Rank: rang, Name: nom, ProductionYear: 2024, TmdbId: tmdb, MediaType: type, PosterUrl: null, Item: null });
  window.__global = window.__global || [
    absent(1, 'Inception', 'movie', '27205'),
    {
      Rank: 2, Name: 'Present', TmdbId: '603', MediaType: 'movie',
      Item: { Id: 'p1', Name: 'Present', ServerId: 'server-1', Type: 'Movie', IsFolder: false, ImageTags: { Primary: 't' } }
    },
    absent(3, 'Game of Thrones', 'tv', '1399'),
    // Classement calcule avant cette version : pas de type, donc pas de bouton.
    absent(4, 'Ancien classement', null, '680'),
    absent(5, 'Chernobyl', 'tv', '87108'),
    absent(6, 'Fight Club', 'movie', '550'),
    absent(7, 'Interstellar', 'movie', '157336'),
    Object.assign(absent(8, 'Stranger Things', 'tv', '66732'), { PosterUrl: 'MediaCarousel/Poster/st.jpg' }),
    absent(9, 'Severance', 'tv', '95396')
  ];
  // `null` : Seerr n'a pas pu repondre pour ce titre.
  window.__etats = window.__etats || {
    'movie:27205': 'request', 'tv:1399': 'request-missing', 'tv:87108': 'available', 'movie:550': null,
    'movie:157336': 'pending', 'tv:66732': 'request', 'tv:95396': 'pending'
  };
  window.ApiClient = {
    getCurrentUserId: () => 'user-1',
    serverId: () => 'server-1',
    getUrl: (p, q) => p + '?' + new URLSearchParams(q || {}).toString(),
    getImageUrl: (id) => 'img://' + id,
    getJSON: (url) => {
      if (url.includes('ClientOptions')) {
        return Promise.resolve({
          EnableHomeRows: true, ShowGlobalRow: true, GlobalRowTitle: 'Top 10 mondial', GlobalRowSize: 30,
          RankNumberScale: 100, HighlightColor: '#775BF4', SeerrRequests: window.__seerr !== false,
          SeerrAdvanced: window.__avance === true
        });
      }
      if (url.includes('Top/Global')) { return Promise.resolve({ Items: window.__global }); }
      return Promise.resolve({ Items: [] });
    },
    ajax: (req) => {
      const route = req.url.split('?')[0];
      const corps = req.data ? JSON.parse(req.data) : null;
      window.__appels.push({ type: req.type, route, corps, dataType: req.dataType });
      if (route === 'MediaCarousel/Seerr/Status') {
        const reponse = corps.map((t) => {
          const etat = window.__etats[t.MediaType + ':' + t.TmdbId];
          return { MediaType: t.MediaType, TmdbId: t.TmdbId, State: etat || null, Error: etat ? null : 'offline' };
        });
        return new Promise((resolve) => setTimeout(() => resolve(reponse), window.__lenteur || 0));
      }
      if (route === 'MediaCarousel/Seerr/Options') {
        if (window.__refusOptions) {
          return Promise.reject({ status: 502, json: () => Promise.resolve({ Error: 'offline' }) });
        }
        // Dans le desordre de Seerr, le serveur 4K en tete : le tri et la preselection sont testes.
        return Promise.resolve({ Servers: corps.MediaType === 'tv' ? [
          { Id: 1, Name: 'Sonarr 4K', Is4k: true, IsDefault: true, ActiveProfileId: 7, ActiveDirectory: '/series-4k',
            Profiles: [{ Id: 7, Name: 'Ultra-HD' }], RootFolders: [{ Path: '/series-4k', FreeSpace: null }] },
          { Id: 0, Name: 'Sonarr', Is4k: false, IsDefault: true, ActiveProfileId: 4, ActiveDirectory: '/series',
            Profiles: [{ Id: 4, Name: 'HD-1080p' }, { Id: 6, Name: 'HD-720p' }],
            RootFolders: [{ Path: '/series', FreeSpace: 4376499000000 }, { Path: '/series2', FreeSpace: null }] }
        ] : [
          { Id: 0, Name: 'Radarr', Is4k: false, IsDefault: true, ActiveProfileId: 4, ActiveDirectory: '/films',
            Profiles: [{ Id: 4, Name: 'HD-1080p' }], RootFolders: [{ Path: '/films', FreeSpace: 1099511627776 }] }
        ] });
      }
      if (route === 'MediaCarousel/Seerr/Seasons') {
        if (window.__refusSaisons) {
          return Promise.reject({ status: 502, json: () => Promise.resolve({ Error: 'offline' }) });
        }
        return new Promise((resolve) => setTimeout(() => resolve({
          PartialRequests: window.__partiel !== false,
          Seasons: [
            { Number: 0, Name: null, Year: '2016', Episodes: 3, State: 'not-requested', Requestable: true },
            { Number: 1, Name: null, Year: '2016', Episodes: 8, State: 'available', Requestable: false },
            { Number: 2, Name: 'Stranger Things 2', Year: '2017', Episodes: 9, State: 'requested', Requestable: false },
            { Number: 3, Name: null, Year: '2019', Episodes: 8, State: 'not-requested', Requestable: true },
            { Number: 4, Name: null, Year: null, Episodes: 9, State: 'not-requested', Requestable: true }
          ]
        }), 60));
      }
      if (route === 'MediaCarousel/Seerr/Request') {
        return new Promise((resolve, reject) => setTimeout(() => {
          if (window.__refus === 404) { reject({ status: 404 }); return; }
          if (window.__refus === 'hors-ligne') {
            reject({ status: 502, json: () => Promise.resolve({ Error: 'offline' }) });
            return;
          }
          resolve({
            MediaType: corps.MediaType, TmdbId: corps.TmdbId, Error: null,
            State: corps.MediaType === 'tv' ? 'pending' : 'requested'
          });
        }, 150));
      }
      return Promise.resolve({});
    }
  };
};

async function pageSeerr(reglages = {}) {
  const vue = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  vue.on('pageerror', e => errors.push('pageerror(seerr): ' + e.message));
  await vue.goto('file://' + path.join(here, 'home.html'));
  await vue.evaluate((r) => { Object.assign(window, r); }, reglages);
  await vue.evaluate(serveurSeerr);
  await vue.evaluate(script);
  await vue.waitForSelector('.mc-ranked');
  return vue;
}

const etatSeerr = (tmdb, etat) =>
  `document.querySelector('.mc-seerr[data-tmdb="${tmdb}"]')`
  + ` && document.querySelector('.mc-seerr[data-tmdb="${tmdb}"]').getAttribute('data-state') === '${etat}'`;

const seerr = await pageSeerr();
await seerr.waitForFunction(etatSeerr('27205', 'request'));
const seerrVu = await seerr.evaluate(() => {
  const bouton = (tmdb) => document.querySelector('.mc-seerr[data-tmdb="' + tmdb + '"]');
  const vu = (b) => b && {
    etat: b.getAttribute('data-state'), texte: b.textContent, inerte: b.getAttribute('aria-disabled'),
    visible: getComputedStyle(b).visibility, fond: getComputedStyle(b).backgroundColor,
    nom: b.getAttribute('aria-label'), popup: b.getAttribute('aria-haspopup'),
    icone: (b.querySelector('.material-icons') || { className: '' }).className
  };
  const carteAbsente = bouton('27205').closest('.card');
  const affiche = carteAbsente.querySelector('.cardScalable').getBoundingClientRect();
  const zone = bouton('27205').getBoundingClientRect();
  const statuts = window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Status');
  return {
    boutons: document.querySelectorAll('.mc-seerr').length,
    surPresent: document.querySelectorAll('.mc-ranked:not(.mc-unavailable) .mc-seerr').length,
    ancien: document.querySelectorAll('.mc-seerr[data-tmdb="680"]').length,
    demander: vu(bouton('27205')),
    filmEnAttente: vu(bouton('157336')),
    serieManquante: vu(bouton('1399')),
    serieEnAttente: vu(bouton('95396')),
    serieADemander: vu(bouton('66732')),
    disponible: vu(bouton('87108')),
    illisible: vu(bouton('550')),
    dansAffiche: bouton('27205').closest('.cardScalable') === carteAbsente.querySelector('.cardScalable')
      && zone.left >= affiche.left && zone.right <= affiche.right
      && zone.top >= affiche.top && zone.bottom <= affiche.bottom,
    voile: getComputedStyle(bouton('27205').parentNode).backgroundImage.indexOf('linear-gradient') !== -1,
    hauteurAbsente: carteAbsente.getBoundingClientRect().height,
    hauteurPresente: document.querySelector('.mc-ranked:not(.mc-unavailable)').getBoundingClientRect().height,
    hauteurRangee: document.querySelector('.mc-row').getBoundingClientRect().height,
    lots: statuts.map(a => a.corps.length),
    json: statuts.length > 0 && statuts.every(a => a.dataType === 'json' && a.type === 'POST'),
    identifiantsNumeriques: statuts.length > 0 && statuts[0].corps.every(t => typeof t.TmdbId === 'number')
  };
});
// Capture pour relecture a l'oeil, seulement si on la demande : jamais dans le depot.
if (process.env.MC_SHOTS) {
  await seerr.screenshot({ path: path.join(process.env.MC_SHOTS, 'seerr-rangee.png'), clip: { x: 0, y: 0, width: 1280, height: 520 } });
}

// Comme chez Jellyfin Enhanced : sur ordinateur, le bouton n'apparait qu'au survol ou au
// focus ; sur un ecran sans survol, tactile ou televiseur, il est toujours la.
const opaciteVoile = (vue) => vue.evaluate(() =>
  getComputedStyle(document.querySelector('.mc-seerr[data-tmdb="27205"]').parentNode).opacity);
await seerr.mouse.move(5, 5);
await seerr.waitForTimeout(300);
const voileAuRepos = await opaciteVoile(seerr);
await seerr.hover('.mc-seerr[data-tmdb="27205"]');
await seerr.waitForTimeout(300);
const voileAuSurvol = await opaciteVoile(seerr);
const tactile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const telephone = await tactile.newPage();
telephone.on('pageerror', e => errors.push('pageerror(seerr tactile): ' + e.message));
await telephone.goto('file://' + path.join(here, 'home.html'));
await telephone.evaluate(serveurSeerr);
await telephone.evaluate(script);
await telephone.waitForFunction(etatSeerr('27205', 'request'));
await telephone.waitForTimeout(300);
const voileTactile = await opaciteVoile(telephone);
await tactile.close();

// Film : « Demande en cours » le temps de la requete, puis « Demande ».
await seerr.click('.mc-seerr[data-tmdb="27205"]');
const pendantDemande = await seerr.evaluate(() => document.querySelector('.mc-seerr[data-tmdb="27205"]').textContent);
await seerr.waitForFunction(etatSeerr('27205', 'requested'));
const apresDemande = await seerr.evaluate(() => {
  const demandes = window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request');
  return {
    demandes: demandes.length,
    corps: demandes[0] && demandes[0].corps,
    texte: document.querySelector('.mc-seerr[data-tmdb="27205"]').textContent,
    fenetre: document.querySelectorAll('.mc-seerr-backdrop').length,
    clicsDocument: window.__clicsDocument,
    hash: location.hash
  };
});
// Un bouton qui n'agit plus n'envoie rien. `force` : Playwright refuse de cliquer un
// bouton `aria-disabled`, une souris ou un doigt ne s'en privent pas.
await seerr.click('.mc-seerr[data-tmdb="27205"]', { force: true });
await seerr.click('.mc-seerr[data-tmdb="157336"]', { force: true });
await seerr.waitForTimeout(300);
const demandesInertes = await seerr.evaluate(() => ({
  demandes: window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').length,
  fenetres: document.querySelectorAll('.mc-seerr-backdrop').length
}));
await seerr.close();

// Clavier et telecommande : Entree sur le bouton, et le focus ne s'evanouit pas.
const clavier = await pageSeerr();
await clavier.waitForFunction(etatSeerr('27205', 'request'));
await clavier.focus('.mc-seerr[data-tmdb="27205"]');
await clavier.keyboard.press('Enter');
await clavier.waitForFunction(etatSeerr('27205', 'requested'));
const auClavier = await clavier.evaluate(() => {
  const bouton = document.querySelector('.mc-seerr[data-tmdb="27205"]');
  return {
    demandes: window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').length,
    focus: document.activeElement === bouton,
    anneau: getComputedStyle(bouton).boxShadow
  };
});
await clavier.close();

// Refus : un compte absent de Seerr le reste ; une panne passe.
const inconnu = await pageSeerr({ __refus: 404 });
const panne = await pageSeerr({ __refus: 'hors-ligne' });
for (const vue of [inconnu, panne]) {
  await vue.waitForFunction(etatSeerr('27205', 'request'));
  await vue.click('.mc-seerr[data-tmdb="27205"]');
}
await inconnu.waitForFunction(etatSeerr('27205', 'user-not-found'));
await panne.waitForFunction(etatSeerr('27205', 'offline'));
const refus = {
  inconnu: await inconnu.evaluate(() => {
    const b = document.querySelector('.mc-seerr[data-tmdb="27205"]');
    return { texte: b.textContent, titre: b.getAttribute('title'), inerte: b.getAttribute('aria-disabled') };
  }),
  panne: await panne.evaluate(() => document.querySelector('.mc-seerr[data-tmdb="27205"]').textContent)
};
await panne.waitForTimeout(4300);
refus.inconnuEnsuite = await inconnu.evaluate(() =>
  document.querySelector('.mc-seerr[data-tmdb="27205"]').getAttribute('data-state'));
refus.panneEnsuite = await panne.evaluate(() =>
  document.querySelector('.mc-seerr[data-tmdb="27205"]').getAttribute('data-state'));
await inconnu.close();
await panne.close();

// SERIE — le choix des saisons.
const saisons = await pageSeerr();
await saisons.waitForFunction(etatSeerr('66732', 'request'));
await saisons.click('.mc-seerr[data-tmdb="66732"]');
await saisons.waitForSelector('.mc-seerr-dialog .mc-seerr-pick');
const fenetre = await saisons.evaluate(() => {
  const d = document.querySelector('.mc-seerr-dialog');
  const lignes = Array.from(d.querySelectorAll('.mc-seerr-pick')).map(box => ({
    saison: box.value, active: !box.disabled, nom: box.closest('label').querySelector('.mc-seerr-season-name').textContent,
    etat: box.closest('label').querySelector('.mc-seerr-season-state').textContent,
    annee: (box.closest('label').querySelector('.mc-seerr-season-year') || { textContent: '' }).textContent,
    episodes: box.closest('label').querySelector('.mc-seerr-season-episodes').textContent
  }));
  const toggles = Array.from(d.querySelectorAll('input[type=checkbox]'));
  const pastille = d.querySelector('.mc-seerr-season-state');
  return {
    role: d.getAttribute('role'), modale: d.getAttribute('aria-modal'),
    titre: d.querySelector('h2').textContent, sousTitre: d.querySelector('.mc-seerr-subtitle').textContent,
    tout: !!d.querySelector('.mc-seerr-all'), envoyer: d.querySelector('.mc-seerr-send').textContent,
    lignes, focus: !!document.activeElement && document.activeElement.matches('.mc-seerr-seasons input:not([disabled])'),
    interrupteurs: toggles.length > 0 && toggles.every(t => t.classList.contains('mc-seerr-toggle')
      && getComputedStyle(t).appearance === 'none' && getComputedStyle(t).width === '40px'),
    fondEntete: getComputedStyle(d.querySelector('.mc-seerr-head')).backgroundImage,
    titreDegrade: getComputedStyle(d.querySelector('h2')).backgroundImage.indexOf('linear-gradient') !== -1,
    capitales: getComputedStyle(pastille).textTransform === 'uppercase',
    avancees: d.querySelectorAll('.mc-seerr-advanced').length,
    demandes: window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').length
  };
});
await saisons.click('.mc-seerr-send');
const sansChoix = await saisons.evaluate(() => ({
  message: document.querySelector('.mc-seerr-message').textContent,
  demandes: window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').length
}));
await saisons.click('.mc-seerr-all');
const toutCoche = await saisons.evaluate(() =>
  Array.from(document.querySelectorAll('.mc-seerr-pick:checked')).map(b => b.value).join(','));
await saisons.click('.mc-seerr-send');
await saisons.waitForFunction(() => !document.querySelector('.mc-seerr-backdrop'));
const apresSaisons = await saisons.evaluate(() => {
  const demande = window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').pop();
  const b = document.querySelector('.mc-seerr[data-tmdb="66732"]');
  return {
    corps: demande && demande.corps, etat: b.getAttribute('data-state'), texte: b.textContent,
    agit: b.getAttribute('aria-disabled') === 'false', focus: document.activeElement === b,
    toast: (document.querySelector('.mc-toast') || { textContent: '' }).textContent
  };
});
// Echap ferme, et le focus revient au bouton.
await saisons.click('.mc-seerr[data-tmdb="1399"]');
await saisons.waitForSelector('.mc-seerr-dialog .mc-seerr-pick');
await saisons.keyboard.press('Escape');
const echap = await saisons.evaluate(() => ({
  fenetre: document.querySelectorAll('.mc-seerr-backdrop').length,
  focus: document.activeElement === document.querySelector('.mc-seerr[data-tmdb="1399"]')
}));
// Quitter la page ferme la fenetre, comme le panneau de personnalisation.
await saisons.click('.mc-seerr[data-tmdb="1399"]');
await saisons.waitForSelector('.mc-seerr-dialog');
await saisons.evaluate(() => { location.hash = '#/details?id=ailleurs'; });
await saisons.waitForTimeout(200);
const apresNavigation = await saisons.evaluate(() => document.querySelectorAll('.mc-seerr-backdrop').length);
await saisons.close();

// Sans demandes partielles dans Seerr : la serie part en entier, specials exceptes.
const entiere = await pageSeerr({ __partiel: false });
await entiere.waitForFunction(etatSeerr('66732', 'request'));
await entiere.click('.mc-seerr[data-tmdb="66732"]');
await entiere.waitForSelector('.mc-seerr-dialog .mc-seerr-pick');
const serieEntiere = await entiere.evaluate(() => ({
  toutes: document.querySelectorAll('.mc-seerr-pick:not([disabled])').length,
  cochees: Array.from(document.querySelectorAll('.mc-seerr-pick:checked')).map(b => b.value).join(','),
  tout: !!document.querySelector('.mc-seerr-all'),
  envoyer: document.querySelector('.mc-seerr-send').textContent
}));
await entiere.click('.mc-seerr-send');
await entiere.waitForFunction(() => !document.querySelector('.mc-seerr-backdrop'));
serieEntiere.envoye = await entiere.evaluate(() =>
  window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').pop().corps.Seasons.join(','));
await entiere.close();

// Refus dans la fenetre : le message s'y affiche et elle reste ouverte.
const refusSaisons = await pageSeerr({ __refus: 404 });
await refusSaisons.waitForFunction(etatSeerr('66732', 'request'));
await refusSaisons.click('.mc-seerr[data-tmdb="66732"]');
await refusSaisons.waitForSelector('.mc-seerr-dialog .mc-seerr-pick');
await refusSaisons.click('.mc-seerr-all');
await refusSaisons.click('.mc-seerr-send');
await refusSaisons.waitForFunction(() => document.querySelector('.mc-seerr-message').textContent !== '');
const refusDansFenetre = await refusSaisons.evaluate(() => ({
  message: document.querySelector('.mc-seerr-message').textContent,
  ouverte: document.querySelectorAll('.mc-seerr-backdrop').length === 1,
  rendue: !document.querySelector('.mc-seerr-send').disabled
}));
await refusSaisons.close();

// Seerr injoignable a l'ouverture : la fenetre le dit.
const saisonsIllisibles = await pageSeerr({ __refusSaisons: true });
await saisonsIllisibles.waitForFunction(etatSeerr('66732', 'request'));
await saisonsIllisibles.click('.mc-seerr[data-tmdb="66732"]');
await saisonsIllisibles.waitForFunction(() => /Seerr hors ligne/.test(document.querySelector('.mc-seerr-seasons').textContent));
const saisonsHorsLigne = await saisonsIllisibles.evaluate(() => ({
  envoi: document.querySelector('.mc-seerr-send').disabled
}));
await saisonsIllisibles.close();

// OPTIONS AVANCEES — serveur, profil et dossier, comme chez Jellyfin Enhanced.
const avancee = await pageSeerr({ __avance: true });
await avancee.waitForFunction(etatSeerr('66732', 'request'));
await avancee.click('.mc-seerr[data-tmdb="66732"]');
await avancee.waitForSelector('.mc-seerr-advanced:not([hidden]) .mc-seerr-server option', { state: 'attached' });
const optionsSerie = await avancee.evaluate(() => {
  const section = document.querySelector('.mc-seerr-advanced');
  const choisi = (sel) => section.querySelector(sel).selectedOptions[0].textContent;
  return {
    titre: section.querySelector('h3').textContent,
    serveurs: Array.from(section.querySelectorAll('.mc-seerr-server option')).map(o => o.textContent).join(','),
    serveur: choisi('.mc-seerr-server'), profil: choisi('.mc-seerr-profile'), dossier: choisi('.mc-seerr-folder')
  };
});
await avancee.selectOption('.mc-seerr-server', '1');
const apres4k = await avancee.evaluate(() => ({
  profil: document.querySelector('.mc-seerr-profile').value,
  dossier: document.querySelector('.mc-seerr-folder').value
}));
await avancee.selectOption('.mc-seerr-server', '0');
await avancee.selectOption('.mc-seerr-profile', '6');
await avancee.selectOption('.mc-seerr-folder', '/series2');
await avancee.click('.mc-seerr-all');
await avancee.click('.mc-seerr-send');
await avancee.waitForFunction(() => !document.querySelector('.mc-seerr-backdrop'));
const demandeAvancee = await avancee.evaluate(() =>
  window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').pop().corps);
// Avec les options avancees, un film ouvre lui aussi sa fenetre.
await avancee.click('.mc-seerr[data-tmdb="27205"]');
await avancee.waitForSelector('.mc-seerr-advanced:not([hidden]) .mc-seerr-server option', { state: 'attached' });
const fenetreFilm = await avancee.evaluate(() => ({
  titre: document.querySelector('.mc-seerr-dialog h2').textContent,
  saisons: document.querySelectorAll('.mc-seerr-dialog .mc-seerr-seasons').length,
  envoiActif: !document.querySelector('.mc-seerr-send').disabled,
  dossier: document.querySelector('.mc-seerr-folder').selectedOptions[0].textContent
}));
await avancee.click('.mc-seerr-send');
await avancee.waitForFunction(() => !document.querySelector('.mc-seerr-backdrop'));
const demandeFilm = await avancee.evaluate(() => ({
  corps: window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').pop().corps,
  etat: document.querySelector('.mc-seerr[data-tmdb="27205"]').getAttribute('data-state')
}));
await avancee.close();

// Options illisibles : la section reste cachee, et la demande part sans elles.
const sansOptions = await pageSeerr({ __avance: true, __refusOptions: true });
await sansOptions.waitForFunction(etatSeerr('27205', 'request'));
await sansOptions.click('.mc-seerr[data-tmdb="27205"]');
await sansOptions.waitForSelector('.mc-seerr-dialog');
await sansOptions.waitForTimeout(200);
const optionsIllisibles = await sansOptions.evaluate(() => ({
  cachee: document.querySelector('.mc-seerr-advanced').hidden
}));
await sansOptions.click('.mc-seerr-send');
await sansOptions.waitForFunction(() => !document.querySelector('.mc-seerr-backdrop'));
optionsIllisibles.corps = await sansOptions.evaluate(() =>
  window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Request').pop().corps);
await sansOptions.close();

// Integration non configuree : ni bouton, ni appel — et la rangee a la meme hauteur.
const sansSeerr = await pageSeerr({ __seerr: false });
await sansSeerr.waitForTimeout(300);
const sansSeerrVu = await sansSeerr.evaluate(() => ({
  boutons: document.querySelectorAll('.mc-seerr').length,
  appels: window.__appels.length,
  hauteurRangee: document.querySelector('.mc-row').getBoundingClientRect().height
}));
await sansSeerr.close();

// Plus de titres qu'un lot n'en accepte.
const vingtCinq = Array.from({ length: 25 }, (_, i) =>
  ({ Rank: i + 1, Name: 'Absent ' + i, TmdbId: String(1000 + i), MediaType: 'movie', Item: null }));
const lot = await pageSeerr({
  __global: vingtCinq,
  __etats: Object.fromEntries(vingtCinq.map(e => ['movie:' + e.TmdbId, 'request']))
});
await lot.waitForFunction(() => document.querySelectorAll('.mc-seerr[data-state="request"]').length === 25);
const lotsDecoupes = await lot.evaluate(() =>
  window.__appels.filter(a => a.route === 'MediaCarousel/Seerr/Status').map(a => a.corps.length));
await lot.close();

// L'accueil est reconstruit a chaque affichage : l'etat deja connu revient aussitot,
// sans attendre une reponse de Seerr ralentie a trois secondes.
const memoire = await pageSeerr();
await memoire.waitForFunction(etatSeerr('27205', 'request'));
await memoire.evaluate(() => {
  window.__lenteur = 3000;
  document.querySelectorAll('.mc-row').forEach(r => r.remove());
});
// `attached` : par defaut, Playwright attend qu'un element soit VISIBLE — donc, ici, que
// Seerr ait repondu. C'est l'etat a l'insertion qu'il faut lire.
await memoire.waitForSelector('.mc-seerr', { state: 'attached' });
const etatAuRetour = await memoire.evaluate(() =>
  document.querySelector('.mc-seerr[data-tmdb="27205"]').getAttribute('data-state'));
await memoire.close();

await browser.close();

let failed = 0;
const check = (name, ok, got) => { console.log((ok ? 'OK    ' : 'ECHEC ') + name + (ok ? '' : '  -> ' + JSON.stringify(got))); if (!ok) failed++; };

check('10 rangees sous les bibliotheques',
  JSON.stringify(result.order) === JSON.stringify(
    ['section0','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','section1','section2','section3']), result.order);
check('titres et ordre corrects', JSON.stringify(result.titles) ===
  JSON.stringify(['Top 10 sur ce serveur','Les plus regardés de tous les temps','Top 10 mondial',
                  'De retour cette semaine','Jamais vu',
                  'Parce que tu as regardé Blade <Runner>',
                  'Par studio','Science-fiction','Comédie','Vide']), result.titles);
check('TOUJOURS: la rangee de tous les temps est remplie',
  result.allTimeCards === 3, result.allTimeCards);
check('plus aucune pastille dans les en-tetes', result.noBadges === 0, result.noBadges);
check('plus de decompte sur les vignettes de studio', result.noTileCounts === 0, result.noTileCounts);
check('rangee de retour remplie', result.returningCards === 2, result.returningCards);
check('rangee jamais vu remplie', result.neverPlayedCards === 3, result.neverPlayedCards);
check('BECAUSE: le titre du film est repris dans le titre de la rangee',
  result.becauseTitle === 'Parce que tu as regardé Blade <Runner>', result.becauseTitle);
check('BECAUSE: la rangee est remplie', result.becauseCards === 5, result.becauseCards);
check('BECAUSE: le film de depart est exclu de sa propre rangee', result.becauseExcludesSeed === true, result);
check('BECAUSE: deux genres au plus dans le filtre', result.becauseGenreCount === 2, result.becauseGenreCount);
check('sections natives conservees par defaut', result.nativeVisible === 4, result.nativeVisible);
check('SWIPE: allowSwipe() de Jellyfin bloque le changement d onglet', result.swipeBlocked, result.stripClasses);
check('classes natives sur la bande', result.stripClasses.includes('scrollX') && result.stripClasses.includes('hiddenScrollX'), result.stripClasses);
check('logo de studio affiche', result.studioLogo === true, result.studioLogo);
check('studio sans logo : repli sur le nom', result.studioFallbackName === 1 && result.studioEscaped === 'Studio <sans logo>', result);
check('rangee de genre remplie', result.genreCards === 6, result.genreCards);
check('genre vide : message explicite', result.genreEmptyMessage === 'Aucun titre dans ce genre.', result.genreEmptyMessage);
check('chargement differe des genres (3 requetes, pas plus)', genreCallsAtRest === 3, genreCallsAtRest);
check('BECAUSE: deux requetes, pas plus', becauseCallsAtRest === 2, becauseCallsAtRest);
check('BECAUSE: aucune rangee pour un compte sans historique',
  !freshRows.titles.some(t => t.indexOf('Parce que') === 0), freshRows.titles);
check('BECAUSE: les 9 autres rangees restent intactes', freshRows.titles.length === 9, freshRows.titles.length);
check('BECAUSE: aucun titre de rangee vide', freshRows.blankTitles === 0, freshRows.blankTitles);
check('a11y: chaque rangee pointe son titre', result.labelledBy === true, result.labelledBy);
check('a11y: libelle de carte explicite', result.cardAria === 'Numéro 1 : Film <1> (2020)', result.cardAria);
check('a11y: fleches hors du parcours clavier', result.arrowsHidden === true, result.arrowsHidden);
check('a11y: roles list/listitem', result.listRoles === true, result.listRoles);
check('titre absent non cliquable', result.unavailableIsLink === false, result.unavailableIsLink);

check('ROUTAGE: un film ouvre sa fiche',
  result.movieHref === '#/details?id=id1&serverId=server-1', result.movieHref);
// Regression : une serie est un dossier, mais `#/list?parentId=` n'affichait que la liste
// nue de ses saisons — sans synopsis, sans distribution, sans bouton de lecture.
check('ROUTAGE: une serie ouvre sa fiche, pas la liste de ses saisons',
  result.seriesHref === '#/details?id=r1&serverId=server-1', result.seriesHref);
// Un studio n'est le parent de rien : `parentId` donnait une page vide.
check('ROUTAGE: un studio ouvre une liste filtree par studioId',
  result.studioHref === '#/list?studioId=s1&serverId=server-1', result.studioHref);
// Ce test tient la CAUSE du defaut, pas seulement son symptome. La largeur de
// reference doit etre relevee sur une carte de MEME FORME. « Mes medias » place ses
// vignettes de bibliotheque — au format paysage — avant nos rangees dans le DOM :
// prendre la premiere carte venue gonflait l'affiche de moitie au bureau et la
// DOUBLAIT presque sur telephone, ou Jellyfin serre bien plus les affiches 2:3 que
// les vignettes paysage.
check('MESURE: le piege est bien present dans la page — une carte paysage avant nos rangees',
  result.piegePaysage !== null && result.piegePaysage.present === true, result.piegePaysage);
check('MESURE: la carte paysage est nettement plus large qu une affiche — le piege mord',
  result.piegePaysage.largeur > result.afficheNativePortrait * 1.3,
  [result.piegePaysage.largeur, result.afficheNativePortrait]);
check('MESURE: la reference relevee est une AFFICHE, pas la vignette paysage',
  Math.abs(parseFloat(result.mesuree) - result.afficheNativePortrait) < 0.5,
  [result.mesuree, result.afficheNativePortrait]);
check('PARITE: nos affiches ont la taille exacte d une affiche native',
  JSON.stringify(result.box) === JSON.stringify(result.nativeBox), [result.box, result.nativeBox]);
check('PARITE: le libelle a la taille exacte du libelle natif',
  JSON.stringify(result.textBox) === JSON.stringify(result.nativeTextBox), [result.textBox, result.nativeTextBox]);
check('PARITE: les rangees de genre suivent la meme taille d affiche',
  JSON.stringify(result.genreBox) === JSON.stringify(result.nativeBox), [result.genreBox, result.nativeBox]);
check('PARITE: la forme native est bien celle des rangees d accueil',
  result.shapeClasses === true, result.shapeClasses);
check('STUDIO: vignette au format paysage natif', result.tileIsBackdrop === true, result.tileIsBackdrop);
check('pas de duplication sur mutation', afterMutation === 10, afterMutation);
check('reinjection apres reconstruction', afterRebuild === 10, afterRebuild);
const extraCalls = callsAfterRebuild.slice(callsBeforeRebuild.length);
check('CACHE: aucun endpoint du plugin refait apres reconstruction de l accueil',
  extraCalls.every(c => !c.startsWith('MediaCarousel/')), extraCalls);
check('CACHE: seul le genre vide est re-interroge (resultat vide non memorise)',
  extraCalls.length === 1 && extraCalls[0].includes('GenreIds=g3'), extraCalls);
check('MASQUAGE: bibliotheques conservees', hidden.libraryVisible && hidden.libraryDisplayed, hidden);
check('MASQUAGE: 3 sections natives masquees', hidden.nativeHidden === 3, hidden.nativeHidden);
check('MASQUAGE: nos 10 rangees restent visibles', hidden.ourRowsVisible === 10, hidden.ourRowsVisible);
check('MASQUAGE: la rangee d un autre plugin est epargnee', hidden.foreignVisible === true, hidden);

check('THEME: la feuille du theme est bien chargee apres la notre', theme.themeLoadedAfter === true, theme);
check('THEME: aucune respiration a droite — elle fausserait le pourcentage de --cardWidth',
  theme.stripPaddingRight === '0px' && theme.caleDeFin === '""' , theme);
check('SURVOL: l affiche est bien agrandie par le theme', hover.agrandie === true, hover);
check('SURVOL: la carte ne confine pas la peinture, sinon l agrandissement est tranche',
  hover.peintureConfinee === false, hover.confinement);
check('SURVOL: la carte survolee passe devant ses voisines',
  hover.positionnee === true && Number(hover.zIndex) >= 2, hover);
check('SURVOL: les cartes voisines restent au plan par defaut',
  hover.zIndexVoisine === 'auto' || hover.zIndexVoisine === '0', hover);
check('THEME: une carte classee s elargit pour loger son chiffre, malgre le theme',
  theme.carteClassee > theme.carteNative * 1.4, [theme.carteClassee, theme.carteNative]);
check('THEME: l affiche ne deborde jamais de sa carte',
  theme.afficheDeborde === false, theme);
check('THEME: la premiere carte s aligne sur celle de la section native',
  theme.bordGauche < 0.5, theme.bordGauche);
check('THEME: sous un theme aussi, nos affiches gardent la taille native',
  theme.cardWidth === theme.nativeCardWidth, [theme.cardWidth, theme.nativeCardWidth]);
check('THEME: meme arrondi que les cartes natives',
  theme.cardRadius === theme.nativeCardRadius, [theme.cardRadius, theme.nativeCardRadius]);
check('THEME: le jeton --sidePadding du theme est adopte',
  Math.abs(parseFloat(theme.stripPadding) - Number(theme.expectedPadding)) < 2, theme);
check('THEME: notre rangee s espace comme une section native',
  theme.rowMarginBottom === theme.nativeRowMargin, [theme.rowMarginBottom, theme.nativeRowMargin]);
check('THEME: aucune de nos regles ne depend de --itemColumnGap',
  zeroGap.readsColumnGapToken === false, zeroGap);
check('THEME: un --sidePadding a zero ne casse pas la bande',
  zeroGap.cardWidth > 0 && zeroGap.stripPadding >= 0, zeroGap);

// Le chiffre est PLEIN et blanc, pose sur un voile degrade. Contour, halo et ombre
// dependaient tous de ce qu'il y avait dessous : ils tenaient sur une affiche sombre et
// lachaient sur une affiche claire. Le voile, lui, fabrique son propre contraste.
check('C1: le chiffre est evide, dans le gris du theme',
  result.rankStroke.indexOf('hsl(') === 0, result.rankStroke);
check('C1: il est a gauche de l affiche et mord dessus',
  result.rankOverlap.aGauche === true && result.rankOverlap.chevauche === true, result.rankOverlap);
check('C2: accent violet par defaut', result.accentDefault === '#775BF4', result.accentDefault);
check('D1: une couleur invalide retombe sur le defaut',
  accent.applied === '#775BF4', accent.applied);
check('D1: aucune declaration injectee dans la feuille',
  !accent.css.includes('body{display:none}') && accent.bodyVisible, accent.css.slice(0, 120));

check('RANG: le chiffre est bien un « 1 »', rank.text === '1', rank.text);
check('RANG: il est dessine en SVG, donc il suit la taille de la carte', rank.isSvg === true, rank);
check('RANG: « 1 » et « 2 » occupent exactement la meme boite', rank.sameWidth === true, rank);
check('RANG: « 10 » est plus large sans etre plus petit',
  rank.tenText === '10' && rank.tenWider && rank.tenSameHeight, rank);
check('RANG: le chiffre reste dans sa carte', rank.withinCard === true, rank);
check('RANG: il commence AVANT l affiche et son pied tombe sur celui de l affiche',
  rank.encartGauche < -20 && Math.abs(rank.encartBas) < 6,
  [rank.encartGauche, rank.encartBas]);
// La hauteur du chiffre est un REGLAGE — `RankNumberScale`, 100 % par defaut : le chiffre
// fait toute la hauteur de l'affiche, la proportion de Netflix. Descendre resserre la
// rangee. L'affiche, elle, ne bouge jamais : seul le chiffre suit.
check('RANG: le chiffre fait la hauteur de l affiche, la valeur par defaut',
  rank.coverage > 0.95 && rank.coverage < 1.05, rank.coverage);
check('RANG: la police du chiffre est posee, jamais heritee',
  rank.declaresFont === true && /sans-serif/.test(rank.fontFamily), rank.fontFamily);
check('RANG: le rang 10, a deux chiffres, garde la meme affiche et la loge dans sa carte',
  rank.dixieme !== null && rank.dixieme.memeAffiche === true
    && rank.dixieme.carteElargie === true && rank.dixieme.afficheDedans === true,
  rank.dixieme);
check('RANG: le chiffre est en frere de l affiche, dans sa propre colonne',
  rank.colonnes === 1, rank.colonnes);

check('ANIM: les rangees entrent en animation', motion.name === 'mc-rise', motion.name);
check('ANIM: chaque rangee entre apres la precedente',
  JSON.stringify(motion.delays) === JSON.stringify(['0ms', '55ms', '110ms', '165ms']), motion.delays);
check('ANIM: seul le chiffre transitionne, et seulement sur sa couleur',
  motion.glyphTransition === 'stroke', motion.glyphTransition);
check('ANIM: prefers-reduced-motion coupe l entree', reduced.animationName === 'none', reduced.animationName);
check('ANIM: prefers-reduced-motion coupe les transitions',
  reduced.glyphTransition === 'none', reduced.glyphTransition);
check('ANIM: sans animation, la rangee reste visible',
  reduced.rowOpacity === '1' && reduced.rowVisible === true, reduced);

check('ORDRE: les rangees suivent la configuration',
  orderedTitles.slice(0, 4).join(' | ')
    === 'Science-fiction | Comédie | Vide | Les plus regardés de tous les temps', orderedTitles);
check('ORDRE: un identifiant inconnu ne casse rien', orderedTitles.length === 10, orderedTitles.length);
check('ORDRE: sans gestion des natives, elles ne bougent pas',
  orderedNative.join(',') === 'section0,mc-row,section1,section2,section3', orderedNative);

check('NATIF: l ordre configure interleave nos rangees et les natives',
  nativeOrder.layout.join(',')
    === 'section1,mc-row,mc-row,section0,mc-row,mc-row,mc-row,mc-row,mc-row,mc-row,mc-row,mc-row,section3,section2',
  nativeOrder.layout);
check('NATIF: la disposition du compte est bien lue',
  nativeOrder.prefsRequested === true, nativeOrder);
check('NATIF: une section absente du compte est ignoree',
  nativeOrder.layout.indexOf('section4') === -1, nativeOrder.layout);
check('NATIF: la rangee d un autre plugin survit au reordonnancement',
  nativeOrder.foreignSurvives === true, nativeOrder);
check('NATIF: un second rendu ne deplace plus rien',
  nativeOrder.movesOnSecondRender === 0, nativeOrder.movesOnSecondRender);
check('VOISIN: la section des bibliotheques n est jamais re-ajoutee',
  nativeOrder.section0Readds === 0, nativeOrder.section0Readds);

check('NATIF: une section en neuvieme position est trouvee',
  deepFirst.indexOf('section8') !== -1, deepFirst);
check('NATIF: une section deplacee garde sa liaison aux donnees',
  binding.liaison === 'function', binding);
check('NATIF: et son chargement est relance',
  binding.relancee === true, binding);
check('NATIF: la valeur heritee « folders » vaut la section des bibliotheques',
  legacyFolders === modernFolders, [legacyFolders, modernFolders]);
check('NATIF: le decalage des interfaces televiseur est rattrape',
  tvLayout.indexOf('section2') < tvLayout.indexOf('mc-row')
    && tvLayout.indexOf('section1') > tvLayout.lastIndexOf('mc-row'),
  tvLayout);

check('PREFS: un seul bouton, sur une rangee du plugin',
  prefs.boutons === 1 && prefs.surNotreRangee === true, prefs);
check('PREFS: rien n est ouvert avant le clic', prefs.panneauAvant === 0, prefs);
check('PREFS: une ligne par rangee ordonnee', ouvert.lignes === 8, ouvert);
check('PREFS: le panneau est une vraie boite de dialogue', ouvert.modal === 'true', ouvert);
check('PREFS: les extremites ne peuvent pas sortir de la liste',
  ouvert.monterDesactive === true && ouvert.descendreDesactive === true, ouvert);
check('PREFS: l enregistrement part en POST sur notre route',
  enregistre.methode === 'POST' && enregistre.route.indexOf('MediaCarousel/UserPreferences') !== -1,
  enregistre);
check('PREFS: la rangee decochee part a false', enregistre.premiereMasquee === false, enregistre);
check('PREFS: l ordre du panneau est celui envoye',
  enregistre.ordre === 'local,global,alltime,returning,neverplayed,because,studios,genres',
  enregistre.ordre);
check('PREFS: couleur et echelle accompagnent l envoi',
  /^#[0-9a-f]{3,8}$/i.test(enregistre.couleur) && enregistre.echelle === 100, enregistre);
check('PREFS: le panneau se ferme apres enregistrement', enregistre.ferme === true, enregistre);
check('PREFS: la reinitialisation part en DELETE', reinitialise === 'DELETE', reinitialise);
check('PREFS: sans autorisation du serveur, aucun bouton', prefsInterdites === 0, prefsInterdites);

check('VISUEL: silhouettes en place avant le chargement differe',
  beforeScroll.skeletons === 6 && beforeScroll.skeletonHidden === 'true', beforeScroll);
check('VISUEL: plus aucune silhouette une fois tout charge', result.skeletonsLeft === 0, result.skeletonsLeft);
check('VISUEL: toutes les images sont marquees pretes',
  styling.imagesTotal > 0 && styling.imagesReady === styling.imagesTotal, styling);
check('VISUEL: une image prete est opaque', styling.readyOpacity === '1', styling.readyOpacity);
check('VISUEL: accroche de defilement posee (proximity est la valeur normalisee de « x »)',
  /^x( proximity)?$/.test(styling.snapType), styling.snapType);
check('CLAIR: fond sombre, aucun mode clair', styling.lightRows === 0, styling.lightRows);
check('CLAIR: fond clair detecte sur les 10 rangees', lightMode.flagged === 10, lightMode.flagged);
check('CLAIR: le contour du chiffre s eclaircit pour tenir sur une page claire',
  lightMode.contourFonce === true, lightMode);
check('CLAIR: sur page claire, seule la teinte change — la geometrie tient',
  lightMode.aucunVoileResiduel === true && lightMode.afficheIntacte === true, lightMode);

check('CSS: la feuille produit bien des regles', styling.ruleCount > 25, styling.ruleCount);
check('CSS: accolades equilibrees', styling.bracesBalanced === true, styling.bracesBalanced);
check('CSS: seuls les points de rupture de comportement subsistent (plus aucun de taille)',
  styling.mediaCount === 3, styling.mediaCount);

// Jellyfin RETRECIT ses cartes a certains paliers pour en montrer davantage :
// une echelle strictement croissante n'a plus de sens. Ce qui doit tenir, a chaque
// palier, c'est l'egalite avec la carte native.
for (const [label, pair] of Object.entries(widths)) {
  check('TAILLE (' + label + ') : identique a la carte native',
    Math.abs(pair[0] - pair[1]) < 0.5, pair);
}
check('TAILLE: la carte grandit tout de meme du telephone au televiseur 4K',
  widths.tv4k[0] > widths.phonePortrait[0], [widths.phonePortrait, widths.tv4k]);
check('TAILLE: proportion d affiche 2:3 conservee',
  Math.abs(styling.posterRatio - 1.5) < 0.02, styling.posterRatio);

check('TIZEN: la bande n utilise pas `gap` (absent avant Chromium 84)',
  styling.stripUsesGapProperty === false, styling.stripUsesGapProperty);
check('PARITE: l espacement entre cartes est celui de Jellyfin',
  styling.cardPadding === styling.nativeCardPadding,
  [styling.cardPadding, styling.nativeCardPadding]);
check('PARITE: les affiches sont des fonds CSS, comme chez Jellyfin',
  styling.postersAreBackgrounds === true, styling.postersAreBackgrounds);
check('TIZEN: le contour de focus tient sur :focus seul',
  styling.hasPlainFocusRule === true, styling.hasPlainFocusRule);
check('TIZEN: le retrait au clic souris est isole dans une regle ecartable',
  styling.focusVisibleOnlyGuard === true, styling.focusVisibleOnlyGuard);

check('COURSE: la mesure a lieu meme si les sections natives arrivent APRES nous',
  coursePerdue.mesuree !== '', coursePerdue);
check('COURSE: course perdue ou gagnee, l affiche fait la meme largeur',
  Math.abs(coursePerdue.affiche - courseGagnee.affiche) < 0.5,
  [coursePerdue.affiche, courseGagnee.affiche]);
check('COURSE: l affiche classee egale la carte native, dans les deux sens',
  Math.abs(coursePerdue.affiche - coursePerdue.native) < 0.5
  && Math.abs(courseGagnee.affiche - courseGagnee.native) < 0.5,
  [coursePerdue.affiche, coursePerdue.native, courseGagnee.affiche, courseGagnee.native]);
check('SONDE: elle n ajoute aucune hauteur a la rangee',
  coursePerdue.hauteurSonde === 0, coursePerdue.hauteurSonde);
check('SONDE: elle n entre pas dans la bande visible, qui garde ses 10 cartes',
  coursePerdue.cartesVisibles === 10 && coursePerdue.sondeHorsBande === true,
  [coursePerdue.cartesVisibles, coursePerdue.sondeHorsBande]);
check('SONDE: elle est retiree de l arbre d accessibilite',
  coursePerdue.sondeMasquee === true, coursePerdue.sondeMasquee);

check('DEBORDEMENT: la bande classee va jusqu au bord affiche, pas au bord du document',
  Math.abs(etroit.finitA - etroit.fenetre) < 4, [etroit.finitA, etroit.fenetre]);
check('DEBORDEMENT: elle montre alors bien plus de cartes',
  etroit.cartesVisibles >= 6, etroit.cartesVisibles);
check('DEBORDEMENT: l affiche garde EXACTEMENT sa taille',
  Math.abs(etroit.affiche - large.affiche) < 0.5, [etroit.affiche, large.affiche]);
check('DEBORDEMENT: la mesure de reference n est pas alteree',
  etroit.mesuree === large.mesuree, [etroit.mesuree, large.mesuree]);
check('DEBORDEMENT: une rangee ORDINAIRE n est pas etendue (ses cartes sont en pourcentage)',
  etroit.bandeOrdinaire !== null && etroit.bandeOrdinaire < etroit.fenetre - 100,
  [etroit.bandeOrdinaire, etroit.fenetre]);
check('DEBORDEMENT: une page normale reste inchangee',
  Math.abs(large.finitA - large.fenetre) < 4 && large.bandeOrdinaire > large.fenetre - 100,
  [large.finitA, large.fenetre, large.bandeOrdinaire]);

check('BASCULE: le compte suivant voit SON classement, pas celui du precedent',
  vuParB.length === 3 && vuParB[0] === 'Dessin anime' && vuParB.join() !== vuParA.join(), [vuParA, vuParB]);
check('BASCULE: ses reglages sont redemandes au serveur, pas repris de la memoire',
  basculeB.reglagesDemandes === 1 && basculeB.classementDemande === 1, basculeB);
check('BASCULE: la couleur personnelle du compte precedent ne le suit pas',
  basculeB.accent.toLowerCase() === '#775bf4', basculeB.accent);
check('CURSEUR: il s ouvre sur la valeur en vigueur, en pourcentage',
  curseurOuvert.valeur === '100' && curseurOuvert.min === '40' && curseurOuvert.max === '100', curseurOuvert);
check('CURSEUR: enregistrer sans y toucher renvoie 100',
  curseurApres.envoye === 100, curseurApres);
check('CURSEUR: enregistrer sans y toucher ne change pas la taille du chiffre',
  Math.abs(curseurApres.chiffre - chiffreAvant) < 0.5, [chiffreAvant, curseurApres.chiffre]);
check('CONNEXION: un compte connecte apres une minute a bien ses rangees',
  connexionTardive === 3, connexionTardive);
check('CUL-DE-SAC: tout masquer laisse un acces au panneau',
  toutMasque.rangees === 0 && toutMasque.boutons === 1, toutMasque);
check('CUL-DE-SAC: et par lui, les rangees reviennent', rangeesRevenues === 3, rangeesRevenues);
check('NAVIGATION: le panneau se ferme quand on quitte la page', panneauApresNavigation === false, panneauApresNavigation);
check('PANNEAU: il herite de la couleur d accentuation', panneauStyle.accent.toLowerCase() === '#ff0000', panneauStyle);
check('PANNEAU: le bouton Enregistrer porte cette couleur', panneauStyle.fondEnregistrer === 'rgb(255, 0, 0)', panneauStyle);
check('PANNEAU: le bouton qui a le focus est entoure, visible a la telecommande',
  panneauStyle.contourFocus === 'solid', panneauStyle);
check('BARRE: le banc a bien une barre de defilement classique', barreClassique.barre === 15, barreClassique);
check('BARRE: la bande n est pas etiree sous la barre de defilement',
  barreClassique.etiree === '' && barreClassique.pageDeborde === false, barreClassique);
check('DOC: chaque variable du README existe dans le script', variablesFantomes.length === 0, variablesFantomes);
check('DOC: le README contient bien un exemple de Custom CSS', exempleReadme.length > 0, exempleReadme);
check('DOC: l exemple du README garde les affiches a la taille native',
  Math.abs(exempleApplique.afficheClassee - exempleApplique.afficheNative) < 0.5, exempleApplique);
check('DOC: l exemple du README laisse le chiffre visible',
  exempleApplique.contourAuRepos !== 'none', exempleApplique);

check('SEERR: un bouton sur chaque titre absent qui a un type et un identifiant TMDB',
  seerrVu.boutons === 7, seerrVu.boutons);
check('SEERR: aucun sur un titre de la bibliotheque', seerrVu.surPresent === 0, seerrVu.surPresent);
check('SEERR: aucun sur un classement calcule avant le type de media', seerrVu.ancien === 0, seerrVu.ancien);
check('SEERR: les etats sont lus en un seul lot, POST et JSON',
  JSON.stringify(seerrVu.lots) === '[7]' && seerrVu.json === true, seerrVu);
check('SEERR: les identifiants partent en nombres, comme le serveur les attend',
  seerrVu.identifiantsNumeriques === true, seerrVu.identifiantsNumeriques);
check('SEERR: « Demander » est actif, au violet de Jellyfin Enhanced, avec son icone',
  seerrVu.demander.texte === 'Demander' && seerrVu.demander.inerte === 'false'
    && seerrVu.demander.fond === 'rgb(90, 63, 184)' && /file_download/.test(seerrVu.demander.icone), seerrVu.demander);
check('SEERR: un film en attente l attend, en ambre, sans action',
  seerrVu.filmEnAttente.texte === 'En attente d\'approbation' && seerrVu.filmEnAttente.inerte === 'true'
    && seerrVu.filmEnAttente.fond === 'rgb(180, 83, 9)', seerrVu.filmEnAttente);
check('SEERR: une serie partiellement disponible propose « Demander manquant », en vert, cliquable',
  seerrVu.serieManquante.texte === 'Demander manquant' && seerrVu.serieManquante.inerte === 'false'
    && seerrVu.serieManquante.popup === 'dialog' && seerrVu.serieManquante.fond === 'rgb(76, 164, 108)',
  seerrVu.serieManquante);
check('SEERR: une serie dont tout est demande attend, sans action — plus de « Demander » trompeur',
  seerrVu.serieEnAttente.texte === 'En attente d\'approbation' && seerrVu.serieEnAttente.inerte === 'true'
    && seerrVu.serieEnAttente.popup === null, seerrVu.serieEnAttente);
check('SEERR: une serie annonce le choix des saisons, pas un film',
  seerrVu.serieADemander.popup === 'dialog' && seerrVu.demander.popup === null, [seerrVu.serieADemander, seerrVu.demander]);
check('SEERR: un titre disponible le dit, en vert',
  seerrVu.disponible.texte === 'Disponible' && seerrVu.disponible.fond === 'rgb(22, 163, 74)'
    && seerrVu.disponible.inerte === 'true', seerrVu.disponible);
check('SEERR: un etat illisible masque le bouton plutot que d afficher une erreur',
  seerrVu.illisible.etat === 'loading' && seerrVu.illisible.visible === 'hidden', seerrVu.illisible);
check('SEERR: un lecteur d ecran entend le titre avec le libelle',
  seerrVu.demander.nom === 'Demander : Inception', seerrVu.demander.nom);
check('SEERR: le bouton est pose dans l affiche, sur le voile de Jellyfin Enhanced',
  seerrVu.dansAffiche === true && seerrVu.voile === true, seerrVu);
check('SEERR: sur ordinateur, le bouton n apparait qu au survol, comme chez Jellyfin Enhanced',
  voileAuRepos === '0' && voileAuSurvol === '1', [voileAuRepos, voileAuSurvol]);
check('SEERR: sur un ecran tactile, il est toujours visible', voileTactile === '1', voileTactile);
check('SEERR: la carte garde la hauteur d une carte de la bibliotheque',
  Math.abs(seerrVu.hauteurAbsente - seerrVu.hauteurPresente) < 0.5, [seerrVu.hauteurAbsente, seerrVu.hauteurPresente]);
check('SEERR: la rangee garde sa hauteur, bouton ou pas',
  Math.abs(seerrVu.hauteurRangee - sansSeerrVu.hauteurRangee) < 0.5, [seerrVu.hauteurRangee, sansSeerrVu.hauteurRangee]);
check('SEERR: sans integration configuree, ni bouton ni appel',
  sansSeerrVu.boutons === 0 && sansSeerrVu.appels === 0, sansSeerrVu);
check('SEERR: pendant la demande, le bouton le dit', pendantDemande === 'Demande en cours', pendantDemande);
check('SEERR: un film se demande d un clic, sans fenetre',
  apresDemande.demandes === 1 && apresDemande.corps.MediaType === 'movie' && apresDemande.corps.TmdbId === 27205
    && apresDemande.corps.Seasons === undefined && apresDemande.fenetre === 0, apresDemande);
check('SEERR: apres la demande, le film est « Demande »', apresDemande.texte === 'Demandé', apresDemande.texte);
check('SEERR: le clic ne remonte pas a jellyfin-web et ne navigue pas',
  apresDemande.clicsDocument === 0 && apresDemande.hash === '', apresDemande);
check('SEERR: un bouton qui n agit plus n envoie rien et n ouvre rien',
  demandesInertes.demandes === 1 && demandesInertes.fenetres === 0, demandesInertes);
check('SEERR: au clavier, Entree demande le titre', auClavier.demandes === 1, auClavier);
check('SEERR: et le focus reste sur le bouton, pour la telecommande', auClavier.focus === true, auClavier);
check('SEERR: le focus clavier est entoure', auClavier.anneau.indexOf('rgb(255, 255, 255)') !== -1, auClavier.anneau);
check('SEERR: un compte absent de Seerr le lit sur le bouton, avec l explication',
  refus.inconnu.texte === 'Utilisateur non trouvé' && !!refus.inconnu.titre && refus.inconnu.inerte === 'true', refus);
check('SEERR: ce refus persiste, puisqu un nouvel essai echouerait pareil',
  refus.inconnuEnsuite === 'user-not-found', refus.inconnuEnsuite);
check('SEERR: une panne de Seerr le dit', refus.panne === 'Seerr hors ligne', refus.panne);
check('SEERR: puis rend la main', refus.panneEnsuite === 'request', refus.panneEnsuite);

check('SAISONS: une serie ouvre une vraie boite de dialogue, sans rien demander',
  fenetre.role === 'dialog' && fenetre.modale === 'true' && fenetre.demandes === 0, fenetre);
check('SAISONS: titre et nom de la serie, comme chez Jellyfin Enhanced',
  fenetre.titre === 'Demander une série' && fenetre.sousTitre === 'Stranger Things', fenetre);
check('SAISONS: seules les saisons encore demandables se cochent',
  fenetre.lignes.filter(l => l.active).map(l => l.saison).join(',') === '0,3,4', fenetre.lignes);
check('SAISONS: chaque saison dit son etat',
  fenetre.lignes[1].etat === 'Disponible' && fenetre.lignes[2].etat === 'Demandé'
    && fenetre.lignes[3].etat === 'Non demandé', fenetre.lignes);
check('SAISONS: nom, specials, annee et episodes',
  fenetre.lignes[0].nom === 'Épisodes spéciaux' && fenetre.lignes[2].nom === 'Stranger Things 2'
    && fenetre.lignes[3].nom === 'Saison 3' && fenetre.lignes[3].annee === '2019' && fenetre.lignes[3].episodes === '8 ép.'
    && fenetre.lignes[4].annee === '' && fenetre.lignes[4].episodes === '9 ép.', fenetre.lignes);
check('SAISONS: la fenetre de Jellyfin Enhanced — interrupteurs, titre en degrade, pastilles en capitales',
  fenetre.interrupteurs && fenetre.titreDegrade && fenetre.capitales, fenetre);
check('SAISONS: l en-tete est illustre par l affiche du titre, deja relayee',
  fenetre.fondEntete.indexOf('st.jpg') !== -1, fenetre.fondEntete);
check('SAISONS: sans options avancees proposees, pas de section', fenetre.avancees === 0, fenetre.avancees);
check('SAISONS: « Tout selectionner » et le bouton des demandes partielles',
  fenetre.tout === true && fenetre.envoyer === 'Demander', fenetre);
check('SAISONS: le focus entre dans la fenetre, sur la premiere case', fenetre.focus === true, fenetre.focus);
check('SAISONS: rien de coche, rien ne part, et la fenetre le dit',
  sansChoix.demandes === 0 && sansChoix.message === 'Veuillez sélectionner au moins une saison', sansChoix);
check('SAISONS: « Tout selectionner » laisse les specials de cote', toutCoche === '3,4', toutCoche);
check('SAISONS: la demande part avec les saisons cochees',
  apresSaisons.corps && apresSaisons.corps.MediaType === 'tv' && apresSaisons.corps.TmdbId === 66732
    && apresSaisons.corps.Seasons.join(',') === '3,4', apresSaisons.corps);
check('SAISONS: la fenetre se ferme et le bouton prend l etat rendu par le serveur',
  apresSaisons.etat === 'pending' && apresSaisons.texte === 'En attente d\'approbation' && !apresSaisons.agit, apresSaisons);
check('SAISONS: un message confirme la demande',
  apresSaisons.toast === 'Demandé 2 saison(s) de « Stranger Things »', apresSaisons.toast);
check('SAISONS: le focus revient au bouton de la serie', apresSaisons.focus === true, apresSaisons.focus);
check('SAISONS: Echap ferme, et le focus revient au bouton', echap.fenetre === 0 && echap.focus === true, echap);
check('SAISONS: quitter la page ferme la fenetre', apresNavigation === 0, apresNavigation);
check('SAISONS: sans demandes partielles, les cases montrent ce qui partira, sans se changer',
  serieEntiere.toutes === 0 && serieEntiere.cochees === '3,4' && serieEntiere.tout === false
    && serieEntiere.envoyer === 'Demander', serieEntiere);
check('SAISONS: et la serie part en entier, specials exceptes', serieEntiere.envoye === '3,4', serieEntiere.envoye);
check('SAISONS: un refus s affiche dans la fenetre, qui reste ouverte',
  refusDansFenetre.message === 'Utilisateur non trouvé' && refusDansFenetre.ouverte && refusDansFenetre.rendue, refusDansFenetre);
check('SAISONS: Seerr injoignable a l ouverture, la fenetre le dit et ne propose rien',
  saisonsHorsLigne.envoi === true, saisonsHorsLigne);

check('AVANCEES: la section de Jellyfin Enhanced, ses serveurs tries par nom',
  optionsSerie.titre === 'Options avancées' && optionsSerie.serveurs === 'Sonarr,Sonarr 4K', optionsSerie);
check('AVANCEES: le serveur par defaut des demandes ordinaires est preselectionne, pas celui de la 4K',
  optionsSerie.serveur === 'Sonarr' && optionsSerie.profil === 'HD-1080p'
    && optionsSerie.dossier === '/series (3.98 TB)', optionsSerie);
check('AVANCEES: changer de serveur propose ses propres profils et dossiers',
  apres4k.profil === '7' && apres4k.dossier === '/series-4k', apres4k);
check('AVANCEES: la demande porte le serveur, le profil et le dossier choisis',
  demandeAvancee.ServerId === 0 && demandeAvancee.ProfileId === 6 && demandeAvancee.RootFolder === '/series2'
    && demandeAvancee.Seasons.join(',') === '3,4', demandeAvancee);
check('AVANCEES: un film ouvre sa fenetre, sans saisons, pret a partir',
  fenetreFilm.titre === 'Demander un film' && fenetreFilm.saisons === 0 && fenetreFilm.envoiActif
    && fenetreFilm.dossier === '/films (1 TB)', fenetreFilm);
check('AVANCEES: et la demande du film porte ses options',
  demandeFilm.corps.MediaType === 'movie' && demandeFilm.corps.ServerId === 0 && demandeFilm.corps.ProfileId === 4
    && demandeFilm.corps.RootFolder === '/films' && demandeFilm.corps.Seasons === undefined
    && demandeFilm.etat === 'requested', demandeFilm);
check('AVANCEES: options illisibles, la section reste cachee et la demande part sans elles',
  optionsIllisibles.cachee === true && optionsIllisibles.corps.ServerId === undefined, optionsIllisibles);
check('SEERR: plus de 20 titres partent en plusieurs lots',
  JSON.stringify(lotsDecoupes) === '[20,5]', lotsDecoupes);
check('SEERR: un retour sur l accueil montre aussitot l etat connu', etatAuRetour === 'request', etatAuRetour);

check('aucune erreur js', errors.length === 0, errors);

console.log(failed === 0 ? '\nTous les tests passent.' : '\n' + failed + ' echec(s).');
process.exit(failed === 0 ? 0 : 1);
