"""Full click-through test of the course HTML, including error paths."""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

HTML = pathlib.Path(__file__).parent / "dist/Modul-1-1_Automationen-verstehen-und-planen.html"
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
errors = []

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1280, "height": 860})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(HTML.as_uri()); await pg.wait_for_timeout(800)

        # 1) all videos decode
        durs = await pg.evaluate("""async () => { const out = {}; for (const [k, v] of Object.entries(MEDIA)) { if (!k.startsWith('V') && k !== 'TRAILER') continue;
            const el = document.createElement('video'); el.src = v; el.muted = true;
            out[k] = await new Promise(r => { el.onloadedmetadata = () => r(el.duration); el.onerror = () => r('ERR'); setTimeout(() => r('TIMEOUT'), 8000); }); } return out; }""")
        print("video durations", durs)
        await pg.screenshot(path=str(SHOTS / "00_start.png"))
        nxt = pg.locator("#next")
        async def go_next(): await nxt.click(); await pg.wait_for_timeout(350)
        async def is_disabled(): return await nxt.is_disabled()

        await pg.fill("input[type=text]", "Timo")
        await go_next()  # trailer
        await pg.screenshot(path=str(SHOTS / "01_video.png"))
        await go_next(); await go_next()  # V1 -> task L1
        assert await is_disabled(), "L1 next should be locked"
        await pg.click("text=Auswerten"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(SHOTS / "02_l1.png"))
        assert not await is_disabled()
        await go_next(); await go_next()  # V2 -> task L2
        # flip: one wrong, rest right (0 irrtum,1 fakt,2 irrtum,3 fakt)
        ans = ["fakt", "fakt", "irrtum", "fakt"]
        for i, a in enumerate(ans):
            await pg.locator(".flip").nth(i).locator("button", has_text="Fakt" if a == "fakt" else "Irrtum").click(); await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(500); await pg.screenshot(path=str(SHOTS / "03_l2.png"))
        assert not await is_disabled(), "L2 should unlock"
        await go_next(); await go_next()  # V3 -> L3
        items = json.loads(await pg.evaluate("JSON.stringify(DATA.levels[2].items)"))
        # wrong first on item 0
        await pg.locator(".pool .chip").first.click(); await pg.locator(".cat", has_text="Node").click(); await pg.wait_for_timeout(250)
        for it in items:
            chip = pg.locator(".pool .chip", has_text=it["t"])
            if await chip.count():
                await chip.click(); await pg.locator(".cat", has=pg.locator("h4", has_text=it["c"])).click(); await pg.wait_for_timeout(150)
        await pg.screenshot(path=str(SHOTS / "04_l3.png"))
        assert not await is_disabled(), "L3 should unlock"
        await go_next(); await go_next()  # V4 -> L4
        l4 = json.loads(await pg.evaluate("JSON.stringify(DATA.levels[3].items)"))
        for k, it in enumerate(l4):
            if k == 0:  # wrong first
                await pg.locator(".opt").nth(1 - it["a"]).click(); await pg.wait_for_timeout(150)
            await pg.locator(".opt").nth(it["a"]).click(); await pg.wait_for_timeout(150)
            await pg.screenshot(path=str(SHOTS / f"05_l4_{k}.png"))
            await pg.locator("main .btn").last.click(timeout=4000); await pg.wait_for_timeout(150)
        await pg.screenshot(path=str(SHOTS / "05_l4.png"))
        assert not await is_disabled(), "L4 should unlock"
        await go_next(); await go_next()  # V5 -> L5 rapid
        l5 = json.loads(await pg.evaluate("JSON.stringify(DATA.levels[4].items)"))
        await pg.click("text=Start – 10 Karten"); await pg.wait_for_timeout(300)
        for k, it in enumerate(l5):
            if k == 1:   # let timer run out
                await pg.wait_for_timeout(6500)
            elif k == 2:  # wrong
                await pg.click("text=Ja, automatisieren")
            else:
                await pg.click("text=Ja, automatisieren" if it["a"] else "text=Nein, bleibt beim Menschen")
            await pg.wait_for_timeout(1900)
        await pg.screenshot(path=str(SHOTS / "06_l5.png"))
        assert not await is_disabled(), "L5 should unlock"
        await go_next(); await go_next()  # V6 -> L6
        await pg.locator(".sbl").nth(1).click(); await pg.wait_for_timeout(200)  # wrong line
        for i in (0, 2, 4):
            await pg.locator(".sbl").nth(i).click(); await pg.wait_for_timeout(150)
        tas = pg.locator(".own textarea")
        for i, txt in enumerate(["Neue Anfrage über Formular", "Ins CRM, Mail, Team", "Formular, CRM, Gmail"]):
            await tas.nth(i).fill(txt)
        await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS / "07_l6.png"), full_page=True)
        assert not await is_disabled(), "L6 should unlock"
        await go_next()  # check
        assert await is_disabled(), "check locked before pass"
        await pg.click("text=Check starten")
        check = json.loads(await pg.evaluate("JSON.stringify(DATA.check)"))
        answers = {c["q"]: c["a"] for c in check}
        # fail on purpose: answer first 5 wrong
        for k in range(10):
            q = await pg.locator(".q").inner_text()
            if k < 5:
                opts = pg.locator(".opt")
                for j in range(await opts.count()):
                    if (await opts.nth(j).inner_text()) != answers[q]:
                        await opts.nth(j).click(); break
            else:
                await pg.locator(".opt", has_text=answers[q]).first.click()
            await pg.wait_for_timeout(100); await pg.locator("main .btn").last.click(); await pg.wait_for_timeout(100)
        await pg.screenshot(path=str(SHOTS / "08_check_fail.png"))
        assert await is_disabled(), "failed check must stay locked"
        await pg.click("text=Check wiederholen")
        for k in range(10):
            q = await pg.locator(".q").inner_text()
            await pg.locator(".opt", has_text=answers[q]).first.click(); await pg.wait_for_timeout(80)
            await pg.locator("main .btn").last.click(); await pg.wait_for_timeout(80)
        await pg.screenshot(path=str(SHOTS / "09_check_pass.png"))
        assert not await is_disabled()
        await go_next()  # end video
        await go_next()  # summary
        await pg.screenshot(path=str(SHOTS / "10_summary.png"), full_page=True)
        xp = await pg.locator("#xp").inner_text(); print("XP", xp)
        # reload -> resume
        await pg.reload(); await pg.wait_for_timeout(800)
        st = await pg.evaluate("JSON.parse(localStorage.getItem('m11-automationen-v1')).step")
        print("resumed step", st)
        await pg.screenshot(path=str(SHOTS / "11_reload.png"))
        # mobile layout
        await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(SHOTS / "12_mobile.png"), full_page=True)
        await b.close()
    print("ERRORS", errors)

async def safe():
    try:
        await main()
    except Exception as e:
        print("FAIL", repr(e)[:300])
asyncio.run(safe())
