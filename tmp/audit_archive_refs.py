import re
import urllib.parse
from pathlib import Path

root = Path('/Users/augie/OES-site/site')
archive = Path('/Volumes/admin2/Documents/OES-ARCHIVE/DOCUMENTS')
files = [
    p for p in root.rglob('*')
    if p.is_file()
    and p.suffix.lower() in {'.html', '.js', '.mjs', '.json', '.css', '.md', '.py'}
    and '.git' not in p.parts
    and 'node_modules' not in p.parts
]
pat = re.compile(r"https://media\.otorlymern-electrical\.com/pdfs/([^\"'<>\s)]+)", re.I)
refs = []
for f in files:
    try:
        text = f.read_text(errors='ignore')
    except Exception:
        continue
    for m in pat.finditer(text):
        raw = urllib.parse.unquote(m.group(1))
        refs.append((f.relative_to(root).as_posix(), m.group(0), raw))

print('refs', len(refs), 'unique', len({x[1] for x in refs}))
allpdf = [p for p in archive.rglob('*.pdf')]
by_rel = {p.relative_to(archive).as_posix(): p for p in allpdf}
by_name = {}
for p in allpdf:
    by_name.setdefault(p.name.lower(), []).append(p)
def norm(s):
    return re.sub(r'[^a-z0-9]+', '', s.lower())
by_norm = {}
for p in allpdf:
    by_norm.setdefault(norm(p.name), []).append(p)
missing, resolved, ambiguous = [], [], []
for src, url, old in refs:
    candidates = []
    if old in by_rel:
        candidates = [by_rel[old]]
    if not candidates and old.lower() in by_rel:
        candidates = [by_rel[old.lower()]]
    name = Path(old).name
    if not candidates and name.lower() in by_name:
        candidates = by_name[name.lower()]
    if not candidates and norm(name) in by_norm:
        candidates = by_norm[norm(name)]
    if len(candidates) == 1:
        resolved.append((src, url, candidates[0].relative_to(archive).as_posix()))
    elif len(candidates) > 1:
        ambiguous.append((src, url, [p.relative_to(archive).as_posix() for p in candidates]))
    else:
        missing.append((src, url))
print('resolved', len(resolved), 'ambiguous', len(ambiguous), 'missing', len(missing))
for row in ambiguous[:80]:
    print('AMB', row)
for row in missing[:200]:
    print('MISS', row)
