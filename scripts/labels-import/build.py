"""Labels import, step 2: previews → OCR draft (zagalna.draft.json) for review.

Usage: python3 -I scripts/labels-import/build.py <out dir from extract.py> <conformity-mark.png>

Needs tesseract with the `ukr` model. The draft is checked by eye against every preview
before it becomes data/labels/zagalna.json.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image

PREFIX = '48260770'


def ean13(sku):
    body = PREFIX + sku
    s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(body))
    return body + str((10 - s % 10) % 10)


def tesseract(img, args):
    p = '/tmp/_ocr.png'
    img.save(p)
    return subprocess.run(['tesseract', p, '-', *args], capture_output=True, text=True).stdout


def normalized(path):
    """Preview is square; the label is 37.5 × 40 mm → restore the aspect, upscale ×3, gray."""
    im = Image.open(path).convert('L')
    w, h = im.size
    return im.resize((round(w * 37.5 / 40) * 3, h * 3), Image.LANCZOS)


def barcode_rows(a):
    """(top, bottom) of the barcode bars: the first run of ≥ 60 rows (×3 scale) that all have many transitions
    and the same bar pattern (text lines are much shorter than bars)."""
    h, w = a.shape
    dark = a < 128
    trans = (dark[:, 1:] != dark[:, :-1]).sum(axis=1)
    y = int(h * 0.5)
    while y < h:
        if trans[y] > 40:
            z = y
            while z + 1 < h and trans[z + 1] > 40 and (dark[z + 1] != dark[y]).mean() < 0.08:
                z += 1
            if z - y >= 60:
                return y, z
            y = z + 1
        else:
            y += 1
    return None


def find_mark(a, tmpl):
    """Best match of the mark in the top-right corner; returns (score, box)."""
    h, w = a.shape
    region = a[: int(h * 0.3), int(w * 0.6):]
    best = (0.0, None)
    for size in (80, 100, 125, 150, 180, 220, 260):
        t = np.asarray(tmpl.resize((round(size * tmpl.width / tmpl.height), size), Image.LANCZOS), dtype=np.float32)
        th, tw = t.shape
        if th >= region.shape[0] or tw >= region.shape[1]:
            continue
        tn = (t - t.mean()) / (t.std() + 1e-6)
        step = 8
        for y in range(0, region.shape[0] - th, step):
            for x in range(0, region.shape[1] - tw, step):
                p = region[y:y + th, x:x + tw]
                ps = p.std()
                if ps < 1:
                    continue
                score = float(((p - p.mean()) / ps * tn).mean())
                if score > best[0]:
                    best = (score, (int(w * 0.6) + x, y, tw, th))
    return best


def paragraphs(lines, short):
    """OCR lines → label text. Short labels keep their lines; long ones become title / art / body paragraphs."""
    lines = [l.strip() for l in lines if l.strip()]
    if short:
        return '\n'.join(lines)
    out, cur = [], []
    art_seen = False
    for l in lines:
        is_art = re.search(r'\b[АA]рт\.?\s*\d{4}', l, re.I) is not None
        if not art_seen:
            if is_art:
                if cur:
                    out.append(' '.join(cur)); cur = []
                out.append(l); art_seen = True
            else:
                cur.append(l)
            continue
        if re.match(r'^(Увага|УВАГА|ПОПЕРЕДЖЕННЯ)', l) and cur:
            out.append(' '.join(cur)); cur = []
        cur.append(l)
    if cur:
        out.append(' '.join(cur))
    text = '\n'.join(out)
    return re.sub(r'(\w)- (\w)', r'\1-\2', text)


def main(out, mark_path):
    manifest = json.load(open(os.path.join(out, 'manifest.json')))
    tmpl = Image.open(mark_path).convert('L')
    items = []
    for m in manifest:
        im = normalized(os.path.join(out, 'prev', m['key'] + '.png'))
        a = np.asarray(im, dtype=np.float32)
        h, w = a.shape
        bars = barcode_rows(a)
        top = bars[0] if bars else None
        score, box = find_mark(a, tmpl)
        has_mark = score > 0.5
        text_img = im.crop((0, 0, w, (top - 6) if top else h)).copy()
        if has_mark:
            x, y, bw, bh = box
            text_img.paste(255, (x - 6, max(0, y - 6), min(w, x + bw + 6), y + bh + 6))
        tsv = tesseract(text_img, ['-l', 'ukr+eng', '--psm', '6', 'tsv'])
        rows = [r.split('\t') for r in tsv.splitlines()[1:] if r.count('\t') >= 11]
        words = [r for r in rows if r[11].strip() and float(r[10]) >= 0]
        by_line = {}
        for r in words:
            k = (int(r[2]), int(r[3]), int(r[4]))
            by_line.setdefault(k, []).append(r)
        lines, lefts, rights, heights = [], [], [], []
        for k in sorted(by_line, key=lambda k: min(int(r[7]) for r in by_line[k])):
            ws = sorted(by_line[k], key=lambda r: int(r[6]))
            lines.append(' '.join(r[11] for r in ws))
            lefts.append(min(int(r[6]) for r in ws))
            rights.append(max(int(r[6]) + int(r[8]) for r in ws))
            heights.append(max(int(r[9]) for r in ws))
        avg_h = (sum(heights) / len(heights)) if heights else 0
        short = avg_h > 110  # big font: word boxes over ~7 pt at ×3 scale (small text is ~60–80 px)
        left = len(lefts) >= 4 and (max(lefts[1:]) - min(lefts[1:]) < 30) and (max(rights) - min(rights) > 120)
        digits = ''
        if top:
            dimg = im.crop((0, bars[1] + 4, w, h - 4)).point(lambda v: 0 if v < 140 else 255)
            pad = Image.new('L', (dimg.width + 80, dimg.height + 80), 255); pad.paste(dimg, (40, 40))
            digits = re.sub(r'\D', '', tesseract(pad, ['--psm', '7', '-c', 'tessedit_char_whitelist=0123456789']))
        sku = m['sku']
        expected = ean13(sku) if sku else ''
        items.append({
            **{k: m[k] for k in ('key', 'file', 'sku', 'title', 'noPrint', 'extraTitle')},
            'text': paragraphs(lines, short),
            'align': 'left' if left else 'center',
            'showMark': has_mark,
            'markScore': round(score, 2),
            'barcode': '' if not top else expected,
            'previewDigits': digits,
            'barcodeOk': (not top and not sku) or (bool(expected) and expected in digits),
        })
        print(m['key'], 'mark' if has_mark else '-', items[-1]['align'], 'bc-ok' if items[-1]['barcodeOk'] else f'BC? {digits}', flush=True)
    json.dump(items, open(os.path.join(out, 'zagalna.draft.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
