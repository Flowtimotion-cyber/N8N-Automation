"""Textkarten im Momentum-Look als Bilder (Pillow).

Alles wird doppelt so groß gezeichnet und dann verkleinert, damit Kanten und
Rundungen glatt sind. Maße in den Funktionen sind immer auf 1080x1920 bezogen.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
SS = 2  # Zeichenfaktor (Supersampling)

NAVY = (0x16, 0x12, 0x3A)
TUERKIS = (0x12, 0xB1, 0xC8)
HELL = (0xFA, 0xF8, 0xF4)
WEISS = (255, 255, 255)
FLIEDER = (0xC9, 0xC6, 0xDD)
GRAU = (0x6B, 0x66, 0x86)
VERLAUF = [(0x9B, 0x2F, 0xC7), (0x3B, 0x4F, 0xD8), (0x22, 0xC2, 0xC8)]

SCHRIFT_ORDNER = Path(__file__).resolve().parent.parent / "assets" / "fonts"
SCHRIFTEN = {
    "extrabold": "Inter-ExtraBold.ttf",
    "bold": "Inter-Bold.ttf",
    "medium": "Inter-Medium.ttf",
}

UNTERTITEL_HOEHE = 220  # Höhe des Untertitel-Streifens
UNTERTITEL_Y = 1260     # obere Kante des Streifens im Video


def schrift(gewicht: str, groesse: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(SCHRIFT_ORDNER / SCHRIFTEN[gewicht]), int(round(groesse * SS)))


def _s(*werte):
    """Rechnet 1080er-Maße in Zeichenmaße um."""
    return tuple(int(round(v * SS)) for v in werte) if len(werte) > 1 else int(round(werte[0] * SS))


def _breite(text: str, f: ImageFont.FreeTypeFont) -> float:
    return f.getlength(text) / SS


def _passend(texte: list[str], gewicht: str, max_breite: float, start: float, minimum: float = 34) -> float:
    """Größte Schriftgröße, bei der alle Zeilen in die Breite passen."""
    g = start
    while g > minimum and max(_breite(t, schrift(gewicht, g)) for t in texte) > max_breite:
        g -= 2
    return g


def _farbe_im_verlauf(t: float) -> tuple[int, int, int]:
    t = min(1.0, max(0.0, t)) * (len(VERLAUF) - 1)
    i = min(int(t), len(VERLAUF) - 2)
    a, b, r = VERLAUF[i], VERLAUF[i + 1], t - i
    return tuple(int(round(a[k] + (b[k] - a[k]) * r)) for k in range(3))


def _verlauf(w: int, h: int) -> Image.Image:
    zeile = Image.new("RGB", (max(w, 2), 1))
    zeile.putdata([_farbe_im_verlauf(x / (max(w, 2) - 1)) for x in range(max(w, 2))])
    return zeile.resize((w, h))


def _pille(ziel: Image.Image, box: tuple[float, float, float, float], radius: float) -> None:
    """Abgerundetes Feld mit Markenverlauf; box in 1080er-Maßen."""
    x0, y0, x1, y1 = _s(*box)
    w, h = x1 - x0, y1 - y0
    maske = Image.new("L", (w, h), 0)
    ImageDraw.Draw(maske).rounded_rectangle((0, 0, w - 1, h - 1), _s(radius), fill=255)
    ziel.paste(_verlauf(w, h).convert("RGBA"), (x0, y0), maske)


def _schatten(ziel: Image.Image, box: tuple[float, float, float, float], radius: float, staerke: int = 70) -> None:
    ebene = Image.new("RGBA", ziel.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = _s(*box)
    ImageDraw.Draw(ebene).rounded_rectangle((x0, y0 + _s(10), x1, y1 + _s(10)), _s(radius), fill=(22, 18, 58, staerke))
    ziel.alpha_composite(ebene.filter(ImageFilter.GaussianBlur(_s(18))))


def _fertig(bild: Image.Image, groesse: tuple[int, int]) -> Image.Image:
    return bild.resize(groesse, Image.LANCZOS)


def _zeilen(text) -> list[str]:
    if isinstance(text, str):
        text = text.split("|")
    return [z.strip() for z in text if z and z.strip()]


# --------------------------------------------------------------------------- Hook

def hook_karte(text) -> Image.Image:
    """Große Textkarte oben für Sekunde 0–2. Letzte Zeile steht im Verlauf."""
    zeilen = _zeilen(text)[:3]
    bild = Image.new("RGBA", _s(W, H), (0, 0, 0, 0))
    g = _passend(zeilen, "extrabold", 800, 86)
    f = schrift("extrabold", g)
    zeilenhoehe = g * 1.42
    rand = 40
    breite = min(980, max(_breite(z, f) for z in zeilen) + 2 * (rand + 30))
    hoehe = len(zeilen) * zeilenhoehe + 2 * rand
    x0, y0 = (W - breite) / 2, 140
    box = (x0, y0, x0 + breite, y0 + hoehe)
    _schatten(bild, box, 40)
    d = ImageDraw.Draw(bild)
    d.rounded_rectangle(_s(*box), _s(40), fill=(255, 255, 255, 246))
    for i, z in enumerate(zeilen):
        cy = y0 + rand + zeilenhoehe * (i + 0.5)
        if i == len(zeilen) - 1:
            tw = _breite(z, f)
            _pille(bild, (W / 2 - tw / 2 - 28, cy - zeilenhoehe / 2 + 8, W / 2 + tw / 2 + 28, cy + zeilenhoehe / 2 - 8), 22)
            d.text(_s(W / 2, cy), z, font=f, fill=WEISS, anchor="mm")
        else:
            d.text(_s(W / 2, cy), z, font=f, fill=NAVY, anchor="mm")
    return _fertig(bild, (W, H))


# --------------------------------------------------------------------- Untertitel

def untertitel_streifen(woerter: list[str], aktiv: int | None) -> Image.Image:
    """Ein Zustand der Wort-Untertitel: Wortgruppe, das gesprochene Wort im Verlauf."""
    bild = Image.new("RGBA", _s(W, UNTERTITEL_HOEHE), (0, 0, 0, 0))
    if not woerter:
        return _fertig(bild, (W, UNTERTITEL_HOEHE))
    innen, abstand = 18, 8
    g = 68
    while g > 36:
        f = schrift("extrabold", g)
        gesamt = sum(_breite(w, f) + 2 * innen for w in woerter) + abstand * (len(woerter) - 1)
        if gesamt <= 980:
            break
        g -= 2
    f = schrift("extrabold", g)
    gesamt = sum(_breite(w, f) + 2 * innen for w in woerter) + abstand * (len(woerter) - 1)
    x, cy = (W - gesamt) / 2, UNTERTITEL_HOEHE / 2
    schatten = Image.new("RGBA", bild.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(schatten)
    xs = x
    for i, w in enumerate(woerter):
        tw = _breite(w, f)
        if i != aktiv:
            ds.text(_s(xs + innen, cy + 3), w, font=f, fill=(10, 8, 30, 170), anchor="lm")
        xs += tw + 2 * innen + abstand
    bild.alpha_composite(schatten.filter(ImageFilter.GaussianBlur(_s(5))))
    d = ImageDraw.Draw(bild)
    for i, w in enumerate(woerter):
        tw = _breite(w, f)
        if i == aktiv:
            _pille(bild, (x, cy - g * 0.66, x + tw + 2 * innen, cy + g * 0.66), 16)
            d.text(_s(x + innen, cy), w, font=f, fill=WEISS, anchor="lm")
        else:
            d.text(_s(x + innen, cy), w, font=f, fill=WEISS, anchor="lm",
                   stroke_width=_s(3), stroke_fill=(16, 12, 44, 235))
        x += tw + 2 * innen + abstand
    return _fertig(bild, (W, UNTERTITEL_HOEHE))


# ------------------------------------------------------------------ Abschlusskarte

def lemniskate(breite: float, punkte: int = 58, radius: float = 5.4) -> Image.Image:
    """Punkt-Lemniskate (liegende Acht aus Punkten) im Markenverlauf, transparent."""
    a = breite / 2 - radius
    hoehe = a * 0.7072 + 2 * radius + 4
    bild = Image.new("RGBA", _s(breite, hoehe), (0, 0, 0, 0))
    d = ImageDraw.Draw(bild)
    for i in range(punkte):
        t = 2 * math.pi * i / punkte
        n = 1 + math.sin(t) ** 2
        x, y = a * math.cos(t) / n, a * math.sin(t) * math.cos(t) / n
        px, py = breite / 2 + x, hoehe / 2 + y
        d.ellipse(_s(px - radius, py - radius, px + radius, py + radius),
                  fill=_farbe_im_verlauf((x + a) / (2 * a)) + (255,))
    return bild  # bewusst noch in Zeichengröße, wird vom Aufrufer eingesetzt


def abschluss_karte(merksatz, marke: str, handle: str) -> Image.Image:
    """Abschlusskarte: Navy, zwei Zeilen Merksatz (weiß + Türkis), Lemniskate, Marke, Handle."""
    zeilen = _zeilen(merksatz)[:2]
    bild = Image.new("RGBA", _s(W, H), NAVY + (255,))
    d = ImageDraw.Draw(bild)
    g = _passend(zeilen, "extrabold", 940, 80)
    f = schrift("extrabold", g)
    if len(zeilen) == 1:
        d.text(_s(W / 2, 748), zeilen[0], font=f, fill=WEISS, anchor="mm")
    else:
        d.text(_s(W / 2, 696), zeilen[0], font=f, fill=WEISS, anchor="mm")
        d.text(_s(W / 2, 696 + g * 1.33), zeilen[1], font=f, fill=TUERKIS, anchor="mm")
    logo = lemniskate(290)
    bild.alpha_composite(logo, (_s(W / 2) - logo.width // 2, _s(1010) - logo.height // 2))
    d.text(_s(W / 2, 1140), marke, font=schrift("bold", 40), fill=WEISS, anchor="mm")
    d.text(_s(W / 2, 1202), handle, font=schrift("medium", 36), fill=FLIEDER, anchor="mm")
    return _fertig(bild, (W, H)).convert("RGB")


# ----------------------------------------------------------------------- Story

STORY_KREIS_D = 740
STORY_KREIS_CY = 1040


def _umbrechen(text: str, f_gewicht: str, groesse: float, max_breite: float) -> list[str]:
    f = schrift(f_gewicht, groesse)
    zeilen, aktuell = [], ""
    for wort in text.split():
        probe = (aktuell + " " + wort).strip()
        if aktuell and _breite(probe, f) > max_breite:
            zeilen.append(aktuell)
            aktuell = wort
        else:
            aktuell = probe
    return zeilen + ([aktuell] if aktuell else [])


def story_hintergrund(hook, karte: str, marke: str, handle: str) -> Image.Image:
    """Heller Story-Hintergrund mit Pille, Hook, Karte und Footer. Der Kreis bleibt frei."""
    bild = Image.new("RGBA", _s(W, H), HELL + (255,))
    d = ImageDraw.Draw(bild)
    # Pille „NEUES REEL“
    fp = schrift("bold", 36)
    etikett = "NEUES REEL"
    tw = _breite(etikett, fp)
    _pille(bild, (W / 2 - tw / 2 - 40, 214, W / 2 + tw / 2 + 40, 290), 38)
    d.text(_s(W / 2, 252), etikett, font=fp, fill=WEISS, anchor="mm")
    # Hook
    zeilen = _zeilen(hook)[:3]
    g = _passend(zeilen, "extrabold", 920, 82)
    f = schrift("extrabold", g)
    oben = 350 + (3 - len(zeilen)) * g * 0.6
    for i, z in enumerate(zeilen):
        d.text(_s(W / 2, oben + g * 1.2 * (i + 0.5)), z, font=f, fill=NAVY, anchor="mm")
    # Karte „<Person> zeigt …“
    gk = 46
    kz = _umbrechen(karte, "bold", gk, 760)
    while len(kz) > 2 and gk > 32:
        gk -= 2
        kz = _umbrechen(karte, "bold", gk, 760)
    fk = schrift("bold", gk)
    hoehe = len(kz) * gk * 1.3 + 64
    box = (110, 1480, 970, 1480 + hoehe)
    _schatten(bild, box, 34, 46)
    d.rounded_rectangle(_s(*box), _s(34), fill=WEISS + (255,))
    for i, z in enumerate(kz):
        d.text(_s(W / 2, 1480 + 32 + gk * 1.3 * (i + 0.5)), z, font=fk, fill=NAVY, anchor="mm")
    # Footer
    d.text(_s(W / 2, 1772), marke, font=schrift("bold", 30), fill=NAVY, anchor="mm")
    d.text(_s(W / 2, 1816), handle, font=schrift("medium", 30), fill=GRAU, anchor="mm")
    return _fertig(bild, (W, H)).convert("RGB")


def story_ring(dicke: float = 14) -> Image.Image:
    """Verlaufsring um den runden Videoausschnitt, transparent, volle Bildgröße."""
    bild = Image.new("RGBA", _s(W, H), (0, 0, 0, 0))
    aussen = STORY_KREIS_D + 2 * dicke
    x0, y0 = (W - aussen) / 2, STORY_KREIS_CY - aussen / 2
    maske = Image.new("L", _s(aussen, aussen), 0)
    dm = ImageDraw.Draw(maske)
    dm.ellipse((0, 0, maske.width - 1, maske.height - 1), fill=255)
    dm.ellipse(_s(dicke, dicke, aussen - dicke, aussen - dicke), fill=0)
    bild.paste(_verlauf(maske.width, maske.height).convert("RGBA"), _s(x0, y0), maske)
    return _fertig(bild, (W, H))


def kreis_maske() -> Image.Image:
    """Weißer Kreis auf Schwarz: schneidet das Video rund aus."""
    maske = Image.new("L", _s(STORY_KREIS_D, STORY_KREIS_D), 0)
    ImageDraw.Draw(maske).ellipse((0, 0, maske.width - 1, maske.height - 1), fill=255)
    return maske.resize((STORY_KREIS_D, STORY_KREIS_D), Image.LANCZOS)
