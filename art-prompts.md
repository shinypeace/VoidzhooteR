# Графические ассеты

Созданы встроенным инструментом imagegen. Исходные PNG скопированы в проект, CLI/API-генерация не использовалась.

- `assets/voidstorm-atlas.png`: 5 × 5 ячеек — корабли игрока, противники, босс, модули.
- `assets/ui-atlas.png`: исходные четыре рамки кнопок.
- `assets/button-cyan.png`, `assets/button-violet.png`, `assets/button-gold.png`, `assets/button-steel.png`: ячейки, выделенные из UI-атласа без перерисовки. Используются как nine-slice текстуры; надписи остаются текстом интерфейса.

## Промпт атласа кораблей

Use case: stylized-concept
Asset type: production sprite atlas for VOIDSTORM, a neon science-fiction top-down vertical arcade shooter.
Create ONE perfectly regular 5-column by 5-row sprite sheet, 1536 by 1536 pixels, actual transparent background. Each of the 25 equal square cells contains ONE centered separate sprite with generous transparent padding, entirely inside its cell. No labels, letters, text, borders, grid, background, stars or floor. Consistent high quality hand-painted 3D game asset rendering, exact orthographic TOP VIEW, bilateral symmetry, hard metallic armor plates with readable highlights, dark gunmetal bodies and restrained luminous neon accents. Crisp silhouettes readable at 50-90 px. All ships point UP; no perspective and no side views. Ship body fills 65-75% cell, no long exhaust trails. 
Rows 1-2 are ten progressively more advanced player spacecraft with cool cyan and blue cockpit lights:
row1 left-right: slim cyan arrow interceptor; broader green twin-engine armored interceptor; purple swept-wing fighter; red long railgun-nose fighter; amber broad four-gun fighter.
row2 left-right: teal organic crescent fighter; golden elite angular heavy fighter; icy blue triple-engine battleship; violet advanced multi-wing dreadnought; pearlescent cyan apex flagship with six wing gun pods.
Rows 3-4 are ten hostile sprites using distinct dark steel armor and hot red/orange/magenta lights:
row3: small red delta drone; yellow slender scout; orange twin-gun fighter; magenta hooked-wing hunter; red broad armored tank.
row4: lime long-nose sniper; white/red elite gunship; orange wide bomber; violet shield-bearing frigate; giant red multi-wing boss battleship, centered in its one cell.
Row5 five collectible module icons (not ships): green repair cross in hexagonal metal capsule; purple lightning overdrive capsule; cyan three projectile multishot capsule; blue shield capsule; gold credit crystal capsule.
Uniform spacing and cell center alignment is critical for use with canvas drawImage. Actual transparent alpha outside every object, no shadows outside cells. Cohesive polished indie space-shooter aesthetic.

## Промпт рамок кнопок

Use case: stylized-concept
Asset type: ONE production UI texture atlas for VOIDSTORM premium arcade space shooter.
Create a square 1536x1536 transparent PNG arranged as exactly FOUR horizontal strips stacked vertically, each 1536 wide and 384 high. Each strip contains ONE identical-proportioned wide rectangular blank game button frame centered inside its strip. The frame extends from x=24 to1512 and from y=70 to314 within its strip, with clean transparent margins. These are finished 2D UI assets, front view, no perspective.
Row1: steel graphite button frame with cyan luminous accent edges.
Row2: same frame with violet luminous accent edges.
Row3: same frame with restrained amber-gold accent edges.
Row4: same frame with subdued ice-blue steel accent edges.
Style: refined sci-fi military flight console, beveled graphite titanium, clean hard edges, angular clipped corners, subtle machined rim details, very fine brushed metal texture, thin inner etched line, precise narrow emissive strips only at far left and right corners. Deep dark navy recessed center intentionally empty for readable white text. Attractive controlled light reflections across the metal rim. Premium polished arcade game UI similar to a bespoke spacecraft dashboard, tasteful restrained neon, dark center should remain flat and uncluttered.
All four buttons have EXACT SAME bounds and shapes and transparent background outside frame. No text, no letters, no numbers, no icons, no symbols, no glyphs, no logos, no watermark, no grids, no decorative objects. Do not draw any surrounding panel. Transparent alpha outside the four frames. Each frame fully isolated with at least 40 transparent pixels vertically around it.
