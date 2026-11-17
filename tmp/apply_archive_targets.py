import json
import re
import urllib.parse
from pathlib import Path

root = Path('/Users/augie/OES-site/site')
plan = Path('/Volumes/admin2/Documents/OES-ARCHIVE/ARCHIVE-META/Reconciliation/oes-archive-full-plan-2026-10-31.json')
rows = json.loads(plan.read_text(encoding='utf-8'))['legacy_pdfs_url_mapping']
map_target = {row['old_path']: row.get('target') for row in rows if row.get('target')}
files = [
    p for p in root.rglob('*')
    if p.is_file() and '.git' not in p.parts and '_deploy' not in p.parts
    and 'ARCHIVE-META' not in p.parts and p.suffix.lower() in {'.html','.js','.mjs','.json','.css','.md','.py'}
]
pat = re.compile(r'https://media\.otorlymern-electrical\.com(/pdfs/[^"\'<>\s)]+)', re.I)
changed = []
replacements = 0
for path in files:
    try: text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError): continue
    def repl(m):
        nonlocal_dummy = None
        raw = m.group(1)
        hash_part = ''
        if '#' in raw:
            raw, hash_part = raw.split('#', 1)
            hash_part = '#' + hash_part
        old_path = '/pdfs/' + urllib.parse.unquote(raw[len('/pdfs/'):])
        target = map_target.get(old_path)
        if not target:
            return m.group(0)
        return 'https://media.otorlymern-electrical.com' + target + hash_part
    updated = pat.sub(repl, text)
    if updated != text:
        path.write_text(updated, encoding='utf-8')
        changed.append(path.relative_to(root).as_posix())
        replacements += len(pat.findall(text))
print(json.dumps({'files_changed': len(changed), 'candidate_matches_in_changed_files': replacements, 'files': changed}, indent=2))
