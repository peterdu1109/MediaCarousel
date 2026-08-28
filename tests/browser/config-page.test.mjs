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
          Genres: { Enabled: false, Count: 0, Source: 'Jellyfin', GeneratedUtc: null },
          LastRun: window.__lastRun || { StartedUtc: '2026-08-27T03:00:00Z', DurationSeconds: 12.4, Running: false, Failures: [] }
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
    tabCount: document.querySelectorAll('.mcCfg-tab').length,
    visiblePanels: Array.from(document.querySelectorAll('[role=tabpanel]')).filter(x => !x.hidden).length,
    firstTabSelected: document.querySelector('#tabLocal').getAttribute('aria-selected') === 'true',
    // Les champs avances sont replies mais presents.
    advancedCount: document.querySelectorAll('.mcCfg-advanced').length,
    windowInAdvanced: !!q('#LocalTopWindowDays').closest('.mcCfg-advanced'),
    exclusionsInAdvanced: !!q('#ExcludedUserIds').closest('.mcCfg-advanced'),
    minStudioInAdvanced: !!q('#MinItemsPerStudio').closest('.mcCfg-advanced'),
    // Onglet grise quand toutes ses bascules sont decochees (Top mondial est off).
    globalTabOff: q('#tabGlobal').classList.contains('mcCfg-tab-off'),
    localTabOn: !q('#tabLocal').classList.contains('mcCfg-tab-off'),
    // Roving tabindex : un seul onglet dans le parcours clavier.
    tabbable: Array.from(document.querySelectorAll('.mcCfg-tab')).filter(t => t.tabIndex === 0).length,
    // Tuile d'alerte sur la cle manquante.
    globalTileState: document.querySelectorAll('.mcCfg-tile')[2].dataset.state,
    globalTileValue: document.querySelectorAll('.mcCfg-tile')[2].querySelector('.mcCfg-tile-value').textContent,
    activeRows: document.querySelectorAll('.mcCfg-tile')[3].querySelector('.mcCfg-tile-value').textContent,
    // Detail par section, rapatrie dans son onglet.
    sectionStates: document.querySelectorAll('[data-state-for]').length,
    localSectionState: q('[data-state-for="LocalTop"]').textContent,
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

// Navigation par onglets.
await page.evaluate(() => document.querySelector('#tabRefresh').click());
const afterTabClick = await page.evaluate(() => ({
  refreshVisible: !document.querySelector('#panelRefresh').hidden,
  localHidden: document.querySelector('#panelLocal').hidden,
  selected: document.querySelector('#tabRefresh').getAttribute('aria-selected')
}));

// Fleche droite depuis le dernier onglet : retour au premier (parcours circulaire).
await page.evaluate(() => {
  document.querySelector('#tabRefresh').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
});
const afterKeyboard = await page.evaluate(() => ({
  selected: document.querySelector('#tabLocal').getAttribute('aria-selected'),
  visible: !document.querySelector('#panelLocal').hidden
}));

// Avertissement de doublon : les valeurs par defaut portent le meme nom.
await page.evaluate(() => {
  ['EnableGlobalTop', 'SyncCollections'].forEach(id => {
    const cb = document.querySelector('#' + id);
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  });
});
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

// Descendre la premiere rangee. L'onglet doit etre ouvert : un panneau masque ne
// peut pas recevoir le focus, et c'est de toute facon ce que fait l'utilisateur.
await page.evaluate(() => document.querySelector('#tabHome').click());
await page.evaluate(() => {
  document.querySelector('#mcRowOrder li:first-child .mcCfg-order-down').click();
});
const reordered = await page.evaluate(() => ({
  value: document.querySelector('#RowOrder').value,
  names: Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-name')).map(e => e.textContent),
  focusStillOnArrow: document.activeElement.className.indexOf('mcCfg-order-down') !== -1
}));

// Cocher la gestion des natives : la liste doit s'etendre sans bousculer nos rangees.
await page.evaluate(() => {
  const cb = document.querySelector('#ManageNativeSections');
  cb.checked = true;
  cb.dispatchEvent(new Event('change'));
});
const withNatives = await page.evaluate(() => {
  const names = Array.from(document.querySelectorAll('#mcRowOrder .mcCfg-order-name')).map(e => e.textContent);
  return {
    count: names.length,
    names: names,
    plugins: names.filter(n => n.indexOf('Jellyfin — ') !== 0)
  };
});

