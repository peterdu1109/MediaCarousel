using System.Xml;
using System.Xml.Serialization;
using JellyfinCarouselPlugin.Api;
using JellyfinCarouselPlugin.Configuration;
using JellyfinCarouselPlugin.Models;
using JellyfinCarouselPlugin.Providers;
using JellyfinCarouselPlugin.Services;

// Vérifie l'insertion de la balise script dans index.html : idempotence, migration depuis
// les anciennes versions, et retrait complet. Une erreur ici laisse les navigateurs des
// utilisateurs demander un script disparu, ou duplique la balise a chaque demarrage.
var failed = 0;

void Check(string name, bool ok)
{
    Console.WriteLine((ok ? "OK    " : "ECHEC ") + name);
    if (!ok)
    {
        failed++;
    }
}

const string legacy = "<script FileTransformation=\"true\" plugin=\"MediaCarousel\" defer=\"defer\" src=\"/MediaCarousel/carousel-layout.js\"></script>";
const string html = "<html><head><title>x</title></head><body><div id=app></div></body></html>";

var once = ScriptTag.Apply(html);
Check("insertion avant </body>", once.Contains(ScriptTag.Tag) && once.IndexOf(ScriptTag.Tag, StringComparison.Ordinal) < once.IndexOf("</body>", StringComparison.Ordinal));
Check("idempotent", ScriptTag.Apply(once) == once);

var migrated = ScriptTag.Apply(html.Replace("</body>", legacy + "</body>", StringComparison.Ordinal));
Check("ancienne balise retiree", !migrated.Contains("carousel-layout.js", StringComparison.Ordinal) && migrated.Contains(ScriptTag.Tag, StringComparison.Ordinal));

// ------------------------------------------------------------------
// Chemin de base du serveur.
//
// Servi sous un sous-chemin — le cas courant derriere un reverse proxy — un `src`
// absolu tombe en 404 : aucune rangee n'apparait, alors que l'API du plugin repond
// parfaitement par ailleurs.
// ------------------------------------------------------------------

Check("BASE: une valeur vide ne prefixe rien", ScriptTag.Normalize(null).Length == 0
    && ScriptTag.Normalize("").Length == 0 && ScriptTag.Normalize("  ").Length == 0);
Check("BASE: les trois ecritures acceptees par Jellyfin donnent le meme prefixe",
    ScriptTag.Normalize("jellyfin") == "/jellyfin"
    && ScriptTag.Normalize("/jellyfin") == "/jellyfin"
    && ScriptTag.Normalize("/jellyfin/") == "/jellyfin");
Check("BASE: la balise porte le prefixe",
    ScriptTag.BuildTag("/jellyfin").Contains("src=\"/jellyfin/MediaCarousel/media-carousel.js\"", StringComparison.Ordinal));
Check("BASE: sans prefixe, la balise est inchangee",
    ScriptTag.BuildTag(null).Contains("src=\"/MediaCarousel/media-carousel.js\"", StringComparison.Ordinal));

// Regression : le retrait ne peut pas se faire par egalite de chaine. Si l'administrateur
// change le chemin de base entre deux demarrages, la balise en place ne ressemble plus a
// celle que nous produirions — elle resterait, et une seconde s'ajouterait a chaque fois.
ScriptTag.BaseUrl = "/jellyfin";
var prefixed = ScriptTag.Apply(html);
Check("BASE: la balise inseree porte le prefixe courant",
    prefixed.Contains("/jellyfin/MediaCarousel/media-carousel.js", StringComparison.Ordinal));

ScriptTag.BaseUrl = "/autre";
var reprefixed = ScriptTag.Apply(prefixed);
Check("BASE: un changement de prefixe remplace la balise au lieu d'en ajouter une",
    CountOccurrences(reprefixed, "plugin=\"MediaCarousel\"") == 1
    && reprefixed.Contains("/autre/MediaCarousel/", StringComparison.Ordinal)
    && !reprefixed.Contains("/jellyfin/MediaCarousel/", StringComparison.Ordinal));

Check("BASE: le retrait attrape une balise ecrite avec un autre prefixe",
    !ScriptTag.Remove(prefixed).Contains("MediaCarousel/media-carousel.js", StringComparison.Ordinal));

ScriptTag.BaseUrl = string.Empty;

static int CountOccurrences(string haystack, string needle)
{
    var count = 0;
    var index = 0;
    while ((index = haystack.IndexOf(needle, index, StringComparison.Ordinal)) >= 0)
    {
        count++;
        index += needle.Length;
    }

    return count;
}

var removed = ScriptTag.Remove(migrated);
Check("suppression complete", !removed.Contains(ScriptTag.Tag, StringComparison.Ordinal) && !removed.Contains("carousel-layout.js", StringComparison.Ordinal));
Check("suppression idempotente", ScriptTag.Remove(removed) == removed);

const string noAnchor = "<html><div>x</div>";
Check("sans </body> ni </head> : inchange", ScriptTag.Apply(noAnchor) == noAnchor);
Check("repli sur </head>", ScriptTag.Apply("<html><head><meta></head>").Contains(ScriptTag.Tag, StringComparison.Ordinal));
Check("html minifie", ScriptTag.Apply("<body>x</body>").Contains(ScriptTag.Tag, StringComparison.Ordinal));

// Cohabitation avec les autres plugins : chacun insere sa propre balise dans le meme
// index.html. La notre doit s'ajouter sans jamais toucher aux leurs, et disparaitre
// seule quand on la retire.
const string foreign = "<script plugin=\"AutrePlugin\" src=\"/AutrePlugin/script.js\"></script>";
var shared = html.Replace("</body>", foreign + "</body>", StringComparison.Ordinal);

var withBoth = ScriptTag.Apply(shared);
Console.WriteLine();
Check("la balise d'un autre plugin est preservee a l'insertion",
    withBoth.Contains(foreign, StringComparison.Ordinal) && withBoth.Contains(ScriptTag.Tag, StringComparison.Ordinal));
Check("insertion idempotente en presence d'un autre plugin", ScriptTag.Apply(withBoth) == withBoth);

var onlyForeign = ScriptTag.Remove(withBoth);
Check("le retrait n'emporte que la notre",
    onlyForeign.Contains(foreign, StringComparison.Ordinal) && !onlyForeign.Contains(ScriptTag.Tag, StringComparison.Ordinal));

// Regroupement des variantes de studios. Sans cela, la rangee affiche « Warner Bros. »,
// « Warner Bros. Pictures » et « Warner Bros. Animation » comme trois studios distincts.
string Key(string name) => StudioNameNormalizer.Normalize(name);

void Same(string a, string b) => Check($"« {a} » et « {b} » regroupes", Key(a) == Key(b) && Key(a).Length > 0);
void Distinct(string a, string b) => Check($"« {a} » et « {b} » distincts", Key(a) != Key(b));

Console.WriteLine();
Same("Warner Bros.", "Warner Bros");
Same("Warner Bros. Pictures", "Warner Bros. Animation");
Same("Twentieth Century Fox Film Corporation", "Twentieth Century Fox");
Same("Studio Ghibli", "STUDIO GHIBLI");
Same("Gaumont", "Gaumont Distribution");
Same("Canal+", "Canal +");
Same("Légendaire Films", "Legendaire Films");
Same("Netflix", "Netflix International Pictures");

Distinct("Warner Bros.", "Universal Pictures");
Distinct("Columbia Pictures", "Sony Pictures");
Distinct("Studio Ghibli", "Studio Canal");

