// הגייה ספרדית (מבטא ספרד / קסטיליאני): חלוקה להברות, הטעמה ותעתיק לעברית.

const VOWELS = 'aeiouáéíóúü';
const STRONG = 'aeoáéóíú'; // í/ú מוטעמות שוברות דיפתונג
const ACCENTED = 'áéíóú';
const INSEPARABLE = new Set(['pr', 'br', 'fr', 'cr', 'kr', 'gr', 'tr', 'dr', 'pl', 'bl', 'fl', 'cl', 'kl', 'gl']);
const isV = (c) => VOWELS.includes(c);

// פירוק מילה ליחידות צליל: { s: 'ch', v: false } וכו'
function units(word) {
  const w = word.toLowerCase();
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i], n = w[i + 1], nn = w[i + 2];
    if (c === 'c' && n === 'h') { out.push({ s: 'ch', v: false }); i++; continue; }
    if (c === 'l' && n === 'l') { out.push({ s: 'll', v: false }); i++; continue; }
    if (c === 'r' && n === 'r') { out.push({ s: 'rr', v: false }); i++; continue; }
    if (c === 'q' && n === 'u') { out.push({ s: 'qu', v: false }); i++; continue; }
    if (c === 'g' && n === 'u' && nn && 'eéií'.includes(nn)) { out.push({ s: 'gu', v: false }); i++; continue; }
    if (c === 'y') {
      // y בסוף מילה אחרי תנועה = תנועה i (hoy, muy, rey)
      const atEnd = i === w.length - 1 && i > 0 && isV(w[i - 1]);
      out.push(atEnd ? { s: 'y', v: true, weak: true } : { s: 'y', v: false });
      continue;
    }
    if (isV(c)) out.push({ s: c, v: true, weak: !STRONG.includes(c) });
    else out.push({ s: c, v: false });
  }
  return out;
}

export function syllabify(word) {
  const u = units(word);
  if (!u.length) return [];
  // מציאת גרעיני תנועה
  const nuclei = []; // [start, end]
  for (let i = 0; i < u.length; i++) {
    if (!u[i].v) continue;
    const last = nuclei[nuclei.length - 1];
    if (last && last[1] === i - 1) {
      const prev = u[i - 1];
      // שתי תנועות חזקות = הברות נפרדות (היאטוס)
      if (!prev.weak && !u[i].weak) nuclei.push([i, i]);
      else last[1] = i;
    } else nuclei.push([i, i]);
  }
  if (!nuclei.length) return [{ text: word, units: u }];
  const cuts = [];
  for (let k = 0; k < nuclei.length - 1; k++) {
    const a = nuclei[k][1] + 1, b = nuclei[k + 1][0]; // עיצורים בתחום [a, b)
    const cons = u.slice(a, b).map((x) => x.s);
    let cut;
    if (cons.length === 0) cut = b;
    else if (cons.length === 1) cut = a;
    else if (cons.length === 2) cut = INSEPARABLE.has(cons.join('')) ? a : a + 1;
    else if (cons.length === 3) cut = INSEPARABLE.has(cons.slice(1).join('')) ? a + 1 : a + 2;
    else cut = a + 2;
    cuts.push(cut);
  }
  const syl = [];
  let start = 0;
  for (const c of [...cuts, u.length]) { syl.push(u.slice(start, c)); start = c; }
  return syl.map((s) => ({ units: s, text: s.map((x) => x.s).join('') }));
}

export function stressIndex(word, syl) {
  const accented = syl.findIndex((s) => s.units.some((x) => ACCENTED.includes(x.s)));
  if (accented >= 0) return accented;
  if (syl.length === 1) return 0;
  const last = word.toLowerCase().slice(-1);
  return isV(last) || last === 'n' || last === 's' ? syl.length - 2 : syl.length - 1;
}

// ---------- תעתיק לעברית ----------
const NIQQUD = { a: 'ָ', e: 'ֶ' }; // קמץ, סגול
const FINAL = { 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ', 'כ': 'ך' };
const plain = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '');

