// Parser XML minimale, senza dipendenze, per MusicXML.
//
// Perché non DOMParser: il convertitore MXL deve girare identico nel
// browser (import diretto di un .mxl dall'utente) e in Node (script CLI
// `songs:convert` e test), e DOMParser esiste solo nel browser. MusicXML è
// XML "regolare" (niente namespace prefissati, niente entità custom
// significative), quindi un tokenizer di ~100 righe basta ed è più veloce
// di un DOM completo su partiture da qualche MB.
//
// Modello prodotto: nodi { name, attrs, children, text }. `text` è il
// testo diretto dell'elemento, già decodificato e con trim (MusicXML non
// usa contenuto misto significativo). Commenti, processing instruction e
// DOCTYPE (compreso l'eventuale subset interno tra [ ]) vengono saltati.

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s) {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : m;
    }
    return NAMED_ENTITIES[e] ?? m;
  });
}

function isSpace(c) {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

export function parseXml(text) {
  const n = text.length;
  const root = { name: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  const buffers = [""]; // testo accumulato per ogni elemento aperto
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const closeTop = () => {
    const node = stack.pop();
    node.text = decodeEntities(buffers.pop()).trim();
  };

  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      buffers[buffers.length - 1] += text.slice(i);
      break;
    }
    if (lt > i) buffers[buffers.length - 1] += text.slice(i, lt);

    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end < 0) throw new Error("XML non valido: commento non chiuso.");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      if (end < 0) throw new Error("XML non valido: CDATA non chiuso.");
      // CDATA è già "letterale": lo proteggo dalla decodifica delle entità.
      buffers[buffers.length - 1] += text
        .slice(lt + 9, end)
        .replace(/&/g, "&amp;");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt + 2);
      if (end < 0) throw new Error("XML non valido: processing instruction non chiusa.");
      i = end + 2;
      continue;
    }
    if (text.startsWith("<!", lt)) {
      // DOCTYPE, con possibile subset interno [ ... ]
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j += 1) {
        const c = text[j];
        if (c === "[") depth += 1;
        else if (c === "]") depth -= 1;
        else if (c === ">" && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    if (text.charCodeAt(lt + 1) === 47 /* / */) {
      const end = text.indexOf(">", lt + 2);
      if (end < 0) throw new Error("XML non valido: tag di chiusura incompleto.");
      if (stack.length > 1) closeTop();
      i = end + 1;
      continue;
    }

    // Tag di apertura: nome, attributi, eventuale auto-chiusura.
    let j = lt + 1;
    while (j < n && !isSpace(text.charCodeAt(j)) && text[j] !== ">" && text[j] !== "/") j += 1;
    const name = text.slice(lt + 1, j);
    const attrs = {};
    let selfClosing = false;
    for (;;) {
      while (j < n && isSpace(text.charCodeAt(j))) j += 1;
      if (j >= n) throw new Error("XML non valido: tag non terminato.");
      const c = text[j];
      if (c === ">") {
        j += 1;
        break;
      }
      if (c === "/") {
        selfClosing = true;
        j = text.indexOf(">", j) + 1;
        break;
      }
      const eq = text.indexOf("=", j);
      if (eq < 0) throw new Error("XML non valido: attributo senza valore.");
      const attrName = text.slice(j, eq).trim();
      let k = eq + 1;
      while (k < n && isSpace(text.charCodeAt(k))) k += 1;
      const quote = text[k];
      if (quote !== '"' && quote !== "'") throw new Error("XML non valido: attributo senza virgolette.");
      const close = text.indexOf(quote, k + 1);
      if (close < 0) throw new Error("XML non valido: attributo non chiuso.");
      attrs[attrName] = decodeEntities(text.slice(k + 1, close));
      j = close + 1;
    }

    const node = { name, attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
      buffers.push("");
    }
    i = j;
  }

  while (stack.length > 1) closeTop();
  const doc = root.children[0];
  if (!doc) throw new Error("XML non valido: nessun elemento radice.");
  return doc;
}

// --- helper di navigazione (tutti null-safe) -------------------------------

export function child(node, name) {
  if (!node) return null;
  for (const c of node.children) if (c.name === name) return c;
  return null;
}

export function childrenOf(node, name) {
  if (!node) return [];
  return node.children.filter((c) => c.name === name);
}

export function textOf(node, name) {
  const c = child(node, name);
  return c ? c.text : "";
}

export function numberOf(node, name, fallback = null) {
  const c = child(node, name);
  if (!c) return fallback;
  const v = Number(c.text);
  return Number.isFinite(v) ? v : fallback;
}

export function attrNumber(node, name, fallback = null) {
  if (!node || node.attrs[name] == null) return fallback;
  const v = Number(node.attrs[name]);
  return Number.isFinite(v) ? v : fallback;
}
