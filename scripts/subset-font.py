#!/usr/bin/env python3
"""
Subset a font to exactly the characters a page uses, as WOFF2.

CJK fonts are 5 to 10 MB and split web packages ship a 100 KB+ @font-face list; a page that
shows 40 Japanese characters needs one WOFF2 of a few KB instead.

Usage:
  python3 scripts/subset-font.py --font NotoSansJP[wght].ttf --weight 500 \
    --html examples/001-atelier-study/index.html --lang ja \
    --out examples/001-atelier-study/public/fonts/noto-sans-jp-500-subset.woff2

Collects the text of every element with lang="<lang>" (and its children) in the given HTML files,
plus any --extra characters, pins variable axes (--weight), and writes WOFF2.
Requires: pip install fonttools brotli. Keep the font's license file next to the output.
"""
import argparse
import sys
from html.parser import HTMLParser

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


class LangText(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self, lang):
        super().__init__()
        self.lang = lang
        self.stack = []
        self.chars = set()

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            return
        inside = bool(self.stack and self.stack[-1]) or dict(attrs).get("lang") == self.lang
        self.stack.append(inside)

    def handle_endtag(self, tag):
        if tag not in self.VOID and self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if self.stack and self.stack[-1]:
            self.chars.update(ch for ch in data if not ch.isspace())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--html", nargs="+", default=[])
    ap.add_argument("--lang", default="ja")
    ap.add_argument("--extra", default="", help="additional characters to keep")
    ap.add_argument("--weight", type=float, help="pin the wght axis of a variable font")
    a = ap.parse_args()

    chars = set(a.extra)
    for path in a.html:
        p = LangText(a.lang)
        with open(path, encoding="utf-8") as f:
            p.feed(f.read())
        chars |= p.chars
    if not chars:
        sys.exit("subset-font: no characters found; check --html and --lang")

    font = TTFont(a.font)
    if "fvar" in font:
        axes = {"wght": a.weight} if a.weight is not None else {}
        font = instancer.instantiateVariableFont(font, axes, inplace=False)

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    sub = subset.Subsetter(options)
    sub.populate(text="".join(sorted(chars)))
    sub.subset(font)
    font.flavor = "woff2"
    font.save(a.out)
    print(f"subset-font: {len(chars)} characters -> {a.out}")


if __name__ == "__main__":
    main()
