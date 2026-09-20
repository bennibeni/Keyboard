import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { parseXml } from "./xmlMini.mjs";
import { convertMusicXml } from "./index.mjs";
import { computePlayOrder } from "./expandRepeats.mjs";
import { tonicFromFifths, inferMode } from "./keys.mjs";
import { decodeNotes, validateSong } from "../format/songSchema.mjs";

// --- helper per costruire partiture MusicXML minime ------------------------

const pitch = (step, octave, alter) =>
  `<pitch><step>${step}</step>${alter != null ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`;
const note = (step, octave, dur, extra = "", alter) =>
  `<note>${pitch(step, octave, alter)}<duration>${dur}</duration>${extra}</note>`;
const rest = (dur) => `<note><rest/><duration>${dur}</duration></note>`;
const measure = (n, body, attrs = "") => `<measure number="${n}"${attrs}>${body}</measure>`;
const attributes = ({ divisions = 1, fifths = 0, mode, time = [4, 4], extra = "" } = {}) =>
  `<attributes><divisions>${divisions}</divisions><key><fifths>${fifths}</fifths>${mode ? `<mode>${mode}</mode>` : ""}</key><time><beats>${time[0]}</beats><beat-type>${time[1]}</beat-type></time>${extra}</attributes>`;
const score = (measures, { partName = "Piano", title = "Test" } = {}) =>
  `<?xml version="1.0"?><score-partwise version="3.1"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>${partName}</part-name></score-part></part-list><part id="P1">${measures.join("")}</part></score-partwise>`;

const convert = async (xml, opts) => convertMusicXml(xml, { fileName: "t.musicxml", ...opts });
const rows = (song) => decodeNotes(song.notes);
const pairs = (song) => rows(song).map((n) => [n.t, n.m, n.d]);

describe("xmlMini", () => {
  it("gestisce entità, CDATA, commenti, DOCTYPE e tag auto-chiusi", () => {
    const root = parseXml(
      `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><!-- c --><r a="1&amp;2"><t>a &lt; b</t><u><![CDATA[<x>&]]></u><e/></r>`,
    );
    expect(root.attrs.a).toBe("1&2");
    expect(root.children.map((c) => c.name)).toEqual(["t", "u", "e"]);
    expect(root.children[0].text).toBe("a < b");
    expect(root.children[1].text).toBe("<x>&");
  });
});

