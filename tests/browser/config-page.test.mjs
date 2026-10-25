import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const browser = await chromium.launch(process.env.MC_CHROMIUM ? { executablePath: process.env.MC_CHROMIUM } : {});
// La page suit la langue du compte, ou celle du navigateur : le banc est en français.
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, locale: 'fr-FR' });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// Les stubs doivent exister avant l'execution du script inline de la page.
await page.addInitScript(() => {
  window.__saved = null;
  window.__refreshCalls = 0;
  window.__config = {
    RowOrder: 'genres, local , inconnue,because',
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
    HideNativeHomeSections: false, ExcludeChannelContent: true,
    EnableHomeRows: true, LocalRowTitle: 'Top 10 sur ce serveur', GlobalRowTitle: 'Top 10 mondial',
    HighlightColor: '#e50914',
    RefreshIntervalHours: 6, SyncCollections: false,
    LocalCollectionName: 'Top 10 du serveur', GlobalCollectionName: 'Top 10 mondial',
    // Un vrai serveur a toujours ces valeurs : sans elles, le formulaire du banc serait
    // invalide, ce que le bouton « Recalculer maintenant » refuse désormais d'enregistrer.
    AllTimeRowSize: 10, BecauseRowSize: 20, RankNumberScale: 100,
    AllowUserPreferences: true
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
          Genres: { Enabled: false, Count: 0, Source: 'Jellyfin', GeneratedUtc: null },
          LastRun: window.__lastRun || { StartedUtc: '2026-08-27T03:00:00Z', DurationSeconds: 12.4, Running: false, Failures: [] },
          PlaybackReporting: window.__playback === true,
          FileTransformation: false,
          Activity: window.__playback === true ? { Viewers: 3, Views: 5, Hours: 97.2, WindowDays: 30 } : null,
          GlobalInLibrary: 0, GlobalTotal: 0,
          CustomizedAccounts: 2, Accounts: 5,
          NextRunUtc: new Date(Date.now() + 4 * 3600000).toISOString()
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

// Extrait les tableaux de champs du script de la page pour les confronter au HTML.
const declared = [...(await page.content()).matchAll(/var (?:checkboxes|numbers|decimals|texts|lists) = \[(.*?)\];/gs)]
  .flatMap(m => [...m[1].matchAll(/'(\w+)'/g)].map(x => x[1]));
await page.evaluate(list => { window.__declaredFields = list; }, declared);
await page.evaluate(() => {
  document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow'));
});
await page.waitForFunction(() => document.querySelectorAll('.mcCfg-tile').length === 4, { timeout: 5000 });

// La verification inverse : un champ present dans le formulaire mais absent des tableaux
// n'est ni charge ni enregistre. Il a l'air de marcher, se laisse modifier, et retrouve
// son ancienne valeur au rechargement — sans le moindre message. C'est exactement le
// travers qui a laisse le reglage « Liste » du Top mondial sans effet cote serveur
// pendant plusieurs versions.
const orphelins = await page.evaluate(() => {
  const declares = window.__declaredFields;
  return [...document.querySelectorAll('#mediaCarouselConfigForm input, '
    + '#mediaCarouselConfigForm select, #mediaCarouselConfigForm textarea')]
    .map(el => el.id)
    .filter(id => id && !declares.includes(id));
});

const loaded = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const mots = Array.from(document.querySelectorAll('#mediaCarouselConfigPage .fieldDescription, #mediaCarouselConfigPage .mcCfg-group-hint, #mediaCarouselConfigPage .mcCfg-intro'))
    .filter(e => e.id !== 'seerrTestResult')
    .reduce((n, e) => n + e.textContent.trim().split(/\s+/).filter(Boolean).length, 0);
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
    // Blocs desactives : masques ET hors du parcours clavier.
    globalHidden: q('#groupGlobal').hidden,
    globalDisabled: q('#GlobalTopApiKey').disabled,
    seerrHidden: q('#blockSeerr').hidden,
    genreHidden: q('#groupGenre').hidden,
    genreDisabled: q('#GenreRowCount').disabled,
    localVisible: q('#groupLocal').hidden === false && q('#LocalTopSize').disabled === false,
    // Structure : une page, cinq blocs, un seul pli.
    legends: Array.from(document.querySelectorAll('.mcCfg-group > legend > span:first-child')).map(l => l.textContent),
    run: {
      state: q('#mcRun').dataset.state,
      value: q('#mcRunValue').textContent,
      detail: q('#mcRunDetail').textContent
    },
    activeRows: q('#mcActiveRows').textContent,
    chips: Array.from(document.querySelectorAll('#mcHealth .mcCfg-chip')).map(c => c.dataset.state + ':' + c.textContent),
    // Une cle absente d'une table s'afficherait telle quelle.
    clesManquantes: Array.from(document.querySelectorAll('[data-i18n]'))
      .filter(e => e.textContent === e.getAttribute('data-i18n') || !e.textContent.trim()).map(e => e.getAttribute('data-i18n')),
    libellesVides: Array.from(document.querySelectorAll('[data-i18n-label]'))
      .filter(e => !e.getAttribute('label') || e.getAttribute('label') === e.getAttribute('data-i18n-label')).map(e => e.id),
    langue: q('#mediaCarouselConfigPage').getAttribute('lang'),
    texteBrutVisible: !q('#mcRawUsers').hidden && q('#mcPickUsers').hidden,
    onglets: document.querySelectorAll('[role=tab], [role=tablist], [role=tabpanel]').length,
    plis: document.querySelectorAll('details').length,
    pliFerme: q('#advancedSettings').open === false,
    periodeVisible: !q('#LocalTopWindowDays').closest('details') && !q('#LocalTopWindowDays').disabled,
    exclusionsRepliees: !!q('#ExcludedUserIds').closest('.mcCfg-advanced'),
    // Retires le 2026-10-25 : reglages techniques, doublon de la tache planifiee, langue reprise de Jellyfin.
    optionsRetirees: ['CandidatesPerUser', 'RefreshIntervalHours', 'MinItemsPerStudio', 'MinItemsPerGenre', 'MetadataLanguage']
      .filter(id => document.getElementById(id) !== null),
    blocTeleviseurs: document.body.textContent.indexOf('Tizen') !== -1,
    mots: mots,
    // Chaque rangee du plugin porte sa case dans la liste.
    casesDesRangees: Array.from(document.querySelectorAll('#mcRowOrder li')).map(li => {
      const cb = li.querySelector('input[type=checkbox]');
      return li.dataset.row + '=' + (cb ? cb.id + (cb.checked ? '+' : '-') : 'aucune');
    }),
    // Sans Playback Reporting, le comptage par nombre de lectures sert au Top du serveur.
    comptageVisible: q('#groupPlayCount').hidden === false && q('#MaxPlaysCountedPerUser').disabled === false,
    // Detail par section, rapatrie dans son bloc ; une rangee decochee n'y figure pas.
    sectionStates: document.querySelectorAll('[data-state-for]').length,
    localSectionState: q('[data-state-for="LocalTop,AllTime"]').textContent,
    rowsSectionState: q('[data-state-for="ReturningSeries,NeverPlayed,Studios,Genres"]').textContent,
    alertHiddenInitially: q('#mcDuplicateAlert').hidden,
    // Un champ absent des tableaux ne serait ni charge ni enregistre.
    orphanFields: (() => {
      const ids = new Set(Array.from(document.querySelectorAll('[id]'))
        .map(e => e.id).filter(id => /^[A-Z]/.test(id)));
      const declared = new Set(window.__declaredFields);
      return [...ids].filter(id => !declared.has(id));
    })(),
    // L'ordre affiche doit etre normalise : inconnus ecartes, manquants ajoutes.
    rowOrderValue: q('#RowOrder').value,
    rowOrderNames: Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-name')).map(e => e.textContent),
    rowOrderRanks: Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-rank')).map(e => e.textContent),
    firstUpDisabled: q('#mcRowOrder .mcCfg-order-up').disabled,
    lastDownDisabled: Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-down')).pop().disabled,
    minRating: q('#NeverPlayedMinRating').value,
    describedBy: Array.from(document.querySelectorAll('[aria-describedby]'))
      .every(el => document.getElementById(el.getAttribute('aria-describedby')) !== null),
    liveRegions: Array.from(document.querySelectorAll('[aria-live]')).map(e => e.getAttribute('aria-live')),
    h1: document.querySelectorAll('h1').length
  };
});

