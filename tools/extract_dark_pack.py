"""Dev tool: cut the generated Dark Fantasy sheets into transparent WebP layers + pack.json.
Usage: python tools/extract_dark_pack.py <folder with dark-*.png> <output folder>   (numpy, scipy, pillow)"""
import numpy as np, json, os, sys
from PIL import Image
from scipy import ndimage as ndi
SRC=(sys.argv[1] if len(sys.argv)>1 else "design-references")
OUT=(sys.argv[2] if len(sys.argv)>2 else "assets/dark"); os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
P=lambda n: os.path.join(SRC,f"dark-{n}.png")
load=lambda n: np.asarray(Image.open(P(n)).convert("RGB")).astype(np.float32)/255
manifest={"version":1,"dir":"assets/dark","frame":[1672,941],"assets":{}}

def save(name, im, lossy_q=88, **extra):
    fn=name+".webp"; im.save(os.path.join(OUT,fn),"WEBP",quality=lossy_q,method=6,alpha_quality=100)
    manifest["assets"][name]={"file":fn,"w":im.width,"h":im.height,**extra}

def key_white(rgb, bg=None):
    bg=np.array([0.996,0.996,0.996]) if bg is None else bg
    rgb=np.clip(rgb/bg,0,1); a=np.clip(1-rgb.min(2),0,1); a=np.clip((a-0.02)/(0.98),0,1)
    col=np.where(a[...,None]>1e-3, (rgb-(1-a[...,None]))/np.maximum(a[...,None],1e-3), 0).clip(0,1)
    return col,a
def key_green(rgb):
    r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
    spill=g-np.maximum(r,b); a=1-np.clip((spill-0.12)/(0.55-0.12),0,1)
    bgc=np.array([0.04,0.97,0.05])
    col=np.where(a[...,None]>1e-3,(rgb-(1-a[...,None])*bgc)/np.maximum(a[...,None],1e-3),0).clip(0,1)
    col[...,1]=np.minimum(col[...,1],(col[...,0]+col[...,2])/2)      # despill (average): no yellow fringe on blood
    return col,a
def key_black(rgb, black=0.03):
    m=rgb.max(2); a=np.clip((m-black)/(1-black),0,1)
    col=np.where(m[...,None]>1e-4, rgb/np.maximum(m[...,None],1e-4),0).clip(0,1); return col,a
def comps(a, thr=0.05, grow=20, min_area=500):
    mask=a>thr; lab,n=ndi.label(ndi.binary_dilation(mask,iterations=grow)); out=[]
    for i,sl in enumerate(ndi.find_objects(lab),1):
        area=int(((lab[sl]==i)&mask[sl]).sum())
        if area>=min_area: out.append((sl[1].start,sl[0].start,sl[1].stop,sl[0].stop,area))
    return out
def tight(col,a,box,pad=4,maxw=None,maxh=None):
    H,W=a.shape; x0,y0,x1,y1=box[:4]; x0=max(0,x0-pad);y0=max(0,y0-pad);x1=min(W,x1+pad);y1=min(H,y1+pad)
    sub_a=a[y0:y1,x0:x1]; ys,xs=np.where(sub_a>0.01); x0+=xs.min(); x1=x0-xs.min()+xs.max()+1; y0+=ys.min(); y1=y0-ys.min()+ys.max()+1
    rgba=(np.dstack([col[y0:y1,x0:x1],a[y0:y1,x0:x1]])*255).astype(np.uint8); im=Image.fromarray(rgba,"RGBA")
    s=min(1,(maxw or 1e9)/im.width,(maxh or 1e9)/im.height)
    if s<1: im=im.resize((round(im.width*s),round(im.height*s)),Image.LANCZOS)
    return im,(x0,y0,x1,y1)

# --- background (opaque)
bg=Image.open(P("background")).convert("RGB").resize((1600,900),Image.LANCZOS)
fn="dark-background.webp"; bg.save(os.path.join(OUT,fn),"WEBP",quality=80,method=6); manifest["assets"]["dark-background"]={"file":fn,"w":1600,"h":900}

# --- foliage: left / right / top, keeping their position in the 1672x941 frame
rgb=load("foliage-sheet"); H,W=rgb.shape[:2]; col,a=key_white(rgb, np.array([0.996,0.996,0.996]))
mask=a>0.05; lab,nlab=ndi.label(ndi.binary_dilation(mask,iterations=30))
objs=ndi.find_objects(lab); info=[]
for i,sl in enumerate(objs,1):
    area=int(((lab[sl]==i)&mask[sl]).sum())
    if area>=4000: info.append((i,(sl[1].start,sl[0].start,sl[1].stop,sl[0].stop,area)))
info=sorted(info,key=lambda t:-t[1][4])[:3]
print("foliage comps:",[t[1] for t in info])
for i,c in info:
    cx=(c[0]+c[2])/2; cy=(c[1]+c[3])/2
    name="foliage-left" if cx<W*0.33 and cy>H*0.3 else "foliage-right" if cx>W*0.66 and cy>H*0.3 else "foliage-top"
    own=ndi.binary_dilation(lab==i,iterations=4)            # keep only pixels that belong to THIS cluster (no duplicated fragments)
    im,box=tight(col,a*own,c,maxh=900); save(name,im,fx=box[0]/W,fy=box[1]/H,fw=(box[2]-box[0])/W,fh=(box[3]-box[1])/H)

