import sys, asyncio, json
from playwright.async_api import async_playwright
key = sys.argv[1]; times = [float(x) for x in sys.argv[2:]]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1280,"height":720})
        errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(f"file:///home/claude/studio/kit/out/{key}/index.html", wait_until="domcontentloaded", timeout=20000)
        await pg.wait_for_timeout(600)
        for t in times:
            await pg.evaluate(f'window.__timelines["{key.lower()}"].seek({t}, false); 0')
            await pg.wait_for_timeout(120)
            await pg.screenshot(path=f"/home/claude/studio/kit/snap/{key}_{t:05.1f}.png")
        print("errors", errs)
        await b.close()
asyncio.run(main())
