#!/usr/bin/env python3
"""
Content-hash cache busting for the browser modules (no build tools needed).

Every relative import in src/js is rewritten to carry a version tag derived
from the imported file's contents, e.g. `from './market.js?v=1a2b3c4d'`, and
index.html loads `src/js/app.js?v=<hash>`. Hashes cascade: a file's tag covers
its own text *including* the tags of what it imports, so changing any module
changes the URL of every module that depends on it, up to app.js.

Why: GitHub Pages lets browsers cache each file for 10 minutes and iOS Safari
may keep them longer. With plain URLs a phone can combine a fresh app.js with
stale copies of the modules it imports (or the reverse), and the whole app
fails to start. Versioned URLs make every deploy a self-consistent set.

Usage:
    python scripts/stamp_versions.py          # rewrite tags in place
    python scripts/stamp_versions.py --check  # exit 1 if any tag is stale (CI)
"""

import hashlib
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'src', 'js')
INDEX = os.path.join(ROOT, 'index.html')
IMPORT_RE = re.compile(r"""((?:import|export)\b[^'"]*?\bfrom\s*|import\s*\(\s*|import\s+)(['"])(\.{1,2}/[^'"?]+\.js)(?:\?v=[0-9a-f]+)?\2""")
APP_RE = re.compile(r'(src="src/js/app\.js)(?:\?v=[0-9a-f]+)?(")')


def modules():
    out = []
    for d, _, files in os.walk(SRC):
        out += [os.path.normpath(os.path.join(d, f)) for f in files if f.endswith('.js')]
    return sorted(out)


def deps(path, text):
    return [os.path.normpath(os.path.join(os.path.dirname(path), m.group(3))) for m in IMPORT_RE.finditer(text)]


def stamp(check=False):
    texts = {p: open(p, encoding='utf-8').read() for p in modules()}
    hashes, stale = {}, []

    def visit(p, stack=()):
        if p in hashes:
            return hashes[p]
        if p in stack:
            raise SystemExit(f'import cycle through {p}')
        for d in deps(p, texts[p]):
            if d not in texts:
                raise SystemExit(f'{os.path.relpath(p, ROOT)} imports missing file {os.path.relpath(d, ROOT)}')
            visit(d, stack + (p,))

        def sub(m):
            target = os.path.normpath(os.path.join(os.path.dirname(p), m.group(3)))
            return f"{m.group(1)}{m.group(2)}{m.group(3)}?v={hashes[target]}{m.group(2)}"

        new = IMPORT_RE.sub(sub, texts[p])
        if new != texts[p]:
            stale.append(os.path.relpath(p, ROOT))
            texts[p] = new
            if not check:
                with open(p, 'w', encoding='utf-8') as f:
                    f.write(new)
        hashes[p] = hashlib.sha256(new.encode('utf-8')).hexdigest()[:10]
        return hashes[p]

    for p in texts:
        visit(p)
    app = os.path.join(SRC, 'app.js')
    html = open(INDEX, encoding='utf-8').read()
    new_html = APP_RE.sub(lambda m: f'{m.group(1)}?v={hashes[app]}{m.group(2)}', html)
    if new_html != html:
        stale.append('index.html')
        if not check:
            with open(INDEX, 'w', encoding='utf-8') as f:
                f.write(new_html)
    return stale, hashes[app]


if __name__ == '__main__':
    check = '--check' in sys.argv
    stale, app_hash = stamp(check)
    if check and stale:
        print('Stale version tags (run python scripts/stamp_versions.py):', ', '.join(stale))
        sys.exit(1)
    print(f"{'Checked' if check else 'Stamped'} module versions; app.js?v={app_hash}"
          + (f" ({len(stale)} file(s) updated)" if stale and not check else ''))