# --- beast: lurk (left) and lunge (right)
rgb=load("beast-sheet"); H,W=rgb.shape[:2]; col,a=key_white(rgb)
cs=sorted(comps(a,grow=30,min_area=20000),key=lambda c:c[0]); print("beast comps:",[(c[0],c[1],c[2],c[3]) for c in cs]); assert len(cs)==2
for name,c in zip(["beast-lurk","beast-lunge"],cs):
    im,box=tight(col,a,c,maxh=900); save(name,im,sx=box[0],sy=box[1],sw=box[2]-box[0],sh=box[3]-box[1])

# --- eyes (screen blend source: black bg)
rgb=load("eyes"); col,a=key_black(rgb,0.04); ec=comps(a,grow=40,min_area=3000); c=(min(k[0] for k in ec),min(k[1] for k in ec),max(k[2] for k in ec),max(k[3] for k in ec),0)
im,box=tight(col,a,c,maxw=1400)
m=rgb.max(2); amber=(rgb[...,0]>0.55)&(rgb[...,1]>0.25)&(rgb[...,2]<0.35)&(m>0.5); lab,n=ndi.label(ndi.binary_dilation(amber,iterations=25))
cents=sorted([ndi.center_of_mass(amber,lab,i) for i in range(1,n+1) if (lab==i).sum()>800],key=lambda p:p[1])
(ly,lx),(ry,rx)=cents[0],cents[-1]; cw=box[2]-box[0]; chh=box[3]-box[1]
save("beast-eyes",im,spacing=round((rx-lx)/cw,4),cx=round(((lx+rx)/2-box[0])/cw,4),cy=round(((ly+ry)/2-box[1])/chh,4))

# --- blood sheet (green key)
img=Image.open(P("blood-sheet")).convert("RGB"); rgb=np.asarray(img).astype(np.float32)/255; col,a=key_green(rgb)
cs=comps(a,thr=0.1,grow=6,min_area=40); H,W=a.shape
splash=max(cs,key=lambda c:c[4]); cs2=[c for c in cs if c is not splash]
drips=sorted([c for c in cs2 if (c[3]-c[1])>3*(c[2]-c[0]) and (c[3]-c[1])>120],key=lambda c:c[0])
scatter=[c for c in cs2 if c not in drips and c[3]<H*0.5 and c[0]>W*0.4]
im,_=tight(col,a,splash,maxw=700); save("blood-splash",im)
if scatter:
    box=[min(c[0] for c in scatter),min(c[1] for c in scatter),max(c[2] for c in scatter),max(c[3] for c in scatter),0]; im,_=tight(col,a,box,maxw=700); save("blood-droplets",im)
    big=max(scatter,key=lambda c:c[4]); im,_=tight(col,a,big,pad=2,maxw=90); save("blood-drop",im)
for i,c in enumerate(drips[:4],1):
    im,_=tight(col,a,c,pad=2,maxh=520); save(f"blood-drip-{i}",im)
print("blood: splash",splash[:4],"scatter",len(scatter),"drips",len(drips))

# --- title (green key) + baseline and letter positions for the extra drips
rgb=load("title"); col,a=key_green(rgb); c=max(comps(a,thr=0.1,grow=30,min_area=8000),key=lambda c:c[4])
im,box=tight(col,a,c,maxw=1600); s=im.width/(box[2]-box[0])
arr=np.asarray(im).astype(float)/255; al=arr[...,3]; sat=arr[...,:3].max(2)-arr[...,:3].min(2)
metal=(al>0.5)&(sat<0.22); rows=np.where(metal.sum(1)>im.width*0.02)[0]; base=(rows.max()+1)/im.height
SRC_CENTERS=[215,380,557,735,910,1090,1262,1412,1575]          # E N C O U N T E R centers in the 1774px source image
letters=[round((cx-box[0])/(box[2]-box[0]),4) for cx in SRC_CENTERS]
print("title base",round(base,3),"letters",letters)
save("encounter-dark",im,base=round(base,4),letters=letters)

# --- procedural fog layers (seamless horizontally)
rng=np.random.default_rng(7)
def fog(h,w,sig,seed,contrast):
    rng=np.random.default_rng(seed); n=rng.normal(size=(h,w)).astype(np.float32)
    f=ndi.gaussian_filter(n,sig,mode="wrap"); f=(f-f.mean())/f.std(); f=np.clip((f*contrast+0.5),0,1)
    yy=np.linspace(0,1,h)[:,None]; env=np.sin(np.pi*yy)**1.4
    return (f*env)
for nm,h,sig,seed,ct in [("fog-back",360,(34,110),11,.42),("fog-front",360,(26,150),23,.5)]:
    f=fog(h,2048,sig,seed,ct); a8=(f*210).astype(np.uint8)
    rgba=np.dstack([np.full((h,2048,3),(172,186,206),np.uint8),a8]); save(nm,Image.fromarray(rgba,"RGBA"),lossy_q=80)

json.dump(manifest,open(os.path.join(OUT,"pack.json"),"w"),indent=2,default=lambda o:o.item() if hasattr(o,"item") else str(o))
tot=0
for k,v in manifest["assets"].items():
    sz=os.path.getsize(os.path.join(OUT,v["file"])); tot+=sz; print(f"{k:16s} {v['w']:5d}x{v['h']:<5d} {sz/1024:7.1f} KB",{kk:vv for kk,vv in v.items() if kk not in("file","w","h","letters")})
print("TOTAL KB",round(tot/1024))
