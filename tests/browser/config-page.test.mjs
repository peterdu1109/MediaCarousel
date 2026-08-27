import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const browser = await chromium.launch(process.env.MC_CHROMIUM ? { executablePath: process.env.MC_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// Les stubs doivent exister avant l'execution du script inline de la page.
await page.addInitScript(() => {
  window.__saved = null;
  window.__refreshCalls = 0;
  window.__config = {
    EnableLocalTop: true, LocalTopSize: 10, LocalTopMediaKind: 'Both', LocalTopWindowDays: 30,
    MaxPlaysCountedPerUser: 3, CandidatesPerUser: 100,
    ExcludedUserIds: ['aaa', 'bbb'], ExcludedLibraryIds: [],
    EnableGlobalTop: false, GlobalTopProvider: 'Tmdb', GlobalTopApiKey: 'secret',
    GlobalTopMediaKind: 'Movies', GlobalTopSize: 10, GlobalTopLibraryOnly: true,
    MetadataLanguage: 'fr-FR',
    EnableStudioRow: true, StudioRowTitle: 'Par studio', StudioRowSize: 20, MinItemsPerStudio: 3,
    EnableGenreRows: false, GenreRowCount: 6, GenreRowItemCount: 20, MinItemsPerGenre: 5,
    EnableReturningRow: true, ReturningRowTitle: 'De retour cette semaine', ReturningRowDays: 7, ReturningRowSize: 20,
    EnableNeverPlayedRow: true, NeverPlayedRowTitle: 'Jamais vu', NeverPlayedRowSize: 20, NeverPlayedMinRating: 7.5,
    HideNativeHomeSections: false,
    EnableHomeRows: true, LocalRowTitle: 'Top 10 sur ce serveur', GlobalRowTitle: 'Top 10 mondial',
    HighlightColor: '#e50914',
    RefreshIntervalHours: 6, SyncCollections: false,
    LocalCollectionName: 'Top 10 du serveur', GlobalCollectionName: 'Top 10 mondial'
  };
  window.ApiClient = {
    getUrl: (p) => p,
    getPluginConfiguration: () => Promise.resolve(JSON.parse(JSON.stringify(window.__config))),
    updatePluginConfiguration: (id, c) => { window.__saved = c; return Promise.resolve({}); },
    getJSON: (url) => {
      if (url.includes('Status')) {
        return Promise.resolve({
          Version: '3.0.1.0',
          LocalTop: { Enabled: true, Count: 10, Source: 'Jellyfin', GeneratedUtc: '2026-08-27T03:00:00Z' },
          GlobalTop: { Enabled: false, Count: 0, Source: 'None', GeneratedUtc: null },
          ReturningSeries: { Enabled: true, Count: 4, Source: 'Jellyfin', GeneratedUtc: '2026-08-27T03:00:00Z' },
          NeverPlayed: { Enabled: true, Count: 20, Source: 'Jellyfin', GeneratedUtc: '2026-08-27T03:00:00Z' },
          Studios: { Enabled: true, Count: 18, Source: 'Jellyfin', GeneratedUtc: '2026-08-27T03:00:00Z' },
          Genres: { Enabled: false, Count: 0, Source: 'Jellyfin', GeneratedUtc: null }
        });
      }
      return Promise.reject(new Error('route inattendue ' + url));
    },
    ajax: () => { window.__refreshCalls++; return Promise.resolve({}); }
  };
  window.Dashboard = {
    showLoadingMsg() {}, hideLoadingMsg() {},
    processPluginConfigurationUpdateResult() {}, alert() {}
  };
});

await page.goto('file://' + path.join(repo, 'Configuration', 'configPage.html'));
await page.evaluate(() => {
  document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow'));
});
await page.waitForFunction(() => document.querySelectorAll('.mcCfg-tile').length === 6, { timeout: 5000 });

const loaded = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  return {
    version: q('#mcVersion').textContent,
    tiles: Array.from(document.querySelectorAll('.mcCfg-tile')).map(t => ({
      state: t.dataset.state,
      value: t.querySelector('.mcCfg-tile-value').textContent,
      detail: t.querySelector('.mcCfg-tile-detail').textContent
    })),
    localSize: q('#LocalTopSize').value,
    excluded: q('#ExcludedUserIds').value,
    apiKeyType: q('#GlobalTopApiKey').type,
    // Groupes desactives : masques ET hors du parcours clavier.
    globalHidden: q('#groupGlobal').hidden,
    globalDisabled: q('#GlobalTopApiKey').disabled,
    genreHidden: q('#groupGenre').hidden,
    genreDisabled: q('#GenreRowCount').disabled,
    localVisible: q('#groupLocal').hidden === false && q('#LocalTopSize').disabled === false,
    // Accessibilite
    legends: Array.from(document.querySelectorAll('.mcCfg-group > legend')).map(l => l.textContent),
    minRating: q('#NeverPlayedMinRating').value,
    describedBy: Array.from(document.querySelectorAll('[aria-describedby]'))
      .every(el => document.getElementById(el.getAttribute('aria-describedby')) !== null),
    liveRegions: Array.from(document.querySelectorAll('[aria-live]')).map(e => e.getAttribute('aria-live')),
    h1: document.querySelectorAll('h1').length
  };
});

