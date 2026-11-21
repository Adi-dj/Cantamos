// הקראה (Text-to-Speech) וזיהוי דיבור בספרדית של ספרד, דרך ה-Web Speech API של הדפדפן.
let voices = [];
function loadVoices() {
  voices = window.speechSynthesis?.getVoices() || [];
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
export function spanishVoice() {
  return voices.find((v) => v.lang === 'es-ES') || voices.find((v) => v.lang?.startsWith('es')) || null;
}
export const canSpeak = () => typeof window !== 'undefined' && !!window.speechSynthesis;

// מהירות הקראה – 3 דרגות, נשמרת בכל מכשיר בנפרד. מכפילה את המהירות שכל מקום מבקש.
export const SPEEDS = [
  { key: 'slow', label: 'איטי', icon: '🐢', factor: 0.7 },
  { key: 'normal', label: 'רגיל', icon: '', factor: 1 },
  { key: 'fast', label: 'מהיר', icon: '🐇', factor: 1.25 },
];
let speedKey = 'normal';
try { speedKey = localStorage.getItem('cantamos-speed') || 'normal'; } catch { /* מצב פרטי */ }
const listeners = new Set();
export const getSpeed = () => speedKey;
export function setSpeed(key) {
  speedKey = key;
  try { localStorage.setItem('cantamos-speed', key); } catch { /* מצב פרטי */ }
  listeners.forEach((f) => f(key));
}
export const onSpeedChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
const factor = () => SPEEDS.find((x) => x.key === speedKey)?.factor ?? 1;

export function speak(text, { rate = 0.9, onend } = {}) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  const v = spanishVoice();
  if (v) u.voice = v;
  u.rate = Math.min(2, Math.max(0.3, rate * factor()));
  if (onend) u.onend = onend;
  window.speechSynthesis.speak(u);
}
export const stopSpeaking = () => canSpeak() && window.speechSynthesis.cancel();

const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
// אפליקציה שנפתחה מאייקון במסך הבית (ולא מתוך הדפדפן)
export const isStandalone = () => typeof window !== 'undefined' && (window.navigator.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches);
export const isIOSHomeScreen = () => isIOS && isStandalone();
// באייפון, אפליקציה ממסך הבית לא מקבלת את זיהוי הדיבור של Safari – לכן שם משתמשים רק בהקלטה
export const canRecognize = () => !!Rec && !isIOSHomeScreen();

const REC_ERRORS = {
  'not-allowed': isIOS
    ? 'אין הרשאה למיקרופון או לזיהוי דיבור. בהגדרות האייפון: Safari ← מיקרופון ← "לאפשר", וגם הכתבה צריכה להיות מופעלת (הגדרות ← כללי ← מקלדת ← "הפעלת הכתבה").'
    : 'אין הרשאה למיקרופון – אשרו גישה למיקרופון בדפדפן ונסו שוב.',
  'service-not-allowed': 'זיהוי הדיבור לא זמין כאן. אפשר להקליט ולהשוות בעצמכם.',
  'audio-capture': 'לא נמצא מיקרופון.',
  network: 'זיהוי הדיבור צריך חיבור לאינטרנט.',
  'no-speech': 'לא נשמע דיבור – דברו מיד אחרי הלחיצה.',
  aborted: 'ההקשבה הופסקה.',
};

export function listenOnce() {
  return new Promise((resolve, reject) => {
    if (!Rec) return reject(Object.assign(new Error('הדפדפן לא תומך בזיהוי דיבור'), { code: 'unsupported' }));
    const r = new Rec();
    r.lang = 'es-ES';
    r.maxAlternatives = 3;
    let done = false;
    const fail = (code, msg) => { if (done) return; done = true; clearTimeout(timer); reject(Object.assign(new Error(msg || REC_ERRORS[code] || 'לא זוהה, נסו שוב'), { code })); };
    const timer = setTimeout(() => { try { r.stop(); } catch { /* כבר נעצר */ } fail('no-speech'); }, 9000);
    r.onresult = (e) => { if (done) return; done = true; clearTimeout(timer); resolve([...e.results[0]].map((a) => a.transcript)); };
    r.onerror = (e) => fail(e.error);
    r.onnomatch = () => fail('no-match', 'לא זוהה, נסו שוב');
    try { r.start(); } catch { fail('service-not-allowed'); }
  });
}

// ---------- הקלטה (עובדת גם באפליקציה ממסך הבית) ----------
export const canRecord = () => typeof window !== 'undefined' && !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export async function startRecording({ maxMs = 8000 } = {}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    throw new Error(e?.name === 'NotAllowedError'
      ? (isIOS ? 'אין הרשאה למיקרופון. אשרו כשהאייפון שואל, או בהגדרות ← Safari ← מיקרופון ← "לאפשר".' : 'אין הרשאה למיקרופון – אשרו גישה בדפדפן.')
      : 'לא הצלחנו לפתוח את המיקרופון.');
  }
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const finished = new Promise((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); // משחרר את המיקרופון (וחוזר לרמקול הרגיל באייפון)
      resolve(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || type || 'audio/mp4' })));
    };
  });
  rec.start();
  const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), maxMs);
  return {
    stop: () => { clearTimeout(timer); if (rec.state !== 'inactive') rec.stop(); return finished; },
    finished,
  };
}
