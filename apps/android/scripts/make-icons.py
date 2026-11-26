"""يولّد أيقونات Android وشاشة البدء من أيقونات الواجهة (apps/web/public) بدل أيقونات Capacitor الافتراضية."""
import glob, os
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
pub = os.path.join(here, "../../web/public")
res = os.path.join(here, "../android/app/src/main/res")
icon = Image.open(os.path.join(pub, "pwa-512.png")).convert("RGBA")
mask = Image.open(os.path.join(pub, "pwa-maskable-512.png")).convert("RGBA")
NAVY = (11, 37, 69, 255)
for d, n in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    out = os.path.join(res, f"mipmap-{d}")
    sq = icon.resize((n, n), Image.LANCZOS)
    sq.save(os.path.join(out, "ic_launcher.png"))
    m = Image.new("L", (n * 4, n * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, n * 4 - 1, n * 4 - 1), fill=255)
    rnd = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    rnd.paste(mask.resize((n, n), Image.LANCZOS), (0, 0), m.resize((n, n), Image.LANCZOS))
    rnd.save(os.path.join(out, "ic_launcher_round.png"))
    f = n * 108 // 48
    mask.resize((f, f), Image.LANCZOS).save(os.path.join(out, "ic_launcher_foreground.png"))
for p in glob.glob(os.path.join(res, "drawable*", "splash.png")):
    w, h = Image.open(p).size
    s = Image.new("RGBA", (w, h), NAVY)
    k = min(w, h) // 3
    lg = mask.resize((k, k), Image.LANCZOS)
    s.paste(lg, ((w - k) // 2, (h - k) // 2), lg)
    s.convert("RGB").save(p)
bg = os.path.join(res, "values", "ic_launcher_background.xml")
open(bg, "w").write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B2545</color>\n</resources>\n')
print("icons + splash generated")
