# Encounter FX

Foundry VTT **V14** + **dnd5e** — ปุ่มเริ่ม Encounter แบบ Immersive: ย้ายซีน, ไฟเผาจอ, แบนเนอร์ ENCOUNTER, d20 3D ทอย Initiative เชื่อมกับ Combat ของ dnd5e

## ติดตั้ง

1. Foundry → **Add-on Modules** → **Install Module**
2. วาง Manifest URL ช่อง *Manifest URL* ด้านล่างสุด แล้วกด Install

```
https://github.com/YOUR_USERNAME/encounter-fx/releases/latest/download/module.json
```

3. เปิดใช้ในเวิลด์ แล้วกดปุ่มไฟ (Encounter FX) ในแถบ Token Controls (GM เท่านั้น)

## ออกเวอร์ชันใหม่ (สำหรับผู้พัฒนา)

1. Commit / push โค้ดขึ้น `main`
2. GitHub → **Releases** → **Draft a new release** → ตั้ง tag เช่น `v0.1.0` → **Publish release**
3. GitHub Actions จะอัปเดต `version`, `manifest`, `download` ใน `module.json` และแนบ `module.json` + `module.zip` ให้เองอัตโนมัติ

> Manifest URL แบบ `latest/download/module.json` จะชี้ไปที่ Release ล่าสุดเสมอ ทำให้ Foundry เช็คอัปเดตได้
