"""Dev tool (not used at runtime): cuts the four generated Magical sheets (orbs, ribbons, core, title; glow on pure black)
into individual alpha WebP files + pack.json.
Usage: python tools/extract_magical_pack.py <folder with magical-*-sheet.png / magical-title.png> <output folder>
Requires: numpy, scipy, pillow."""
import numpy as np, json, os
from PIL import Image
from scipy import ndimage as ndi
import sys
SRC=(sys.argv[1] if len(sys.argv)>1 else "design-references")+"/magical-%s.png"
OUT=sys.argv[2] if len(sys.argv)>2 else "assets/magical"; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))

def load(n): return np.asarray(Image.open(SRC%n).convert("RGB")).astype(np.float32)/255

def comps(rgb, thr=0.05, grow=14, min_area=900):
    m=rgb.max(2); mask=m>thr
    lab,n=ndi.label(ndi.binary_dilation(mask,iterations=grow))
    out=[]
    for i,sl in enumerate(ndi.find_objects(lab),1):
        area=int(((lab[sl]==i)&mask[sl]).sum())
        if area<min_area: continue
        ys,xs=sl; out.append((xs.start,ys.start,xs.stop,ys.stop,area))
    return out

def crop_alpha(rgb, box, pad=6, black=0.025, maxw=None):
    x0,y0,x1,y1=box[:4]; H,W=rgb.shape[:2]
    # tighten to alpha > 0.01 inside box
    sub=rgb[max(0,y0-pad):min(H,y1+pad), max(0,x0-pad):min(W,x1+pad)]
    m=sub.max(2); a=np.clip((m-black)/(1-black),0,1)
    ys,xs=np.where(a>0.01); sub=sub[ys.min():ys.max()+1, xs.min():xs.max()+1]
    m=sub.max(2); a=np.clip((m-black)/(1-black),0,1)
    col=np.where(m[...,None]>1e-4, sub/np.maximum(m[...,None],1e-4), 0).clip(0,1)
    rgba=(np.dstack([col,a])*255).astype(np.uint8)
    im=Image.fromarray(rgba,"RGBA")
    if maxw and im.width>maxw: im=im.resize((maxw, round(im.height*maxw/im.width)), Image.LANCZOS)
    return im, sub

manifest={"version":1,"dir":"assets/magical","assets":{}}
def save(name, im, **extra):
    fn=name+".webp"; im.save(os.path.join(OUT,fn),"WEBP",quality=90,method=6,alpha_quality=100)
    manifest["assets"][name]={"file":fn,"w":im.width,"h":im.height,**extra}

# ---- orbs (3x2 grid)
rgb=load("orbs-sheet"); cs=comps(rgb)
cs=sorted(cs,key=lambda c:(int((c[1]+c[3])/2 > rgb.shape[0]/2), (c[0]+c[2])/2)); assert len(cs)==6,len(cs); print('orb centers',[((c[0]+c[2])//2,(c[1]+c[3])//2) for c in cs])
for name,c in zip(["orb-blue","orb-cyan","orb-violet","orb-magenta","orb-gold","orb-green"],cs):
    im,_=crop_alpha(rgb,c,maxw=420); save(name,im)
# ---- ribbons (4 rows)
rgb=load("ribbons-sheet"); cs=sorted(comps(rgb,grow=10,min_area=3000),key=lambda c:c[1]); assert len(cs)==4,len(cs)
for name,c in zip(["ribbon-blue","ribbon-violet","ribbon-gold","ribbon-green"],cs):
    im,sub=crop_alpha(rgb,c,maxw=1000)
    m=sub.max(2); ys,xs=np.where(m>0.97)
    ax=(xs.mean()/sub.shape[1]) if len(xs) else 0.94; ay=(ys.mean()/sub.shape[0]) if len(ys) else 0.5
    save(name,im,ax=round(float(ax),4),ay=round(float(ay),4))
# ---- core sheet (quadrant crops for the three big elements, components for the stars)
rgb=load("core-sheet"); H,W=rgb.shape[:2]
def region(x0,y0,x1,y1):
    r=np.zeros_like(rgb); r[y0:y1,x0:x1]=rgb[y0:y1,x0:x1]; return r
for nm,(x0,y0,x1,y1),mw in [("arcane-core",(0,0,760,505),520),("arcane-ring",(780,0,W,505),560),("magic-burst",(0,505,760,H),720)]:
    r=region(x0,y0,x1,y1); c=comps(r,grow=6,min_area=300); box=[min(k[0] for k in c),min(k[1] for k in c),max(k[2] for k in c),max(k[3] for k in c)]
    im,_=crop_alpha(rgb,box,maxw=mw); save(nm,im)
r=region(780,505,W,H); cs=comps(r,thr=0.05,grow=8,min_area=120)
stars=sorted(cs,key=lambda c:-c[4])[:4]; stars=sorted(stars,key=lambda c:(c[1]//250,c[0]))
print("stars:",[(c[0],c[1],c[4]) for c in stars])
for i,c in enumerate(stars,1):
    im,_=crop_alpha(rgb,c,maxw=260); save(f"sparkle-{i}",im)
# ---- title
rgb=load("title"); cs=comps(rgb,grow=30,min_area=5000); assert cs
c=max(cs,key=lambda c:c[4]); im,_=crop_alpha(rgb,c,maxw=1600); save("encounter-magical",im)

json.dump(manifest,open(os.path.join(OUT,"pack.json"),"w"),indent=2)
tot=0
for k,v in manifest["assets"].items():
    sz=os.path.getsize(os.path.join(OUT,v["file"])); tot+=sz; print(f"{k:20s} {v['w']:5d}x{v['h']:<5d} {sz/1024:7.1f} KB", {kk:vv for kk,vv in v.items() if kk in('ax','ay')})
print("TOTAL KB", round(tot/1024))