const cocherSur = (p) => (id, valeur) => p.evaluate(([i, v]) => {
  const cb = document.querySelector('#' + i);
  cb.checked = v;
  cb.dispatchEvent(new Event('change'));
}, [id, valeur]);
const cocher = cocherSur(page);
// Visible : ni l'element ni un de ses parents ne porte `hidden`.
const visible = (id) => page.$eval('#' + id, el => el.closest('[hidden]') === null);
const actif = (id) => page.$eval('#' + id, el => el.disabled === false);

// Avertissement de doublon : les valeurs par defaut portent le meme nom.
await cocher('EnableGlobalTop', true);
await cocher('SyncCollections', true);
const alertShown = await page.evaluate(() => ({
  visible: !document.querySelector('#mcDuplicateAlert').hidden,
  text: document.querySelector('#mcDuplicateAlert').textContent
}));

// Renommer la collection doit lever l'avertissement.
await page.evaluate(() => {
  const input = document.querySelector('#GlobalCollectionName');
  input.value = 'Tendances mondiales';
  input.dispatchEvent(new Event('input'));
});
const alertCleared = await page.evaluate(() => document.querySelector('#mcDuplicateAlert').hidden);

// Films et series separes : l'accueil affiche leurs deux titres, pas le titre unique.
const doublonSepare = await page.evaluate(() => {
  const set = (id, v) => { const e = document.querySelector('#' + id); e.value = v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); };
  const kind = document.querySelector('#GlobalTopMediaKind');
  kind.value = 'Both'; kind.dispatchEvent(new Event('change'));
  const split = document.querySelector('#GlobalTopSplitByType');
  split.checked = true; split.dispatchEvent(new Event('change'));
  set('GlobalMoviesRowTitle', 'Tendances mondiales');
  const alerte = !document.querySelector('#mcDuplicateAlert').hidden;
  set('GlobalMoviesRowTitle', 'Top 10 des films');
  split.checked = false; split.dispatchEvent(new Event('change'));
  kind.value = 'Movies'; kind.dispatchEvent(new Event('change'));
  return alerte;
});

// La case du Top mondial, cochee dans la liste, revele son bloc et celui de Seerr.
const afterToggle = {
  bloc: await visible('groupGlobal'),
  cle: await actif('GlobalTopApiKey'),
  seerr: await visible('blockSeerr')
};

// Films et series : la case « separees » n'a de sens qu'avec les deux, et le titre suit.
const separation = { filmsSeuls: {}, lesDeux: {}, separees: {} };
separation.filmsSeuls = { caseVisible: await visible('GlobalTopSplitByType'), titreUnique: await visible('GlobalRowTitle') };
await page.evaluate(() => {
  const s = document.querySelector('#GlobalTopMediaKind');
  s.value = 'Both';
  s.dispatchEvent(new Event('change'));
});
separation.lesDeux = { caseVisible: await visible('GlobalTopSplitByType'), titreUnique: await visible('GlobalRowTitle') };
await cocher('GlobalTopSplitByType', true);
separation.separees = {
  titreUnique: await visible('GlobalRowTitle'),
  films: await visible('GlobalMoviesRowTitle') && await actif('GlobalMoviesRowTitle'),
  series: await visible('GlobalSeriesRowTitle') && await actif('GlobalSeriesRowTitle')
};
await cocher('GlobalTopSplitByType', false);

// Cocher une rangee dans la liste revele ses reglages, et ses minimums dans le pli.
await cocher('EnableGenreRows', true);
const genresCoches = {
  bloc: await visible('groupGenre'),
  champ: await actif('GenreRowCount'),
};
await cocher('EnableGenreRows', false);
const genresDecoches = { bloc: await visible('groupGenre') };

// Le bloc du Top du serveur sert aussi a « de tous les temps ».
await cocher('EnableLocalTop', false);
const sansTop = { bloc: await visible('groupLocal') };
await cocher('EnableAllTimeRow', true);
const toujoursSeul = {
  bloc: await visible('groupLocal'),
  taille: await visible('LocalTopSize') || await actif('LocalTopSize'),
  types: await actif('LocalTopMediaKind'),
  toujours: await visible('AllTimeRowSize') && await actif('AllTimeRowSize')
};
await cocher('EnableLocalTop', true);
await cocher('EnableAllTimeRow', false);

// Descendre la premiere rangee : la liste n'est pas reconstruite, la case suit sa rangee.
await page.evaluate(() => {
  // On marque les noeuds : un reordonnancement ne doit pas reconstruire la liste.
  // La reconstruction faisait clignoter l'affichage a chaque clic et detruisait le
  // noeud portant le focus, d'ou le saut de la page.
  document.querySelectorAll('#mcRowOrder li').forEach((li, i) => { li.__marque = i; });
  window.__caseLocal = document.querySelector('#EnableLocalTop');
  document.querySelector('#mcRowOrder li:first-child .mcCfg-order-down').click();
});
const reordered = await page.evaluate(() => ({
  value: document.querySelector('#RowOrder').value,
  names: Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-name')).map(e => e.textContent),
  focusStillOnArrow: document.activeElement.className.indexOf('mcCfg-order-down') !== -1,
  noeudsPreserves: Array.from(document.querySelectorAll('#mcRowOrder li'))
    .every(li => typeof li.__marque === 'number'),
  marques: Array.from(document.querySelectorAll('#mcRowOrder li')).map(li => li.__marque).slice(0, 2)
}));

// Cocher la gestion des natives : la liste doit s'etendre sans bousculer nos rangees.
await cocher('ManageNativeSections', true);
const withNatives = await page.evaluate(() => {
  const names = Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-name')).map(e => e.textContent);
  return {
    count: names.length,
    names: names,
    natives: names.filter(n => n.indexOf('Jellyfin — ') === 0).sort(),
    plugins: names.filter(n => n.indexOf('Jellyfin — ') !== 0),
    sansCase: Array.from(document.querySelectorAll('#mcRowOrder li'))
      .filter(li => li.dataset.row.indexOf('native:') === 0)
      .every(li => !li.querySelector('input'))
  };
});

await cocher('ManageNativeSections', false);
const withoutNatives = await page.evaluate(() => ({
  count: document.querySelectorAll('#mcRowOrder .mcCfg-order-name').length,
  // Les cases des rangees ont survecu aux deux rendus : meme noeud, meme etat.
  memeCase: document.querySelector('#EnableLocalTop') === window.__caseLocal
    && document.querySelector('#EnableLocalTop').checked === true
}));

// Enregistrement : les champs d'un bloc masque doivent tout de meme etre sauvegardes.
await page.evaluate(() => {
  document.querySelector('#LocalTopSize').value = '15';
  document.querySelector('#NeverPlayedMinRating').value = '8.2';
  document.querySelector('#ExcludedUserIds').value = 'aaa\nccc, ddd';
  document.querySelector('#mediaCarouselConfigForm').dispatchEvent(new Event('submit', { cancelable: true }));
});
await page.waitForFunction(() => window.__saved !== null, { timeout: 5000 });
const saved = await page.evaluate(() => window.__saved);
const feedbackAfterSave = await page.evaluate(() => document.querySelector('#mcFeedback').textContent);

// RECALCUL — constate en prod le 2026-09-28 : une case cochee puis « Recalculer
// maintenant » presse, sans « Enregistrer », recalculait avec l'ancien reglage.
await page.evaluate(() => {
  window.__saved = null;
  document.querySelector('#GlobalTopSplitByType').checked = true;
  document.querySelector('#refreshNowButton').click();
});
await page.waitForTimeout(300);
const refresh = await page.evaluate(() => ({
  calls: window.__refreshCalls,
  feedback: document.querySelector('#mcFeedback').textContent,
  enregistreAvant: !!window.__saved && window.__saved.GlobalTopSplitByType === true
}));

// INVALIDE — un nombre vide dans le pli ferme : le navigateur refusait l'envoi sans pouvoir
// montrer l'erreur. Le pli s'ouvre, et rien n'est enregistre ni recalcule.
await page.evaluate(() => {
  window.__saved = null;
  document.querySelector('#advancedSettings').open = false;
  document.querySelector('#MaxPlaysCountedPerUser').value = '';
  document.querySelector('#refreshNowButton').click();
});
await page.waitForTimeout(300);
const invalide = await page.evaluate(() => ({
  pliOuvert: document.querySelector('#advancedSettings').open,
  enregistre: window.__saved !== null,
  recalculs: window.__refreshCalls
}));
await page.evaluate(() => { document.querySelector('#MaxPlaysCountedPerUser').value = '3'; });

