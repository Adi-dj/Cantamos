// מבודד קטעי ספרדית (טקסט לטיני) בתוך משפט בעברית, כדי שהסדר לא יתבלגן במסך צר.
const LATIN = /([¡¿«]?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’]*(?:[ ,.\-/+…]+[¡¿«]?[A-Za-zÀ-ÿ0-9'’]+)*[!?»…]?)/g;

export default function Bidi({ children }) {
  if (typeof children !== 'string') return children;
  return children.split(LATIN).map((part, i) => (i % 2 ? <bdi key={i} lang="es" dir="ltr">{part}</bdi> : part));
}
