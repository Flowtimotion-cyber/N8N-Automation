import sys, subprocess, re, glob
from PIL import Image
k=sys.argv[1]
s=open(f"out/{k}/index.html").read()
sc=[(float(a),float(b)) for a,b in re.findall(r'SC\("#sc\d+",([\d.]+),([\d.]+)\)',s)]
ts=[round(min(b-0.5, a+ (b-a)*0.8),1) for a,b in sc]
for f in glob.glob(f"snap/{k}_*.png"): __import__('os').remove(f)
subprocess.run(["python3","snap.py",k]+[str(t) for t in ts],check=True)
fs=sorted(glob.glob(f"snap/{k}_*.png"));ims=[Image.open(f).resize((640,360)) for f in fs]
W=Image.new('RGB',(1280,360*((len(ims)+1)//2)),'white')
for i,im in enumerate(ims): W.paste(im,((i%2)*640,(i//2)*360))
W.save(f'snap/{k}_sheet.jpg',quality=80)
