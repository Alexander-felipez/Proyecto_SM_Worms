# Bolivia Tactics 2D

Juego 2D táctico por turnos inspirado en Worms, ambientado en distintos biomas de Bolivia con una dirección artística cinematográfica y moderna.

## Stack Tecnológico

- **Frontend:** Phaser 3, Matter.js (Físicas), HTML5 Canvas, JS ES6 Modules.
- **Herramientas:** Vite (Bundler), npm.

## Empezando

1. `npm install`
2. `npm run dev` (Inicia servidor de desarrollo con Vite)
3. `npm run build` (Crea build de producción)

## Estructura de Directorios

- `src/scenes/` - Lógica de escenas (Menú principal, Juego, Preload, UI).
- `src/entities/` - Clases de personajes, armas y proyectiles.
- `src/systems/` - Lógicas genéricas separadas (Físicas, Manejador de turnos, Sistemas de partículas).
- `src/config/` - Definiciones de biomas, constantes, configuración de físicas.
- `src/utils/` - Utilidades y helpers matemáticos/visuales.
- `src/assets/` - Imágenes y recursos de audio.

## Características Base (Prototipo Actual)

- **Físicas con Matter.js:** El jugador es un objeto con físicas, puede saltar y sufrir fuerzas.
- **Armas y Explosiones:** Haces click e invocas un proyectil; al colisionar genera una explosión con _Camera Shake_, onda expansiva física y _flash_ visual.
- **Terreno Prototipo:** El bioma base (GameScene) simula temporalmente "Santa Cruz Tropical" utilizando físicas de Matter.js puras y colores cálidos.

## Próximos Pasos (Hoja de Ruta)

- Implementar deformación de terreno real con Canvas/RenderTexture (máscaras de colisión para destrucción voxel/polígonos de Matter).
- Configurar estados completos de Turnos e IAs básicas usando `systems/TurnManager.js`.
- Integrar assets generados y optimizados de los 4 biomas:
  1. *Santa Cruz Tropical*
  2. *La Paz Altura Extrema*
  3. *Luna / Espacio*
  4. *Salar de Uyuni Futurista*