// Un nom entierement compose de mots generiques ne doit pas produire une cle vide,
// sinon des societes sans rapport se retrouveraient fusionnees.
Check("« Studio » garde une cle non vide", Key("Studio") == "studio");
Check("« Films » garde une cle non vide", Key("Films") == "films");
Distinct("Studio", "Films");
Check("nom vide : cle vide", Key("").Length == 0 && Key("   ").Length == 0 && Key(null) .Length == 0);
Check("ponctuation seule : cle vide", Key("---").Length == 0);


// ---------------------------------------------------------------------------
// Comptage des catalogues.
//
// Ces tests existent parce que les decomptes de Jellyfin ne sont pas utilisables :
// dans BaseItemRepository.GetItemValues (v10.11.11), l'ItemCounts attache a chaque
// studio ou genre vient d'un itemCountQuery non correle a la ligne courante, donc
// identique pour toutes les entrees. Le comptage est refait ici, et verifie ici.
// ---------------------------------------------------------------------------

var filmotheque = Guid.NewGuid();
var jeunesse = Guid.NewGuid();

CatalogCounter NewStudioCounter() => new(StudioNameNormalizer.Normalize, StringComparer.Ordinal);
CatalogCounter NewGenreCounter() => new(name => name, StringComparer.OrdinalIgnoreCase);

// Les variantes d'un meme studio se regroupent et leurs titres s'additionnent.
var studios = NewStudioCounter();
studios.Add("Warner Bros.", filmotheque);
studios.Add("Warner Bros. Pictures", filmotheque);
studios.Add("Warner Bros. Animation", jeunesse);
studios.Add("Universal Pictures", filmotheque);

var warner = studios.Buckets[StudioNameNormalizer.Normalize("Warner Bros.")];
Check("STUDIOS: les trois variantes Warner comptent pour 3 titres", warner.Total == 3);
Check("STUDIOS: Universal reste distinct", studios.Buckets[StudioNameNormalizer.Normalize("Universal Pictures")].Total == 1);
Check("STUDIOS: deux groupes seulement", studios.Buckets.Count == 2);

// La ventilation par bibliotheque est ce qui permet le filtrage par droits.
Check("STUDIOS: 2 titres Warner en filmotheque", warner.ByLibrary[filmotheque] == 2);
Check("STUDIOS: 1 titre Warner en jeunesse", warner.ByLibrary[jeunesse] == 1);

// B2 : un utilisateur qui ne voit que la jeunesse ne compte que ce qu'il peut ouvrir.
Check("B2: vu de la jeunesse seule, Warner vaut 1", warner.CountIn(new[] { jeunesse }) == 1);
Check("B2: vu des deux bibliotheques, Warner vaut 3", warner.CountIn(new[] { filmotheque, jeunesse }) == 3);
Check("B2: sans aucune bibliotheque visible, Warner disparait", warner.CountIn(Array.Empty<Guid>()) == 0);
Check("B2: Universal est invisible depuis la jeunesse", studios.Buckets[StudioNameNormalizer.Normalize("Universal Pictures")].CountIn(new[] { jeunesse }) == 0);

// Les genres se regroupent a la casse pres, et s'additionnent aussi (regression A2).
var genres = NewGenreCounter();
genres.Add("Science-Fiction", filmotheque);
genres.Add("science-fiction", filmotheque);
genres.Add("SCIENCE-FICTION", jeunesse);
genres.Add("Comédie", filmotheque);

Check("GENRES: les trois graphies comptent pour 3 titres", genres.Buckets["Science-Fiction"].Total == 3);
Check("GENRES: un seul groupe pour les trois graphies", genres.Buckets.Count == 2);
Check("GENRES: la ventilation suit aussi", genres.Buckets["science-fiction"].ByLibrary[jeunesse] == 1);

// Un nom vide ou reduit a rien par le normaliseur ne cree pas de groupe fourre-tout.
var ignore = NewStudioCounter();
ignore.Add(null, filmotheque);
ignore.Add("   ", filmotheque);
ignore.Add("---", filmotheque);
Check("COMPTAGE: noms vides ou sans lettre ignores", ignore.Buckets.Count == 0);

// Les espaces autour d'un nom ne creent pas une variante distincte.
var trimmed = NewGenreCounter();
trimmed.Add("Action", filmotheque);
trimmed.Add("  Action  ", filmotheque);
Check("COMPTAGE: espaces de bord ignores", trimmed.Buckets.Count == 1 && trimmed.Buckets["Action"].ByVariant.Count == 1);

// ---------------------------------------------------------------------------
// Choix de la variante affichee.
//
// La rangee affiche des logos : une variante illustree doit l'emporter sur une
// variante mieux fournie, sinon un studio apparait comme un simple libelle au
// milieu d'images.
// ---------------------------------------------------------------------------

var sansLogo = new CatalogRepresentative(Guid.NewGuid(), "Warner Bros. Pictures", HasLogo: false, VariantCount: 40);
Check("VARIANTE: une variante avec logo bat une variante sans, meme moins fournie", sansLogo.IsBeatenBy(hasLogo: true, variantCount: 1));

var avecLogo = new CatalogRepresentative(Guid.NewGuid(), "Warner Bros.", HasLogo: true, VariantCount: 5);
Check("VARIANTE: une variante sans logo ne detrone pas une variante illustree", !avecLogo.IsBeatenBy(hasLogo: false, variantCount: 900));
Check("VARIANTE: a logo egal, la mieux fournie l'emporte", avecLogo.IsBeatenBy(hasLogo: true, variantCount: 6));
Check("VARIANTE: a logo egal, la moins fournie ne l'emporte pas", !avecLogo.IsBeatenBy(hasLogo: true, variantCount: 4));
Check("VARIANTE: a egalite parfaite, la premiere reste", !avecLogo.IsBeatenBy(hasLogo: true, variantCount: 5));


// ---------------------------------------------------------------------------
// Classement du Top du serveur.
//
// Le plafond par utilisateur, le decompte de spectateurs distincts et l'ordre de
// departage n'etaient couverts par aucun test alors qu'ils portent la fonction
// principale du plugin.
// ---------------------------------------------------------------------------

var alice = Guid.NewGuid();
var bob = Guid.NewGuid();
var carol = Guid.NewGuid();

var dune = Guid.NewGuid();
var matrix = Guid.NewGuid();

TopListCandidate Play(Guid item, string name, Guid user, int plays, DateTime? last = null)
    => new(item, name, 2021, null, null, user, plays, last);

// Le plafond borne la contribution au score, mais TotalPlays garde la valeur brute.
var capped = new TopListAccumulator(playCap: 3);
capped.Add(Play(dune, "Dune", alice, 10));
var duneRank = capped.Rank(10).Single();
Check("TOP: le plafond borne le score a 3", Math.Abs(duneRank.Score - 3) < 0.001);
Check("TOP: TotalPlays conserve les 10 lectures reelles", duneRank.TotalPlays == 10);

// Le Top mondial affichait deux fois la meme serie, a deux rangs consecutifs. Une liste
// « tendances » est recalculee en continu par TMDB : entre la requete de la page 1 et celle
// de la page 2, elle s'est reordonnee, et un titre qui a recule d'un rang reapparait sur la
// page suivante. Sans deduplication, il entre deux fois dans le classement.
var page1 = TrendingKey.For("12345", isMovie: false, "Rick et Morty", 2013);
var page2 = TrendingKey.For("12345", isMovie: false, "Rick et Morty", 2013);
Check("DOUBLON: le meme titre revu sur une autre page donne la MEME cle",
    page1 == page2);

// TMDB numerote films et series independamment : l'identifiant 42 designe deux oeuvres
// differentes selon le type. Les confondre masquerait un titre legitime.
Check("DOUBLON: meme identifiant, type different -> deux cles distinctes",
    TrendingKey.For("42", isMovie: true, "Ambigu", 2020)
        != TrendingKey.For("42", isMovie: false, "Ambigu", 2020));

