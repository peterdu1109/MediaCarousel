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
    box: measure(rows[0].querySelector('.card')),
    nativeBox: measure(document.querySelector('#nativeReference .card')),
    textBox: measure(rows[0].querySelector('.cardText-first')),
    nativeTextBox: measure(document.querySelector('#nativeReference .cardText-first')),
    rankFill: getComputedStyle(rows[0]).getPropertyValue('--mc-rank-fill').trim(),
    rankOutline: getComputedStyle(rows[0]).getPropertyValue('--mc-rank-outline').trim(),
    accentDefault: getComputedStyle(rows[0]).getPropertyValue('--mc-accent').trim(),
    genreBox: measure(rows[7].querySelector('.card')),
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
    cardWidth: Math.round(row.querySelector('.card').getBoundingClientRect().width * 10) / 10,
    nativeCardWidth: Math.round(
      document.querySelector('#nativeReference .card').getBoundingClientRect().width * 10) / 10,
    cardRadius: getComputedStyle(poster.querySelector('.cardImageContainer')).borderTopLeftRadius,
    nativeCardRadius: getComputedStyle(
      document.querySelector('#nativeReference .cardImageContainer')).borderTopLeftRadius,
    nativeRowMargin: getComputedStyle(document.getElementById('nativeReference')).marginBottom
  };
});
await themed.close();

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
  const outline = getComputedStyle(row).getPropertyValue('--mc-rank-outline').trim();
  const halo = getComputedStyle(row).getPropertyValue('--mc-rank-halo').trim();
  return {
    flagged: document.querySelectorAll('.mc-row.mc-on-light').length,
    outlineIsDark: /^rgba\((\d{1,2})[, ]/.test(outline),
    haloIsLight: halo.indexOf('rgba(255,255,255') === 0
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
    document.querySelector('.mc-row .card').getBoundingClientRect().width,
    document.querySelector('#nativeReference .card').getBoundingClientRect().width
  ]);
}

// Ecran large mais bas : un televiseur 720p, ou une fenetre aplatie.
await sizing.setViewportSize({ width: 1280, height: 560 });
await sizing.waitForTimeout(120);
widths.shortScreen = await sizing.evaluate(() => [
  document.querySelector('.mc-row .card').getBoundingClientRect().width,
  document.querySelector('#nativeReference .card').getBoundingClientRect().width
]);

await sizing.setViewportSize({ width: 1280, height: 900 });
await sizing.waitForTimeout(120);

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
    // Le contour doit etre peint DERRIERE le remplissage.
    paintOrder: getComputedStyle(one.querySelector('.mc-rank-glyph')).paintOrder,
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
check('PARITE: nos cartes ont la taille exacte d une carte native',
  JSON.stringify(result.box) === JSON.stringify(result.nativeBox), [result.box, result.nativeBox]);
check('PARITE: le libelle a la taille exacte du libelle natif',
  JSON.stringify(result.textBox) === JSON.stringify(result.nativeTextBox), [result.textBox, result.nativeTextBox]);
check('PARITE: les rangees de genre suivent la meme taille',
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
check('THEME: sous un theme aussi, nos cartes gardent la taille native',
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

check('C1: chiffres evides, contour clair',
  result.rankFill === 'rgba(255,255,255,.2)' && result.rankOutline === 'rgba(255,255,255,.94)', result);
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
check('RANG: il couvre entre le tiers et la moitie de l affiche',
  rank.coverage > 0.3 && rank.coverage < 0.55, rank.coverage);
check('RANG: la police du chiffre est posee, jamais heritee',
  rank.declaresFont === true && /sans-serif/.test(rank.fontFamily), rank.fontFamily);
check('RANG: le contour est peint derriere le remplissage',
  rank.paintOrder.indexOf('stroke') === 0, rank.paintOrder);

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
check('NATIF: la valeur heritee « folders » vaut la section des bibliotheques',
  legacyFolders === modernFolders, [legacyFolders, modernFolders]);
check('NATIF: le decalage des interfaces televiseur est rattrape',
  tvLayout.indexOf('section2') < tvLayout.indexOf('mc-row')
    && tvLayout.indexOf('section1') > tvLayout.lastIndexOf('mc-row'),
  tvLayout);

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
check('CLAIR: le contour des chiffres devient sombre', lightMode.outlineIsDark === true, lightMode);
check('CLAIR: et le halo qui le detache devient clair', lightMode.haloIsLight === true, lightMode);

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

check('aucune erreur js', errors.length === 0, errors);

console.log(failed === 0 ? '\nTous les tests passent.' : '\n' + failed + ' echec(s).');
process.exit(failed === 0 ? 0 : 1);
