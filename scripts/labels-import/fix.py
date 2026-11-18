"""Labels import, step 3: fix typical OCR confusions (Latin look-alikes in Ukrainian text) in the draft.

Usage: python3 -I scripts/labels-import/fix.py <draft.json> <out.json>
Only whole-word replacements found in the «Загальна» set; everything is still checked by eye afterwards.
"""
import json
import re
import sys

WORDS = {
    'IBy': 'Іву', 'IBY': 'ІВУ', 'Pym': 'Рум', 'Ta': 'та', 'TA': 'ТА', 'poag': 'роад', 'POAQ': 'РОАД', 'POAY': 'РОАД', 'poya': 'роад',
    'Yoy': 'Чоу', 'YOY': 'ЧОУ', 'Hopc': 'Норс', 'HOPC': 'НОРС', 'Hope': 'Норс', 'Bupoounk': 'Виробник', 'Bupoouuk': 'Виробник',
    'BupooOunk': 'Виробник', 'Ko': 'Ко', 'KO.': 'КО.', 'Yoyuxoy': 'Чоучжоу', 'YEH': 'ЧЕНГ', 'CTPHT': 'СТРИТ', 'CTPUT': 'СТРИТ',
    'Yeur': 'Ченг', 'MEPICTAP': 'МЕРІСТАР', 'Ha': 'на', 'Ykpaina': 'Україна', 'IMNOPT': 'ІМПОРТ', 'EKCNOPT': 'ЕКСПОРТ', 'KHP': 'КНР',
    'KiMHaTa': 'кімната', 'Zour': 'Донг', 'Dour': 'Донг', 'four': 'Донг', 'flour': 'Донг', 'Tyabb': 'Гуань', 'Ba': 'Ва', 'Ya': 'Ча',
    'Sino': 'Ляо', 'KY3KAC': 'КУЗКАС', 'Akynaté': 'Акулятка', 'wT.': 'шт.', 'Мо': '№',
}
PATTERNS = [
    (r'Ko,\s*/?(?:ITO|JITO|1TO|ЛІТД)\)', 'Ко,ЛТД)'),
    (r'КО\.,\s*/?(?:ITO|1TO)\)', 'КО.,ЛТД)'),
    (r'IMPOR T\s*&\s*EXPOR\s*Т', 'IMPORT&EXPORT'),
    (r'IMPOR T\s*&\s*EXPORT', 'IMPORT&EXPORT'),
    (r'IMPORT\s*&\s*EXPORT', 'IMPORT&EXPORT'),
    (r'\((\d+)\s*m[iі]ct\)', r'(\1 міс+)'),
    (r'\(([0-9OЗ])\s*Mict\)', r'(\1 міс+)'),
    (r'\((?:O|0)m(?:ict|ic\+t?|ic\+|t)\)', '(0міс+)'),
    (r'(\d)\s*m[iі]ct', r'\1 міс+'),
    (r'(\d{4})p\.', r'\1р.'), (r'(\d{4})p\b', r'\1р'),
    (r'Чжуошан', 'Чжоушан'), (r'ЧЖУОШАН', 'ЧЖОУШАН'),
    (r'КН Р\)', 'КНР)'),
    (r'\s+Wy\b', ''),
    (r'N2\s?1399', '№1399'),
    (r'“"', '"'), (r'""', '"'),
    (r'(\S)- (\S)', r'\1-\2'),
    (r'247-5Б', '247-Б'),
    (r'КО\.,\s*/?1?\s*(?:ITO|TO)\)', 'КО.,ЛТД)'),
    (r'\((?:O|0)m\.?\s*\+\)', '(0м+)'),
    (r'\((?:O|0)mic\s*\+\)', '(0міс+)'),
    (r'\((\d+)\s*mic\s*\+\s*t?\)', r'(\1міс+)'),
    (r'\((\d+)\s*(?:mM|m|M)\s*\+\)', r'(\1м+)'),
    (r'\(Зміст\)', '(3міс+)'),
    (r'(арт\. \d{4}) [Gg]\b', r'\1'),
    (r'IMPOR ТЕХРОКТ', 'IMPORT&EXPORT'),
    (r'KY3SKAC', 'КУЗКАС'),
    (r'КНР/', 'КНР.'),
    (r'^Yaw ка', 'Чашка'),
    (r'Ко,\s*/?(?:ЛІТД|ІТД)\)', 'Ко,ЛТД)'),
    (r'"Іжачок"', '"Їжачок"'),
    (r'\(([0-9]+)\s*міст\)', r'(\1 міс+)'),
    (r'\(Ом\)', '(0м+)'),
    (r'\((\d)м\)', r'(\1м+)'),
    (r'\(Оміс\s*\+\)', '(0міс+)'),
    (r'"Меда[^"\s]*"', '"MegaZayka"'),
    (r'"Зрасе"', '"Space"'),
    (r'КУЗКА С', 'КУЗКАС'),
    (r'С клад', 'Склад'),
    (r'PEMa', 'PEVa'),
    (r'EMA \(EBA\)', 'EVA (ЕВА)'),
    (r'247-[56]\.', '247-Б.'),
    (r'(?<![\w])Мо(\s?\d)', r'№\1'),
    (r'^((?:[АA]рт|арт)\. \d{4})\s+\S{1,3}$', r'\1'),
    (r'500 ті', '500 ml'),
    (r'"І?іжачок"', '"Їжачок"'),
    (r'\(З\s?(міс\+|м\+)\)', r'(3 \1)'),
    (r'пош кодження', 'пошкодження'),
    (r'Не пі\S*ягає о\S+ ві\S+ в Україні', 'Не підлягає оцінці відповідності в Україні'),
    (r'кімната 1071', 'кімната 101'),
    (r'\(100[079]5 ', '(100% '),
    (r'1\.5М AAA', '1.5V AAA'),
    (r'[MМ][eе]1399', '№1399'),
    (r'піщалка', 'пищалка'),
    (r'іграш ок', 'іграшок'),
    (r'\b(35|40|50|80)[27](40|50|70|80)\b', r'\1*\2'),
    (r'\(60520\) 5\.?', '(60±20)%.'),
    # the article goes on its own line (printed big and bold)
    (r'^(.+?),?\s+((?:[АA]рт|арт)\. ?\d{4})$', r'\1\n\2'),
]