// Sans identifiant, la cle retombe sur le nom normalise et l'annee.
Check("DOUBLON: sans identifiant, la casse et les espaces ne separent pas",
    TrendingKey.For(null, false, "  Rick ET Morty  ", 2013)
        == TrendingKey.For("", false, "rick et morty", 2013));
Check("DOUBLON: sans identifiant, deux annees differentes restent distinctes",
    TrendingKey.For(null, true, "Dune", 1984) != TrendingKey.For(null, true, "Dune", 2021));
Check("DOUBLON: une annee absente ne fusionne pas avec une annee connue",
    TrendingKey.For(null, true, "Dune", null) != TrendingKey.For(null, true, "Dune", 2021));

// Le filtrage lui-meme : cinq titres dont deux doublons doivent en laisser trois.
var flux = new[]
{
    ("1", false, "Rick et Morty", (int?)2013),
    ("2", false, "Severance", (int?)2022),
    ("1", false, "Rick et Morty", (int?)2013),
    (null, true, "Dune", (int?)2021),
    (null, true, "dune", (int?)2021)
};
var vus = new HashSet<string>(StringComparer.Ordinal);
var retenus = flux.Where(t => vus.Add(TrendingKey.For(t.Item1, t.Item2, t.Item3, t.Item4))).Count();
Check("DOUBLON: cinq titres dont deux repetitions en laissent trois", retenus == 3);

// Jellyfin ecrit ses dates en UTC mais EF Core sur SQLite les relit en Unspecified.
// `ToUniversalTime()` les traiterait alors comme LOCALES et les decalerait du fuseau du
// serveur : une lecture de 1 h du matin a Paris ressortait a 23 h la veille, donc un jour
// plus tot, ce qui deplace la frontiere de la fenetre d'observation.
var brute = new DateTime(2026, 3, 1, 1, 0, 0, DateTimeKind.Unspecified);
var ramenee = PlaybackDate.AsUtc(brute);
Check("FUSEAU: une date non qualifiee est lue comme de l UTC, sans decalage",
    ramenee.Kind == DateTimeKind.Utc && ramenee.Hour == 1 && ramenee.Day == 1);

var deja = new DateTime(2026, 3, 1, 1, 0, 0, DateTimeKind.Utc);
Check("FUSEAU: une date deja en UTC n est pas touchee",
    PlaybackDate.AsUtc(deja) == deja);

var locale = new DateTime(2026, 3, 1, 1, 0, 0, DateTimeKind.Local);
Check("FUSEAU: une date locale est bien convertie",
    PlaybackDate.AsUtc(locale) == locale.ToUniversalTime()
        && PlaybackDate.AsUtc(locale).Kind == DateTimeKind.Utc);

// Un plafond nul ou negatif signifie « pas de plafond ».
var uncapped = new TopListAccumulator(playCap: 0);
uncapped.Add(Play(dune, "Dune", alice, 10));
Check("TOP: un plafond nul ne borne rien", Math.Abs(uncapped.Rank(10).Single().Score - 10) < 0.001);

// Trois spectateurs a une lecture battent un seul spectateur qui revoit en boucle.
var audience = new TopListAccumulator(playCap: 3);
audience.Add(Play(dune, "Dune", alice, 1));
audience.Add(Play(dune, "Dune", bob, 1));
audience.Add(Play(dune, "Dune", carol, 1));
audience.Add(Play(matrix, "Matrix", alice, 99));
var ranked = audience.Rank(10);
Check("TOP: trois spectateurs comptent 3 comme un seul plafonne a 3", Math.Abs(ranked[0].Score - ranked[1].Score) < 0.001);
Check("TOP: a score egal, le plus partage passe devant", ranked[0].ItemId == dune);
Check("TOP: 3 spectateurs distincts sur Dune", ranked[0].DistinctViewers == 3);
Check("TOP: 1 seul spectateur sur Matrix", ranked[1].DistinctViewers == 1);

// Une SERIE recoit le score de chacun de ses episodes, chaque episode etant un element
// distinct. Le plafond doit porter sur la contribution totale de l'utilisateur au titre,
// sinon un seul binge-watcher place n'importe quelle serie en tete.
var serie = Guid.NewGuid();
var binge = new TopListAccumulator(playCap: 3);
for (var ep = 0; ep < 24; ep++)
{
    binge.Add(Play(serie, "Serie", alice, 1));
}

binge.Add(Play(dune, "Dune", alice, 1));
binge.Add(Play(dune, "Dune", bob, 1));
binge.Add(Play(dune, "Dune", carol, 1));
var bingeRank = binge.Rank(10);
Check("TOP: 24 episodes d'un seul compte plafonnent a 3, comme un film",
    Math.Abs(bingeRank.Single(r => r.ItemId == serie).Score - 3) < 0.001);
Check("TOP: trois spectateurs d'un film valent le binge d'une serie",
    Math.Abs(bingeRank.Single(r => r.ItemId == dune).Score - 3) < 0.001);
Check("TOP: les 24 lectures restent visibles dans TotalPlays",
    bingeRank.Single(r => r.ItemId == serie).TotalPlays == 24);

// Deux comptes qui suivent la meme serie doivent la faire monter, eux.
var partage = new TopListAccumulator(playCap: 3);
for (var ep = 0; ep < 24; ep++)
{
    partage.Add(Play(serie, "Serie", alice, 1));
    partage.Add(Play(serie, "Serie", bob, 1));
}

Check("TOP: deux spectateurs sur une serie valent deux fois le plafond",
    Math.Abs(partage.Rank(10).Single().Score - 6) < 0.001);

// Un meme compte qui rejoue ne gonfle pas le nombre de spectateurs.
var repeat = new TopListAccumulator(playCap: 10);
repeat.Add(Play(dune, "Dune", alice, 2));
repeat.Add(Play(dune, "Dune", alice, 3));
var repeated = repeat.Rank(10).Single();
Check("TOP: un compte qui revient reste 1 spectateur", repeated.DistinctViewers == 1);
Check("TOP: ses lectures s'additionnent quand meme", repeated.TotalPlays == 5);

// A score et audience egaux, la lecture la plus recente departage.
var ancien = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
var recent = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
var tie = new TopListAccumulator(playCap: 3);
tie.Add(Play(dune, "Dune", alice, 1, ancien));
tie.Add(Play(matrix, "Matrix", bob, 1, recent));
Check("TOP: a egalite, le plus recemment lu passe devant", tie.Rank(10)[0].ItemId == matrix);

// La date retenue est la plus recente de tous les comptes.
var dates = new TopListAccumulator(playCap: 3);
dates.Add(Play(dune, "Dune", alice, 1, recent));
dates.Add(Play(dune, "Dune", bob, 1, ancien));
Check("TOP: la derniere lecture est celle du compte le plus recent", dates.Rank(10).Single().LastPlayedUtc == recent);

// Les rangs sont contigus et commencent a 1 ; la taille demandee est respectee.
var many = new TopListAccumulator(playCap: 3);
for (var i = 0; i < 25; i++)
{
    many.Add(Play(Guid.NewGuid(), "Titre " + i, alice, 25 - i));
}

var top5 = many.Rank(5);
Check("TOP: la taille demandee est respectee", top5.Count == 5);
Check("TOP: les rangs vont de 1 a 5", top5.Select(r => r.Rank).SequenceEqual(new[] { 1, 2, 3, 4, 5 }));
Check("TOP: les scores decroissent", top5.Zip(top5.Skip(1)).All(p => p.First.Score >= p.Second.Score));

// Une lecture a zero ou un identifiant vide n'entre pas au classement.
var noise = new TopListAccumulator(playCap: 3);
noise.Add(Play(dune, "Dune", alice, 0));
noise.Add(Play(Guid.Empty, "Fantome", alice, 5));
Check("TOP: zero lecture et identifiant vide sont ignores", noise.DistinctItems == 0 && noise.Rank(10).Count == 0);


