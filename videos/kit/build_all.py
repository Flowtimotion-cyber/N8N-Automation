import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from kit import compose, WORDS
from plans import P
keys = sys.argv[1:] or list(P)
for k in keys:
    if k not in WORDS: print("skip", k); continue
    print("==", k)
    dur, starts = compose(k, P[k], f"/home/claude/studio/kit/out/{k}")
    print("  dur", dur, "scenes", " ".join(f"{t:.0f}" for t in starts))
