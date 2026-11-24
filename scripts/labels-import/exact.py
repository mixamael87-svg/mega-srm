"""Labels import (preferred): exact label text from the BarTender .btw design stream.

Usage: python3 -I scripts/labels-import/exact.py <folder with .btw> <current zagalna.json> <out.json>

A .btw holds, after the preview PNG, a zlib stream with UTF-16 strings (ff fe ff <len8> or
ff fe ff ff <len16>). The label's text object is the one Cyrillic string that is not a BarTender
default; barcodes are the 13-digit strings. Previews can be stale (0105 and 0662 had empty
previews but full text) — so the text comes from here, not from OCR.
Keeps align/showMark/barcode/noPrint/extraTitle from the current JSON; applies only layout rules:
article on its own line; 1200 series without a blank line and with fewer paragraphs (fits 37.5×40).
"""
import json, os, re, struct, sys, zlib

JUNK = re.compile(r'^(Образец текста|Ввод данных|Копии:|Серийные номера:|Использовать настройки принтера|Антенна RFID \d+|Магнитная полоса.*|Фон \d+|Цвет фона \d+|Фоновый рисунок \d+|Поле \d+|Слой \d+|Форма \d+|Форма ввода данных|Текст \d+|Штрих-код \d+|Шаблон \d+|Копии \d+|Серийные номера \d+|Рисунок \d+|Линия \d+|Прямоугольник \d+|Xprinter.*)$')
SKIP_DIRS, SKIP_FILES = set(), {'0402 без фут'}  # 1400 restored by the owner 24.11.2026


def stream(b):
    tail = b[b.find(b'IEND') + 8:]
    for i in range(len(tail) - 2):
        if tail[i] == 0x78 and tail[i + 1] in (0x01, 0x5e, 0x9c, 0xda):
            try:
                d = zlib.decompressobj().decompress(tail[i:])
            except Exception:
                continue
            if 'BarTender'.encode('utf-16-le') in d[:40]:
                return d
    raise ValueError('no design stream')


def strings(d):
    out, i = [], 0
    while (i := d.find(b'\xff\xfe\xff', i)) >= 0:
        j = i + 3; n = d[j]; j += 1
        if n == 0xff:
            n = struct.unpack('<H', d[j:j + 2])[0]; j += 2
        try:
            out.append(d[j:j + 2 * n].decode('utf-16-le')); i = j + 2 * n
        except UnicodeDecodeError:
            i += 1
    return out


def label_text(path):
    texts = []
    for s in strings(stream(open(path, 'rb').read())):
        t = s.replace('\r\n', '\n').replace('\r', '\n')
        if re.search(r'[А-Яа-яІіЇїЄєҐґ]', t) and not JUNK.match(t.strip()) and t not in texts:
            texts.append(t)
    if len(texts) != 1:
        raise SystemExit(f'{path}: expected one text object, got {len(texts)}')
    return texts[0]


def tidy(t):
    lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in t.split('\n')]
    t = '\n'.join(lines).strip()
    t = re.sub(r'\n{3,}', '\n\n', t)
    # article on its own line (printed big and bold)
    t = re.sub(r'^(.+?)[,]?\s+((?:[АA]рт|арт)\.\s?\d{4})\s*$', r'\1\n\2', t, flags=re.M)
    t = re.sub(r'^((?:[АA]рт|арт)\.\s?\d{4})\s+(\S.*)$', r'\1\n\2', t, flags=re.M)
    return t


PARA_1200 = re.compile(r'^(Арт\. \d{4}|Склад матеріалу|Матеріал корпусу|Виготовлено компанією|Адреса виробника|Імпортер|Дата виготовлення|Номер партії|Строк придатності|Кольори та деталі|Умови зберігання|Правила та умови|ПОПЕРЕДЖЕННЯ|Дорослі повинні|Використовувати тільки|Зберігайте упаковку|Рекомендовано мити|Після миття)')


def series_1200(t):
    """Keep line breaks only before the original paragraphs (and after the title line); BarTender's hard
    breaks inside paragraphs and blank lines are dropped so the longest label (1217) fits."""
    lines = [l for l in t.split('\n') if l.strip()]
    out = []
    for i, l in enumerate(lines):
        if not out or PARA_1200.match(l) or (i == 1 and re.match(r'^Арт\. \d{4}$', lines[0])):
            out.append(l)
        else:
            out[-1] += ' ' + l
    return '\n'.join(out)


def main(src, current, out):
    cur = {(x.get('sku') or x['title']): x for x in json.load(open(current))}
    res = []
    for d in sorted(os.listdir(src)):
        if d in SKIP_DIRS:
            continue
        for f in sorted(os.listdir(os.path.join(src, d))):
            stem = f[:-4]
            if not f.endswith('.btw') or stem in SKIP_FILES:
                continue
            m = re.match(r'^(\d{4})', stem)
            key = m.group(1) if m else 'Частина 2 (серія 1200)'
            item = dict(cur.get(key) or {'sku': key, 'title': '', 'align': 'center', 'showMark': False, 'barcode': None, 'noPrint': False})
            t = tidy(label_text(os.path.join(src, d, f)))
            if item.get('sku') and 1205 <= int(item['sku']) <= 1221 or key.startswith('Частина 2'):
                t = series_1200(t)
            item['text'] = t
            res.append(item)
    json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
    print(len(res), 'labels')


if __name__ == '__main__':
    main(*sys.argv[1:4])
