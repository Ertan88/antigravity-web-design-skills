import { useEffect, useState, type ReactNode } from 'react';

const ROTATE_MS = 12_000;

/**
 * Birleşik kart: birden fazla kart aynı yerde sırayla görünür. Üstteki ince çubuklar hangi kartta
 * olunduğunu ve sıradakine ne kadar kaldığını gösterir (hikâye çubukları gibi).
 */
export function GroupCard({ members, grow }: { members: { id: string; node: ReactNode }[]; grow: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, []);
  const index = i % members.length;
  const current = members[index]!;
  return (
    <div className={`card-group ${grow ? 'card-group-grow' : ''}`}>
      <div className="card-group-item" key={current.id}>
        {current.node}
      </div>
      <div className="group-bars" aria-hidden="true">
        {members.map((m, j) => (
          <span key={m.id} className={j < index ? 'done' : j === index ? 'active' : ''}>
            {j === index && <i key={i} style={{ animationDuration: `${ROTATE_MS}ms` }} />}
          </span>
        ))}
      </div>
    </div>
  );
}