// ---------------------------------------------------------------------------
// Proxy d'affiches.
//
// Le nom de fichier vient du client : c'est la seule entree non authentifiee du
// plugin. Il ne doit jamais pouvoir designer autre chose qu'une affiche TMDB.
// ---------------------------------------------------------------------------

Check("PROXY: une affiche TMDB est relayee",
    PosterProxy.ToLocalUrl("https://image.tmdb.org/t/p/w342/abc123.jpg") == "MediaCarousel/Poster/abc123.jpg");
Check("PROXY: l'adresse relayee est relative, pour suivre le chemin de base du serveur",
    !PosterProxy.ToLocalUrl("https://image.tmdb.org/t/p/w342/abc123.jpg")!.StartsWith('/'));
Check("PROXY: l'adresse distante est reconstruite chez TMDB",
    PosterProxy.BuildRemoteUrl("abc123.jpg") == "https://image.tmdb.org/t/p/w342/abc123.jpg");

// Ce que le plugin ne sait pas relayer passe tel quel : mieux vaut une affiche
// chargee depuis sa source qu'une vignette vide.
Check("PROXY: une adresse etrangere passe inchangee",
    PosterProxy.ToLocalUrl("https://exemple.test/x.jpg") == "https://exemple.test/x.jpg");
Check("PROXY: null reste null", PosterProxy.ToLocalUrl(null) is null);

// Validation du nom recu du client.
Check("PROXY: nom simple accepte", PosterProxy.IsValidFileName("abc123.jpg"));
Check("PROXY: png et webp acceptes", PosterProxy.IsValidFileName("a.png") && PosterProxy.IsValidFileName("a.webp"));
Check("PROXY: remontee de chemin refusee", !PosterProxy.IsValidFileName("../../etc/passwd"));
Check("PROXY: remontee deguisee refusee", !PosterProxy.IsValidFileName("..%2Fsecret.jpg"));
Check("PROXY: separateur refuse", !PosterProxy.IsValidFileName("sous/dossier.jpg"));
Check("PROXY: antislash refuse", !PosterProxy.IsValidFileName("sous\\dossier.jpg"));
Check("PROXY: chemin absolu refuse", !PosterProxy.IsValidFileName("/etc/passwd.jpg"));
Check("PROXY: extension inattendue refusee", !PosterProxy.IsValidFileName("charge.exe"));
Check("PROXY: extension absente refusee", !PosterProxy.IsValidFileName("abc123"));
Check("PROXY: chaine de requete refusee", !PosterProxy.IsValidFileName("abc.jpg?x=1"));
Check("PROXY: nom vide refuse", !PosterProxy.IsValidFileName("") && !PosterProxy.IsValidFileName(null));
Check("PROXY: nom demesure refuse", !PosterProxy.IsValidFileName(new string('a', 200) + ".jpg"));

// Une URL qui n'est pas chez TMDB ne doit pas produire de nom de fichier relayable,
// meme si elle se termine par un nom valide.
Check("PROXY: un hote etranger ne produit aucun nom",
    !PosterProxy.TryGetFileName("https://mechant.test/t/p/w342/abc123.jpg", out _));
Check("PROXY: un hote qui imite le prefixe est refuse",
    !PosterProxy.TryGetFileName("https://image.tmdb.org.mechant.test/t/p/w342/abc.jpg", out _));

// ----------------------------------------------------------------------------
// Preferences par compte : validation de ce qui vient du client, puis fusion.
// ----------------------------------------------------------------------------

Check("PREFS: des preferences vides valent aucune preference",
    UserPreferenceRules.Sanitize(new UserRowPreferences()) is null);
Check("PREFS: null reste null", UserPreferenceRules.Sanitize(null) is null);

// La couleur part dans une feuille de styles construite par concatenation.
Check("PREFS: une couleur valide est conservee",
    UserPreferenceRules.Sanitize(new UserRowPreferences { HighlightColor = "#ABCDEF" })?.HighlightColor == "#ABCDEF");
Check("PREFS: une couleur qui ferme la regle est ecartee",
    UserPreferenceRules.Sanitize(new UserRowPreferences { HighlightColor = "red;} body{display:none} .x{color:red" }) is null);
Check("PREFS: une couleur sans diese est ecartee",
    UserPreferenceRules.Sanitize(new UserRowPreferences { HighlightColor = "775BF4" }) is null);

// L'ordre pilote des selecteurs : seuls les identifiants connus passent.
Check("PREFS: un identifiant inconnu est ecarte",
    UserPreferenceRules.Sanitize(new UserRowPreferences { RowOrder = "local,inconnue,genres" })?.RowOrder == "local,genres");
Check("PREFS: un doublon est ecarte",
    UserPreferenceRules.Sanitize(new UserRowPreferences { RowOrder = "local,local,genres" })?.RowOrder == "local,genres");
Check("PREFS: les sections natives sont acceptees",
    UserPreferenceRules.Sanitize(new UserRowPreferences { RowOrder = "native:nextup,local" })?.RowOrder == "native:nextup,local");
Check("PREFS: un ordre entierement inconnu ne laisse rien",
    UserPreferenceRules.Sanitize(new UserRowPreferences { RowOrder = "aaa,bbb" }) is null);

// L'echelle a les bornes du rendu, 40 a 100 : au-dela, rien ne changerait a l'ecran.
Check("PREFS: une echelle demesuree est ramenee au plafond du rendu",
    UserPreferenceRules.Sanitize(new UserRowPreferences { RankNumberScale = 9000 })?.RankNumberScale == 100);
Check("PREFS: une echelle negative est ecartee",
    UserPreferenceRules.Sanitize(new UserRowPreferences { RankNumberScale = -5 }) is null);
// 25 est ce qu'enregistrait le panneau jusqu'en 3.14.1, sans que personne l'ait choisi :
// relevee a 40, elle figerait un chiffre reduit ; ecartee, le compte suit le serveur.
Check("PREFS: 25, la valeur du curseur defectueux, est ecartee",
    UserPreferenceRules.Sanitize(new UserRowPreferences { RankNumberScale = 25 }) is null);
Check("PREFS: le plancher du rendu est accepte",
    UserPreferenceRules.Sanitize(new UserRowPreferences { RankNumberScale = 40 })?.RankNumberScale == 40);

// La fusion : null ne doit RIEN ecraser, sinon un compte cesserait de suivre le serveur
// pour des reglages auxquels il n'a jamais touche.
var serveur = new ClientOptionsDto
{
    EnableHomeRows = true,
    ShowLocalRow = true,
    ShowGenreRows = true,
    HighlightColor = "#775BF4",
    RowOrder = "local,genres",
    RankNumberScale = 100
};

UserPreferenceRules.Apply(serveur, null);
Check("PREFS: aucune preference ne change rien",
    serveur.ShowLocalRow && serveur.HighlightColor == "#775BF4");

UserPreferenceRules.Apply(serveur, new UserRowPreferences { ShowGenreRows = false });
Check("PREFS: un choix explicite l'emporte", !serveur.ShowGenreRows);
Check("PREFS: le reste continue de suivre le serveur",
    serveur.ShowLocalRow && serveur.RowOrder == "local,genres" && serveur.RankNumberScale == 100);

UserPreferenceRules.Apply(serveur, new UserRowPreferences { HighlightColor = "#000000", RankNumberScale = 55 });
Check("PREFS: couleur et echelle sont reprises",
    serveur.HighlightColor == "#000000" && serveur.RankNumberScale == 55);