// Second passage : le Top mondial a echoue au dernier recalcul, et Playback Reporting
// est installe. addInitScript et non evaluate : le rechargement remet le contexte JS a
// zero, seul un script d'initialisation survit a la navigation.
await page.addInitScript(() => {
  window.__playback = true;
  window.__lastRun = {
    StartedUtc: '2026-08-27T03:00:00Z',
    DurationSeconds: 8.1,
    Running: false,
    Failures: [{ Section: 'Top mondial', Message: 'TMDB a répondu 401 : clé d’API invalide.' }]
  };
});
await page.reload();
await page.evaluate(() => {
  document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow'));
});
await page.waitForFunction(() => document.querySelectorAll('.mcCfg-tile').length === 4, { timeout: 5000 });
const failedRun = await page.evaluate(() => ({
  state: document.querySelector('#mcRun').dataset.state,
  value: document.querySelector('#mcRunValue').textContent,
  detail: document.querySelector('#mcRunDetail').textContent
}));
const activiteAvecPlayback = await page.evaluate(() => {
  const t = document.querySelector('.mcCfg-tile');
  return {
    state: t.dataset.state,
    name: t.querySelector('.mcCfg-tile-name').textContent,
    value: t.querySelector('.mcCfg-tile-value').textContent,
    detail: t.querySelector('.mcCfg-tile-detail').textContent
  };
});

// PLAYBACK — avec Playback Reporting, le Top du serveur sur une periode ne compte que les
// vraies lectures : les reglages du comptage par nombre de lectures n'y font rien.
const comptage = { avecPlayback: await visible('groupPlayCount') };
await page.evaluate(() => {
  const input = document.querySelector('#LocalTopWindowDays');
  input.value = '0';
  input.dispatchEvent(new Event('input'));
});
comptage.depuisToujours = await visible('groupPlayCount') && await actif('MaxPlaysCountedPerUser');
await page.evaluate(() => {
  const input = document.querySelector('#LocalTopWindowDays');
  input.value = '30';
  input.dispatchEvent(new Event('input'));
});
comptage.retourPeriode = await visible('groupPlayCount');
await cocher('EnableAllTimeRow', true);
comptage.deTousLesTemps = await visible('groupPlayCount');
await cocher('EnableAllTimeRow', false);

// RETOUR — jellyfin-web reaffiche la meme page, gardee en cache, quand on y revient :
// `pageshow` repart. Chaque ecouteur pose a l'affichage l'etait une fois de plus, et
// « Descendre » faisait reculer la rangee de deux places.
await page.evaluate(() => {
  document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow'));
});
await page.waitForTimeout(300);
const ordreRangees = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-name')).map(e => e.textContent));
const ordreAvantClic = await ordreRangees();
await page.evaluate(() => document.querySelector('#mcRowOrder li .mcCfg-order-down').click());
const ordreApresClic = await ordreRangees();

// JELLYFIN ENHANCED — idees reprises le 2026-10-25 : aide masquable, recherche, chiffres qui
// menent a leur reglage, remise de tous les comptes aux reglages du serveur. Et la barre
// d'enregistrement de XFusion, visible seulement quand un reglage attend.
const idees = await page.evaluate(async () => {
  const q = (s) => document.querySelector(s);
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const visibleEl = (el) => !!el && el.getClientRects().length > 0;
  const r = {};
  // Un nouvel affichage de la page repart sans modification en attente.
  document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow'));
  await pause(400);
  r.barreAuChargement = q('#mcSaveBar').classList.contains('is-visible');
  const taille = q('#LocalTopSize');
  taille.value = '11';
  taille.dispatchEvent(new Event('input', { bubbles: true }));
  r.barreApresModif = q('#mcSaveBar').classList.contains('is-visible');

  q('#mcHintsToggle').click();
  r.aideMasquee = !visibleEl(q('#hintWindow')) && q('#mcHintsToggle').getAttribute('aria-pressed') === 'false';
  r.resultatSeerrGarde = !document.querySelector('#mediaCarouselConfigPage').classList.contains('mcCfg-nohints')
    || getComputedStyle(q('#seerrTestResult')).display !== 'none';
  q('#mcHintsToggle').click();
  r.aideRevenue = visibleEl(q('#hintWindow'));

  q('#advancedSettings').open = false;
  q('#mcStatus').children[3].click();
  await pause(50);
  r.chiffreMeneAuReglage = document.activeElement && document.activeElement.id;

  window.__suppressions = [];
  const ajaxAvant = ApiClient.ajax;
  ApiClient.ajax = (req) => {
    if (req.type === 'DELETE') { window.__suppressions.push(req.url); return Promise.resolve(2); }
    return ajaxAvant(req);
  };
  q('#mcResetAll').click();
  r.confirmation = q('#mcResetAllLabel').textContent;
  r.rienAvantConfirmation = window.__suppressions.length;
  q('#mcResetAll').click();
  await pause(100);
  r.suppressions = window.__suppressions.slice();
  r.resultat = q('#mcResetAllResult').textContent;
  ApiClient.ajax = ajaxAvant;

  q('#mediaCarouselConfigForm').dispatchEvent(new Event('submit', { cancelable: true }));
  await pause(200);
  r.barreApresEnregistrement = q('#mcSaveBar').classList.contains('is-visible');
  return r;
});

// INTERRUPTEUR — retire de la page le 2026-10-25 : un serveur qui l'avait coupe doit le voir,
// sinon ses rangees resteraient masquees sans aucun moyen de les rallumer.
const interrupteur = await page.evaluate(async () => {
  const q = (s) => document.querySelector(s);
  const vu = (el) => el.getClientRects().length > 0;
  const r = { caseVisible: vu(q('#EnableHomeRows')), alerteCachee: !vu(q('#mcRowsOff')) };
  const cb = q('#EnableHomeRows');
  cb.checked = false;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
  r.coupeAnnonce = vu(q('#mcRowsOff'));
  q('#mcRowsOn').click();
  await new Promise(res => setTimeout(res, 50));
  r.rallume = q('#EnableHomeRows').checked;
  r.alerteApres = !vu(q('#mcRowsOff'));
  return r;
});

