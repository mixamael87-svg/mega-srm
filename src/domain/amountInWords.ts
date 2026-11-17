type Gender = 'm' | 'f';
type Forms = [one: string, few: string, many: string];

const ONES_M = ['', 'один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"];
const ONES_F = ['', 'одна', 'дві', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"];
const TEENS = ['десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п'ятнадцять", 'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять"];
const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', "п'ятдесят", 'шістдесят', 'сімдесят', 'вісімдесят', "дев'яносто"];
const HUNDREDS = ['', 'сто', 'двісті', 'триста', 'чотириста', "п'ятсот", 'шістсот', 'сімсот', 'вісімсот', "дев'ятсот"];

const SCALES: { forms: Forms; gender: Gender }[] = [
  { forms: ['', '', ''], gender: 'f' }, // units (гривня — жіночий рід)
  { forms: ['тисяча', 'тисячі', 'тисяч'], gender: 'f' },
  { forms: ['мільйон', 'мільйони', 'мільйонів'], gender: 'm' },
  { forms: ['мільярд', 'мільярди', 'мільярдів'], gender: 'm' },
];

/** Plural form index for Ukrainian: 1 / 2–4 / 5–20 (11–14 → many). */
export function pluralIndex(n: number): 0 | 1 | 2 {
  const n100 = n % 100, n10 = n % 10;
  if (n100 >= 11 && n100 <= 14) return 2;
  if (n10 === 1) return 0;
  if (n10 >= 2 && n10 <= 4) return 1;
  return 2;
}

function triadWords(n: number, gender: Gender): string[] {
  const w: string[] = [];
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  if (h) w.push(HUNDREDS[h]!);
  if (t === 1) w.push(TEENS[o]!);
  else {
    if (t) w.push(TENS[t]!);
    if (o) w.push((gender === 'f' ? ONES_F : ONES_M)[o]!);
  }
  return w;
}

function integerWords(n: number): string {
  if (n === 0) return 'нуль';
  const parts: string[] = [];
  let scale = 0;
  while (n > 0) {
    const triad = n % 1000;
    if (triad) {
      const s = SCALES[scale];
      if (!s) throw new RangeError('amount too large');
      const words = triadWords(triad, s.gender);
      if (scale > 0) words.push(s.forms[pluralIndex(triad)]);
      parts.unshift(words.join(' '));
    }
    n = Math.floor(n / 1000);
    scale++;
  }
  return parts.join(' ');
}

const HRYVNIA: Forms = ['гривня', 'гривні', 'гривень'];
const KOPIYKA: Forms = ['копійка', 'копійки', 'копійок'];

/** 3962855 → "Тридцять дев'ять тисяч шістсот двадцять вісім гривень 55 копійок" */
export function amountInWordsUah(kopecks: number): string {
  if (!Number.isSafeInteger(kopecks) || kopecks < 0) throw new RangeError(`invalid kopecks: ${kopecks}`);
  const uah = Math.floor(kopecks / 100), kop = kopecks % 100;
  const words = integerWords(uah);
  const text = `${words} ${HRYVNIA[pluralIndex(uah)]} ${String(kop).padStart(2, '0')} ${KOPIYKA[pluralIndex(kop)]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
