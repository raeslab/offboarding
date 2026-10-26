#!/usr/bin/env python3
"""Download (vendor) all third-party assets used by the static site in docs/.

Run once from the repository root, and again whenever you want to bump versions:

    python scripts/fetch_vendor.py

Only the Python standard library is used. Everything ends up under docs/ so the
site works offline and without any CDN at runtime.

What is fetched
---------------
* jsPDF (MIT)                       -> docs/vendor/jspdf/
* jspdf-autotable (MIT)             -> docs/vendor/jspdf/
* Nunito Sans static TTFs (SIL OFL) -> docs/vendor/fonts/   (VIB's body font, via Google Fonts)
* VIB logos + favicons              -> docs/assets/          (from www.vib.be)

Note: VIB's heading font "Degular" is served through Adobe Fonts (Typekit). Its
licence does not allow self-hosting, so it is NOT vendored; headings use
Nunito Sans instead.
"""
from __future__ import annotations

import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

JSPDF_VERSION = "4.2.1"
AUTOTABLE_VERSION = "5.0.9"

FILES = {
    # --- jsPDF ---------------------------------------------------------------
    f"https://cdnjs.cloudflare.com/ajax/libs/jspdf/{JSPDF_VERSION}/jspdf.umd.min.js":
        "vendor/jspdf/jspdf.umd.min.js",
    f"https://raw.githubusercontent.com/parallax/jsPDF/v{JSPDF_VERSION}/LICENSE":
        "vendor/jspdf/LICENSE-jspdf.txt",
    f"https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/{AUTOTABLE_VERSION}/jspdf.plugin.autotable.min.js":
        "vendor/jspdf/jspdf.plugin.autotable.min.js",
    f"https://raw.githubusercontent.com/simonbengtsson/jsPDF-AutoTable/v{AUTOTABLE_VERSION}/LICENSE.txt":
        "vendor/jspdf/LICENSE-autotable.txt",
    # --- Nunito Sans licence ------------------------------------------------------
    "https://raw.githubusercontent.com/google/fonts/main/ofl/nunitosans/OFL.txt":
        "vendor/fonts/OFL-NunitoSans.txt",
    # --- VIB branding (from www.vib.be) --------------------------------------
    "https://vib.be/sites/vib.sites.vib.be/files/logo_VIB_noTagline.svg":
        "assets/vib-logo.svg",
    "https://vib.be/sites/vib.sites.vib.be/files/VIB-logo_white.svg":
        "assets/vib-logo-white.svg",
    "https://vib.be/themes/custom/entityone/favicon.ico":
        "assets/favicon.ico",
    "https://vib.be/themes/custom/entityone/favicon-32x32.png":
        "assets/favicon-32x32.png",
    "https://vib.be/themes/custom/entityone/favicon-16x16.png":
        "assets/favicon-16x16.png",
    "https://vib.be/themes/custom/entityone/apple-touch-icon.png":
        "assets/apple-touch-icon.png",
}

# Static Nunito Sans instances. Google Fonts serves TrueType (not woff2) to
# non-browser user agents, which is what jsPDF needs to embed the font.
FONT_CSS_URL = (
    "https://fonts.googleapis.com/css2?family=Nunito+Sans:"
    "ital,wght@0,300;0,400;0,600;0,700;0,800;1,400&display=swap"
)
UA = "Python-urllib/3 (offboarding vendor script)"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def clean_svg(data: bytes) -> bytes:
    """Strip editor metadata (Illustrator embeds >400 kB of private data)."""
    s = data.decode("utf-8")
    s = re.sub(r"<metadata.*?</metadata>", "", s, flags=re.DOTALL)
    s = re.sub(r"<i:pgf.*?</i:pgf>", "", s, flags=re.DOTALL)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.DOTALL)
    s = re.sub(r"\n\s*\n", "\n", s)
    return s.encode("utf-8")


def save(rel: str, data: bytes) -> None:
    if rel.endswith(".svg"):
        data = clean_svg(data)
    out = DOCS / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    print(f"  {rel:48s} {len(data)/1024:8.1f} kB")


def fetch_fonts() -> None:
    css = get(FONT_CSS_URL).decode("utf-8")
    blocks = re.findall(r"@font-face\s*{(.*?)}", css, re.DOTALL)
    if not blocks:
        raise RuntimeError("No @font-face rules returned by Google Fonts")
    for block in blocks:
        style = re.search(r"font-style:\s*(\w+)", block).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", block).group(1)
        m = re.search(r"src:\s*url\((.*?)\)\s*format\('(\w+)'\)", block)
        if not m:
            raise RuntimeError(f"Unexpected @font-face block: {block}")
        url, fmt = m.group(1), m.group(2)
        if fmt != "truetype":
            raise RuntimeError(f"Expected truetype, Google returned {fmt}")
        data = get(url)
        if data[:4] not in (b"\x00\x01\x00\x00", b"true"):
            raise RuntimeError(f"{url} is not a TrueType file")
        suffix = "-italic" if style == "italic" else ""
        save(f"vendor/fonts/NunitoSans-{weight}{suffix}.ttf", data)


def main() -> int:
    print(f"Vendoring into {DOCS}")
    failed = []
    for url, rel in FILES.items():
        try:
            save(rel, get(url))
        except Exception as exc:  # noqa: BLE001 - report and continue
            failed.append((url, exc))
            print(f"  FAILED {rel}: {exc}")
    try:
        fetch_fonts()
    except Exception as exc:  # noqa: BLE001
        failed.append((FONT_CSS_URL, exc))
        print(f"  FAILED fonts: {exc}")
    if failed:
        print(f"\n{len(failed)} download(s) failed.")
        return 1
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
