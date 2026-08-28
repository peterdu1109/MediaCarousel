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
    PosterProxy.ToLocalUrl("https://image.tmdb.org/t/p/w342/abc123.jpg") == "/MediaCarousel/Poster/abc123.jpg");
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

Console.WriteLine(failed == 0 ? "\nTous les tests passent." : $"\n{failed} echec(s).");
return failed;