// Le fichier des preferences peut porter une valeur enregistree sous les anciennes bornes.
var avecAncienneEchelle = new ClientOptionsDto { RankNumberScale = 100 };
UserPreferenceRules.Apply(avecAncienneEchelle, new UserRowPreferences { RankNumberScale = 25 });
Check("PREFS: un 25 deja enregistre n'est plus applique, le serveur reprend la main",
    avecAncienneEchelle.RankNumberScale == 100);
UserPreferenceRules.Apply(avecAncienneEchelle, new UserRowPreferences { RankNumberScale = 150 });
Check("PREFS: un 150 deja enregistre est ramene au plafond du rendu",
    avecAncienneEchelle.RankNumberScale == 100);

// SEERR — association des comptes, etats calques sur Jellyfin Enhanced, choix des saisons.
var jellyfinId = Guid.Parse("22ae9f6f-970a-4447-a5f7-02ae3fbeb896");
Check("SEERR: l'identifiant Jellyfin perd ses tirets, comme Seerr l'enregistre",
    SeerrRules.NormalizeJellyfinUserId(jellyfinId) == "22ae9f6f970a4447a5f702ae3fbeb896");
const string comptesSeerr = """
    {"pageInfo":{"results":3},"results":[
      {"id":1,"jellyfinUserId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
      {"id":2,"displayName":"compte local, sans lien Jellyfin"},
      {"id":7,"jellyfinUserId":"22AE9F6F970A4447A5F702AE3FBEB896"}]}
    """;
Check("SEERR: le compte lie est retrouve, casse ignoree",
    SeerrRules.FindSeerrUserId(comptesSeerr, jellyfinId) == 7);
Check("SEERR: un identifiant enregistre avec ses tirets est retrouve aussi",
    SeerrRules.FindSeerrUserId("""{"results":[{"id":9,"jellyfinUserId":"22ae9f6f-970a-4447-a5f7-02ae3fbeb896"}]}""", jellyfinId) == 9);
Check("SEERR: un compte absent de Seerr ne correspond a personne",
    SeerrRules.FindSeerrUserId(comptesSeerr, Guid.Parse("11111111-2222-3333-4444-555555555555")) is null);
Check("SEERR: une reponse sans liste de comptes ne correspond a personne",
    SeerrRules.FindSeerrUserId("""{"message":"Unauthorized"}""", jellyfinId) is null);

// Films : les etats de seerr-status.js.
string Film(string mediaInfo) => SeerrRules.ReadState("{\"id\":27205" + mediaInfo + "}", "movie");
Check("SEERR: un film que Seerr n'a jamais vu se demande", Film("") == "request");
Check("SEERR: un film en attente attend l'approbation", Film(""","mediaInfo":{"status":2}""") == "pending");
Check("SEERR: un film approuve sans telechargement est « Demande »",
    Film(""","mediaInfo":{"status":3,"downloadStatus":[]}""") == "requested");
Check("SEERR: un film qui se telecharge est « Traitement »",
    Film(""","mediaInfo":{"status":3,"downloadStatus":[{"size":10}]}""") == "processing");
Check("SEERR: partiellement disponible, disponible, bloque",
    Film(""","mediaInfo":{"status":4}""") == "partial" && Film(""","mediaInfo":{"status":5}""") == "available"
    && Film(""","mediaInfo":{"status":6}""") == "blocked");
Check("SEERR: un film supprime redevient demandable", Film(""","mediaInfo":{"status":7}""") == "request");

// Series : l'etat d'ensemble, puis sa deduction depuis les saisons.
string Serie(string mediaInfo) => SeerrRules.ReadState("{\"id\":1399" + mediaInfo + "}", "tv");
string Saisons(bool speciaux, params (int N, int S)[] saisons) => SeerrRules.ReadState("{\"id\":1399,\"mediaInfo\":{\"status\":1,\"seasons\":["
    + string.Join(",", saisons.Select(s => "{\"seasonNumber\":" + s.N + ",\"status\":" + s.S + "}")) + "]}}", "tv", speciaux);
Check("SEERR: une serie inconnue se demande", Serie("") == "request");
Check("SEERR: sans detail des saisons, une serie en attente reste « En attente d'approbation »",
    Serie(""","mediaInfo":{"status":2}""") == "pending");
Check("SEERR: sans detail des saisons, une serie en cours laisse demander les autres",
    Serie(""","mediaInfo":{"status":3}""") == "request");
Check("SEERR: sans detail des saisons, partiellement disponible propose « Demander manquant »",
    Serie(""","mediaInfo":{"status":4}""") == "request-missing");
Check("SEERR: toutes les saisons disponibles : « Disponible »", Saisons(false, (1, 5), (2, 5)) == "available");
Check("SEERR: des speciaux jamais demandes gardent la serie demandable, si Seerr les accepte",
    Saisons(true, (0, 1), (1, 5), (2, 5)) == "request-more" && Saisons(false, (0, 1), (1, 5), (2, 5)) == "available");
Check("SEERR: une saison disponible et une absente : « Demander manquant »", Saisons(false, (1, 5), (2, 1)) == "request-missing");
Check("SEERR: une saison demandee et une absente : « Demander »", Saisons(false, (1, 2), (2, 1)) == "request");
Check("SEERR: tout est demande et en attente : plus « Demander », mais « En attente d'approbation »",
    Saisons(false, (1, 2), (2, 2)) == "pending");
Check("SEERR: tout est demande, une saison approuvee : « Demande »", Saisons(false, (1, 2), (2, 3)) == "requested");
Check("SEERR: rien a demander, une partie disponible : « Partiellement disponible »",
    Saisons(false, (1, 5), (2, 3)) == "partial");
Check("SEERR: toutes les saisons bloquees : « Bloque »", Saisons(false, (1, 6), (2, 6)) == "blocked");
Check("SEERR: les speciaux seuls ne decident de rien", Saisons(true, (0, 5)) == "request");

// Choix des saisons.
const string serieDetaillee = """
    {"id":1399,"seasons":[
      {"seasonNumber":0,"name":"Specials","episodeCount":14,"airDate":"2010-12-05"},
      {"seasonNumber":1,"name":"Saison 1","episodeCount":10,"airDate":"2011-04-17"},
      {"seasonNumber":2,"name":"2","episodeCount":10,"airDate":"2012-04-01"},
      {"seasonNumber":3,"name":"","episodeCount":10,"airDate":null},
      {"seasonNumber":4,"name":"Saison 4","episodeCount":0},
      {"seasonNumber":5,"name":"Saison 5","episodeCount":10},
      {"seasonNumber":6,"name":"Saison 6","episodeCount":10}],
     "mediaInfo":{"status":4,
      "seasons":[{"seasonNumber":1,"status":5},{"seasonNumber":2,"status":3}],
      "requests":[
        {"status":1,"seasons":[{"seasonNumber":3,"status":1}]},
        {"status":3,"seasons":[{"seasonNumber":5,"status":3}]}],
      "downloadStatus":[{"episode":{"seasonNumber":2}}]}}
    """;
var sansSpeciaux = SeerrRules.ReadSeasons(serieDetaillee, includeSpecials: false);
var avecSpeciaux = SeerrRules.ReadSeasons(serieDetaillee, includeSpecials: true);
SeerrSeason Saison(int n) => sansSpeciaux.First(s => s.Number == n);
Check("SEERR: sans episodes, une saison n'est pas proposee ; les speciaux seulement si Seerr les accepte",
    string.Join(",", sansSpeciaux.Select(s => s.Number)) == "1,2,3,5,6"
    && string.Join(",", avecSpeciaux.Select(s => s.Number)) == "0,1,2,3,5,6");
