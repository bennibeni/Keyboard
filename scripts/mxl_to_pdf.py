r"""Spartito PDF da un file MusicXML (.mxl, .musicxml, .xml).

Uso (PowerShell, dalla cartella di Keyboard):
    python scripts/mxl_to_pdf.py public/mxl/brano.mxl          -> public/mxl/brano.pdf
    python scripts/mxl_to_pdf.py public/mxl/brano.mxl -o C:\Users\torre\Desktop\brano.pdf
    python scripts/mxl_to_pdf.py C:\percorso\cartella           -> un PDF per ogni file della cartella
    python scripts/mxl_to_pdf.py brano.mxl --scale 45 --landscape

Requisiti: una sola volta `pip install verovio`.
Come funziona: Verovio impagina lo spartito (pagine A4 in SVG), poi Microsoft Edge
(o Chrome), già presente su Windows, le stampa in PDF senza aprire finestre.
Diteggiature, sigle degli accordi, legature e ritornelli sono quelli del file.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

try:
    import verovio
except ImportError:
    sys.exit("Manca Verovio: esegui una volta  pip install verovio")

SUFFIXES = {".mxl", ".musicxml", ".xml"}

BROWSER_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]
BROWSER_NAMES = ["msedge", "chrome", "google-chrome", "chromium", "chromium-browser"]


def read_musicxml(path: Path) -> str:
    """Testo MusicXML del file; per un .mxl legge la partitura indicata in container.xml."""
    if path.suffix.lower() != ".mxl":
        return path.read_text(encoding="utf-8")
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        root_file = None
        if "META-INF/container.xml" in names:
            container = ET.fromstring(z.read("META-INF/container.xml"))
            for el in container.iter():
                if el.tag.endswith("rootfile") and el.get("full-path"):
                    root_file = el.get("full-path")
                    break
        if root_file is None:
            root_file = next(
                n for n in names if n.lower().endswith((".musicxml", ".xml")) and not n.startswith("META-INF")
            )
        return z.read(root_file).decode("utf-8")


def render_pages(xml: str, scale: int, landscape: bool) -> list[str]:
    tk = verovio.toolkit()
    width, height = (2970, 2100) if landscape else (2100, 2970)  # A4 in decimi di mm
    tk.setOptions(
        {
            "pageWidth": width,
            "pageHeight": height,
            "pageMarginTop": 80,
            "pageMarginBottom": 80,
            "pageMarginLeft": 90,
            "pageMarginRight": 90,
            "scale": scale,
            "adjustPageHeight": False,
            "breaks": "auto",
            "header": "auto",
            "footer": "none",  # niente logo Verovio: i numeri di pagina li aggiunge pages_to_pdf
            "svgViewBox": True,
        }
    )
    if not tk.loadData(xml):
        raise RuntimeError("Verovio non riesce a leggere il file (MusicXML non valido?)")
    return [tk.renderToSVG(page) for page in range(1, tk.getPageCount() + 1)]


def find_browser(explicit: str | None) -> str:
    if explicit:
        return explicit
    for candidate in BROWSER_CANDIDATES:
        if candidate and os.path.isfile(candidate):
            return candidate
    for name in BROWSER_NAMES:
        found = shutil.which(name)
        if found:
            return found
    sys.exit("Non trovo Edge né Chrome: indica il percorso con --browser \"C:\\...\\msedge.exe\"")


def pages_to_pdf(pages: list[str], out_pdf: Path, browser: str, landscape: bool) -> None:
    size = "297mm 210mm" if landscape else "210mm 297mm"
    w, h = size.split()
    n = len(pages)
    body = "\n".join(
        f'<div class="page">{svg}<div class="num">{i} / {n}</div></div>' if n > 1 else f'<div class="page">{svg}</div>'
        for i, svg in enumerate(pages, start=1)
    )
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: {size}; margin: 0; }}
html, body {{ margin: 0; padding: 0; background: #fff; }}
.page {{ position: relative; width: {w}; height: {h}; overflow: hidden; break-after: page; }}
.num {{ position: absolute; bottom: 7mm; left: 0; right: 0; text-align: center;
        font: 9pt "Times New Roman", Times, serif; color: #444; }}
.page:last-child {{ break-after: auto; }}
.page svg {{ width: 100%; height: 100%; display: block; }}
</style></head><body>{body}</body></html>"""
    with tempfile.TemporaryDirectory() as tmp:
        html_path = Path(tmp) / "spartito.html"
        html_path.write_text(html, encoding="utf-8")
        cmd = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            f"--user-data-dir={Path(tmp) / 'profilo'}",
            f"--print-to-pdf={out_pdf.resolve()}",
            html_path.resolve().as_uri(),
        ]
        # check=False: l'esito si controlla dal PDF creato (Edge a volte esce con
        # codice diverso da 0 anche quando ha stampato correttamente).
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, check=False)
        if not out_pdf.exists() or out_pdf.stat().st_size == 0:
            raise RuntimeError(f"Il browser non ha creato il PDF.\n{result.stderr.strip()[-800:]}")


def convert(src: Path, out_pdf: Path, args) -> None:
    pages = render_pages(read_musicxml(src), args.scale, args.landscape)
    if out_pdf.exists():
        out_pdf.unlink()
    pages_to_pdf(pages, out_pdf, find_browser(args.browser), args.landscape)
    print(f"{src.name} -> {out_pdf}  ({len(pages)} pagine)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera il PDF di uno spartito MusicXML (.mxl).")
    parser.add_argument("input", help="file .mxl/.musicxml/.xml oppure una cartella")
    parser.add_argument("-o", "--output", help="PDF da creare (solo con un file in ingresso)")
    parser.add_argument("--scale", type=int, default=40, help="grandezza delle note, default 40 (es. 30-60)")
    parser.add_argument("--landscape", action="store_true", help="pagine A4 orizzontali")
    parser.add_argument("--browser", help="percorso di msedge.exe o chrome.exe, se non trovato da solo")
    args = parser.parse_args()

    src = Path(args.input)
    if src.is_dir():
        files = sorted(p for p in src.iterdir() if p.suffix.lower() in SUFFIXES)
        if not files:
            sys.exit(f"Nessun file MusicXML in {src}")
        if args.output:
            sys.exit("--output vale solo per un singolo file")
        for f in files:
            convert(f, f.with_suffix(".pdf"), args)
    elif src.is_file():
        convert(src, Path(args.output) if args.output else src.with_suffix(".pdf"), args)
    else:
        sys.exit(f"Non trovo {src}")


if __name__ == "__main__":
    main()
