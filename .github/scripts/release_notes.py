"""Transforme les commits conventionnels en release notes Markdown lisibles.
Lit les commits sur stdin (un par ligne), écrit les notes sur stdout.
"""
import sys
import re

raw = sys.stdin.read()
feats, fixes, perfs, others = [], [], [], []

for line in raw.strip().split('\n'):
    line = line.strip()
    if not line:
        continue
    m = re.match(r'^(\w+)(?:\([^)]*\))?!?:\s*(.+)$', line)
    if m:
        t, msg = m.group(1).lower(), m.group(2).strip()
        msg = msg[0].upper() + msg[1:]
        if t == 'feat':
            feats.append(msg)
        elif t in ('fix', 'hotfix'):
            fixes.append(msg)
        elif t == 'perf':
            perfs.append(msg)
        elif t not in ('chore', 'build', 'ci', 'docs'):
            others.append(msg)
    else:
        others.append(line[0].upper() + line[1:])

out = []
if feats:
    out.append('### Nouvelles fonctionnalites\n' + '\n'.join(f'- {x}' for x in feats))
if fixes:
    out.append('### Corrections\n' + '\n'.join(f'- {x}' for x in fixes))
if perfs:
    out.append('### Performances\n' + '\n'.join(f'- {x}' for x in perfs))
if others:
    out.append('### Ameliorations\n' + '\n'.join(f'- {x}' for x in others))
if not out:
    out.append('### Ameliorations\n- Mise a jour et corrections diverses')

print('\n\n'.join(out))