// Bascule : activer le Top mondial doit reveler et reactiver son groupe.
await page.evaluate(() => {
  const cb = document.querySelector('#EnableGlobalTop');
  cb.checked = true;
  cb.dispatchEvent(new Event('change'));
});
const afterToggle = await page.evaluate(() => ({
  hidden: document.querySelector('#groupGlobal').hidden,
  disabled: document.querySelector('#GlobalTopApiKey').disabled
}));

// Enregistrement : les champs d'un groupe masque doivent tout de meme etre sauvegardes.
await page.evaluate(() => {
  document.querySelector('#LocalTopSize').value = '15';
  document.querySelector('#NeverPlayedMinRating').value = '8.2';
  document.querySelector('#ExcludedUserIds').value = 'aaa\nccc, ddd';
  document.querySelector('#mediaCarouselConfigForm').dispatchEvent(new Event('submit', { cancelable: true }));
});
await page.waitForFunction(() => window.__saved !== null, { timeout: 5000 });
const saved = await page.evaluate(() => window.__saved);
const feedbackAfterSave = await page.evaluate(() => document.querySelector('#mcFeedback').textContent);

await page.evaluate(() => document.querySelector('#refreshNowButton').click());
await page.waitForTimeout(300);
const refresh = await page.evaluate(() => ({
  calls: window.__refreshCalls,
  feedback: document.querySelector('#mcFeedback').textContent
}));

await browser.close();

let failed = 0;
const check = (name, ok, got) => { console.log((ok ? 'OK    ' : 'ECHEC ') + name + (ok ? '' : '  -> ' + JSON.stringify(got))); if (!ok) failed++; };

check('version affichee', loaded.version === 'v3.0.1.0', loaded.version);
check('6 tuiles d etat', loaded.tiles.length === 6, loaded.tiles.length);
check('tuile active : compte et date', loaded.tiles[0].state === 'ok' && loaded.tiles[0].value === '10'
  && loaded.tiles[0].detail.startsWith('Calculé le'), loaded.tiles[0]);
check('tuile desactivee lisible sans couleur', loaded.tiles[1].state === 'off'
  && loaded.tiles[1].value === '—' && loaded.tiles[1].detail === 'Désactivé', loaded.tiles[1]);
check('valeurs chargees', loaded.localSize === '10', loaded.localSize);
check('listes rendues ligne par ligne', loaded.excluded === 'aaa\nbbb', loaded.excluded);
check('cle d API masquee a l ecran', loaded.apiKeyType === 'password', loaded.apiKeyType);
check('groupe inactif masque', loaded.globalHidden === true && loaded.genreHidden === true, loaded);
check('groupe inactif hors parcours clavier', loaded.globalDisabled === true && loaded.genreDisabled === true, loaded);
check('groupe actif utilisable', loaded.localVisible === true, loaded.localVisible);
check('bascule revele le groupe', afterToggle.hidden === false && afterToggle.disabled === false, afterToggle);
check('6 groupes avec legende', loaded.legends.length === 6, loaded.legends);
check('a11y: chaque aria-describedby pointe une cible', loaded.describedBy === true, loaded.describedBy);
check('a11y: regions live presentes', loaded.liveRegions.length === 2
  && loaded.liveRegions.every(v => v === 'polite'), loaded.liveRegions);
check('a11y: un seul h1', loaded.h1 === 1, loaded.h1);
check('enregistrement : valeur modifiee', saved.LocalTopSize === 15, saved.LocalTopSize);
check('note chargee sans troncature', loaded.minRating === '7.5', loaded.minRating);
check('note enregistree en decimal', saved.NeverPlayedMinRating === 8.2, saved.NeverPlayedMinRating);
check('enregistrement : liste normalisee', JSON.stringify(saved.ExcludedUserIds) === JSON.stringify(['aaa','ccc','ddd']), saved.ExcludedUserIds);
check('enregistrement : champ masque conserve', saved.GlobalTopApiKey === 'secret', saved.GlobalTopApiKey);
check('retour utilisateur apres enregistrement', feedbackAfterSave.startsWith('Réglages enregistrés'), feedbackAfterSave);
check('recalcul declenche une seule requete', refresh.calls === 1, refresh.calls);
check('retour utilisateur apres recalcul', refresh.feedback.startsWith('Recalcul lancé en arrière-plan'), refresh.feedback);
check('aucune erreur js', errors.length === 0, errors);

console.log(failed === 0 ? '\nTous les tests passent.' : '\n' + failed + ' echec(s).');
process.exit(failed === 0 ? 0 : 1);
