"""Generate the 1200x630 social cards in assets/ (original art only: arena backgrounds + text, no Pokémon artwork).
Run: python3 scripts/make-og-images.py   (needs Pillow and the DejaVu fonts)"""
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import math, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLD=(255,201,74); GOLD_D=(216,154,31); FOREST_D=(27,67,50); MINT=(116,198,157); PARCH=(253,246,227)
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"; REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
CARDS = {
  "og-image": ("indigo",  "TRAINER DESK",     ["Pokémon GO events & Community Day", "TCG card prices & digital binder", "Pokédex  ·  Pixel Arena mini-game"], "trainerdesk.net"),
  "og-go":    ("forest",  "GO EVENTS",        ["Live Pokémon GO event countdowns", "Community Day: featured Pokémon & bonuses", "Times shown in your timezone"], "trainerdesk.net/go"),
  "og-tcg":   ("volcano", "TCG CARD PRICES",  ["Browse every Pokémon TCG set", "TCGplayer & Cardmarket market prices", "Build a free digital binder"], "trainerdesk.net/tcg"),
  "og-pokedex": ("glacier", "POKÉDEX",        ["Every Pokémon, all generations", "Types, base stats & abilities", "Search by name or number"], "trainerdesk.net/pokedex"),
  "og-arena": ("indigo",  "PIXEL ARENA",      ["Free pixel battle royale mini-game", "Pick a fighter, outlast 11 rivals", "Type matchups decide the fight"], "trainerdesk.net/arena"),
}
def star(d,cx,cy,r,fill):
    d.polygon([(cx+math.cos(-math.pi/2+i*math.pi/4)*(r if i%2==0 else r*0.30), cy+math.sin(-math.pi/2+i*math.pi/4)*(r if i%2==0 else r*0.30)) for i in range(8)], fill=fill)
def pixel_text(text, max_w):
    for scale in (4,3):
        f=ImageFont.truetype(BOLD,22); box=f.getbbox(text); t=Image.new("RGBA",(box[2]+4,box[3]+4),(0,0,0,0))
        ImageDraw.Draw(t).text((2,0),text,font=f,fill=GOLD); t=t.resize((t.width*scale,t.height*scale),Image.NEAREST)
        if t.width<=max_w: return t
    return t
def card(name, bgname, title, lines, foot):
    W,H=1200,630
    bg=Image.open(os.path.join(ROOT,"assets/arena",bgname+".webp")).convert("RGB").resize((W,W),Image.LANCZOS).crop((0,(W-H)//2,W,(W-H)//2+H))
    img=ImageEnhance.Brightness(bg).enhance(0.45); d=ImageDraw.Draw(img)
    d.rectangle([0,0,W-1,H-1],outline=GOLD_D,width=14); d.rectangle([22,22,W-23,H-23],outline=FOREST_D,width=6)
    panel=Image.new("RGBA",(W,H),(0,0,0,0)); ImageDraw.Draw(panel).rounded_rectangle([60,70,W-60,H-70],radius=18,fill=(20,45,33,215)); img.paste(panel,(0,0),panel)
    d=ImageDraw.Draw(img); d.ellipse([100,112,196,208],fill=GOLD,outline=PARCH,width=6); star(d,148,160,34,FOREST_D)
    t=pixel_text(title, W-60-222-40); img.paste(t,(222,160-t.height//2),t)
    f=ImageFont.truetype(REG,40); fs=ImageFont.truetype(REG,30); y=262
    for ln in lines:
        d.rectangle([108,y+14,122,y+28],fill=MINT); d.text((140,y),ln,font=f,fill=PARCH); y+=64
    d.text((108,H-140),foot+"  ·  free, unofficial fan site",font=fs,fill=(200,220,205))
    img.save(os.path.join(ROOT,"assets",name+".jpg"),quality=86,optimize=True,progressive=True)
for k,v in CARDS.items(): card(k,*v); print("wrote assets/%s.jpg" % k)