describe("conversione base", () => {
  it("note, durate, tempo da metronomo puntato e metro", async () => {
    const xml = score([
      measure(
        1,
        `${attributes()}<direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute></metronome></direction-type></direction>` +
          note("C", 4, 1) + note("D", 4, 1) + note("E", 4, 2),
      ),
    ]);
    const song = await convert(xml);
    expect(pairs(song)).toEqual([[0, 60, 1], [1, 62, 1], [2, 64, 2]]);
    expect(song.time.bpm).toBe(90);
    expect(song.time.timeSignature).toBe("4/4");
    expect(validateSong(song).errors).toEqual([]);
  });

  it("fonde le legature attraverso la barra di battuta", async () => {
    const xml = score([
      measure(1, attributes() + rest(2) + note("G", 4, 2, `<tie type="start"/>`)),
      measure(2, note("G", 4, 4, `<tie type="stop"/>`)),
    ]);
    const song = await convert(xml);
    expect(pairs(song)).toEqual([[2, 67, 6]]);
  });

  it("deduce le fini di legatura quando il file scrive solo gli inizi", async () => {
    const tied = (n) => measure(n, note("A", 4, 4, `<tie type="start"/>`));
    const xml = score([
      measure(1, attributes() + note("A", 4, 4, `<tie type="start"/>`)),
      tied(2), tied(3), tied(4), tied(5),
    ]);
    const song = await convert(xml);
    expect(pairs(song)).toEqual([[0, 69, 20]]);
    expect(song.meta.warnings.join(" ")).toMatch(/dedotte/);
  });

  it("accordi e più voci con backup", async () => {
    const xml = score([
      measure(
        1,
        attributes() +
          note("C", 5, 2, "<voice>1</voice><staff>1</staff>") +
          `<note><chord/>${pitch("E", 5)}<duration>2</duration><voice>1</voice><staff>1</staff></note>` +
          note("D", 5, 2, "<voice>1</voice><staff>1</staff>") +
          `<backup><duration>4</duration></backup>` +
          note("C", 3, 4, "<voice>2</voice><staff>2</staff>"),
        "",
      ).replace("<divisions>1</divisions>", "<divisions>1</divisions><staves>2</staves>"),
    ]);
    const song = await convert(xml);
    const r = rows(song);
    expect(r.map((n) => [n.t, n.m, n.d, n.s, n.h])).toEqual([
      [0, 48, 4, 2, "LH"], [0, 72, 2, 1, "RH"], [0, 76, 2, 1, "RH"], [2, 74, 2, 1, "RH"],
    ]);
  });

  it("terzine: le durate restano esatte", async () => {
    const trip = (step) => note(step, 4, 1, "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>");
    const xml = score([measure(1, attributes({ divisions: 3 }) + trip("C") + trip("D") + trip("E") + note("F", 4, 9))]);
    const song = await convert(xml);
    const r = rows(song);
    expect(r.map((n) => n.t)).toEqual([0, 0.333333, 0.666667, 1]);
    expect(r[3].d).toBe(3);
  });

  it("strumenti traspositori: altezza sonante", async () => {
    const xml = score([
      measure(1, attributes({ extra: "<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>" }) + note("C", 5, 4)),
    ], { partName: "Clarinet in Bb" });
    expect(pairs(await convert(xml))).toEqual([[0, 70, 4]]);
  });

  it("anacrusi e misure di lunghezza reale", async () => {
    const xml = score([
      measure(0, attributes() + note("G", 4, 1), ` implicit="yes"`),
      measure(1, note("C", 5, 4)),
    ]);
    const song = await convert(xml);
    expect(song.bars.map((b) => [b[0], b[1]])).toEqual([[0, 1], [1, 4]]);
    expect(pairs(song)).toEqual([[0, 67, 1], [1, 72, 4]]);
  });

  it("modo assente: lo dedude dalle altezze (La minore vs Do maggiore)", async () => {
    const xml = score([
      measure(1, attributes() + note("A", 4, 2) + note("C", 5, 1) + note("E", 5, 1)),
      measure(2, note("E", 4, 1) + note("A", 4, 3)),
      measure(3, note("A", 3, 4)),
    ]);
    const song = await convert(xml);
    expect(song.meta.key).toMatchObject({ tonic: "A", mode: "minor", inferred: true });
  });

  it("armonia e testi", async () => {
    const xml = score([
      measure(
        1,
        attributes() +
          `<harmony><root><root-step>C</root-step></root><kind>minor-seventh</kind><bass><bass-step>B</bass-step><bass-alter>-1</bass-alter></bass></harmony>` +
          note("C", 4, 4, `<lyric number="1"><syllabic>begin</syllabic><text>Hel</text></lyric>`),
      ),
    ]);
    const song = await convert(xml);
    expect(song.harmony).toEqual([{ t: 0, symbol: "Cm7/Bb", root: "C", kind: "minor-seventh", bass: "Bb" }]);
    expect(song.lyrics).toEqual([{ t: 0, verse: "1", text: "Hel", syl: "begin" }]);
  });

  it("abbellimenti: acciaccatura prima del battere, appoggiatura sul battere, skip li scarta", async () => {
    const grace = (slash) => `<note><grace${slash ? ' slash="yes"' : ""}/>${pitch("D", 5)}</note>`;
    const measures = (slash) => [
      measure(1, attributes() + rest(4)),
      measure(2, grace(slash) + note("C", 5, 4)),
    ];
    const acc = rows(await convert(score(measures(true))));
    expect(acc[0]).toMatchObject({ m: 74, t: 3.875, d: 0.125 });
    expect(acc[1]).toMatchObject({ m: 72, t: 4, d: 4 });

    const app = rows(await convert(score(measures(false))));
    expect(app[0]).toMatchObject({ m: 74, t: 4, d: 0.125 });
    expect(app[1]).toMatchObject({ m: 72, t: 4.125, d: 3.875 });

    const skipped = rows(await convert(score(measures(true)), { grace: "skip" }));
    expect(skipped).toHaveLength(1);
  });

  it("dinamiche -> velocity solo se richiesto", async () => {
    const xml = score([
      measure(1, attributes() + `<direction><direction-type><dynamics><p/></dynamics></direction-type></direction>` + note("C", 4, 4)),
    ]);
    expect(rows(await convert(xml))[0].vel).toBeUndefined();
    expect(rows(await convert(xml, { dynamics: true }))[0].vel).toBe(0.51);
  });

  it("ritornello con volte: ordine e tempi eseguiti", async () => {
    const xml = score([
      measure(1, attributes() + `<barline location="left"><repeat direction="forward"/></barline>` + note("C", 4, 4)),
      measure(2, `<barline location="left"><ending number="1" type="start"/></barline>` + note("D", 4, 4) +
        `<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>`),
      measure(3, `<barline location="left"><ending number="2" type="start"/></barline>` + note("E", 4, 4) +
        `<barline location="right"><ending number="2" type="stop"/></barline>`),
    ]);
    const song = await convert(xml);
    expect(pairs(song)).toEqual([[0, 60, 4], [4, 62, 4], [8, 60, 4], [12, 64, 4]]);
    expect(song.bars.map((b) => b[3])).toEqual([0, 1, 0, 2]);
    const flat = await convert(xml, { expandRepeats: false });
    expect(pairs(flat)).toEqual([[0, 60, 4], [4, 62, 4], [8, 64, 4]]);
  });

  it("D.C. al Fine su una misura che ha anche il ritornello (regressione)", async () => {
    const xml = score([
      measure(1, attributes() + note("C", 4, 4)),
      measure(2, note("D", 4, 4) + `<direction><sound fine="yes"/></direction>`),
      measure(3, note("E", 4, 4)),
      measure(4, note("F", 4, 4) + `<direction><sound dacapo="yes"/></direction>` +
        `<barline location="right"><repeat direction="backward"/></barline>`),
    ]);
    const song = await convert(xml);
    // 1 2 3 4 | :| 3 4 (ritornello) | D.C. -> 1 2 Fine
    expect(song.bars.map((b) => b[3])).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
  });
});