function consonantHe(s, nextVowel) {
  const soft = nextVowel && 'eiéí'.includes(nextVowel);
  switch (s) {
    case 'b': case 'v': return 'ב';
    case 'c': return soft ? 'ת׳' : 'ק';
    case 'z': return 'ת׳';
    case 'ch': return 'צ׳';
    case 'd': return 'ד';
    case 'f': return 'פ';
    case 'g': return soft ? 'ח' : 'ג';
    case 'gu': return 'ג';
    case 'h': return '';
    case 'j': return 'ח';
    case 'k': case 'qu': return 'ק';
    case 'l': return 'ל';
    case 'll': case 'y': return 'י';
    case 'm': return 'מ';
    case 'n': return 'נ';
    case 'ñ': return 'ני';
    case 'p': return 'פּ';
    case 'r': return 'ר';
    case 'rr': return 'רר';
    case 's': return 'ס';
    case 't': return 'ט';
    case 'w': return 'ו';
    case 'x': return 'קס';
    default: return s;
  }
}
// מוסיף ניקוד לאות האחרונה ברצף (לפני גרש, אם יש)
function attach(cons, mark) {
  if (!cons) return 'א' + mark;
  if (cons.endsWith('׳')) return cons.slice(0, -1) + mark + '׳';
  return cons + mark;
}
function vowelHe(cons, v) {
  const p = plain(v);
  if (p === 'a' || p === 'e') return attach(cons, NIQQUD[p]);
  if (p === 'i' || p === 'y') return attach(cons, 'ִ') + 'י';
  if (p === 'o') return (cons || 'א') + 'וֹ';
  return (cons || 'א') + 'וּ'; // u, ü
}

function syllableHe(s, isLastSyl, wordEndsVowel) {
  const u = s.units;
  let out = '';
  let pending = ''; // עיצור שמחכה לתנועה
  const nucleusIdx = u.map((x, i) => (x.v ? i : -1)).filter((i) => i >= 0);
  // התנועה העיקרית בגרעין: החזקה, או האחרונה מבין החלשות (ui, iu)
  let main = nucleusIdx.find((i) => !u[i].weak);
  if (main === undefined) main = nucleusIdx[nucleusIdx.length - 1];
  for (let i = 0; i < u.length; i++) {
    const x = u[i];
    if (!x.v) {
      if (pending) out += pending;
      const nextV = u.slice(i + 1).find((y) => y.v)?.s;
      pending = consonantHe(x.s, nextV);
      continue;
    }
    if (i === main) { out += vowelHe(pending, x.s); pending = ''; }
    else if (i < main) { // גלישה לפני התנועה: bien → בְיֶן
      out += pending; pending = 'aeiouáéíóú'.includes(x.s) && plain(x.s) === 'u' ? 'ו' : 'י';
    } else { // גלישה אחרי התנועה: aire → אָיְ
      out += plain(x.s) === 'u' ? 'ו' : 'י';
    }
  }
  out += pending;
  if (isLastSyl && wordEndsVowel) {
    const p = plain(u[main]?.s || '');
    if (p === 'a' || p === 'e') out += 'ה';
  }
  return out;
}

// ניתוח מילה אחת
export function analyzeWord(word) {
  const clean = word.replace(/[^a-záéíóúüñ]/gi, '');
  if (!clean) return null;
  const syl = syllabify(clean);
  const stress = stressIndex(clean, syl);
  const endsVowel = isV(clean.toLowerCase().slice(-1));
  const parts = syl.map((s, i) => ({
    latin: s.text,
    he: syllableHe(s, i === syl.length - 1, endsVowel),
    stressed: i === stress,
  }));
  // אות סופית
  const last = parts[parts.length - 1];
  const m = last.he.match(/([מנפצכ])$/);
  if (m) last.he = last.he.slice(0, -1) + FINAL[m[1]];
  return { word: clean, parts };
}

export function analyzeText(text) {
  return text.split(/\s+/).map(analyzeWord).filter(Boolean);
}

export function hebrewTranslit(text) {
  return analyzeText(text).map((w) => w.parts.map((p) => p.he).join('')).join(' ');
}

// טיפים להגייה ספרדית לפי האותיות שבמילה
const TIPS = [
  [/z|c[eiéí]/i, 'z, ce, ci – בספרד נהגים כמו th באנגלית (think), בתעתיק: ת׳'],
  [/j|g[eiéí]/i, 'j, ge, gi – ח גרונית'],
  [/ll|y/i, 'll ו-y – כמו י'],
  [/ñ/i, 'ñ – כמו ני (niña = נִינְיָה)'],
  [/h/i, 'h – אות שקטה, לא מבטאים'],
  [/rr|^r/i, 'rr או r בתחילת מילה – ר׳ מתגלגלת חזקה (קצה הלשון)'],
  [/v/i, 'v – נהגית כמו b'],
  [/[aeiou]d[aeiou]|d$/i, 'd בין תנועות או בסוף מילה – רכה, כמו th ב-this'],
  [/qu/i, 'qu – נשמע ק (ה-u שקטה)'],
  [/gu[eiéí]/i, 'gue, gui – נשמע גֶ, גִי (ה-u שקטה)'],
];
export function pronunciationTips(text) {
  return TIPS.filter(([re]) => re.test(text)).map(([, tip]) => tip);
}
