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

Console.WriteLine(failed == 0 ? "\nTous les tests passent." : $"\n{failed} echec(s).");
return failed;
