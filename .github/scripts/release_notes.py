"""Transforme des commits conventionnels en notes de version lisibles par un utilisateur.

Lit les sujets de commit sur stdin (un par ligne), ecrit du Markdown sur stdout.
L'objectif est qu'un utilisateur non developpeur comprenne ce qui change,
sans jargon de commit ni prefixe technique.
"""
import re
import sys

# Ordre d'affichage des sections. La cle est le type de commit conventionnel.
SECTIONS = [
    ("breaking", "## Attention avant de mettre a jour"),
    ("feat", "## Nouveautes"),
    ("fix", "## Corrections"),
    ("perf", "## Performances"),
    ("other", "## Autres ameliorations"),
]

# Types purement internes : invisibles pour l'utilisateur, donc masques.
HIDDEN_TYPES = {"chore", "build", "ci", "test", "style"}

# Portees techniques traduites en libelles comprehensibles.
SCOPE_LABELS = {
    "api": "API",
    "config": "Configuration",
    "ui": "Interface",
    "ux": "Interface",
    "layout": "Interface",
    "top": "Classements",
    "local": "Top du serveur",
    "global": "Top mondial",
    "collections": "Collections",
    "tmdb": "TMDB",
    "trakt": "Trakt",
}

COMMIT_PATTERN = re.compile(r"^(?P<type>\w+)(?:\((?P<scope>[^)]*)\))?(?P<breaking>!)?:\s*(?P<message>.+)$")


def humanize(message):
    """Met la premiere lettre en majuscule et retire la ponctuation finale."""
    message = message.strip().rstrip(".")
    return message[0].upper() + message[1:] if message else message


def classify(line):
    """Renvoie (section, texte) pour un sujet de commit, ou None s'il doit etre masque."""
    match = COMMIT_PATTERN.match(line)

    if not match:
        # Commit non conventionnel : affiche tel quel plutot que perdu.
        return "other", humanize(line)

    commit_type = match.group("type").lower()
    if commit_type in HIDDEN_TYPES:
        return None

    message = humanize(match.group("message"))

    scope = (match.group("scope") or "").lower()
    label = SCOPE_LABELS.get(scope)
    if label:
        message = "**{0}** — {1}".format(label, message)

    if match.group("breaking"):
        return "breaking", message

    if commit_type == "docs":
        return None
    if commit_type in ("feat", "fix", "perf"):
        return commit_type, message
    if commit_type == "hotfix":
        return "fix", message

    return "other", message


def main():
    buckets = {key: [] for key, _ in SECTIONS}

    for line in sys.stdin.read().splitlines():
        line = line.strip()
        if not line or "[skip ci]" in line:
            continue

        result = classify(line)
        if result is None:
            continue

        section, message = result
        # Deux commits peuvent decrire la meme chose : on ne la liste qu'une fois.
        if message not in buckets[section]:
            buckets[section].append(message)

    blocks = []
    for key, heading in SECTIONS:
        if buckets[key]:
            blocks.append(heading + "\n\n" + "\n".join("- " + item for item in buckets[key]))

    if not blocks:
        blocks.append("## Autres ameliorations\n\n- Corrections et ajustements divers")

    print("\n\n".join(blocks))


if __name__ == "__main__":
    main()
