// Ordine di esecuzione delle misure: ritornelli, prime/seconde volte
// (volte), D.C., D.S., Coda e Fine.
//
// Input: un array di descrittori, uno per misura in ordine di scrittura:
//   { fwd: bool,                       // ritornello in avanti (|:)
//     bwd: { times } | null,           // ritornello all'indietro (:|)
//     ending: number[] | null,         // numeri della "volta" che copre la misura
//     endingStop: bool,                // ultima misura della volta
//     jump: { dacapo, dalsegno, tocoda, fine, segno, coda } }
//
// Output: { order: number[], warnings: string[] } dove `order` elenca gli
// indici di misura nell'ordine in cui vengono suonati (con ripetizioni).
//
// Regole applicate (convenzioni standard di lettura):
//  - `|: A :|` ripete A `times` volte in totale (default 2);
//  - senza `|:` iniziale si ripete dall'inizio del brano, oppure dalla fine
//    del ritornello precedente;
//  - con le volte, alla passata N si salta ogni misura la cui volta non
//    includa N (le misure di una volta comprendono anche la sua barra
//    di ritornello: saltarle significa non ripetere di nuovo);
//  - D.C./D.S. si eseguono una sola volta; DOPO il salto i ritornelli
//    non si ripetono e, dove ci sono volte, si suona l'ultima;
//  - dopo il salto, "Fine" termina il brano e "To Coda" salta alla Coda.

export function computePlayOrder(measures, { expand = true } = {}) {
  const n = measures.length;
  if (!expand) return { order: measures.map((_, i) => i), warnings: [] };

  const warnings = [];
  const segnoAt = new Map();
  const codaAt = new Map();
  let maxEnding = 0;
  measures.forEach((m, i) => {
    if (m.jump?.segno != null && !segnoAt.has(m.jump.segno)) segnoAt.set(m.jump.segno, i);
    if (m.jump?.coda != null && !codaAt.has(m.jump.coda)) codaAt.set(m.jump.coda, i);
    for (const e of m.ending ?? []) maxEnding = Math.max(maxEnding, e);
  });

  const order = [];
  const backwardTaken = new Map();
  const jumpsDone = new Set();
  let repeatStart = 0;
  let pass = 1;
  let afterJump = false;
  let i = 0;
  let guard = 0;
  const limit = n * 60 + 1000;

  while (i < n) {
    guard += 1;
    if (guard > limit) {
      warnings.push("Struttura di ritornelli non risolvibile: espansione interrotta.");
      break;
    }
    const m = measures[i];
    if (m.fwd) repeatStart = i;

    if (m.ending?.length) {
      const wanted = afterJump ? maxEnding : pass;
      if (!m.ending.includes(wanted)) {
        i += 1;
        continue;
      }
    }

    order.push(i);

    if (afterJump && m.jump?.fine) break;
    if (afterJump && m.jump?.tocoda != null) {
      const target = codaAt.get(m.jump.tocoda);
      if (target != null && target !== i) {
        i = target;
        continue;
      }
      warnings.push(`"To Coda" senza Coda corrispondente (misura ${i + 1}).`);
    }

    if (!afterJump && m.bwd) {
      const taken = backwardTaken.get(i) ?? 0;
      const times = Math.max(2, m.bwd.times ?? 2);
      if (taken < times - 1) {
        backwardTaken.set(i, taken + 1);
        pass = taken + 2;
        i = repeatStart;
        continue;
      }
      // Ritornello concluso: si prosegue, ma senza saltare i controlli
      // successivi (una misura può avere sia `:|` sia D.C./D.S.).
      backwardTaken.delete(i);
      pass = 1;
      repeatStart = i + 1;
    }

    if (m.endingStop && !m.bwd) {
      // Ultima volta senza ritornello: il blocco ripetuto è concluso.
      pass = 1;
      repeatStart = i + 1;
    }

    if (!afterJump && (m.jump?.dacapo || m.jump?.dalsegno != null) && !jumpsDone.has(i)) {
      jumpsDone.add(i);
      afterJump = true;
      if (m.jump.dacapo) {
        i = 0;
      } else if (segnoAt.has(m.jump.dalsegno)) {
        i = segnoAt.get(m.jump.dalsegno);
      } else {
        warnings.push(`"D.S." senza Segno corrispondente (misura ${i + 1}): salto all'inizio.`);
        i = 0;
      }
      continue;
    }

    i += 1;
  }

  return { order, warnings };
}
