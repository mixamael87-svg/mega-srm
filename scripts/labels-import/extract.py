"""Labels import, step 1: BarTender .btw files → preview PNGs + manifest.

Usage: python3 -I scripts/labels-import/extract.py <folder with .btw> <out dir>

The .btw format is closed; each file embeds a PNG preview (≈600×600 px for the 37.5 × 40 mm label).
Rules for «Загальна» (owner, 17.11.2026): skip 1400/*, skip "0402 без фут" (duplicate of 0402),
"... не друк" → noPrint, "1205-1" → sku 1205 + extra «частина 2», "частина 2" → helper label.
"""
import json
import os
import re
import sys

SKIP_DIRS = {'1400'}
SKIP_FILES = {'0402 без фут'}
HELPER = 'Частина 2 (серія 1200)'


def classify(stem: str):
    if stem in SKIP_FILES:
        return None
    if stem == 'частина 2':
        return {'sku': None, 'title': HELPER, 'noPrint': False, 'extraTitle': None}
    m = re.match(r'^(\d{4})(-1)?(.*)$', stem)
    if not m:
        raise SystemExit(f'Unknown file name: {stem}')
    rest = m.group(3).strip()
    no_print = bool(re.search(r'не\s*(друк|печ)', rest))
    if rest and not no_print:
        raise SystemExit(f'Unknown suffix in file name: {stem}')
    return {'sku': m.group(1), 'title': '', 'noPrint': no_print, 'extraTitle': HELPER if m.group(2) else None}


def main(src: str, out: str):
    os.makedirs(os.path.join(out, 'prev'), exist_ok=True)
    manifest = []
    for d in sorted(os.listdir(src)):
        if d in SKIP_DIRS or not os.path.isdir(os.path.join(src, d)):
            continue
        for f in sorted(os.listdir(os.path.join(src, d))):
            if not f.endswith('.btw'):
                continue
            stem = f[:-4]
            c = classify(stem)
            if c is None:
                continue
            b = open(os.path.join(src, d, f), 'rb').read()
            s = b.find(b'\x89PNG')
            e = b.find(b'IEND', s) + 8
            if s < 0:
                raise SystemExit(f'No preview in {d}/{f}')
            key = c['sku'] or 'helper-1200'
            open(os.path.join(out, 'prev', key + '.png'), 'wb').write(b[s:e])
            manifest.append({'key': key, 'file': f'{d}/{f}', **c})
    keys = [m['key'] for m in manifest]
    dup = {k for k in keys if keys.count(k) > 1}
    if dup:
        raise SystemExit(f'Duplicate articles: {sorted(dup)}')
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
    print(len(manifest), 'labels')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