Check("SEERR: une saison disponible ne se redemande pas", Saison(1).State == "available" && !Saison(1).Requestable);
Check("SEERR: une saison qui se telecharge est « Traitement »", Saison(2).State == "processing" && !Saison(2).Requestable);
Check("SEERR: une saison qui attend son approbation n'est plus demandable",
    Saison(3).State == "requested" && !Saison(3).Requestable);
Check("SEERR: une demande refusee laisse la saison demandable", Saison(5).State == "not-requested" && Saison(5).Requestable);
Check("SEERR: un nom qui n'est qu'un numero est laisse au client", Saison(1).Name == "Saison 1" && Saison(2).Name is null && Saison(3).Name is null);
Check("SEERR: l'annee vient de la premiere diffusion", Saison(1).Year == "2011" && Saison(3).Year is null);
Check("SEERR: le nombre d'episodes est transmis", Saison(6).Episodes == 10);

Check("SEERR: les reglages de Seerr sont lus", SeerrRules.ReadRequestSettings(
    """{"apiKey":"secret","partialRequestsEnabled":true,"enableSpecialEpisodes":true}""") == (true, true));
Check("SEERR: un reglage absent vaut faux", SeerrRules.ReadRequestSettings("""{"applicationTitle":"Seerr"}""") == (false, false));

Check("SEERR: les saisons demandees sont dedoublonnees et triees",
    string.Join(",", SeerrRules.NormalizeSeasons(new[] { 3, 1, 3, 2 })!) == "1,2,3");
Check("SEERR: une liste vide, negative ou demesuree est refusee",
    SeerrRules.NormalizeSeasons(Array.Empty<int>()) is null && SeerrRules.NormalizeSeasons(new[] { -1 }) is null
    && SeerrRules.NormalizeSeasons(Enumerable.Range(1, 201)) is null && SeerrRules.NormalizeSeasons(null) is null);

Check("SEERR: un film se demande sans saisons",
    SeerrRules.BuildRequestBody("movie", 27205) == """{"mediaType":"movie","mediaId":27205}""");
Check("SEERR: une serie se demande saison par saison, comme la fenetre de Jellyfin Enhanced",
    SeerrRules.BuildRequestBody("tv", 1399, new[] { 1, 2 }) == """{"mediaType":"tv","mediaId":1399,"seasons":[1,2]}""");
// Options avancees : serveurs, profils, dossiers, et le choix qu'on laisse passer.
const string serveursSonarr = """
    [{"id":0,"name":"Sonarr","is4k":false,"isDefault":true,"activeProfileId":4,"activeDirectory":"/series"},
     {"id":1,"name":"Sonarr 4K","is4k":true,"isDefault":true,"activeProfileId":7,"activeDirectory":"/series-4k"},
     {"name":"sans identifiant"}]
    """;
var lusServeurs = SeerrRules.ReadServers(serveursSonarr);
Check("SEERR: les serveurs sont lus, un serveur sans identifiant ecarte",
    lusServeurs.Count == 2 && lusServeurs[0].Name == "Sonarr" && lusServeurs[0].IsDefault && !lusServeurs[0].Is4k
    && lusServeurs[0].ActiveProfileId == 4 && lusServeurs[0].ActiveDirectory == "/series" && lusServeurs[1].Is4k);
var (profilsLus, dossiersLus) = SeerrRules.ReadServerDetails("""
    {"server":{"id":0},"profiles":[{"id":4,"name":"HD-1080p"},{"id":6,"name":"Ultra-HD"}],
     "rootFolders":[{"id":1,"path":"/series","freeSpace":4376499000000},{"id":2,"path":"/series2"}]}
    """);
Check("SEERR: le detail d'un serveur donne ses profils et ses dossiers, espace libre compris",
    profilsLus.Count == 2 && profilsLus[0].Name == "HD-1080p" && dossiersLus.Count == 2
    && dossiersLus[0].FreeSpace == 4376499000000 && dossiersLus[1].FreeSpace is null);
var detailles = new[]
{
    lusServeurs[0] with { Profiles = profilsLus, Folders = dossiersLus },
    lusServeurs[1] with { Profiles = new[] { new SeerrProfile(7, "4K") }, Folders = new[] { new SeerrFolder("/series-4k", null) } }
};
Check("SEERR: un choix publie par Seerr passe",
    SeerrRules.IsAllowedChoice(detailles, new SeerrChoice(0, 6, "/series2")));
Check("SEERR: un dossier invente ne passe pas — il finirait chez Sonarr",
    !SeerrRules.IsAllowedChoice(detailles, new SeerrChoice(0, 4, "C:/Windows")));
Check("SEERR: le profil d'un autre serveur ne passe pas",
    !SeerrRules.IsAllowedChoice(detailles, new SeerrChoice(0, 7, "/series")));
Check("SEERR: un serveur inconnu ne passe pas",
    !SeerrRules.IsAllowedChoice(detailles, new SeerrChoice(9, 4, "/series")));
Check("SEERR: les series vont a Sonarr, les films a Radarr",
    SeerrRules.ServiceFor("tv") == "sonarr" && SeerrRules.ServiceFor("movie") == "radarr");
Check("SEERR: le choix accompagne la demande",
    SeerrRules.BuildRequestBody("tv", 1399, new[] { 1 }, new SeerrChoice(0, 6, "/series2"))
        == """{"mediaType":"tv","mediaId":1399,"seasons":[1],"serverId":0,"profileId":6,"rootFolder":"/series2"}""");

Check("SEERR: seuls movie et tv sont des types de media",
    SeerrRules.IsMediaType("movie") && SeerrRules.IsMediaType("tv")
    && !SeerrRules.IsMediaType("Movie") && !SeerrRules.IsMediaType("series") && !SeerrRules.IsMediaType(null));
Check("SEERR: l'adresse perd sa barre finale",
    SeerrRules.NormalizeBaseUrl(" http://seerr.local:5055/ ") == "http://seerr.local:5055");
Check("SEERR: seules les adresses http et https sont acceptees",
    SeerrRules.NormalizeBaseUrl("ftp://seerr") is null && SeerrRules.NormalizeBaseUrl("javascript:alert(1)") is null
    && SeerrRules.NormalizeBaseUrl("") is null && SeerrRules.NormalizeBaseUrl(null) is null);

// ---------------------------------------------------------------------------
// Rapprochement du Top mondial sans recalcul : un titre demande qui arrive dans la
// bibliotheque passe « present », un titre supprime redevient absent.
// ---------------------------------------------------------------------------
var arrive = Guid.NewGuid();
var dejaPresent = Guid.NewGuid();
var calcul = TopListSnapshot.Restore(TopListKind.Global, "Tmdb", new[]
{
    new TopListEntry { Rank = 1, ItemId = dejaPresent, Name = "Present", TmdbId = "1", MediaType = "movie" },
    new TopListEntry { Rank = 2, Name = "Demande", TmdbId = "2", MediaType = "tv", PosterUrl = "p.jpg" },
    new TopListEntry { Rank = 3, Name = "Ancien", TmdbId = "3" }
}, new DateTime(2026, 9, 28, 18, 20, 0, DateTimeKind.Utc));

var biblio = new Dictionary<string, Guid> { ["movie:1"] = dejaPresent, ["tv:2"] = arrive, ["movie:3"] = Guid.NewGuid() };
Guid Resoudre(TrendingTitle t) => biblio.TryGetValue((t.IsMovie ? "movie:" : "tv:") + t.TmdbId, out var id) ? id : Guid.Empty;

var rapproche = GlobalTopRematch.Apply(calcul, Resoudre);
Check("REMATCH: le titre demande arrive dans la bibliotheque et passe present",
    rapproche is not null && rapproche.Entries[1].ItemId == arrive);
Check("REMATCH: rang, affiche et type sont conserves",
    rapproche is not null && rapproche.Entries[1].Rank == 2 && rapproche.Entries[1].PosterUrl == "p.jpg"
    && rapproche.Entries[1].MediaType == "tv");
