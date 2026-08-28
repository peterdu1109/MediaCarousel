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
    Item: { Id: 'id' + (i + 1), Name: 'Film <' + (i + 1) + '>', ServerId: 'server-1', IsFolder: false, ImageTags: { Primary: 'tag' } }
  }));

  window.ApiClient = {
    getCurrentUserId: () => 'user-1',
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
          ReturningRowTitle: 'De retour cette semaine', ReturningRowSize: 20,
          NeverPlayedRowTitle: 'Jamais vu', NeverPlayedRowSize: 20,
          HideNativeSections: window.__hideNative === true,
          LocalRowTitle: 'Top 10 sur ce serveur', GlobalRowTitle: 'Top 10 mondial',
          StudioRowTitle: 'Par studio',
          HighlightColor: window.__accent === undefined ? '#775BF4' : window.__accent,
          LocalRowSize: 10, GlobalRowSize: 10, StudioRowSize: 20,
          GenreRowCount: 3, GenreRowItemCount: 12
        });
      }
      if (url.includes('Top/Local')) return Promise.resolve({ Items: ranked(4) });
      if (url.includes('Top/Global')) return Promise.resolve({
        Items: [
          { Rank: 1, Name: 'Absent & "cité"', ProductionYear: 2024, PosterUrl: 'https://img/x.jpg', Item: null },
          { Rank: 2, Name: 'Present', Item: { Id: 'idg', Name: 'Present', ServerId: 'server-1', IsFolder: false, ImageTags: { Primary: 't' } } }
        ]
      });
      if (url.includes('Rows/Returning')) return Promise.resolve({
        Items: [1, 2].map(i => ({
          Rank: i, Name: 'Serie ' + i,
          Item: { Id: 'r' + i, Name: 'Serie ' + i, ServerId: 'server-1', IsFolder: false, ImageTags: { Primary: 'p' } }
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
          { Id: 's1', Name: 'A24', ItemCount: 12, Item: { Id: 's1', Name: 'A24', ServerId: 'server-1', IsFolder: false, ImageTags: { Logo: 'lg' } } },
          { Id: 's2', Name: 'Studio <sans logo>', ItemCount: 5, Item: { Id: 's2', Name: 'Studio <sans logo>', ServerId: 'server-1', IsFolder: false, ImageTags: {} } }
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
await page.waitForFunction(() => document.querySelectorAll('.mc-row').length === 9, { timeout: 8000 });

// Les rangees de genre se remplissent au defilement : on parcourt la page.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForFunction(
  () => document.querySelectorAll('.mc-row .mc-plain').length >= 12
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

  const card = rows[0].querySelector('.mc-card');

  return {
    order: Array.from(container.children).map(k =>
      k.className.split(' ').filter(c => c.startsWith('section') || c === 'mc-row').join('')),
    titles: rows.map(r => r.querySelector('.mc-row-title').textContent),
    swipeBlocked: allowSwipe(card) === false,
    stripClasses: rows[0].querySelector('.mc-strip').className,
    noBadges: document.querySelectorAll('.mc-row-badge').length,
    noTileCounts: document.querySelectorAll('.mc-tile-count').length,
    returningCards: rows[2].querySelectorAll('.mc-plain').length,
    neverPlayedCards: rows[3].querySelectorAll('.mc-plain').length,
    becauseTitle: rows[4].querySelector('.mc-row-title').textContent,
    becauseCards: rows[4].querySelectorAll('.mc-plain').length,
    becauseExcludesSeed: window.__calls.some(c => c.startsWith('Items?') && c.includes('ExcludeItemIds=seed1')),
    becauseGenreCount: (() => {
      const call = window.__calls.find(c => c.startsWith('Items?') && c.includes('Genres='));
      return call ? new URLSearchParams(call.split('?')[1]).get('Genres').split('|').length : 0;
    })(),
    studioLogo: !!rows[5].querySelector('.mc-tile img'),
    studioFallbackName: rows[5].querySelectorAll('.mc-tile-name').length,
    studioEscaped: rows[5].querySelector('.mc-tile-name')?.textContent,
    genreCards: rows[6].querySelectorAll('.mc-plain').length,
    genreEmptyMessage: rows[8].querySelector('.mc-empty')?.textContent,
    nativeVisible: Array.from(container.children)
      .filter(c => !c.classList.contains('mc-row') && !c.classList.contains('mc-hidden-native')).length,
    labelledBy: rows.every(r => {
      const id = r.getAttribute('aria-labelledby');
      return id && r.querySelector('#' + id);
    }),
    cardAria: card.getAttribute('aria-label'),
    arrowsHidden: Array.from(rows[0].querySelectorAll('.mc-arrow'))
      .every(a => a.getAttribute('tabindex') === '-1' && a.getAttribute('aria-hidden') === 'true'),
    listRoles: rows[0].querySelector('.mc-strip').getAttribute('role') === 'list'
      && card.getAttribute('role') === 'listitem',
    unavailableIsLink: rows[1].querySelector('.mc-unavailable').tagName === 'A',
    posterHeight: rows[0].querySelector('.mc-poster').getBoundingClientRect().height,
    rankFill: getComputedStyle(rows[0]).getPropertyValue('--mc-rank-fill').trim(),
    rankOutline: getComputedStyle(rows[0]).getPropertyValue('--mc-rank-outline').trim(),
    accentDefault: getComputedStyle(rows[0]).getPropertyValue('--mc-accent').trim(),
    genrePosterHeight: rows[6].querySelector('.mc-plain .mc-poster').getBoundingClientRect().height,
    tileHeight: rows[5].querySelector('.mc-tile').getBoundingClientRect().height
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
await page.waitForFunction(() => document.querySelectorAll('.mc-row').length === 9, { timeout: 8000 });
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
await injection.waitForFunction(() => document.querySelectorAll('.mc-row').length === 9, { timeout: 8000 });

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
await themed.waitForFunction(() => document.querySelectorAll('.mc-row').length === 9, { timeout: 8000 });
await themed.addStyleTag({ path: path.join(here, 'theme-excerpt.css') });
await themed.waitForTimeout(300);

const theme = await themed.evaluate(() => {
  const row = document.querySelector('.mc-row');
  const strip = row.querySelector('.mc-strip');
  const poster = row.querySelector('.mc-poster');
  const styleTag = document.getElementById('mc-styles');
  const themeTag = document.querySelector('style:last-of-type');
  return {
    themeLoadedAfter: styleTag.compareDocumentPosition(themeTag) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false,
    // Le jeton du theme doit etre adopte : 10 % de la largeur de la bande.
    stripPadding: getComputedStyle(strip).paddingLeft,
    expectedPadding: (strip.clientWidth * 0.10).toFixed(0),
    // Notre marge doit resister a la regle .verticalSection du theme.
    rowMarginBottom: getComputedStyle(row).marginBottom,
    // Le rayon du theme doit etre repris.
    posterRadius: getComputedStyle(poster).borderTopLeftRadius,
    posterHeight: poster.getBoundingClientRect().height,
    gap: getComputedStyle(strip).columnGap
  };
});
await themed.close();

// Un compte sans historique : la rangee personnalisee doit simplement ne pas exister,
// plutot que d'afficher un titre vide ou une bande sans carte.
const fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
fresh.on('pageerror', e => errors.push('pageerror(fresh): ' + e.message));
await fresh.addInitScript(() => { window.__noHistory = true; });
await fresh.goto('file://' + path.join(here, 'home.html'));
await fresh.evaluate(stub);
await fresh.evaluate(script);
await fresh.waitForFunction(() => document.querySelectorAll('.mc-row').length === 8, { timeout: 8000 });

const freshRows = await fresh.evaluate(() => ({
  titles: Array.from(document.querySelectorAll('.mc-row-title')).map(t => t.textContent),
  // Les rangees de genre sont volontairement vides tant qu'elles n'ont pas defile ;
  // ce qui compte ici est qu'aucune rangee ne porte un titre vide ou tronque.
  blankTitles: Array.from(document.querySelectorAll('.mc-row-title'))
    .filter(t => !t.textContent.trim()).length
}));
await fresh.close();

// Second passage, sections natives masquees.
const hidePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
hidePage.on('pageerror', e => errors.push('pageerror(hide): ' + e.message));
await hidePage.addInitScript(() => { window.__hideNative = true; });
await hidePage.goto('file://' + path.join(here, 'home.html'));
await hidePage.evaluate(stub);
await hidePage.evaluate(script);
await hidePage.waitForFunction(() => document.querySelectorAll('.mc-row').length === 9, { timeout: 8000 });

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

await browser.close();

let failed = 0;
const check = (name, ok, got) => { console.log((ok ? 'OK    ' : 'ECHEC ') + name + (ok ? '' : '  -> ' + JSON.stringify(got))); if (!ok) failed++; };

check('9 rangees sous les bibliotheques',
  JSON.stringify(result.order) === JSON.stringify(
    ['section0','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','mc-row','section1','section2','section3']), result.order);
check('titres et ordre corrects', JSON.stringify(result.titles) ===
  JSON.stringify(['Top 10 sur ce serveur','Top 10 mondial','De retour cette semaine','Jamais vu',
                  'Parce que tu as regardé Blade <Runner>',
                  'Par studio','Science-fiction','Comédie','Vide']), result.titles);
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
check('BECAUSE: les 8 autres rangees restent intactes', freshRows.titles.length === 8, freshRows.titles.length);
check('BECAUSE: aucun titre de rangee vide', freshRows.blankTitles === 0, freshRows.blankTitles);
check('a11y: chaque rangee pointe son titre', result.labelledBy === true, result.labelledBy);
check('a11y: libelle de carte explicite', result.cardAria === 'Numéro 1 : Film <1> (2020)', result.cardAria);
check('a11y: fleches hors du parcours clavier', result.arrowsHidden === true, result.arrowsHidden);
check('a11y: roles list/listitem', result.listRoles === true, result.listRoles);
check('titre absent non cliquable', result.unavailableIsLink === false, result.unavailableIsLink);
check('affiche dimensionnee', result.posterHeight === 180, result.posterHeight);
check('affiche de genre dimensionnee', result.genrePosterHeight === 180, result.genrePosterHeight);
check('vignette de studio dimensionnee', result.tileHeight === 104, result.tileHeight);
check('pas de duplication sur mutation', afterMutation === 9, afterMutation);
check('reinjection apres reconstruction', afterRebuild === 9, afterRebuild);
const extraCalls = callsAfterRebuild.slice(callsBeforeRebuild.length);
check('CACHE: aucun endpoint du plugin refait apres reconstruction de l accueil',
  extraCalls.every(c => !c.startsWith('MediaCarousel/')), extraCalls);
check('CACHE: seul le genre vide est re-interroge (resultat vide non memorise)',
  extraCalls.length === 1 && extraCalls[0].includes('GenreIds=g3'), extraCalls);
check('MASQUAGE: bibliotheques conservees', hidden.libraryVisible && hidden.libraryDisplayed, hidden);
check('MASQUAGE: 3 sections natives masquees', hidden.nativeHidden === 3, hidden.nativeHidden);
check('MASQUAGE: nos 9 rangees restent visibles', hidden.ourRowsVisible === 9, hidden.ourRowsVisible);
check('MASQUAGE: la rangee d un autre plugin est epargnee', hidden.foreignVisible === true, hidden);

check('THEME: la feuille du theme est bien chargee apres la notre', theme.themeLoadedAfter === true, theme);
check('THEME: le jeton --sidePadding du theme est adopte',
  Math.abs(parseFloat(theme.stripPadding) - Number(theme.expectedPadding)) < 2, theme);
check('THEME: notre marge de rangee resiste a .verticalSection',
  theme.rowMarginBottom !== '16px' && parseFloat(theme.rowMarginBottom) > 20, theme.rowMarginBottom);
check('THEME: le rayon du theme est repris', theme.posterRadius === '16px', theme.posterRadius);
check('THEME: la gouttiere du theme est reprise', theme.gap === '8px', theme.gap);
check('THEME: les affiches gardent leur hauteur', theme.posterHeight === 180, theme.posterHeight);

check('C1: chiffres lisibles au repos (contour .85, remplissage .25)',
  result.rankFill === 'rgba(255,255,255,.25)' && result.rankOutline === 'rgba(255,255,255,.85)', result);
check('C2: accent violet par defaut', result.accentDefault === '#775BF4', result.accentDefault);
check('D1: une couleur invalide retombe sur le defaut',
  accent.applied === '#775BF4', accent.applied);
check('D1: aucune declaration injectee dans la feuille',
  !accent.css.includes('body{display:none}') && accent.bodyVisible, accent.css.slice(0, 120));

check('aucune erreur js', errors.length === 0, errors);

console.log(failed === 0 ? '\nTous les tests passent.' : '\n' + failed + ' echec(s).');
process.exit(failed === 0 ? 0 : 1);
