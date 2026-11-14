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

export function speak(text, { rate = 0.9, onend } = {}) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  const v = spanishVoice();
  if (v) u.voice = v;
  u.rate = rate;
  if (onend) u.onend = onend;
  window.speechSynthesis.speak(u);
}
export const stopSpeaking = () => canSpeak() && window.speechSynthesis.cancel();

const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const canRecognize = () => !!Rec;

export function listenOnce() {
  return new Promise((resolve, reject) => {
    if (!Rec) return reject(new Error('הדפדפן לא תומך בזיהוי דיבור'));
    const r = new Rec();
    r.lang = 'es-ES';
    r.maxAlternatives = 3;
    r.onresult = (e) => resolve([...e.results[0]].map((a) => a.transcript));
    r.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? 'אין הרשאה למיקרופון' : 'לא נשמע דיבור, נסו שוב'));
    r.onnomatch = () => reject(new Error('לא זוהה, נסו שוב'));
    r.start();
  });
}