Check("REMATCH: la date reste celle du calcul, la tuile ne pretend pas a un recalcul",
    rapproche is not null && rapproche.GeneratedUtc == calcul.GeneratedUtc && rapproche.Kind == TopListKind.Global);
Check("REMATCH: une entree calculee avant les types attend le recalcul",
    rapproche is not null && rapproche.Entries[2].ItemId == Guid.Empty);
Check("REMATCH: rien de change, rien a publier", GlobalTopRematch.Apply(rapproche!, Resoudre) is null);

biblio.Remove("movie:1");
var retire = GlobalTopRematch.Apply(rapproche!, Resoudre);
Check("REMATCH: un titre supprime de la bibliotheque redevient absent",
    retire is not null && retire.Entries[0].ItemId == Guid.Empty);

biblio["movie:9"] = arrive;
var doublon = GlobalTopRematch.Apply(TopListSnapshot.Restore(TopListKind.Global, "Tmdb", new[]
{
    new TopListEntry { Rank = 1, Name = "Film", TmdbId = "9", MediaType = "movie" },
    new TopListEntry { Rank = 2, Name = "Film bis", TmdbId = "9", MediaType = "movie" }
}, DateTime.UtcNow), Resoudre);
Check("REMATCH: deux entrees ne montrent jamais la meme affiche",
    doublon is not null && doublon.Entries[0].ItemId == arrive && doublon.Entries[1].ItemId == Guid.Empty);

Check("REMATCH: cles surveillees par type et par IMDb",
    string.Join(",", GlobalTopRematch.KeysFor("tv", "2", "tt123")) == "tv:2,imdb:tt123"
    && !GlobalTopRematch.KeysFor("movie", null, " ").Any());

// ---------------------------------------------------------------------------
// Passage d'une rangee melee a deux rangees separees : constate en prod le 2026-09-28, la
// case cochee faisait disparaitre le Top mondial jusqu'au recalcul suivant.
// ---------------------------------------------------------------------------
var stock = new Dictionary<TopListKind, TopListSnapshot>
{
    [TopListKind.Global] = new(TopListKind.Global, "Tmdb", new[]
    {
        new TopListEntry { Rank = 1, Name = "Serie A", MediaType = "tv", TmdbId = "1" },
        new TopListEntry { Rank = 2, Name = "Film A", MediaType = "movie", TmdbId = "2" },
        new TopListEntry { Rank = 3, Name = "Film B", MediaType = "movie", TmdbId = "3" }
    }),
    [TopListKind.GlobalMovies] = TopListSnapshot.Empty(TopListKind.GlobalMovies),
    [TopListKind.GlobalSeries] = TopListSnapshot.Empty(TopListKind.GlobalSeries)
};
TopListSnapshot Lire(TopListKind kind) => stock[kind];

var filmsTires = GlobalTopFallback.For(TopListKind.GlobalMovies, Lire);
Check("SECOURS: avant le recalcul, les films sont tires de la liste melee, renumerotes",
    string.Join(",", filmsTires.Entries.Select(e => e.Rank + e.Name)) == "1Film A,2Film B"
    && filmsTires.Kind == TopListKind.GlobalMovies);
Check("SECOURS: et les series de meme",
    string.Join(",", GlobalTopFallback.For(TopListKind.GlobalSeries, Lire).Entries.Select(e => e.Name)) == "Serie A");
Check("SECOURS: une liste deja calculee est servie telle quelle",
    ReferenceEquals(GlobalTopFallback.For(TopListKind.Global, Lire), stock[TopListKind.Global]));

stock[TopListKind.GlobalMovies] = filmsTires;
stock[TopListKind.Global] = TopListSnapshot.Empty(TopListKind.Global);
Check("SECOURS: au retour a la liste melee, elle est refaite des deux moities",
    GlobalTopFallback.For(TopListKind.Global, Lire).Entries.Count == 2);
Check("SECOURS: rien a tirer, la liste vide reste vide",
    GlobalTopFallback.For(TopListKind.GlobalSeries, Lire).Entries.Count == 0);

// Le recalcul relance par un enregistrement ne doit pas se relancer lui-meme : il ecrit
// les identifiants de ses collections dans la configuration.
var reglages = new System.Text.Json.Nodes.JsonObject
{
    ["GlobalTopSplitByType"] = false,
    ["GlobalCollectionId"] = "a"
};
var empreinte = SettingsSignature.Of(reglages);
reglages["GlobalCollectionId"] = "b";
Check("REGLAGES: les identifiants de collection ne comptent pas comme un changement",
    SettingsSignature.Of(reglages) == empreinte);
reglages["GlobalTopSplitByType"] = true;
Check("REGLAGES: cocher la case separee compte comme un changement",
    SettingsSignature.Of(reglages) != empreinte);

// ---------------------------------------------------------------------------
// Top du serveur d'apres les vraies lectures (Playback Reporting). Les cas rejouent la
// prod du 2026-09-28 : un compte a 0 minute faisait gagner une voix, et 96 heures de
// visionnage ne pesaient pas plus que 25 minutes.
// ---------------------------------------------------------------------------
Guid Id(int n) => new Guid(n, 0, 0, new byte[8]);
var lundi = new DateTime(2026, 9, 21, 20, 0, 0);
var vues = new List<PlaybackView>
{
    // Mushoku : deux vrais spectateurs, et un compte qui n'a rien regarde.
    new(Id(1), Id(101), 1380, lundi), new(Id(1), Id(102), 1020, lundi), new(Id(1), Id(103), 0, lundi),
    // Rick et Morty : un seul spectateur, 96 heures.
    new(Id(2), Id(101), 345600, lundi),
    // Tempal : un seul spectateur, 25 minutes, mais plus recent.
    new(Id(3), Id(102), 1500, lundi.AddDays(3)),
    // Trois petites lectures de 2 minutes : 6 minutes en tout, le compte compte.
    new(Id(4), Id(104), 120, lundi), new(Id(4), Id(104), 120, lundi), new(Id(4), Id(104), 120, lundi),
    // Deux minutes seulement : personne ne l'a vraiment regarde.
    new(Id(5), Id(101), 120, lundi)
};
var reel = PlaybackTop.Rank(vues, 10);
Check("VRAIES LECTURES: un compte a 0 minute ne compte pas comme spectateur",
    reel.First(t => t.TitleId == Id(1)).Viewers == 2);
Check("VRAIES LECTURES: plusieurs courtes lectures s'additionnent, 6 min comptent",
    reel.Any(t => t.TitleId == Id(4) && t.Viewers == 1));
Check("VRAIES LECTURES: 2 minutes en tout ne font pas un spectateur, le titre disparait",
    reel.All(t => t.TitleId != Id(5)));
Check("VRAIES LECTURES: deux spectateurs passent devant un seul",
    reel[0].TitleId == Id(1));
Check("VRAIES LECTURES: entre spectateurs uniques, le temps passe departage, pas la recence",
    reel[1].TitleId == Id(2) && reel[2].TitleId == Id(3));
Check("VRAIES LECTURES: la taille est respectee", PlaybackTop.Rank(vues, 2).Count == 2);

// Fichier remplace apres lecture : l'episode est retrouve par serie, saison et numero,
// lus dans le nom que Playback Reporting enregistre (noms releves sur la prod).
Check("NOMS: « One Piece - s23e25 - … » donne la serie, la saison et le numero",
    PlaybackNames.ParseEpisode("One Piece - s23e25 - Le désespoir envahit Elbaf") == new PlaybackEpisodeName("One Piece", 23, 25));