describe("computePlayOrder", () => {
  const M = (o = {}) => ({ fwd: false, bwd: null, ending: null, endingStop: false, jump: {}, ...o });

  it("ritornello con times=3", () => {
    const { order } = computePlayOrder([M({ fwd: true }), M({ bwd: { times: 3 } }), M()]);
    expect(order).toEqual([0, 1, 0, 1, 0, 1, 2]);
  });

  it("senza |: iniziale si ripete dall'inizio, poi dal ritornello precedente", () => {
    const { order } = computePlayOrder([M(), M({ bwd: { times: 2 } }), M(), M({ bwd: { times: 2 } })]);
    expect(order).toEqual([0, 1, 0, 1, 2, 3, 2, 3]);
  });

  it("volte 1 e 2 su più misure", () => {
    const { order } = computePlayOrder([
      M({ fwd: true }),
      M({ ending: [1] }),
      M({ ending: [1], bwd: { times: 2 }, endingStop: true }),
      M({ ending: [2] }),
      M({ ending: [2], endingStop: true }),
      M(),
    ]);
    expect(order).toEqual([0, 1, 2, 0, 3, 4, 5]);
  });

  it("D.S. al Coda", () => {
    const { order } = computePlayOrder([
      M(), M({ jump: { segno: "s" } }), M({ jump: { tocoda: "c" } }), M({ jump: { dalsegno: "s" } }), M({ jump: { coda: "c" } }),
    ]);
    expect(order).toEqual([0, 1, 2, 3, 1, 2, 4]);
  });

  it("expand=false restituisce l'ordine scritto", () => {
    expect(computePlayOrder([M({ fwd: true }), M({ bwd: { times: 2 } })], { expand: false }).order).toEqual([0, 1]);
  });

  it("struttura malformata: non va in loop infinito", () => {
    const { order } = computePlayOrder([M({ jump: { dalsegno: "x" } }), M({ jump: { dalsegno: "x" } })]);
    expect(order.length).toBeLessThan(100);
  });
});

describe("tonalità", () => {
  it("tonic da armatura e modo", () => {
    expect(tonicFromFifths(3, "major")).toBe("A");
    expect(tonicFromFifths(-3, "minor")).toBe("C");
    expect(tonicFromFifths(0, "dorian")).toBe("D");
    expect(inferMode(0, [3, 0, 1, 0, 4, 1, 0, 1, 0, 6, 0, 1]).mode).toBe("minor");
  });
});

// --- contenitore .mxl -------------------------------------------------------

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of files) {
    const raw = Buffer.from(data);
    const body = deflate ? zlib.deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc32(raw), 14);
    h.writeUInt32LE(body.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    const local = Buffer.concat([h, nameBuf, body]);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc32(raw), 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([c, nameBuf]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

describe("contenitore .mxl", () => {
  const xml = score([measure(1, attributes() + note("C", 4, 4))]);
  const container = `<container><rootfiles><rootfile full-path="dir/score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`;

  it("legge lo ZIP compresso seguendo container.xml", async () => {
    const zip = makeZip([
      { name: "META-INF/container.xml", data: container, deflate: true },
      { name: "dir/score.xml", data: xml, deflate: true },
    ]);
    const song = await convertMusicXml(zip, { fileName: "x.mxl" });
    expect(pairs(song)).toEqual([[0, 60, 4]]);
    expect(song.meta.source.rootXml).toBe("dir/score.xml");
  });

  it("voci non compresse e container mancante: ripiega sul primo XML", async () => {
    const zip = makeZip([{ name: "a.xml", data: xml, deflate: false }]);
    expect(pairs(await convertMusicXml(zip))).toEqual([[0, 60, 4]]);
  });

  it("riconosce XML in chiaro e UTF-16 con BOM", async () => {
    expect(pairs(await convertMusicXml(new TextEncoder().encode(xml)))).toEqual([[0, 60, 4]]);
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]);
    expect(pairs(await convertMusicXml(new Uint8Array(utf16)))).toEqual([[0, 60, 4]]);
  });

  it("messaggi d'errore chiari", async () => {
    await expect(convertMusicXml("<html/>")).rejects.toThrow(/non è una partitura MusicXML/);
    await expect(convertMusicXml(score([measure(1, attributes() + rest(4))]))).rejects.toThrow(/note suonabili/);
    await expect(convertMusicXml(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).rejects.toThrow(/\.mxl/);
  });
});
