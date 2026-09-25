#!/usr/bin/env python3
"""Generates Android launcher, adaptive and splash images from resources/icon.png.

Android-only: writes into android/app/src/main/res and never touches the iOS
icon set in resources/AppIcon.appiconset.

Adaptive icon: the artwork is extracted as a black shape with alpha and placed
inside the 66/108 safe zone, on a solid yellow background layer, so no launcher
mask (circle, squircle, teardrop) crops it.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "resources" / "icon.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
BG_HEX = "#FDC30B"
BG = (253, 195, 11)
SPLASH_BG = (251, 249, 243)  # #FBF9F3, same as capacitor.config splash

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def load_icon() -> Image.Image:
    im = Image.open(SRC).convert("RGB")
    # Drop the thin dark frame baked into the master image.
    return im.crop((16, 16, im.width - 16, im.height - 16))


def artwork_layer(icon: Image.Image) -> Image.Image:
    """Black artwork with alpha taken from darkness relative to the yellow bg."""
    gray = ImageOps.grayscale(icon)
    bg_l = int(0.299 * BG[0] + 0.587 * BG[1] + 0.114 * BG[2])
    alpha = gray.point(lambda v: max(0, min(255, int((bg_l - v) * 255 / max(1, bg_l - 20)))))
    layer = Image.new("RGBA", icon.size, (10, 10, 10, 0))
    layer.putalpha(alpha)
    return layer


def centered(layer: Image.Image, size: int, fraction: float, bg=(0, 0, 0, 0)) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    inner = max(1, round(size * fraction))
    scaled = layer.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.alpha_composite(scaled, (off, off))
    return canvas


def main() -> None:
    icon = load_icon()
    art = artwork_layer(icon)

    for name, scale in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        # Adaptive foreground: 108dp canvas, artwork inside the 66dp safe zone.
        fg_size = round(108 * scale)
        centered(art, fg_size, 0.60).save(folder / "ic_launcher_foreground.png")

        # Legacy square icon (pre-Android 8): yellow rounded square.
        size = round(48 * scale)
        square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 6, fill=255)
        filled = centered(art, size, 0.82, bg=BG + (255,))
        square.paste(filled, (0, 0), mask)
        square.save(folder / "ic_launcher.png")

        # Legacy round icon.
        round_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        round_icon.paste(centered(art, size, 0.70, bg=BG + (255,)), (0, 0), mask)
        round_icon.save(folder / "ic_launcher_round.png")

    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{BG_HEX}</color>\n</resources>\n'
    )
    for xml in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (RES / "mipmap-anydpi-v26" / xml).write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background"/>\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
            '    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n'
            "</adaptive-icon>\n"
        )
    # The template's vector foreground (Capacitor logo) would shadow ours.
    vector = RES / "drawable-v24" / "ic_launcher_foreground.xml"
    if vector.exists():
        vector.unlink()
    bg_xml = RES / "drawable" / "ic_launcher_background.xml"
    if bg_xml.exists():
        bg_xml.unlink()

    # Splash: cream background with the rounded app icon in the centre.
    tile = icon.convert("RGBA")
    tmask = Image.new("L", tile.size, 0)
    ImageDraw.Draw(tmask).rounded_rectangle((0, 0, tile.width - 1, tile.height - 1), radius=tile.width // 5, fill=255)
    tile.putalpha(tmask)
    splash_dirs = {"drawable": (480, 800)}
    for name, scale in DENSITIES.items():
        splash_dirs[f"drawable-port-{name}"] = (round(320 * scale), round(480 * scale))
        splash_dirs[f"drawable-land-{name}"] = (round(480 * scale), round(320 * scale))
    for folder, (w, h) in splash_dirs.items():
        canvas = Image.new("RGBA", (w, h), SPLASH_BG + (255,))
        side = round(min(w, h) * 0.32)
        t = tile.resize((side, side), Image.LANCZOS)
        canvas.alpha_composite(t, ((w - side) // 2, (h - side) // 2))
        (RES / folder).mkdir(parents=True, exist_ok=True)
        canvas.convert("RGB").save(RES / folder / "splash.png")

    print("Android icons and splash generated in", RES)


if __name__ == "__main__":
    main()
