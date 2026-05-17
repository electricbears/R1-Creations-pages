#!/usr/bin/env python3
"""
generate-r1-qr.py

Generate a Rabbit R1 Creations-compliant QR code PNG for a given app.

The QR encodes a JSON payload in the format expected by the R1 "Add via QR code"
install flow:

    {
        "title": "My App",
        "url": "https://...",
        "description": "Short description.",
        "iconUrl": "",
        "themeColor": "#FE5000"
    }

Usage:
    python3 tools/generate-r1-qr.py \\
        --title "TNG Tricorder" \\
        --url "https://electricbears.github.io/R1-Creations-pages/TNG-Tricorder/" \\
        --description "LCARS-inspired tricorder scan interface for Rabbit R1."

Optional flags:
    --icon-url      URL of an icon image (default: empty string)
    --theme-color   Hex colour for the creation tile (default: #FE5000)
    --out           Output PNG path (default: <slug>-r1-install-qr.png in cwd)
    --size          QR box size in pixels per module (default: 10)

Requirements (auto-installed if missing):
    qrcode[pil]
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def ensure_qrcode():
    """Import qrcode, installing it first if not available."""
    try:
        import qrcode
        return qrcode
    except ImportError:
        print("qrcode not found — installing qrcode[pil]...", flush=True)
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--quiet", "qrcode[pil]"]
        )
        import qrcode
        return qrcode


def slugify(name: str) -> str:
    """Convert an app name to a filesystem-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a Rabbit R1 Creations-compliant install QR code PNG.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--title", required=True, help="App title shown on R1.")
    parser.add_argument("--url", required=True, help="Hosted URL of the web app.")
    parser.add_argument("--description", required=True, help="Short description for the creation tile.")
    parser.add_argument("--icon-url", default="", help="Icon URL (optional, default: empty).")
    parser.add_argument("--theme-color", default="#FE5000", help="Hex theme colour (default: #FE5000).")
    parser.add_argument(
        "--out", default=None,
        help="Output PNG path. Defaults to <slug>-r1-install-qr.png in the current directory."
    )
    parser.add_argument("--size", type=int, default=10, help="QR box size in pixels per module (default: 10).")
    args = parser.parse_args()

    payload = {
        "title": args.title,
        "url": args.url,
        "description": args.description,
        "iconUrl": args.icon_url,
        "themeColor": args.theme_color,
    }

    # Compact JSON — no extra whitespace — to keep the QR data minimal
    data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    out_path = Path(args.out) if args.out else Path(f"{slugify(args.title)}-r1-install-qr.png")

    qrcode = ensure_qrcode()

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=args.size,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(out_path)

    print(f"Saved:   {out_path.resolve()}")
    print(f"Payload: {data}")


if __name__ == "__main__":
    main()