// SEERR — les reglages de la demande des titres absents, sur une page a part : le Top
// mondial y est active, et sa case « titres presents » cochee, comme a l'installation.
const seerrPage = await browser.newPage({ viewport: { width: 1100, height: 900 }, locale: 'fr-FR' });
seerrPage.on('pageerror', e => errors.push('pageerror(seerr): ' + e.message));
seerrPage.on('console', m => { if (m.type() === 'error') errors.push('console(seerr): ' + m.text()); });
await seerrPage.addInitScript(() => {
  window.__saved = null;
  window.__essais = [];
  window.__reponseEssai = { Ok: true, Error: null };
  window.__config = {
    RowOrder: '', EnableLocalTop: true, LocalTopSize: 10, LocalTopMediaKind: 'Both', LocalTopWindowDays: 30,
    MaxPlaysCountedPerUser: 3, CandidatesPerUser: 100, ExcludedUserIds: [], ExcludedLibraryIds: [],
    EnableGlobalTop: true, GlobalTopProvider: 'Tmdb', GlobalTopApiKey: 'cle-tmdb', GlobalTopMediaKind: 'Both',
    GlobalTopSize: 10, GlobalTopLibraryOnly: true, MetadataLanguage: 'fr-FR',
    EnableSeerrRequests: false, SeerrUrl: '', SeerrApiKey: '', SeerrAdvancedRequests: false,
    EnableHomeRows: true, LocalRowTitle: 'Top 10 sur ce serveur', GlobalRowTitle: 'Top 10 mondial',
    HighlightColor: '#775BF4', RefreshIntervalHours: 6, SyncCollections: false,
    LocalCollectionName: 'Top 10 du serveur', GlobalCollectionName: 'Top 10 mondial'
  };
  window.ApiClient = {
    getUrl: (p) => p,
    getPluginConfiguration: () => Promise.resolve(JSON.parse(JSON.stringify(window.__config))),
    updatePluginConfiguration: (id, c) => { window.__saved = c; return Promise.resolve({}); },
    getJSON: () => Promise.resolve({
      Version: '3.15.0.0',
      LocalTop: { Enabled: true, Count: 10, Source: 'Jellyfin', GeneratedUtc: '2026-09-26T03:00:00Z' },
      GlobalTop: { Enabled: true, Count: 10, Source: 'Tmdb', GeneratedUtc: '2026-09-26T03:00:00Z' },
      ReturningSeries: { Enabled: false, Count: 0, Source: 'Jellyfin', GeneratedUtc: null },
      NeverPlayed: { Enabled: false, Count: 0, Source: 'Jellyfin', GeneratedUtc: null },
      Studios: { Enabled: false, Count: 0, Source: 'Jellyfin', GeneratedUtc: null },
      Genres: { Enabled: false, Count: 0, Source: 'Jellyfin', GeneratedUtc: null },
      LastRun: { StartedUtc: '2026-09-26T03:00:00Z', DurationSeconds: 3, Running: false, Failures: [] },
      PlaybackReporting: true, FileTransformation: true, Activity: null,
      GlobalInLibrary: 11, GlobalTotal: 20, CustomizedAccounts: 0, Accounts: 3
    }),
    ajax: (req) => {
      if (req.url.indexOf('Seerr/Test') !== -1) {
        window.__essais.push({ type: req.type, corps: JSON.parse(req.data), dataType: req.dataType });
        return Promise.resolve(window.__reponseEssai);
      }
      return Promise.resolve({});
    }
  };
  window.Dashboard = {
    showLoadingMsg() {}, hideLoadingMsg() {},
    processPluginConfigurationUpdateResult() {}, alert() {}
  };
});
await seerrPage.goto('file://' + path.join(repo, 'Configuration', 'configPage.html'));
const afficherPage = () => seerrPage.evaluate(() => {
  document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow'));
});
await afficherPage();
await seerrPage.waitForFunction(() => document.querySelectorAll('.mcCfg-tile').length === 4, { timeout: 5000 });

const etatSeerrCfg = () => seerrPage.evaluate(() => ({
  groupe: document.querySelector('#groupSeerr').closest('[hidden]') === null,
  champs: !document.querySelector('#SeerrUrl').disabled && !document.querySelector('#SeerrApiKey').disabled
    && !document.querySelector('#seerrTestButton').disabled && !document.querySelector('#SeerrAdvancedRequests').disabled,
  alerte: document.querySelector('#mcSeerrAlert').closest('[hidden]') === null,
  blocEteint: document.querySelector('#blockSeerr').hidden
}));
const cocherSeerr = cocherSur(seerrPage);

const chiffresSeerr = () => seerrPage.evaluate(() => ({
  tuiles: Array.from(document.querySelectorAll('.mcCfg-tile')).map(t => t.dataset.state + ':'
    + t.querySelector('.mcCfg-tile-value').textContent + ':' + t.querySelector('.mcCfg-tile-detail').textContent),
  seerr: (Array.from(document.querySelectorAll('#mcHealth .mcCfg-chip')).find(c => /Seerr/.test(c.textContent)) || {}).dataset
}));
const chiffresAuChargement = await chiffresSeerr();
const seerrAuChargement = await etatSeerrCfg();
await cocherSeerr('EnableSeerrRequests', true);
const seerrCoche = await etatSeerrCfg();
await cocherSeerr('GlobalTopLibraryOnly', false);
const seerrSansFiltre = await etatSeerrCfg();
const chiffresSansFiltre = await chiffresSeerr();
await cocherSeerr('EnableGlobalTop', false);
const seerrSousTopEteint = await etatSeerrCfg();
await cocherSeerr('EnableGlobalTop', true);
const seerrTopRallume = await etatSeerrCfg();
// Le piege du groupe imbrique : rallumer le Top mondial ne doit pas rallumer un Seerr decoche.
await cocherSeerr('EnableSeerrRequests', false);
await cocherSeerr('EnableGlobalTop', false);
await cocherSeerr('EnableGlobalTop', true);
const seerrResteEteint = await etatSeerrCfg();
await cocherSeerr('EnableSeerrRequests', true);

// Essai de connexion : il part avec les valeurs SAISIES, avant tout enregistrement.
await seerrPage.evaluate(() => {
  document.querySelector('#SeerrUrl').value = 'http://seerr.local:5055/';
  document.querySelector('#SeerrApiKey').value = 'cle-seerr-de-test';
  document.querySelector('#seerrTestButton').click();
});
await seerrPage.waitForFunction(() => /réussie/.test(document.querySelector('#seerrTestResult').textContent));
const essaiReussi = await seerrPage.evaluate(() => ({
  essais: window.__essais.slice(),
  message: document.querySelector('#seerrTestResult').textContent
}));
await seerrPage.evaluate(() => {
  window.__reponseEssai = { Ok: false, Error: 'unauthorized' };
  document.querySelector('#seerrTestButton').click();
});
await seerrPage.waitForFunction(() => /refuse/.test(document.querySelector('#seerrTestResult').textContent));
const essaiRefuse = await seerrPage.evaluate(() => document.querySelector('#seerrTestResult').textContent);

// jellyfin-web rejoue `pageshow` a chaque retour sur la page : un clic, un seul essai.
await afficherPage();
await seerrPage.waitForTimeout(200);
const essaisAvant = await seerrPage.evaluate(() => window.__essais.length);
await seerrPage.evaluate(() => {
  document.querySelector('#SeerrUrl').value = 'http://seerr.local:5055';
  document.querySelector('#SeerrApiKey').value = 'cle-seerr-de-test';
  document.querySelector('#EnableSeerrRequests').checked = true;
  document.querySelector('#EnableSeerrRequests').dispatchEvent(new Event('change'));
  document.querySelector('#SeerrAdvancedRequests').checked = true;
  document.querySelector('#seerrTestButton').click();
});
await seerrPage.waitForTimeout(300);
const essaisApresRetour = await seerrPage.evaluate(() => window.__essais.length) - essaisAvant;

await seerrPage.evaluate(() => {
  document.querySelector('#mediaCarouselConfigForm').dispatchEvent(new Event('submit', { cancelable: true }));
});
await seerrPage.waitForFunction(() => window.__saved !== null, { timeout: 5000 });
const seerrEnregistre = await seerrPage.evaluate(() => ({
  active: window.__saved.EnableSeerrRequests,
  adresse: window.__saved.SeerrUrl,
  cle: window.__saved.SeerrApiKey,
  avancees: window.__saved.SeerrAdvancedRequests,
  typeCle: document.querySelector('#SeerrApiKey').type
}));
await cocherSeerr('GlobalTopLibraryOnly', false);
const chiffresSeerrPret = await chiffresSeerr();
await seerrPage.close();

