import sys, re, subprocess
from PIL import Image, ImageDraw
k=sys.argv[1]
s=open(f"out/{k}/index.html").read()
sc=[(float(a),float(b)) for a,b in re.findall(r'SC\("#sc\d+",([\d.]+),([\d.]+)\)',s)]
ts=[]
for a,b in sc: ts += [round(a+(b-a)*0.35,1), round(b-0.6,1)]
ims=[]
for t in ts:
    p=f"snap/rs_{k}_{t}.jpg"
    subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',f'renders/{k}.mp4','-frames:v','1','-vf','scale=400:-1',p])
    im=Image.open(p); ImageDraw.Draw(im).text((6,4),f"{t}",fill=(200,0,0)); ims.append(im)
W=Image.new('RGB',(1600,225*((len(ims)+3)//4)),'white')
for i,im in enumerate(ims): W.paste(im,((i%4)*400,(i//4)*225))
W.save(f'snap/rs_{k}.jpg',quality=82)