Check("NOMS: une serie dont le nom porte des tirets reste entiere",
    PlaybackNames.ParseEpisode("Re:ZERO -Starting Life in Another World- - s03e05 - Titre")
        == new PlaybackEpisodeName("Re:ZERO -Starting Life in Another World-", 3, 5));
Check("NOMS: un titre d'episode avec deux-points ne gene pas",
    PlaybackNames.ParseEpisode("The Mandalorian - s02e02 - Chapitre 10 : La passagère") == new PlaybackEpisodeName("The Mandalorian", 2, 2));
Check("NOMS: sans titre d'episode, en capitales",
    PlaybackNames.ParseEpisode("Lioness - S01E08") == new PlaybackEpisodeName("Lioness", 1, 8));
Check("NOMS: un nom de film n'est pas pris pour un episode",
    PlaybackNames.ParseEpisode("Transformers : Le Commencement") is null && PlaybackNames.ParseEpisode("") is null);

// ---------------------------------------------------------------------------
// Fichier des reglages. Rejoue la prod du 2026-09-29 : une ecriture tombee en panne en route
// avait deja vide le fichier, et Jellyfin remplace par les valeurs par defaut tout fichier
// qu'il n'arrive pas a lire. Tous les reglages etaient perdus.
// ---------------------------------------------------------------------------
var dossierReglages = Path.Combine(Path.GetTempPath(), "mc-reglages-" + Guid.NewGuid().ToString("N"));
var fichierReglages = Path.Combine(dossierReglages, "JellyfinCarouselPlugin.xml");

var absent = ConfigurationFile.Read<ReglagesDeTest>(fichierReglages, out var problemeAbsent);
Check("REGLAGES SURS: fichier absent, valeurs par defaut sans rien ecrire",
    absent.Titre == "defaut" && problemeAbsent is null && !File.Exists(fichierReglages));

ConfigurationFile.Write(fichierReglages, new ReglagesDeTest { Titre = "Top 10 des films", Taille = 20 });
var relu = ConfigurationFile.Read<ReglagesDeTest>(fichierReglages, out var problemeRelu);
Check("REGLAGES SURS: ce qui est ecrit se relit",
    relu.Titre == "Top 10 des films" && relu.Taille == 20 && problemeRelu is null);
Check("REGLAGES SURS: aucun fichier temporaire ne reste apres une ecriture",
    Directory.GetFiles(dossierReglages).Length == 1);

// Une ecriture qui tombe en panne en route laisse l'ancien fichier intact.
var avantPanne = File.ReadAllBytes(fichierReglages);
var panne = false;
try
{
    ConfigurationFile.Write(fichierReglages, new ReglagesPieges());
}
catch (InvalidOperationException)
{
    panne = true;
}

Check("REGLAGES SURS: une ecriture en panne laisse l'ancien fichier intact",
    panne && File.ReadAllBytes(fichierReglages).SequenceEqual(avantPanne));
Check("REGLAGES SURS: ni fichier temporaire apres la panne",
    Directory.GetFiles(dossierReglages).Length == 1);

// Temoin : ecrit comme Jellyfin (FileMode.Create), la meme panne perdait le fichier.
var temoin = Path.Combine(dossierReglages, "temoin.xml");
File.WriteAllBytes(temoin, avantPanne);
try
{
    using var fluxTemoin = new FileStream(temoin, FileMode.Create, FileAccess.Write);
    new XmlSerializer(typeof(ReglagesPieges)).Serialize(fluxTemoin, new ReglagesPieges());
}
catch (InvalidOperationException)
{
}

Check("REGLAGES SURS: temoin, l'ecriture de Jellyfin perdait le fichier sur la meme panne",
    !File.ReadAllBytes(temoin).SequenceEqual(avantPanne));
File.Delete(temoin);

// Le fichier vide que la prod a laisse : illisible, mais laisse tel quel.
File.WriteAllBytes(fichierReglages, Array.Empty<byte>());
var vide = ConfigurationFile.Read<ReglagesDeTest>(fichierReglages, out var problemeVide);
Check("REGLAGES SURS: fichier vide, valeurs par defaut et probleme signale",
    vide.Titre == "defaut" && problemeVide is not null);
Check("REGLAGES SURS: fichier vide, rien n'est reecrit", new FileInfo(fichierReglages).Length == 0);

var coupe = avantPanne.Take(avantPanne.Length / 2).ToArray();
File.WriteAllBytes(fichierReglages, coupe);
var tronque = ConfigurationFile.Read<ReglagesDeTest>(fichierReglages, out var problemeTronque);
Check("REGLAGES SURS: fichier coupe au milieu, valeurs par defaut et fichier laisse tel quel",
    tronque.Titre == "defaut" && problemeTronque is not null && File.ReadAllBytes(fichierReglages).SequenceEqual(coupe));

// Un fichier ecrit par Jellyfin lui-meme, celui de toutes les installations, se relit.
using (var fluxJellyfin = new FileStream(fichierReglages, FileMode.Create, FileAccess.Write))
using (var texte = new StreamWriter(fluxJellyfin, null, 1024, leaveOpen: true))
using (var xml = new XmlTextWriter(texte) { Formatting = Formatting.Indented })
{
    new XmlSerializer(typeof(ReglagesDeTest)).Serialize(xml, new ReglagesDeTest { Titre = "ecrit par Jellyfin", Taille = 7 });
}

var jellyfin = ConfigurationFile.Read<ReglagesDeTest>(fichierReglages, out var problemeJellyfin);
Check("REGLAGES SURS: un fichier ecrit par Jellyfin se relit",
    jellyfin.Titre == "ecrit par Jellyfin" && jellyfin.Taille == 7 && problemeJellyfin is null);

Directory.Delete(dossierReglages, recursive: true);

// ---------------------------------------------------------------------------
// Texte de la fiche de l'extension : francais sur un serveur en francais, anglais sinon
// (demande d'Elie le 2026-10-03).
// ---------------------------------------------------------------------------
Check("DESCRIPTION: un serveur en fr-FR lit le francais", PluginDescription.For("fr-FR") == PluginDescription.French);
Check("DESCRIPTION: toute variante du francais aussi (fr, FR-ca, fr_BE)",
    PluginDescription.For("fr") == PluginDescription.French
    && PluginDescription.For("FR-ca") == PluginDescription.French
    && PluginDescription.For("fr_BE") == PluginDescription.French);
Check("DESCRIPTION: l'anglais pour toute autre langue (en-US, de-DE, es)",
    PluginDescription.For("en-US") == PluginDescription.English
    && PluginDescription.For("de-DE") == PluginDescription.English
    && PluginDescription.For("es") == PluginDescription.English);
Check("DESCRIPTION: l'anglais sans langue connue, ni pour un code qui commence seulement par fr",
    PluginDescription.For(null) == PluginDescription.English
    && PluginDescription.For("") == PluginDescription.English
    && PluginDescription.For("fri") == PluginDescription.English);

Console.WriteLine(failed == 0 ? "\nTous les tests passent." : $"\n{failed} echec(s).");
return failed;

/// <summary>
/// Reglages de test : deux champs et leurs valeurs par defaut.
/// </summary>
public class ReglagesDeTest
{
    /// <summary>Obtient ou definit un titre.</summary>
    public string Titre { get; set; } = "defaut";

    /// <summary>Obtient ou definit une taille.</summary>
    public int Taille { get; set; } = 10;
}

/// <summary>
/// Reglages dont l'ecriture tombe en panne en route, apres un premier champ.
/// </summary>
public class ReglagesPieges
{
    /// <summary>Obtient ou definit le champ ecrit avant la panne.</summary>
    public string Premier { get; set; } = "ecrit";

    /// <summary>Obtient ou definit le champ qui tombe en panne.</summary>
    public string Second
    {
        get => throw new InvalidOperationException("panne en route");
        set { }
    }
}