await page.evaluate(() => {
  const cb = document.querySelector('#ManageNativeSections');
  cb.checked = false;
  cb.dispatchEvent(new Event('change'));
});
const withoutNatives = await page.evaluate(() => ({
  count: document.querySelectorAll('#mcRowOrder .mcCfg-order-name').length
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

// Second passage : le Top mondial a echoue au dernier recalcul. La tolerance aux
// pannes conserve l'instantane precedent, donc seule cette tuile peut le dire.
// addInitScript et non evaluate : le rechargement remet le contexte JS a zero,
// seul un script d'initialisation survit a la navigation.
await page.addInitScript(() => {
  window.__lastRun = {
    StartedUtc: '2026-08-27T03:00:00Z',
    DurationSeconds: 8.1,
    Running: false,
    Failures: [{ Section: 'Top mondial', Message: 'TMDB a répondu 401 : clé d\u2019API invalide.' }]
  };
});
await page.reload();
await page.evaluate(() => {
  document.querySelector('#mediaCarouselConfigPage').dispatchEvent(new Event('pageshow'));
});
await page.waitForFunction(() => document.querySelectorAll('.mcCfg-tile').length === 4, { timeout: 5000 });
const failedRun = await page.evaluate(() => {
  const t = document.querySelector('.mcCfg-tile');
  return {
    state: t.getAttribute('data-state'),
    value: t.querySelector('.mcCfg-tile-value').textContent,
    detail: t.querySelector('.mcCfg-tile-detail').textContent
  };
});

await browser.close();

let failed = 0;
const check = (name, ok, got) => { console.log((ok ? 'OK    ' : 'ECHEC ') + name + (ok ? '' : '  -> ' + JSON.stringify(got))); if (!ok) failed++; };

check('version affichee', loaded.version === 'v3.0.1.0', loaded.version);
check('4 tuiles de synthese', loaded.tiles.length === 4, loaded.tiles.length);
check('tuile dernier calcul en temps relatif', loaded.tiles[0].state === 'ok'
  && /il y a|instant/.test(loaded.tiles[0].value), loaded.tiles[0]);
check('ECHEC SILENCIEUX: la tuile passe en alerte', failedRun.state === 'warn', failedRun);
check('ECHEC SILENCIEUX: la section en echec est nommee',
  /Top mondial/.test(failedRun.value), failedRun.value);
check('ECHEC SILENCIEUX: le message de l erreur est affiche',
  /401/.test(failedRun.detail), failedRun.detail);
check('tuile dernier calcul : la duree mesuree est affichee',
  /12 s/.test(loaded.tiles[0].detail), loaded.tiles[0]);
check('tuile Top serveur chiffree', loaded.tiles[1].value === '10', loaded.tiles[1]);
check('tuile Top mondial : desactive lisible sans couleur',
  loaded.globalTileState === 'off' && loaded.globalTileValue === '—', loaded);
check('tuile rangees actives', loaded.activeRows === '4 / 7', loaded.activeRows);
check('valeurs chargees', loaded.localSize === '10', loaded.localSize);
check('listes rendues ligne par ligne', loaded.excluded === 'aaa\nbbb', loaded.excluded);
check('cle d API masquee a l ecran', loaded.apiKeyType === 'password', loaded.apiKeyType);
check('groupe inactif masque', loaded.globalHidden === true && loaded.genreHidden === true, loaded);
check('groupe inactif hors parcours clavier', loaded.globalDisabled === true && loaded.genreDisabled === true, loaded);
check('groupe actif utilisable', loaded.localVisible === true, loaded.localVisible);
check('bascule revele le groupe', afterToggle.hidden === false && afterToggle.disabled === false, afterToggle);
check('8 groupes avec legende conserves', loaded.legends.length === 8, loaded.legends);
check('6 onglets', loaded.tabCount === 6, loaded.tabCount);
check('un seul panneau visible', loaded.visiblePanels === 1 && loaded.firstTabSelected, loaded);
check('roving tabindex : un seul onglet focalisable', loaded.tabbable === 1, loaded.tabbable);
check('onglet grise quand ses bascules sont decochees',
  loaded.globalTabOff === true && loaded.localTabOn === true, loaded);
check('2 blocs de reglages avances', loaded.advancedCount === 2, loaded.advancedCount);
check('fenetre, exclusions et minimums replies',
  loaded.windowInAdvanced && loaded.exclusionsInAdvanced && loaded.minStudioInAdvanced, loaded);
check('detail par section dans son onglet', loaded.sectionStates === 4
  && loaded.localSectionState.indexOf('Top du serveur') === 0, loaded.localSectionState);
check('aucun avertissement quand les collections sont desactivees',
  loaded.alertHiddenInitially === true, loaded.alertHiddenInitially);

check('clic sur un onglet : le panneau suit', afterTabClick.refreshVisible
  && afterTabClick.localHidden && afterTabClick.selected === 'true', afterTabClick);
check('fleche droite : parcours circulaire des onglets',
  afterKeyboard.selected === 'true' && afterKeyboard.visible, afterKeyboard);

check('DOUBLON: avertissement leve sur les valeurs par defaut',
  alertShown.visible && alertShown.text.indexOf('Top 10 mondial') >= 0, alertShown);
check('DOUBLON: le message nomme le classement concerne',
  alertShown.text.indexOf('Top mondial') >= 0, alertShown.text);
check('DOUBLON: renommer la collection leve l avertissement', alertCleared === true, alertCleared);
// Les entrees absentes sont reinserees a leur place par defaut, pas ajoutees a la
// fin : sans cela, activer la gestion des natives les ferait toutes basculer sous
// nos rangees, et une rangee nouvelle deplacerait la disposition de l'utilisateur.
check('ORDRE: les entrees absentes reviennent a leur place par defaut',
  loaded.rowOrderValue === 'genres,global,returning,neverplayed,local,studios,because', loaded.rowOrderValue);
check('ORDRE: les 7 rangees sont listees', loaded.rowOrderNames.length === 7, loaded.rowOrderNames);
check('ORDRE: l ordre configure est respecte a l affichage',
  loaded.rowOrderNames[0] === 'Par genre' && loaded.rowOrderNames[1] === 'Top mondial', loaded.rowOrderNames);
check('ORDRE: les rangs sont numerotes de 1 a 7',
  loaded.rowOrderRanks.join(',') === '1,2,3,4,5,6,7', loaded.rowOrderRanks);
check('ORDRE: on ne monte pas la premiere ni ne descend la derniere',
  loaded.firstUpDisabled === true && loaded.lastDownDisabled === true, loaded);
check('ORDRE: descendre echange bien les deux rangees',
  reordered.names[0] === 'Top mondial' && reordered.names[1] === 'Par genre', reordered.names);
check('ORDRE: le champ suit le deplacement',
  reordered.value.indexOf('global,genres') === 0, reordered.value);
check('ORDRE: le focus reste sur la rangee deplacee',
  reordered.focusStillOnArrow === true, reordered);
check('ORDRE: l ordre modifie est enregistre',
  saved.RowOrder.indexOf('global,genres') === 0, saved.RowOrder);

check('NATIF: la case etend la liste aux sections de Jellyfin',
  withNatives.count === 16, withNatives.count);
check('NATIF: les sections natives sont nommees lisiblement',
  withNatives.names.indexOf('Jellyfin — Continuer à regarder') !== -1, withNatives.names);
check('NATIF: les bibliotheques arrivent en tete par defaut',
  withNatives.names[0] === 'Jellyfin — Mes médias', withNatives.names[0]);
check('NATIF: nos rangees gardent leur ordre relatif',
  withNatives.plugins.join(',') === reordered.names.join(','), withNatives.plugins);
check('NATIF: decocher revient aux seules rangees du plugin',
  withoutNatives.count === 7, withoutNatives.count);

check('a11y: chaque aria-describedby pointe une cible', loaded.describedBy === true, loaded.describedBy);
check('aucun champ orphelin hors des tableaux de chargement',
  loaded.orphanFields.length === 0, loaded.orphanFields);
check('a11y: 3 regions live (bandeau, avertissement, retour)', loaded.liveRegions.length === 3
  && loaded.liveRegions.every(v => v === 'polite'), loaded.liveRegions);
check('a11y: un seul h1', loaded.h1 === 1, loaded.h1);
check('enregistrement : valeur modifiee', saved.LocalTopSize === 15, saved.LocalTopSize);
check('note chargee sans troncature', loaded.minRating === '7.5', loaded.minRating);
check('note enregistree en decimal', saved.NeverPlayedMinRating === 8.2, saved.NeverPlayedMinRating);
check('enregistrement : liste normalisee', JSON.stringify(saved.ExcludedUserIds) === JSON.stringify(['aaa','ccc','ddd']), saved.ExcludedUserIds);
check('enregistrement : champ d un onglet masque conserve', saved.GlobalTopApiKey === 'secret', saved.GlobalTopApiKey);
check('enregistrement : champ replie sous Reglages avances conserve',
  saved.CandidatesPerUser === 100 && JSON.stringify(saved.ExcludedLibraryIds) === '[]', saved.CandidatesPerUser);
check('retour utilisateur apres enregistrement', feedbackAfterSave.startsWith('Réglages enregistrés'), feedbackAfterSave);
check('recalcul declenche une seule requete', refresh.calls === 1, refresh.calls);
check('retour utilisateur apres recalcul', refresh.feedback.startsWith('Recalcul lancé en arrière-plan'), refresh.feedback);
check('aucune erreur js', errors.length === 0, errors);

console.log(failed === 0 ? '\nTous les tests passent.' : '\n' + failed + ' echec(s).');
process.exit(failed === 0 ? 0 : 1);
