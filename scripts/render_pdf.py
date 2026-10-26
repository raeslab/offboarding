#!/usr/bin/env python3
"""Render PDF pages to PNG (for visually reviewing the generated reports).

    uv run python scripts/render_pdf.py test-results/samples/*.pdf [--scale 1.5]

Writes <name>-p<N>.png next to each PDF and prints the extracted text of page 1.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pypdfium2 as pdfium


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+", type=Path)
    ap.add_argument("--scale", type=float, default=1.5)
    ap.add_argument("--text", action="store_true", help="print text of every page")
    args = ap.parse_args()

    for pdf_path in args.pdfs:
        pdf = pdfium.PdfDocument(pdf_path)
        print(f"== {pdf_path} ({len(pdf)} pages)")
        for i, page in enumerate(pdf, start=1):
            out = pdf_path.with_name(f"{pdf_path.stem}-p{i}.png")
            page.render(scale=args.scale).to_pil().save(out)
            print(f"   {out}")
            if args.text or i == 1:
                print(page.get_textpage().get_text_range()[:1500])


if __name__ == "__main__":
    main()