// ANGLAIS — un compte regle en anglais (ou un navigateur anglais) a toute la page en anglais.
const enPage = await browser.newPage({ viewport: { width: 1100, height: 900 }, locale: 'en-US' });
enPage.on('pageerror', e => errors.push('pageerror(en): ' + e.message));
await enPage.addInitScript(() => {
  window.__config = { RowOrder: '', EnableLocalTop: true, LocalTopWindowDays: 7, ManageNativeSections: true,
    EnableHomeRows: true, AllowUserPreferences: false, RefreshIntervalHours: 6,
    HighlightColor: '#abc', GlobalTopSize: 12, ExcludedUserIds: ['U1', 'zzz'], ExcludedLibraryIds: [] };
  window.__saved = null;
  window.ApiClient = {
    getUrl: (p) => p,
    getCurrentUserId: () => 'u1',
    getPluginConfiguration: () => Promise.resolve(JSON.parse(JSON.stringify(window.__config))),
    updatePluginConfiguration: (id, c) => { window.__saved = c; return Promise.resolve({}); },
    getJSON: (url) => url === 'Users' ? Promise.resolve([{ Id: 'u1', Name: 'Elie' }, { Id: 'u2', Name: 'Invite' }])
      : url === 'Library/VirtualFolders' ? Promise.resolve([{ ItemId: 'l1', Name: 'Films' }])
      : Promise.resolve({
      Version: '4.5.0.0', PlaybackReporting: true, FileTransformation: true,
      Activity: { Viewers: 1, Views: 1, Hours: 2.5, WindowDays: 7 },
      LocalTop: { Enabled: true, Count: 10, Source: 'PlaybackReporting', GeneratedUtc: new Date(Date.now() - 7200000).toISOString() },
      LastRun: { StartedUtc: new Date(Date.now() - 7200000).toISOString(), DurationSeconds: 0.4, Running: false, Failures: [] },
      CustomizedAccounts: 0, Accounts: 2
    }),
    ajax: () => Promise.resolve({})
  };
  window.Dashboard = { showLoadingMsg() {}, hideLoadingMsg() {}, processPluginConfigurationUpdateResult() {} };
});
await enPage.goto('file://' + path.join(repo, 'Configuration', 'configPage.html'));
await enPage.evaluate(() => document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow')));
await enPage.waitForFunction(() => document.querySelectorAll('.mcCfg-tile').length === 4, { timeout: 5000 });
const anglais = await enPage.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const t = document.querySelector('.mcCfg-tile');
  return {
    langue: q('#mediaCarouselConfigPage').getAttribute('lang'),
    legends: Array.from(document.querySelectorAll('.mcCfg-group > legend > span:first-child')).map(l => l.textContent),
    doublon: (() => {
      const set = (id, v) => { const e = q('#' + id); if (e.type === 'checkbox') { e.checked = v; } else { e.value = v; } e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
      set('EnableGlobalTop', true); set('SyncCollections', true);
      set('GlobalRowTitle', 'Same'); set('GlobalCollectionName', 'Same');
      const texte = q('#mcDuplicateAlert').textContent;
      set('SyncCollections', false); set('EnableGlobalTop', false);
      return texte;
    })(),
    natives: Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-native')).map(e => e.textContent),
    fleche: q('#mcRowOrder li .mcCfg-order-down').getAttribute('aria-label'),
    libelle: q('#LocalTopWindowDays').getAttribute('label'),
    activite: t.querySelector('.mcCfg-tile-name').textContent + '|' + t.querySelector('.mcCfg-tile-value').textContent
      + '|' + t.querySelector('.mcCfg-tile-detail').textContent,
    calcul: q('#mcRunValue').textContent + '|' + q('#mcRunDetail').textContent,
    clesManquantes: Array.from(document.querySelectorAll('[data-i18n]'))
      .filter(e => e.textContent === e.getAttribute('data-i18n') || !e.textContent.trim()).map(e => e.getAttribute('data-i18n')),
    texteFrancais: (q('#mediaCarouselConfigPage').innerText.match(/.{0,30}(Rangées|Enregistrer|Réglages|Période).{0,30}/) || [''])[0]
  };
});
// EXCLUSIONS — des cases, plus des identifiants a taper ; un identifiant perdu reste visible.
await enPage.waitForFunction(() => !document.querySelector('#mcPickUsers').hidden, { timeout: 3000 }).catch(() => {});
const exclusions = await enPage.evaluate(() => {
  const avant = Array.from(document.querySelectorAll('#mcPickUsers label')).map(l =>
    l.textContent + (l.querySelector('input').checked ? '+' : '-'));
  const invite = document.querySelector('#mcPickUsers input[data-pick="u2"]');
  invite.checked = true;
  invite.dispatchEvent(new Event('change', { bubbles: true }));
  return {
    avant,
    texteCache: document.querySelector('#mcRawUsers').hidden,
    valeur: document.querySelector('#ExcludedUserIds').value,
    bibliotheques: Array.from(document.querySelectorAll('#mcPickLibraries label')).map(l => l.textContent)
  };
});
// COULEUR — « #abc » se chargeait en noir dans le champ couleur, et s'enregistrait ainsi.
const couleurCourte = await enPage.evaluate(() => document.querySelector('#HighlightColor').value);
// VIDE — un nombre vide dans un bloc masque gardait zero a l'enregistrement.
await enPage.evaluate(() => {
  document.querySelector('#GlobalTopSize').value = '';
  document.querySelector('#mediaCarouselConfigForm').dispatchEvent(new Event('submit', { cancelable: true }));
});
await enPage.waitForFunction(() => window.__saved !== null, { timeout: 3000 });
const nombreVide = await enPage.evaluate(() => ({
  taille: window.__saved.GlobalTopSize,
  exclus: window.__saved.ExcludedUserIds,
  retour: document.querySelector('#mcFeedback').textContent
}));

// La langue d'affichage de Jellyfin prime sur celle du navigateur.
await enPage.evaluate(() => {
  localStorage.setItem('u1-language', 'fr-FR');
  document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow'));
});
await enPage.waitForTimeout(300);
const basculeFr = await enPage.evaluate(() => ({
  langue: document.querySelector('#mediaCarouselConfigPage').getAttribute('lang'),
  legende: document.querySelector('.mcCfg-group > legend > span').textContent,
  native: document.querySelector('#mcRowOrder .mcCfg-order-native').textContent
}));
await enPage.evaluate(() => localStorage.removeItem('u1-language'));
await enPage.close();

// TELEPHONE 12.1 — releve en prod le 2026-09-28 : jellyfin-web 12.1 met `.checkboxContainer`
// en ligne et fixe la hauteur du libelle. Sur un telephone, le libelle serre sur six lignes
// debordait sur le texte du dessus. Le banc charge les regles de jellyfin-web concernees.
// Les cases de la liste des rangees sont mesurees elles aussi.
await page.setViewportSize({ width: 375, height: 812 });
await page.addStyleTag({ path: path.join(repo, 'tests', 'browser', 'jellyfin-checkbox.css') });
const telephone = await page.evaluate(async () => {
  document.querySelectorAll('#mediaCarouselConfigPage details').forEach((d) => { d.open = true; });
  await new Promise((r) => setTimeout(r, 50));
  const aCote = [];
  const debordes = [];
  let cases = 0;
  for (const label of document.querySelectorAll('#mediaCarouselConfigPage .emby-checkbox-label')) {
    if (!label.getBoundingClientRect().height) continue;
    cases++;
    const texte = label.querySelector('span');
    const l = label.getBoundingClientRect();
    const t = texte.getBoundingClientRect();
    if (t.top < l.top - 1 || t.bottom > l.bottom + 1) debordes.push(texte.textContent.trim().slice(0, 40));
    const boite = label.closest('div.checkboxContainer');
    const aide = boite && boite.querySelector('.fieldDescription');
    if (aide && aide.getBoundingClientRect().height && aide.getBoundingClientRect().top < l.bottom - 1) {
      aCote.push(texte.textContent.trim().slice(0, 40));
    }
  }
  // Aucune ligne de la liste ne deborde de la largeur de l'ecran.
  const largeur = document.documentElement.clientWidth;
  const lignesTropLarges = Array.from(document.querySelectorAll('#mcRowOrder li'))
    .filter(li => li.getBoundingClientRect().right > largeur + 1).length;
  return { cases, aCote, debordes, lignesTropLarges };
});

// FLECHES — vu sur le Jellyfin du PC le 2026-10-25 : jellyfin-web met ses boutons en flex sans
// centrage horizontal, la fleche se collait au bord gauche de sa case.
const flechesCentrees = await page.evaluate(() => Array.from(document.querySelectorAll('#mcRowOrder button'))
  .every(b => getComputedStyle(b).justifyContent === 'center' && getComputedStyle(b).alignItems === 'center'));