# 1200 series (left aligned): "Арт. NNNN" / title / composition, and the paragraphs of the original
# (no blank line and no separate «Контакти»/«Претензії» paragraphs: with letters ≥ 80 % wide, 1217 would not fit otherwise)
SERIES_1200 = [
    (r'^(Арт\. \d{4})\n(.+?) (Склад матеріалу|Матеріал корпусу)', r'\1\n\2\n\3'),
    (r' (Виготовлено компанією|Імпортер ТОВ|Адреса виробника)', r'\n\1'),
]

# The mark sits mid-right on the old MegaZayka labels — the detector only looks at the top-right corner
MARK_BY_EYE = {'0310', '0311', '0315', '0331', '0332', '0604', '1007', '1008'}

# Barcodes kept as printed by BarTender although they differ from ean13(sku) (owner, 18.11.2026)
BARCODE_AS_ORIGINAL = {'0810': '4826077008116'}

# Per-label corrections found by eye against the previews (17.11.2026)
BY_KEY = {
    '0539': [(r'\(0міс\+\)', '(0м+)')],
    '0640': [(r'80780 см', '80*80 см')],
    '0654': [(r'50770', '50*70')],
    '0665': [(r'розмір 5 ', 'розмір S ')],
    '0719': [(r'Не підлягає оцінні вілповідності в Україні\.?', 'Не підлягає оцінці відповідності в Україні.'), (r'пііллягає опіннні вілповідності', 'підлягає оцінці відповідності')],
    '0922': [(r'\(сачок Akynaté іграш ок\)', '(сачок Акула+6 іграшок)'), (r'сачок Акулятка іграш ок', 'сачок Акула+6 іграшок')],
    '0933': [(r'Kupacdt6', 'Жираф+6'), (r'Карась\+6', 'Жираф+6')],
    '1007': [(r'^арт\. 1007\n(Кошик для іграшок, 35\*40) ', r'\1\nарт. 1007\n')],
    '1200': [(r'\S*(?:POKT|РОКТ)\S*(?:EXPO|ЕХРО)\S* 1 CO\.', 'IMPORT&EXPORT CO.')],
    '2002': [(r'[“”]', '"'), (r'" 3(\s)', r'" з\1')],
    'helper-1200': [(r' (Номер партії|Строк придатності|Кольори та деталі|Умови зберігання|Правила та умови|ПОПЕРЕДЖЕННЯ!|Дорослі повинні|Використовувати тільки|Зберігайте упаковку|Рекомендовано мити|Після миття)', r'\n\1')],
    '2014': [(r'32726', '32*26')],
}



def fix(text: str) -> str:
    for _ in range(2):  # patterns see both the raw Latin and the word-fixed text
        for p, r in PATTERNS:
            text = re.sub(p, r, text, flags=re.M)
        text = re.sub(r"(?<![\w&])([A-Za-z][A-Za-z0-9.]*\.?)(?![\w&])", lambda m: WORDS.get(m.group(1), m.group(1)), text)
    return text


if __name__ == '__main__':
    items = json.load(open(sys.argv[1]))
    for it in items:
        it['text'] = fix(it['text'])
        for p, r in BY_KEY.get(it['key'], []):
            it['text'] = re.sub(p, r, it['text'])
        if it['sku'] and 1205 <= int(it['sku']) <= 1221:
            for p, r in SERIES_1200:
                it['text'] = re.sub(p, r, it['text'], flags=re.S)
        if it['key'] in BARCODE_AS_ORIGINAL:
            it['barcode'] = BARCODE_AS_ORIGINAL[it['key']]
        if it['key'] in MARK_BY_EYE:
            it['showMark'] = True
    json.dump(items, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
    print(len(items), 'fixed')