// MISE EN PAGE — revue sur le Jellyfin du PC le 2026-10-25, sur une page a part en largeur de bureau.
const mise = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
await mise.addInitScript(() => {
  window.ApiClient = {
    getUrl: (p) => p,
    getPluginConfiguration: () => Promise.resolve({ RowOrder: '', EnableLocalTop: true, LocalTopWindowDays: 0,
      LocalTopSize: 10, LocalTopMediaKind: 'Both', MaxPlaysCountedPerUser: 3, EnableHomeRows: true,
      AllowUserPreferences: true, HighlightColor: '#775BF4', RankNumberScale: 100 }),
    updatePluginConfiguration: () => Promise.resolve({}),
    getJSON: (url) => url.includes('Status')
      ? Promise.resolve({ Version: '4.5.0.0', PlaybackReporting: false, CustomizedAccounts: 0, Accounts: 2, LastRun: {} })
      : Promise.reject(new Error('absent')),
    ajax: () => Promise.resolve({})
  };
  window.Dashboard = { showLoadingMsg() {}, hideLoadingMsg() {}, processPluginConfigurationUpdateResult() {} };
});
await mise.goto('file://' + path.join(repo, 'Configuration', 'configPage.html'));
await mise.evaluate(() => document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow')));
await mise.waitForFunction(() => document.querySelectorAll('.mcCfg-tile').length === 4, { timeout: 5000 });
const miseEnPage = await mise.evaluate(() => {
  document.querySelector('#advancedSettings').open = true;
  const carte = document.querySelector('#advancedSettings').getBoundingClientRect().width;
  const seul = document.querySelector('#MaxPlaysCountedPerUser').getBoundingClientRect().width;
  const tops = Array.from(document.querySelectorAll('#groupLocal .mcCfg-grid-4 > *'))
    .filter(e => e.getClientRects().length).map(e => Math.round(e.getBoundingClientRect().top));
  return {
    carte: Math.round(carte), champSeul: Math.round(seul),
    lignesTopServeur: new Set(tops).size,
    couleur: Math.round(document.querySelector('#HighlightColor').getBoundingClientRect().width),
    boutonSansCompte: document.querySelector('#mcResetAll').getClientRects().length > 0
  };
});
await mise.close();

await browser.close();

let failed = 0;
const check = (name, ok, got) => { console.log((ok ? 'OK    ' : 'ECHEC ') + name + (ok ? '' : '  -> ' + JSON.stringify(got))); if (!ok) failed++; };

check('version affichee', loaded.version === 'v3.0.1.0', loaded.version);
check('CHIFFRES: 4 chiffres cles', loaded.tiles.length === 4, loaded.tiles.length);
check('CALCUL: dernier calcul en temps relatif', loaded.run.state === 'ok'
  && /il y a|instant/.test(loaded.run.value), loaded.run);
check('CALCUL: le prochain calcul est annonce', /prochain dans 4 h/.test(loaded.run.detail), loaded.run.detail);
check('CHIFFRES: sans Playback Reporting, l activite le dit au lieu d un zero',
  loaded.tiles[0].state === 'off' && loaded.tiles[0].value === '—' && /Playback Reporting/.test(loaded.tiles[0].detail), loaded.tiles[0]);
check('CHIFFRES: avec Playback Reporting, comptes, visionnages et heures sur la periode',
  activiteAvecPlayback.name === 'Ont regardé (30 j)' && activiteAvecPlayback.value === '3'
    && /comptes · 5 visionnages · 97,2 h/.test(activiteAvecPlayback.detail), activiteAvecPlayback);
check('CHIFFRES: Top mondial et « a demander » eteints avec le Top mondial',
  loaded.tiles[1].state === 'off' && loaded.tiles[2].state === 'off', loaded.tiles.slice(1, 3));
check('CHIFFRES: comptes ayant personnalise leur accueil', loaded.tiles[3].value === '2 / 5', loaded.tiles[3]);
check('CHIFFRES: titres du Top mondial deja dans la bibliotheque',
  chiffresAuChargement.tuiles[1] === 'ok:11 / 20:titres dans la bibliothèque', chiffresAuChargement.tuiles);
check('CHIFFRES: « a demander » masque quand seuls les titres presents sont gardes',
  /^off:—:seuls les titres présents/.test(chiffresAuChargement.tuiles[2]), chiffresAuChargement.tuiles);
check('CHIFFRES: sans ce filtre, les 9 absents sont a demander',
  /^pending:9:absents/.test(chiffresSansFiltre.tuiles[2]), chiffresSansFiltre.tuiles);
check('CHIFFRES: Seerr pret, les absents se demandent via Seerr',
  /^ok:9:.*Seerr/.test(chiffresSeerrPret.tuiles[2]) && chiffresSeerrPret.seerr.state === 'ok', chiffresSeerrPret);
check('SANTE: quatre services, File Transformation absent signale',
  loaded.chips.length === 4 && loaded.chips[0].indexOf('off') === 0 && /^warn:.*File Transformation/.test(loaded.chips[3]),
  loaded.chips);
check('SANTE: la cle du Top mondial eteint n est pas une alerte', loaded.chips[1].indexOf('off') === 0, loaded.chips[1]);
check('RANGEES: le compteur des rangees actives', loaded.activeRows === '4 / 8 actives', loaded.activeRows);
check('LANGUE: page en francais, aucun texte manquant',
  loaded.langue === 'fr' && loaded.clesManquantes.length === 0 && loaded.libellesVides.length === 0,
  [loaded.langue, loaded.clesManquantes, loaded.libellesVides]);
check('LANGUE: en anglais, aucun texte manquant ni reste en francais',
  anglais.langue === 'en' && anglais.clesManquantes.length === 0 && anglais.texteFrancais === '', anglais);
check('LANGUE: les cinq blocs en anglais',
  anglais.legends.join('|') === 'Home rows|Server Top|Worldwide Top|Seerr|Appearance', anglais.legends);
check('LANGUE: les sections de Jellyfin sous leur nom anglais (en-us.json)',
  anglais.natives[0] === 'Jellyfin — My Media' && anglais.natives.indexOf('Jellyfin — Next Up') !== -1, anglais.natives);
check('LANGUE: fleches et libelles des champs traduits',
  /^Move down: /.test(anglais.fleche) && anglais.libelle === 'Period (days)', [anglais.fleche, anglais.libelle]);
check('LANGUE: chiffres en anglais, singulier compris',
  anglais.activite === 'Watched this week|1|account · 1 view · 2.5 h', anglais.activite);
check('LANGUE: calcul en anglais', /^Last refresh: 2 h ago\|.*under a second/.test(anglais.calcul), anglais.calcul);
check('EXCLUSIONS: les comptes se cochent, un identifiant perdu reste coche et nomme',
  exclusions.avant.join('|') === 'Elie+|Invite-|Not found: zzz+' && exclusions.texteCache === true, exclusions);
check('EXCLUSIONS: cocher un compte reecrit la liste enregistree', exclusions.valeur === 'u1\nu2\nzzz', exclusions.valeur);
check('EXCLUSIONS: les bibliotheques aussi', exclusions.bibliotheques.join('|') === 'Films', exclusions.bibliotheques);
check('EXCLUSIONS: sans liste lisible, la zone de texte reste', loaded.texteBrutVisible === true, loaded.texteBrutVisible);
check('EXCLUSIONS: et les comptes coches sont enregistres', JSON.stringify(nombreVide.exclus) === '["u1","u2","zzz"]', nombreVide.exclus);
check('COULEUR: une couleur courte se charge en entier, pas en noir', couleurCourte === '#aabbcc', couleurCourte);
check('VIDE: un nombre vide d un bloc masque garde sa valeur', nombreVide.taille === 12, nombreVide.taille);
check('LANGUE: les guillemets suivent la langue', !/«/.test(anglais.doublon), anglais.doublon);
check('INTERRUPTEUR: plus de case generale, et rien n est annonce quand les rangees sont affichees',
  interrupteur.caseVisible === false && interrupteur.alerteCachee === true, interrupteur);
check('INTERRUPTEUR: coupe sur le serveur, la page l annonce et le bouton le rallume',
  interrupteur.coupeAnnonce === true && interrupteur.rallume === true && interrupteur.alerteApres === true, interrupteur);
check('BARRE: invisible au chargement, visible apres une modification',
  idees.barreAuChargement === false && idees.barreApresModif === true, idees);
check('BARRE: disparait une fois enregistre', idees.barreApresEnregistrement === false, idees);
check('AIDE: le bouton masque les explications, puis les rend', idees.aideMasquee && idees.aideRevenue, idees);
check('CHIFFRES: un clic sur un chiffre mene a son reglage', idees.chiffreMeneAuReglage === 'AllowUserPreferences', idees.chiffreMeneAuReglage);
check('COMPTES: la remise a zero demande une confirmation',
  /^Confirmer/.test(idees.confirmation) && idees.rienAvantConfirmation === 0, idees);
check('COMPTES: confirmee, elle efface les choix de tous les comptes',
  idees.suppressions.join() === 'MediaCarousel/UserPreferences/All' && /2 compte/.test(idees.resultat), idees);
check('LANGUE: la langue d affichage de Jellyfin prime sur le navigateur',
  basculeFr.langue === 'fr' && basculeFr.legende === 'Rangées de l\'accueil'
    && basculeFr.native === 'Jellyfin — Mes médias', basculeFr);
check('ECHEC SILENCIEUX: le bandeau du calcul passe en alerte', failedRun.state === 'warn', failedRun);
check('ECHEC SILENCIEUX: la section en echec est nommee',
  /Top mondial/.test(failedRun.value), failedRun.value);
check('ECHEC SILENCIEUX: le message de l erreur est affiche',
  /401/.test(failedRun.detail), failedRun.detail);
check('CALCUL: la duree mesuree est affichee', /12 s/.test(loaded.run.detail), loaded.run);
check('valeurs chargees', loaded.localSize === '10', loaded.localSize);
check('listes rendues ligne par ligne', loaded.excluded === 'aaa\nbbb', loaded.excluded);
check('cle d API masquee a l ecran', loaded.apiKeyType === 'password', loaded.apiKeyType);

// Structure de la page : celle qu'Elie a choisie le 2026-10-01.
check('PAGE: une seule page, sans onglet', loaded.onglets === 0, loaded.onglets);
check('PAGE: cinq blocs, dans l ordre',
  loaded.legends.join('|') === 'Rangées de l\'accueil|Top du serveur|Top mondial|Seerr|Apparence', loaded.legends);
check('PAGE: un seul pli « Reglages avances », ferme a l ouverture',
  loaded.plis === 1 && loaded.pliFerme === true, [loaded.plis, loaded.pliFerme]);
check('PAGE: la periode du Top du serveur est en vue, plus repliee', loaded.periodeVisible === true, loaded.periodeVisible);
check('PAGE: les exclusions sont dans le pli', loaded.exclusionsRepliees, loaded);
check('PAGE: les quatre options retirees ne sont plus sur la page', loaded.optionsRetirees.length === 0, loaded.optionsRetirees);
check('PAGE: leurs valeurs enregistrees restent intactes',
  saved.CandidatesPerUser === 100 && saved.RefreshIntervalHours === 6 && saved.MinItemsPerStudio === 3
    && saved.MetadataLanguage === 'fr-FR', saved);
check('PAGE: le bloc des televiseurs est retire (il vit dans le README)', loaded.blocTeleviseurs === false, loaded.blocTeleviseurs);
check('PAGE: au plus 320 mots d explication (il y en avait pres de 1 000)', loaded.mots <= 320, loaded.mots);

check('RANGEES: chaque rangee du plugin porte sa case dans la liste',
  loaded.casesDesRangees.join(',') === 'genres=EnableGenreRows-,alltime=EnableAllTimeRow-,global=EnableGlobalTop-,'
    + 'returning=EnableReturningRow+,neverplayed=EnableNeverPlayedRow+,local=EnableLocalTop+,'
    + 'studios=EnableStudioRow+,because=EnableBecauseRow-', loaded.casesDesRangees);
check('bloc inactif masque', loaded.globalHidden === true && loaded.genreHidden === true
  && loaded.seerrHidden === true, loaded);
check('bloc inactif hors parcours clavier', loaded.globalDisabled === true && loaded.genreDisabled === true, loaded);
check('bloc actif utilisable', loaded.localVisible === true, loaded.localVisible);
check('cocher le Top mondial revele son bloc et Seerr',
  afterToggle.bloc && afterToggle.cle && afterToggle.seerr, afterToggle);
check('SEPAREES: avec les films seuls, ni case ni second titre',
  separation.filmsSeuls.caseVisible === false && separation.filmsSeuls.titreUnique === true, separation.filmsSeuls);
check('SEPAREES: avec films et series, la case apparait',
  separation.lesDeux.caseVisible === true && separation.lesDeux.titreUnique === true, separation.lesDeux);
check('SEPAREES: cochee, un titre pour les films et un pour les series remplacent le titre unique',
  separation.separees.titreUnique === false && separation.separees.films && separation.separees.series,
  separation.separees);
check('RANGEES: cocher « par genre » revele ses reglages',
  genresCoches.bloc && genresCoches.champ, genresCoches);
check('RANGEES: la decocher les masque a nouveau',
  genresDecoches.bloc === false, genresDecoches);
check('TOP SERVEUR: sans le Top ni « de tous les temps », le bloc disparait', sansTop.bloc === false, sansTop);
check('TOP SERVEUR: « de tous les temps » seule garde le bloc, sans les champs du Top',
  toujoursSeul.bloc && !toujoursSeul.taille && toujoursSeul.types && toujoursSeul.toujours, toujoursSeul);
check('detail par section dans son bloc', loaded.sectionStates === 3
  && loaded.localSectionState.indexOf('Top du serveur') === 0, loaded.localSectionState);
check('detail des rangees : seules les rangees cochees sont citees',
  /De retour/.test(loaded.rowsSectionState) && !/Genres/.test(loaded.rowsSectionState), loaded.rowsSectionState);
check('aucun avertissement quand les collections sont desactivees',
  loaded.alertHiddenInitially === true, loaded.alertHiddenInitially);

check('DOUBLON: avertissement leve sur les valeurs par defaut',
  alertShown.visible && alertShown.text.indexOf('Top 10 mondial') >= 0, alertShown);
check('DOUBLON: le message nomme le classement concerne',
  alertShown.text.indexOf('Top mondial') >= 0, alertShown.text);
check('DOUBLON: il renvoie aux reglages avances, pas a un onglet',
  alertShown.text.indexOf('réglages avancés') >= 0 && alertShown.text.indexOf('onglet') === -1, alertShown.text);
check('DOUBLON: renommer la collection leve l avertissement', alertCleared === true, alertCleared);
check('DOUBLON: films et series separes, c est le titre des films qui est compare', doublonSepare === true, doublonSepare);
// Les entrees absentes sont reinserees a leur place par defaut, pas ajoutees a la
// fin : sans cela, activer la gestion des natives les ferait toutes basculer sous
// nos rangees, et une rangee nouvelle deplacerait la disposition de l'utilisateur.
check('ORDRE: les entrees absentes reviennent a leur place par defaut',
  loaded.rowOrderValue === 'genres,alltime,global,returning,neverplayed,local,studios,because',
  loaded.rowOrderValue);
check('ORDRE: les 8 rangees sont listees', loaded.rowOrderNames.length === 8, loaded.rowOrderNames);
check('ORDRE: l ordre configure est respecte a l affichage',
  loaded.rowOrderNames[0] === 'Par genre'
    && loaded.rowOrderNames[1] === 'Les plus regardés de tous les temps', loaded.rowOrderNames);
check('ORDRE: les rangs sont numerotes de 1 a 8',
  loaded.rowOrderRanks.join(',') === '1,2,3,4,5,6,7,8', loaded.rowOrderRanks);
check('ORDRE: on ne monte pas la premiere ni ne descend la derniere',
  loaded.firstUpDisabled === true && loaded.lastDownDisabled === true, loaded);
check('ORDRE: descendre echange bien les deux rangees',
  reordered.names[0] === 'Les plus regardés de tous les temps'
    && reordered.names[1] === 'Par genre', reordered.names);
check('ORDRE: le champ suit le deplacement',
  reordered.value.indexOf('alltime,genres') === 0, reordered.value);
check('ORDRE: la liste n est pas reconstruite a chaque deplacement',
  reordered.noeudsPreserves === true && JSON.stringify(reordered.marques) === '[1,0]',
  [reordered.noeudsPreserves, reordered.marques]);
check('ORDRE: le focus reste sur la rangee deplacee',
  reordered.focusStillOnArrow === true, reordered);
check('ORDRE: l ordre modifie est enregistre',
  saved.RowOrder.indexOf('alltime,genres') === 0, saved.RowOrder);

check('NATIF: la case etend la liste aux sections de Jellyfin',
  withNatives.count === 17, withNatives.count);
check('NATIF: les sections portent les noms de Jellyfin (fr.json)',
  withNatives.natives.join('|') === [
    'Jellyfin — Continuer de regarder',
    'Jellyfin — Enregistrements actifs',
    'Jellyfin — Mes médias',
    'Jellyfin — Mes médias (petit)',
    'Jellyfin — Médias récemment ajoutés',
    'Jellyfin — Reprendre l’écoute',
    'Jellyfin — Reprendre la lecture',
    'Jellyfin — TV en direct',
    'Jellyfin — À suivre'
  ].sort().join('|'), withNatives.natives);
check('NATIF: les sections de Jellyfin n ont pas de case', withNatives.sansCase === true, withNatives.sansCase);
check('NATIF: les bibliotheques arrivent en tete par defaut',
  withNatives.names[0] === 'Jellyfin — Mes médias', withNatives.names[0]);
check('NATIF: nos rangees gardent leur ordre relatif',
  withNatives.plugins.join(',') === reordered.names.join(','), withNatives.plugins);
check('NATIF: decocher revient aux seules rangees du plugin',
  withoutNatives.count === 8, withoutNatives.count);
check('NATIF: les cases des rangees survivent aux deux rendus', withoutNatives.memeCase === true, withoutNatives);

check('a11y: chaque aria-describedby pointe une cible', loaded.describedBy === true, loaded.describedBy);
check('aucun champ orphelin hors des tableaux de chargement',
  loaded.orphanFields.length === 0, loaded.orphanFields);
check('a11y: 5 regions live (avertissements, essai Seerr, retour, remise a zero), pas les chiffres relus a chaque frappe', loaded.liveRegions.length === 5
  && loaded.liveRegions.every(v => v === 'polite'), loaded.liveRegions);
check('a11y: un seul h1', loaded.h1 === 1, loaded.h1);
check('enregistrement : valeur modifiee', saved.LocalTopSize === 15, saved.LocalTopSize);
check('note chargee sans troncature', loaded.minRating === '7.5', loaded.minRating);
check('note enregistree en decimal', saved.NeverPlayedMinRating === 8.2, saved.NeverPlayedMinRating);
check('enregistrement : liste normalisee', JSON.stringify(saved.ExcludedUserIds) === JSON.stringify(['aaa','ccc','ddd']), saved.ExcludedUserIds);
check('enregistrement : champ d un bloc masque conserve', saved.MinItemsPerGenre === 5 && saved.GenreRowCount === 6,
  [saved.MinItemsPerGenre, saved.GenreRowCount]);
check('enregistrement : la cle d API est conservee', saved.GlobalTopApiKey === 'secret', saved.GlobalTopApiKey);
check('aucun champ du formulaire n est orphelin des tableaux',
  orphelins.length === 0, orphelins);
// Le contenu des plugins de chaine (XFusion, IPTV) est ecarte par defaut : la case doit
// etre relue puis reenregistree telle quelle, sans quoi une sauvegarde la remettrait a
// false et les catalogues IPTV reviendraient dans les rangees sans avertissement.
check('CHAINE: la case n est plus sur la page, mais le reglage reste actif a l enregistrement',
  saved.ExcludeChannelContent === true, saved.ExcludeChannelContent);
check('enregistrement : champ replie sous Reglages avances conserve',
  saved.CandidatesPerUser === 100 && JSON.stringify(saved.ExcludedLibraryIds) === '[]', saved.CandidatesPerUser);
check('retour utilisateur apres enregistrement', feedbackAfterSave.startsWith('Réglages enregistrés'), feedbackAfterSave);
check('recalcul declenche une seule requete', refresh.calls === 1, refresh.calls);
check('retour utilisateur apres recalcul', refresh.feedback.startsWith('Recalcul lancé en arrière-plan'), refresh.feedback);
check('RECALCUL: le bouton enregistre d abord la case cochee, sans « Enregistrer »',
  refresh.enregistreAvant === true, refresh);
check('INVALIDE: un champ vide du pli ferme ouvre le pli pour montrer l erreur', invalide.pliOuvert === true, invalide);
check('INVALIDE: rien n est enregistre ni recalcule', invalide.enregistre === false && invalide.recalculs === 1, invalide);

check('PLAYBACK: avec Playback Reporting, le comptage par nombre de lectures est masque',
  comptage.avecPlayback === false, comptage);
check('PLAYBACK: sauf avec une periode a 0, depuis toujours',
  comptage.depuisToujours === true && comptage.retourPeriode === false, comptage);
check('PLAYBACK: et pour « de tous les temps », qui le suit toujours', comptage.deTousLesTemps === true, comptage);
check('PLAYBACK: sans Playback Reporting, il est en vue', loaded.comptageVisible === true, loaded.comptageVisible);

check('SEERR: decoche, le groupe est masque et hors du parcours clavier',
  seerrAuChargement.groupe === false && seerrAuChargement.champs === false && seerrAuChargement.alerte === false,
  seerrAuChargement);
check('SEERR: coche, adresse, cle et essai deviennent utilisables',
  seerrCoche.groupe === true && seerrCoche.champs === true, seerrCoche);
check('SEERR: avec « titres presents » coche, l avertissement previent qu aucun bouton ne s affichera',
  seerrCoche.alerte === true, seerrCoche);
check('SEERR: decocher ce filtre leve l avertissement', seerrSansFiltre.alerte === false, seerrSansFiltre);
check('SEERR: sous un Top mondial eteint, le bloc Seerr disparait avec ses champs',
  seerrSousTopEteint.groupe === false && seerrSousTopEteint.champs === false
    && seerrSousTopEteint.blocEteint === true, seerrSousTopEteint);
check('SEERR: rallumer le Top mondial rend le groupe Seerr coche',
  seerrTopRallume.groupe === true && seerrTopRallume.champs === true, seerrTopRallume);
check('SEERR: mais ne rallume pas un Seerr decoche',
  seerrResteEteint.groupe === false && seerrResteEteint.champs === false, seerrResteEteint);
check('SEERR: l essai part en POST JSON avec les valeurs saisies',
  essaiReussi.essais.length === 1 && essaiReussi.essais[0].type === 'POST'
    && essaiReussi.essais[0].dataType === 'json'
    && essaiReussi.essais[0].corps.Url === 'http://seerr.local:5055/'
    && essaiReussi.essais[0].corps.ApiKey === 'cle-seerr-de-test', essaiReussi.essais);
check('SEERR: un essai reussi le dit', /Connexion réussie/.test(essaiReussi.message), essaiReussi.message);
check('SEERR: une cle refusee est nommee comme telle', /refuse cette clé/.test(essaiRefuse), essaiRefuse);
check('SEERR: apres un retour sur la page, un clic ne fait qu un essai', essaisApresRetour === 1, essaisApresRetour);
check('SEERR: activation, adresse et cle sont enregistrees',
  seerrEnregistre.active === true && seerrEnregistre.adresse === 'http://seerr.local:5055'
    && seerrEnregistre.cle === 'cle-seerr-de-test', seerrEnregistre);
check('SEERR: la cle est masquee a l ecran', seerrEnregistre.typeCle === 'password', seerrEnregistre.typeCle);
check('SEERR: les options avancees sont enregistrees', seerrEnregistre.avancees === true, seerrEnregistre.avancees);
check('RETOUR: apres un retour sur la page, « Descendre » ne recule la rangee que d une place',
  ordreApresClic[0] === ordreAvantClic[1] && ordreApresClic[1] === ordreAvantClic[0]
    && ordreApresClic[2] === ordreAvantClic[2], [ordreAvantClic.slice(0, 3), ordreApresClic.slice(0, 3)]);
check('TELEPHONE 12.1: chaque explication passe sous sa case, jamais a cote',
  telephone.aCote.length === 0 && telephone.cases > 10, telephone);
check('TELEPHONE 12.1: aucun libelle de case ne deborde sur le texte voisin',
  telephone.debordes.length === 0, telephone);
check('TELEPHONE 12.1: aucune ligne de la liste ne depasse l ecran', telephone.lignesTropLarges === 0, telephone);
check('FLECHES: centrees dans leur case', flechesCentrees === true, flechesCentrees);
check('MISE EN PAGE: un champ seul ne s etire pas sur toute la carte', miseEnPage.champSeul < miseEnPage.carte * 0.5, miseEnPage);
check('MISE EN PAGE: les quatre champs du Top du serveur tiennent sur une ligne', miseEnPage.lignesTopServeur === 1, miseEnPage);
check('MISE EN PAGE: la couleur est une pastille, pas une barre', miseEnPage.couleur <= 100, miseEnPage);
check('COMPTES: sans compte personnalise, pas de bouton de remise a zero', miseEnPage.boutonSansCompte === false, miseEnPage);
check('aucune erreur js', errors.length === 0, errors);

console.log(failed === 0 ? '\nTous les tests passent.' : '\n' + failed + ' echec(s).');
process.exit(failed === 0 ? 0 : 1);
