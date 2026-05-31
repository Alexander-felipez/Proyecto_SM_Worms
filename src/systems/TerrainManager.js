import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';
import { getMapConfig } from '../config/MapConfig';

/**
 * TerrainManager
 * Genera terreno destructible usando configuraciones de MapConfig.js.
 * Cada mapa define su propia curva de terreno, colores y decoraciones.
 *
 * Para SANTA_CRUZ incluye:
 *  - Fondo de atardecer con paralaje
 *  - Terreno en forma de cañón (acantilados laterales + meseta central)
 *  - Cueva de los Tayos (elipse hueca transitable)
 *  - Puentes de madera colgantes destructibles
 *  - Decoraciones programáticas: cartel, torre de radio, bandera, cabaña, grúa, bote
 *
 * Usa dimensiones fijas del mapa (GAME_CONFIG.MAP) para evitar problemas
 * con ventanas de diferentes tamaños.
 */
export class TerrainManager {
    constructor(scene) {
        this.scene = scene;
        this.blockSize = 16;
        this.terrainBlocks = [];

        // Dimensiones fijas del mapa
        this.width  = GAME_CONFIG.MAP.DEFAULT_WIDTH;
        this.height = GAME_CONFIG.MAP.DEFAULT_HEIGHT;

        // Detectar mapa desde la sala
        const mapKey = (scene.room && scene.room.map) || 'el_alto';
        this.mapConfig = getMapConfig(mapKey);

        // Coordenadas de la isla
        this.islandStartX = 150;
        this.islandEndX   = this.width - 150;
        this.waterLevel   = this.height - 80;

        // Función de terreno para spawn (se asigna en createTerrain)
        this.getIslandY = null;

        // Áreas sólidas de decoraciones (para físicas)
        this.solidAreas = [];

        // Datos de la cueva (para exclusión en isPointSolid)
        this.caveData = null;

        // Pincel de borrado — se crea en createTerrain
        this.eraserShape = null;
    }

    createTerrain() {
        const cfg = this.mapConfig;

        // ══════════════════════════════════════════════════════════
        //  0. FONDO DE ATARDECER CON PARALAJE (solo SANTA_CRUZ)
        // ══════════════════════════════════════════════════════════
        if (cfg.biome === 'SANTA_CRUZ') {
            this._drawSantaCruzBackground();
        }

        // ══════════════════════════════════════════════════════════
        //  1. CAPA VISUAL (RenderTexture)
        // ══════════════════════════════════════════════════════════
        this.rt = this.scene.add.renderTexture(0, 0, this.width, this.height).setOrigin(0, 0);

        // ─── A) FUNCIÓN DE ALTURA ───
        const islandWidth = this.islandEndX - this.islandStartX;
        this.getIslandY = (x) => {
            const normalizedX = (x - this.islandStartX) / islandWidth;
            return cfg.getHeight(normalizedX, x, this.waterLevel);
        };

        // ─── B) CUERPO DEL TERRENO (Texturizado o Procedimental) ───
        const hasDirtTex = cfg.biome === 'SANTA_CRUZ' && this.scene.textures.exists('terrain_dirt');

        if (hasDirtTex) {
            // ── SANTA_CRUZ: Estampar textura de tierra y enmascarar el área no-terreno ──
            this._buildTexturedTerrain(cfg);
        } else {
            // ── Otros mapas / fallback: relleno sólido procedimental ──
            const terrainGfx = this.scene.make.graphics({ add: false });
            terrainGfx.fillStyle(cfg.terrainColor, 1);
            terrainGfx.beginPath();
            terrainGfx.moveTo(this.islandStartX, this.height);
            terrainGfx.lineTo(this.islandStartX - 20, this.waterLevel);
            for (let x = this.islandStartX; x <= this.islandEndX; x += 8) {
                terrainGfx.lineTo(x, this.getIslandY(x));
            }
            terrainGfx.lineTo(this.islandEndX + 20, this.waterLevel);
            terrainGfx.lineTo(this.islandEndX + 50, this.height);
            terrainGfx.closePath();
            terrainGfx.fillPath();

            const crustWidth = 6;
            terrainGfx.lineStyle(crustWidth, cfg.crustColor, 1);
            terrainGfx.beginPath();
            for (let x = this.islandStartX; x <= this.islandEndX; x += 8) {
                const y = this.getIslandY(x);
                x === this.islandStartX ? terrainGfx.moveTo(x, y) : terrainGfx.lineTo(x, y);
            }
            terrainGfx.strokePath();
            this.rt.draw(terrainGfx, 0, 0);
            terrainGfx.destroy();
        }

        // ─── C) DECORACIONES PROGRAMÁTICAS ───
        const decorGfx = this.scene.make.graphics({ add: false });
        this.drawDecorations(decorGfx);

        // ─── D) PUENTES COLGANTES ───
        if (cfg.bridges && cfg.bridges.length > 0) {
            this._drawBridges(decorGfx, cfg.bridges);
        }

        // Estampar decoraciones en la RenderTexture
        this.rt.draw(decorGfx, 0, 0);
        decorGfx.destroy();

        // ─── G) EXCAVAR LA CUEVA (antes de buildPhysicsGrid) ───
        if (cfg.cave) {
            this.caveData = cfg.cave;
            this._eraseCave(cfg.cave);
        }

        // ─── H) AGUA ───
        if (cfg.hasWater) {
            // Capa base del agua
            const waterRect = this.scene.add.rectangle(
                this.width / 2, this.height - 40,
                this.width, 80,
                cfg.waterColor, 0.85
            );
            waterRect.setDepth(5);

            if (cfg.biome === 'SANTA_CRUZ') {
                // Brillo del atardecer reflejado en el agua
                const waterShine = this.scene.add.rectangle(
                    this.width / 2, this.height - 60,
                    this.width, 20,
                    0xff8c00, 0.18
                );
                waterShine.setDepth(6);
            }
        }

        // ══════════════════════════════════════════════════════════
        //  2. CAPA FÍSICA (Grid de bloques Matter.js)
        // ══════════════════════════════════════════════════════════
        this.buildPhysicsGrid();

        // 3. Pincel de borrado
        this.eraserShape = this.scene.make.graphics({ add: false });
        this.eraserShape.fillStyle(0xffffff);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TERRENO TEXTURIZADO — SANTA CRUZ
    // ═══════════════════════════════════════════════════════════════

    /**
     * Estampa terrain_dirt en tiles 128×128 sobre toda el área del mapa,
     * luego borra con una máscara todo lo que quede FUERA/ENCIMA del terreno.
     * Añade la tira de pasto encima de la superficie.
     */
    _buildTexturedTerrain(cfg) {
        const TILE = 128;

        // 1. Crear imagen temporal reutilizable para estampar tiles
        const stamp = this.scene.make.image({ key: 'terrain_dirt', add: false });
        stamp.setDisplaySize(TILE, TILE);

        // 2. Estampar dirt cubriendo TODA la superficie del mapa
        for (let tx = 0; tx <= this.width; tx += TILE) {
            for (let ty = 0; ty <= this.height; ty += TILE) {
                stamp.setPosition(tx + TILE / 2, ty + TILE / 2);
                this.rt.draw(stamp);
            }
        }
        stamp.destroy();

        // 3. Crear la máscara «cielo»: el polígono que cubre todo lo que NO es terreno.
        //    Al borrarlo del RT, solo queda el terreno con su textura.
        const skyMask = this.scene.make.graphics({ add: false });
        skyMask.fillStyle(0xffffff, 1);
        skyMask.beginPath();
        skyMask.moveTo(0, 0);
        skyMask.lineTo(this.width, 0);
        skyMask.lineTo(this.width, this.height);
        skyMask.lineTo(this.islandEndX + 50, this.height);
        skyMask.lineTo(this.islandEndX + 20, this.waterLevel);
        // Trazar superficie en sentido inverso (de derecha a izquierda)
        for (let x = this.islandEndX; x >= this.islandStartX; x -= 8) {
            skyMask.lineTo(x, this.getIslandY(x));
        }
        skyMask.lineTo(this.islandStartX - 20, this.waterLevel);
        skyMask.lineTo(this.islandStartX, this.height);
        skyMask.lineTo(0, this.height);
        skyMask.closePath();
        skyMask.fillPath();
        this.rt.erase(skyMask, 0, 0);
        skyMask.destroy();

        // 4. Tira de pasto: terrain_grass o fallback procedimental
        if (this.scene.textures.exists('terrain_grass')) {
            const GRASS_W = 256;
            const grassStamp = this.scene.make.image({ key: 'terrain_grass', add: false });
            grassStamp.setDisplaySize(GRASS_W, 32);
            for (let gx = this.islandStartX; gx <= this.islandEndX; gx += GRASS_W) {
                // Centrar en el punto medio del tile, justo encima de la superficie
                const midX = gx + GRASS_W / 2;
                const surfY = this.getIslandY(Math.min(midX, this.islandEndX));
                grassStamp.setPosition(midX, surfY - 8);
                this.rt.draw(grassStamp);
            }
            grassStamp.destroy();
        } else {
            // Fallback: línea verde procedimental
            const grassGfx = this.scene.make.graphics({ add: false });
            grassGfx.lineStyle(10, cfg.crustColor, 1);
            grassGfx.beginPath();
            for (let x = this.islandStartX; x <= this.islandEndX; x += 8) {
                const y = this.getIslandY(x);
                x === this.islandStartX ? grassGfx.moveTo(x, y) : grassGfx.lineTo(x, y);
            }
            grassGfx.strokePath();
            this.rt.draw(grassGfx, 0, 0);
            grassGfx.destroy();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  FONDO PARALAJE — SANTA CRUZ ATARDECER
    // ═══════════════════════════════════════════════════════════════

    _drawSantaCruzBackground() {
        const W = this.width;
        const H = this.height;

        // ── PRIORIDAD 1: Imagen de fondo generada con IA ──
        if (this.scene.textures.exists('sky_sunset')) {
            const bg = this.scene.add.image(W / 2, H / 2, 'sky_sunset');
            bg.setDisplaySize(W, H);
            bg.setScrollFactor(0.12);
            bg.setDepth(-10);

            // Capa de tinte oscuro encima para asegurar contraste con el terreno
            const tintOverlay = this.scene.add.rectangle(W / 2, H * 0.3, W, H * 0.6, 0x000000, 0.18);
            tintOverlay.setScrollFactor(0.12);
            tintOverlay.setDepth(-9);
        } else {
            // ── FALLBACK: Gradiente de cielo procedimental ──
            const skyLayers = [
                { y: 0,          h: H * 0.12, color: 0x0d0500, alpha: 1.0  },
                { y: H * 0.10,  h: H * 0.15, color: 0x3d1200, alpha: 0.9  },
                { y: H * 0.22,  h: H * 0.15, color: 0x7a2800, alpha: 0.85 },
                { y: H * 0.34,  h: H * 0.18, color: 0xc04000, alpha: 0.8  },
                { y: H * 0.48,  h: H * 0.18, color: 0xe06010, alpha: 0.75 },
                { y: H * 0.62,  h: H * 0.20, color: 0xf08020, alpha: 0.7  },
                { y: H * 0.78,  h: H * 0.22, color: 0xd06030, alpha: 0.6  },
            ];
            skyLayers.forEach(({ y, h, color, alpha }) => {
                const bg = this.scene.add.rectangle(W / 2, y + h / 2, W, h, color, alpha);
                bg.setDepth(-10);
                bg.setScrollFactor(0.12);
            });

            // Sol procedimental
            const sunX = W * 0.62, sunY = H * 0.50;
            const sunGfx = this.scene.add.graphics();
            sunGfx.setDepth(-9).setScrollFactor(0.12);
            sunGfx.fillStyle(0xff6600, 0.15); sunGfx.fillCircle(sunX, sunY, 130);
            sunGfx.fillStyle(0xff8800, 0.25); sunGfx.fillCircle(sunX, sunY, 90);
            sunGfx.fillStyle(0xffaa00, 0.45); sunGfx.fillCircle(sunX, sunY, 60);
            sunGfx.fillStyle(0xffdd44, 1);    sunGfx.fillCircle(sunX, sunY, 36);
            sunGfx.fillStyle(0xffffa0, 0.7);  sunGfx.fillCircle(sunX, sunY - 8, 18);
        }

        // ── Siluetas del horizonte (siempre programmáticas: edificios, Cristo, Uorubó) ──
        const horizonY = H * 0.52;
        const buildingData = [
            { bx: 200,  bw: 35,  bh: 80,  wx: 8,  wh: 10 },
            { bx: 260,  bw: 25,  bh: 55 },
            { bx: 320,  bw: 40,  bh: 100, wx: 10, wh: 12 },
            { bx: 395,  bw: 20,  bh: 60 },
            { bx: 450,  bw: 50,  bh: 85,  wx: 12, wh: 14 },
            { bx: 540,  bw: 28,  bh: 70 },
            { bx: 1000, bw: 45,  bh: 95,  wx: 10, wh: 12 },
            { bx: 1130, bw: 55,  bh: 115, wx: 14, wh: 16 },
            { bx: 1260, bw: 38,  bh: 80 },
            { bx: 2400, bw: 42,  bh: 90,  wx: 10, wh: 12 },
            { bx: 2520, bw: 50,  bh: 105, wx: 12, wh: 14 },
            { bx: 2650, bw: 35,  bh: 75 },
        ];
        const silGfx = this.scene.add.graphics();
        silGfx.setDepth(-8).setScrollFactor(0.22);
        buildingData.forEach(b => {
            silGfx.fillStyle(0x1a0800, 0.75);
            silGfx.fillRect(b.bx, horizonY - b.bh, b.bw, b.bh);
            if (b.wx) {
                silGfx.fillStyle(0xffcc44, 0.55);
                for (let row = 0; row < 3; row++) {
                    for (let col = 0; col < 2; col++) {
                        if (Math.random() > 0.35) {
                            silGfx.fillRect(b.bx + 4 + col * (b.wx + 4), horizonY - b.bh + 8 + row * (b.wh + 5), b.wx, b.wh);
                        }
                    }
                }
            }
            if (b.bh > 80) {
                silGfx.fillStyle(0x1a0800, 0.8);
                silGfx.fillRect(b.bx + b.bw / 2 - 1, horizonY - b.bh - 20, 2, 20);
                silGfx.fillStyle(0xff3300, 0.9);
                silGfx.fillCircle(b.bx + b.bw / 2, horizonY - b.bh - 22, 2.5);
            }
        });

        // Cristo Redentor
        const cristoX = W * 0.78, cristoY = horizonY - 40;
        const crisGfx = this.scene.add.graphics();
        crisGfx.setDepth(-7).setScrollFactor(0.18);
        crisGfx.fillStyle(0x1a0600, 0.6);
        crisGfx.fillRect(cristoX - 8, cristoY, 16, 35);
        crisGfx.fillRect(cristoX - 6, cristoY - 50, 12, 50);
        crisGfx.fillCircle(cristoX, cristoY - 58, 8);
        crisGfx.fillRect(cristoX - 38, cristoY - 38, 76, 6);

        // Puente Uorubó
        const puenteY = horizonY + 10;
        const puenteGfx = this.scene.add.graphics();
        puenteGfx.setDepth(-7).setScrollFactor(0.20);
        puenteGfx.fillStyle(0x1a0800, 0.5);
        puenteGfx.fillRect(W * 0.25 - 5, puenteY - 70, 10, 70);
        puenteGfx.fillRect(W * 0.35 - 5, puenteY - 70, 10, 70);
        puenteGfx.fillRect(W * 0.23, puenteY - 4, W * 0.14, 4);
        puenteGfx.lineStyle(1.5, 0x1a0800, 0.45);
        puenteGfx.lineBetween(W * 0.25, puenteY - 70, W * 0.23, puenteY - 4);
        puenteGfx.lineBetween(W * 0.25, puenteY - 70, W * 0.37, puenteY - 4);
        puenteGfx.lineBetween(W * 0.35, puenteY - 70, W * 0.23, puenteY - 4);
        puenteGfx.lineBetween(W * 0.35, puenteY - 70, W * 0.37, puenteY - 4);

        // Estrellas
        const starGfx = this.scene.add.graphics();
        starGfx.setDepth(-9).setScrollFactor(0.05);
        [[120,60],[340,45],[580,80],[800,35],[1050,55],[1300,40],[1600,30],[1900,50],[2200,42],[2600,65],[2900,38],[3050,55]]
            .forEach(([sx, sy]) => {
                starGfx.fillStyle(0xfff0cc, 0.3 + Math.random() * 0.5);
                starGfx.fillCircle(sx, sy, 1 + Math.random() * 1.2);
            });

        // Nubes de atardecer
        const cloudGfx = this.scene.add.graphics();
        cloudGfx.setDepth(-8).setScrollFactor(0.30);
        [{cx:400,cy:160,r:40,a:0.20,c:0xff7722},{cx:950,cy:130,r:35,a:0.22,c:0xff8833},
         {cx:1800,cy:145,r:45,a:0.20,c:0xff7722},{cx:2700,cy:160,r:52,a:0.21,c:0xff8833}]
            .forEach(({cx,cy,r,a,c}) => {
                cloudGfx.fillStyle(c, a);
                cloudGfx.fillEllipse(cx, cy, r * 2.5, r);
                cloudGfx.fillEllipse(cx - r * 0.4, cy + r * 0.3, r * 1.5, r * 0.7);
            });

        // Reflejo del sol en el agua
        const reflectGfx = this.scene.add.graphics();
        reflectGfx.setDepth(4).setScrollFactor(0.12);
        reflectGfx.fillStyle(0xff8800, 0.30);
        reflectGfx.fillRect(W * 0.62 - 30, this.waterLevel - 10, 60, 20);
        reflectGfx.fillStyle(0xffaa00, 0.15);
        reflectGfx.fillRect(W * 0.62 - 90, this.waterLevel - 7, 180, 14);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CUEVA — EXCAVAR
    // ═══════════════════════════════════════════════════════════════

    _eraseCave(cave) {
        // Crear gráfico de la elipse de la cueva para borrar de la RenderTexture
        const caveGfx = this.scene.make.graphics({ add: false });
        caveGfx.fillStyle(0xffffff, 1);
        caveGfx.fillEllipse(cave.cx, cave.cy, cave.rx * 2, cave.ry * 2);

        // Borde interior de la cueva (piedra oscura)
        const caveBorderGfx = this.scene.make.graphics({ add: false });
        caveBorderGfx.lineStyle(6, 0x3a2510, 1);
        caveBorderGfx.strokeEllipse(cave.cx, cave.cy, cave.rx * 2, cave.ry * 2);

        this.rt.erase(caveGfx, 0, 0);
        this.rt.draw(caveBorderGfx, 0, 0);

        // Añadir letrero de la cueva
        this._drawCaveSign(cave);

        caveGfx.destroy();
        caveBorderGfx.destroy();
    }

    _drawCaveSign(cave) {
        // Letrero "Cueva de los Tayos" encima de la entrada
        const signGfx = this.scene.make.graphics({ add: false });
        const sx = cave.cx - 80;
        const sy = cave.cy - cave.ry - 30;

        signGfx.fillStyle(0x4a2800, 1);
        signGfx.fillRect(sx, sy, 160, 22);
        signGfx.lineStyle(2, 0x8b5a2b, 1);
        signGfx.strokeRect(sx, sy, 160, 22);

        this.rt.draw(signGfx, 0, 0);
        signGfx.destroy();

        // Texto del letrero
        const signText = this.scene.add.text(cave.cx, cave.cy - cave.ry - 19, '🦅 Cueva de los Tayos', {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#f0c060',
            stroke: '#2a1400',
            strokeThickness: 2,
        }).setOrigin(0.5, 0.5).setDepth(2);

        // Postes del letrero
        const postGfx = this.scene.make.graphics({ add: false });
        postGfx.fillStyle(0x5a3010, 1);
        postGfx.fillRect(cave.cx - 75, cave.cy - cave.ry - 8, 5, 8);
        postGfx.fillRect(cave.cx + 70, cave.cy - cave.ry - 8, 5, 8);
        this.rt.draw(postGfx, 0, 0);
        postGfx.destroy();
    }

    // ═══════════════════════════════════════════════════════════════
    //  PUENTES COLGANTES
    // ═══════════════════════════════════════════════════════════════

    _drawBridges(gfx, bridges) {
        bridges.forEach(bridge => {
            this._drawSingleBridge(gfx, bridge);
        });
    }

    _drawSingleBridge(gfx, bridge) {
        const { x1, y1, x2, y2, planks } = bridge;
        const bridgeLen = x2 - x1;
        const plankW    = Math.floor(bridgeLen / planks);
        const plankH    = 10;
        const sag       = 22; // Curvatura hacia abajo del cable

        // ── Tablones de madera ──
        for (let i = 0; i < planks; i++) {
            const t  = i / (planks - 1);
            const px = x1 + t * bridgeLen;
            // Curva catenaria suave
            const catenary = sag * Math.sin(t * Math.PI);
            const py = Phaser.Math.Linear(y1, y2, t) + catenary;

            // Tablón principal
            gfx.fillStyle(0x7a4a1a, 1);
            gfx.fillRect(px - plankW * 0.4, py - plankH / 2, plankW * 0.85, plankH);

            // Vetas de madera
            gfx.lineStyle(1, 0x5a3010, 0.6);
            gfx.lineBetween(px - plankW * 0.3, py - 2, px + plankW * 0.3, py - 2);
            gfx.lineBetween(px - plankW * 0.3, py + 2, px + plankW * 0.3, py + 2);

            // Clavos de metal
            gfx.fillStyle(0x888888, 1);
            gfx.fillCircle(px - plankW * 0.3, py, 2);
            gfx.fillCircle(px + plankW * 0.3, py, 2);

            // Registrar área sólida del tablón
            this.solidAreas.push({
                type: 'bridge',
                x: px - plankW * 0.4,
                y: py - plankH / 2,
                w: plankW * 0.85,
                h: plankH,
            });
        }

        // ── Cables de soporte (izquierdo y derecho) ──
        gfx.lineStyle(2.5, 0x3a3020, 0.9);
        // Cable superior izquierdo
        gfx.beginPath();
        gfx.moveTo(x1, y1 - 5);
        for (let i = 1; i <= planks; i++) {
            const t = i / planks;
            const catenary = sag * Math.sin(t * Math.PI);
            const cx = x1 + t * bridgeLen;
            const cy = Phaser.Math.Linear(y1, y2, t) + catenary - plankH / 2;
            gfx.lineTo(cx, cy);
        }
        gfx.strokePath();

        // Cable inferior (bajo los tablones)
        gfx.lineStyle(2, 0x4a3a25, 0.7);
        gfx.beginPath();
        gfx.moveTo(x1, y1 + 5);
        for (let i = 1; i <= planks; i++) {
            const t = i / planks;
            const catenary = sag * Math.sin(t * Math.PI);
            const cx = x1 + t * bridgeLen;
            const cy = Phaser.Math.Linear(y1, y2, t) + catenary + plankH / 2;
            gfx.lineTo(cx, cy);
        }
        gfx.strokePath();

        // ── Cuerdas verticales (péndulos) ──
        gfx.lineStyle(1.5, 0x5a4a30, 0.7);
        for (let i = 0; i < planks; i++) {
            const t = i / (planks - 1);
            const px = x1 + t * bridgeLen;
            const catenary = sag * Math.sin(t * Math.PI);
            const py = Phaser.Math.Linear(y1, y2, t) + catenary;
            // Cuerda desde cable superior hasta tablón
            gfx.lineBetween(px, py - catenary * 0.8 - 5, px, py - plankH / 2);
        }

        // ── Postes de anclaje en los extremos ──
        this._drawBridgePost(gfx, x1, y1, true);
        this._drawBridgePost(gfx, x2, y2, false);
    }

    _drawBridgePost(gfx, x, y, isLeft) {
        const postH = 35;
        const dir = isLeft ? 1 : -1;

        // Poste de madera
        gfx.fillStyle(0x6a3a10, 1);
        gfx.fillRect(x - 5 + (isLeft ? 0 : -6), y - postH, 11, postH + 5);
        this.solidAreas.push({
            x: x - 5 + (isLeft ? 0 : -6),
            y: y - postH,
            w: 11,
            h: postH + 5,
        });

        // Cruz superior del poste
        gfx.fillStyle(0x7a4a20, 1);
        gfx.fillRect(x - 14, y - postH, 28, 7);

        // Cuerda de tensión diagonal
        gfx.lineStyle(2, 0x5a3a18, 0.8);
        gfx.lineBetween(x, y - postH, x + dir * 30, y - 5);
    }

    // ═══════════════════════════════════════════════════════════════
    //  DECORACIONES
    // ═══════════════════════════════════════════════════════════════

    drawDecorations(gfx) {
        const decorations = this.mapConfig.decorations || [];

        decorations.forEach(deco => {
            switch (deco.type) {
                case 'cholet':         this.drawCholet(gfx, deco);        break;
                case 'teleferico_tower': this.drawTelefericoTower(gfx, deco); break;
                case 'palm':           this.drawPalm(gfx, deco);          break;
                case 'colonial_house': this.drawColonialHouse(gfx, deco); break;
                case 'lunar_dome':     this.drawLunarDome(gfx, deco);     break;
                case 'radar':          this.drawRadar(gfx, deco);         break;
                case 'lunar_rover':    this.drawLunarRover(gfx, deco);    break;
                // ── Nuevas decoraciones de Santa Cruz ──
                case 'welcome_sign':   this.drawWelcomeSign(gfx, deco);   break;
                case 'radio_tower':    this.drawRadioTower(gfx, deco);    break;
                case 'flag_bolivia':   this.drawFlagBolivia(gfx, deco);   break;
                case 'el_aljibe_hut':  this.drawElAljibeHut(gfx, deco);   break;
                case 'crane':          this.drawCrane(gfx, deco);         break;
                case 'boat':           this.drawBoat(gfx, deco);          break;
            }
        });
    }

    // ── Cartel "Bienvenidos a Santa Cruz de la Sierra" ──
    drawWelcomeSign(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const postH = 55;
        const boardW = 170, boardH = 36;
        const bx = deco.x - boardW / 2;
        const by = baseY - postH - boardH;

        // Postes de madera
        gfx.fillStyle(0x6b3a10, 1);
        gfx.fillRect(deco.x - boardW / 2 + 15, by + boardH, 8, postH);
        gfx.fillRect(deco.x + boardW / 2 - 23, by + boardH, 8, postH);
        this.solidAreas.push({ x: bx + 15, y: by + boardH, w: boardW - 30, h: postH });

        // Tablero principal
        gfx.fillStyle(0x1a5a0a, 1);
        gfx.fillRect(bx, by, boardW, boardH);
        gfx.lineStyle(3, 0xf5c518, 1);
        gfx.strokeRect(bx, by, boardW, boardH);
        gfx.lineStyle(1.5, 0xf5c518, 0.6);
        gfx.strokeRect(bx + 4, by + 4, boardW - 8, boardH - 8);

        // Escudo simplificado de SCZ (círculo verde/blanco)
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(bx + 18, by + boardH / 2, 10);
        gfx.fillStyle(0x007730, 1);
        gfx.fillCircle(bx + 18, by + boardH / 2, 7);
        gfx.fillStyle(0xffd700, 1);
        gfx.fillCircle(bx + 18, by + boardH / 2, 3);

        this.solidAreas.push({ x: bx, y: by, w: boardW, h: boardH });

        // Texto del cartel (superpuesto fuera del gfx como objeto Text)
        this.scene.add.text(deco.x + 8, by + boardH / 2, 'BIENVENIDOS A\nSANTA CRUZ DE LA SIERRA', {
            fontSize: '7px',
            fontFamily: 'Arial Black, Arial',
            color: '#ffe066',
            stroke: '#003300',
            strokeThickness: 1.5,
            align: 'center',
            lineSpacing: 1,
        }).setOrigin(0.5, 0.5).setDepth(3);
    }

    // ── Torre de Radio "Sirari" ──
    drawRadioTower(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const tH = 220;
        const x  = deco.x;

        // Base de cemento
        gfx.fillStyle(0x888888, 1);
        gfx.fillRect(x - 18, baseY - 14, 36, 14);
        this.solidAreas.push({ x: x - 18, y: baseY - 14, w: 36, h: 14 });

        // Cuerpo de la torre (celosía triangular que se estrecha)
        const sections = 8;
        for (let i = 0; i < sections; i++) {
            const t   = i / sections;
            const t1  = (i + 1) / sections;
            const w0  = 16 * (1 - t * 0.7);
            const w1  = 16 * (1 - t1 * 0.7);
            const y0  = baseY - 14 - t * tH;
            const y1  = baseY - 14 - t1 * tH;

            // Lados de la celosía
            gfx.lineStyle(3, 0xaaaaaa, 1);
            gfx.lineBetween(x - w0, y0, x - w1, y1);
            gfx.lineBetween(x + w0, y0, x + w1, y1);

            // Travesaño horizontal
            gfx.lineStyle(2, 0x999999, 1);
            gfx.lineBetween(x - w0, y0, x + w0, y0);

            // Diagonales cruzadas
            gfx.lineStyle(1.5, 0x888888, 0.7);
            gfx.lineBetween(x - w0, y0, x + w1, y1);
            gfx.lineBetween(x + w0, y0, x - w1, y1);
        }

        // Plataforma de observación
        gfx.fillStyle(0x666666, 1);
        gfx.fillRect(x - 10, baseY - 14 - tH - 6, 20, 6);

        // Antena principal
        gfx.fillStyle(0x999999, 1);
        gfx.fillRect(x - 1.5, baseY - 14 - tH - 35, 3, 35);

        // Luces de aviación (rojas)
        gfx.fillStyle(0xff2200, 1);
        gfx.fillCircle(x, baseY - 14 - tH - 36, 4);
        gfx.fillStyle(0xff4400, 0.4);
        gfx.fillCircle(x, baseY - 14 - tH - 36, 8);

        // Cables de tensión
        gfx.lineStyle(1.5, 0x777777, 0.6);
        gfx.lineBetween(x, baseY - 14 - tH, x - 80, baseY - 20);
        gfx.lineBetween(x, baseY - 14 - tH, x + 80, baseY - 20);

        // Letrero "SIRARI"
        this.scene.add.text(x, baseY - 14 - tH - 45, '📡 SIRARI', {
            fontSize: '8px',
            fontFamily: 'Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5, 1).setDepth(3);

        this.solidAreas.push({ x: x - 16, y: baseY - 14 - tH, w: 32, h: tH });
    }

    // ── Bandera de Bolivia ──
    drawFlagBolivia(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const poleH = 90;
        const flagW = 60, flagH = 40;
        const px    = deco.x;
        const fy    = baseY - poleH;

        // Asta de bandera (mástil)
        gfx.fillStyle(0xcccccc, 1);
        gfx.fillRect(px - 2, baseY - poleH, 4, poleH);
        this.solidAreas.push({ x: px - 2, y: baseY - poleH, w: 4, h: poleH });

        // Franjas de la bandera boliviana (rojo, amarillo, verde)
        gfx.fillStyle(0xcc0000, 1);
        gfx.fillRect(px, fy, flagW, flagH / 3);
        gfx.fillStyle(0xf0c800, 1);
        gfx.fillRect(px, fy + flagH / 3, flagW, flagH / 3);
        gfx.fillStyle(0x007730, 1);
        gfx.fillRect(px, fy + 2 * (flagH / 3), flagW, flagH / 3);

        // Escudo (simplificado)
        gfx.fillStyle(0xffffff, 0.8);
        gfx.fillCircle(px + flagW / 2, fy + flagH / 2, 8);
        gfx.fillStyle(0xcc0000, 1);
        gfx.fillCircle(px + flagW / 2, fy + flagH / 2, 4);

        // Borde de la bandera
        gfx.lineStyle(1, 0xaaaaaa, 0.5);
        gfx.strokeRect(px, fy, flagW, flagH);

        // Sombra suave de la bandera
        gfx.lineStyle(1, 0x333333, 0.3);
        gfx.lineBetween(px, fy, px + flagW, fy + 5);
        gfx.lineBetween(px, fy + flagH, px + flagW, fy + flagH + 5);

        // Esfera de remate del mástil
        gfx.fillStyle(0xffd700, 1);
        gfx.fillCircle(px, baseY - poleH, 5);
    }

    // ── Cabaña de paja "Bar El Aljibe" ──
    drawElAljibeHut(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const w = 130, h = 85;
        const x = deco.x - w / 2;
        const y = baseY - h;

        // Paredes de adobe (barro crudo)
        gfx.fillStyle(0xd4a055, 1);
        gfx.fillRect(x, y, w, h);
        this.solidAreas.push({ x, y, w, h });

        // Textura de pared (líneas horizontales de adobe)
        gfx.lineStyle(1, 0xc09040, 0.5);
        for (let row = y + 12; row < baseY; row += 12) {
            gfx.lineBetween(x, row, x + w, row);
        }

        // Techo de paja (triángulo con textura)
        gfx.fillStyle(0x9b6b20, 1);
        gfx.fillTriangle(x - 12, y, x + w + 12, y, deco.x, y - 55);
        this.solidAreas.push({
            type: 'triangle',
            x1: x - 12, y1: y, x2: x + w + 12, y2: y, x3: deco.x, y3: y - 55,
        });

        // Líneas de paja en el techo
        gfx.lineStyle(2, 0x7a5010, 0.6);
        for (let i = 1; i < 7; i++) {
            const ratio = i / 7;
            const lx = Phaser.Math.Linear(x - 12, deco.x, ratio);
            const rx = Phaser.Math.Linear(x + w + 12, deco.x, ratio);
            const ty = Phaser.Math.Linear(y, y - 55, ratio);
            gfx.lineBetween(lx, ty, rx, ty);
        }

        // Ventanas de madera
        gfx.fillStyle(0x5a3010, 1);
        gfx.fillRect(x + 10, y + 18, 28, 22);
        gfx.fillRect(x + w - 38, y + 18, 28, 22);
        gfx.fillStyle(0x6699cc, 0.4);
        gfx.fillRect(x + 13, y + 21, 22, 16);
        gfx.fillRect(x + w - 35, y + 21, 22, 16);
        gfx.lineStyle(2, 0x7a5020, 1);
        gfx.strokeRect(x + 10, y + 18, 28, 22);
        gfx.strokeRect(x + w - 38, y + 18, 28, 22);

        // Puerta de madera con arco
        gfx.fillStyle(0x5c3010, 1);
        gfx.fillRect(deco.x - 13, y + h - 42, 26, 42);
        gfx.fillCircle(deco.x, y + h - 42, 13);
        gfx.fillStyle(0xffd700, 1);
        gfx.fillCircle(deco.x + 8, y + h - 22, 2.5);

        // Letrero "El Aljibe"
        const signW = 100, signH = 18;
        gfx.fillStyle(0x8b3a00, 1);
        gfx.fillRect(deco.x - signW / 2, y - 20, signW, signH);
        gfx.lineStyle(2, 0xffd700, 1);
        gfx.strokeRect(deco.x - signW / 2, y - 20, signW, signH);
        this.scene.add.text(deco.x, y - 11, '🍺 EL ALJIBE', {
            fontSize: '9px',
            fontFamily: 'Arial Black, Arial',
            color: '#ffd700',
            stroke: '#4a1800',
            strokeThickness: 2,
        }).setOrigin(0.5, 0.5).setDepth(3);

        // Mesitas afuera (izquierda)
        gfx.fillStyle(0x8b5a2b, 1);
        gfx.fillRect(x - 28, baseY - 12, 22, 3);
        gfx.fillRect(x - 22, baseY - 12, 3, 12);
        gfx.fillRect(x - 10, baseY - 12, 3, 12);
    }

    // ── Grúa Industrial de Construcción ──
    drawCrane(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const towerH = 160;
        const armLen = 120;
        const x = deco.x;

        // Base de la grúa (patines)
        gfx.fillStyle(0x555555, 1);
        gfx.fillRect(x - 25, baseY - 8, 50, 8);
        this.solidAreas.push({ x: x - 25, y: baseY - 8, w: 50, h: 8 });

        // Torre vertical (celosía amarilla)
        gfx.fillStyle(0xf09000, 1);
        gfx.fillRect(x - 7, baseY - towerH - 8, 14, towerH);
        this.solidAreas.push({ x: x - 7, y: baseY - towerH - 8, w: 14, h: towerH });

        // Refuerzos diagonales de la torre
        gfx.lineStyle(2, 0xc07000, 0.8);
        for (let i = 0; i < 5; i++) {
            const dy = (towerH / 5) * i;
            gfx.lineBetween(x - 7, baseY - 8 - dy, x + 7, baseY - 8 - dy - towerH / 5);
            gfx.lineBetween(x + 7, baseY - 8 - dy, x - 7, baseY - 8 - dy - towerH / 5);
        }

        // Cabina de operación
        gfx.fillStyle(0xf09000, 1);
        gfx.fillRect(x - 14, baseY - towerH - 8 - 20, 28, 20);
        gfx.fillStyle(0x66aadd, 0.6);
        gfx.fillRect(x - 10, baseY - towerH - 8 - 17, 10, 12);

        // Brazo horizontal (pluma)
        gfx.fillStyle(0xf09000, 1);
        gfx.fillRect(x - 10, baseY - towerH - 8 - 26, armLen + 10, 9);

        // Contrapeso
        gfx.fillStyle(0x888888, 1);
        gfx.fillRect(x - 45, baseY - towerH - 8 - 25, 32, 15);

        // Cable de la pluma
        gfx.lineStyle(2, 0x555555, 1);
        gfx.lineBetween(x + armLen - 5, baseY - towerH - 8 - 22, x + armLen - 5, baseY - towerH + 30);

        // Gancho
        gfx.lineStyle(2.5, 0xaaaaaa, 1);
        gfx.lineBetween(x + armLen - 5, baseY - towerH + 30, x + armLen + 3, baseY - towerH + 38);
        gfx.fillStyle(0xaaaaaa, 1);
        gfx.fillRect(x + armLen - 8, baseY - towerH + 28, 6, 12);

        // Letrero en la cabina
        this.scene.add.text(x, baseY - towerH - 8 - 38, '🏗️', {
            fontSize: '12px',
        }).setOrigin(0.5, 0.5).setDepth(3);
    }

    // ── Bote pesquero (flota en el agua) ──
    drawBoat(gfx, deco) {
        const waterY = this.waterLevel;
        const bx = deco.x;
        const by = waterY - 10;

        // Casco del bote
        gfx.fillStyle(0xcc4400, 1);
        gfx.fillTriangle(bx - 35, by, bx + 35, by, bx + 30, by + 14);
        gfx.fillRect(bx - 35, by, 70, 8);
        gfx.fillStyle(0xaa3300, 1);
        gfx.fillRect(bx - 35, by + 8, 65, 6);

        // Borda blanca
        gfx.fillStyle(0xeeeeee, 1);
        gfx.fillRect(bx - 35, by - 4, 70, 5);

        // Cubierta
        gfx.fillStyle(0xe8c880, 1);
        gfx.fillRect(bx - 28, by - 12, 56, 9);

        // Cabina del capitán
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(bx - 14, by - 30, 28, 18);
        gfx.fillStyle(0x5599cc, 0.7);
        gfx.fillRect(bx - 10, by - 27, 10, 8);
        gfx.fillRect(bx + 2, by - 27, 8, 8);
        gfx.fillStyle(0xcc4400, 1);
        gfx.fillRect(bx - 16, by - 32, 32, 4);

        // Mástil
        gfx.fillStyle(0x8b6010, 1);
        gfx.fillRect(bx + 8, by - 55, 3, 25);

        // Banderita
        gfx.fillStyle(0xcc0000, 1);
        gfx.fillTriangle(bx + 11, by - 55, bx + 24, by - 50, bx + 11, by - 45);

        // Ondas de agua alrededor del bote
        gfx.lineStyle(1.5, 0x0077aa, 0.35);
        gfx.lineBetween(bx - 42, waterY + 3, bx - 25, waterY + 3);
        gfx.lineBetween(bx + 30, waterY + 3, bx + 46, waterY + 3);
        gfx.lineStyle(1, 0x0088cc, 0.25);
        gfx.lineBetween(bx - 48, waterY + 7, bx - 30, waterY + 7);
        gfx.lineBetween(bx + 36, waterY + 7, bx + 52, waterY + 7);
    }

    // ═══════════════════════════════════════════════════════════════
    //  DECORACIONES HEREDADAS (EL ALTO, LUNA)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Cholet — Fachada andina con paneles de colores brillantes.
     */
    drawCholet(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const w = 120, h = 130;
        const x = deco.x - w / 2;
        const y = baseY - h;

        gfx.fillStyle(0xff8c00, 1);
        gfx.fillRect(x, y, w, h);
        this.solidAreas.push({ x, y, w, h });

        gfx.fillStyle(0x00cc88, 1);
        gfx.fillRect(x + 15, y + 15, w - 30, 40);
        gfx.fillStyle(0x00d4ff, 1);
        gfx.fillRect(x + 15, y + 65, w - 30, 35);

        gfx.lineStyle(3, 0xffd700, 1);
        gfx.strokeRect(x + 12, y + 12, w - 24, 46);
        gfx.strokeRect(x + 12, y + 62, w - 24, 41);

        gfx.fillStyle(0x1a1a3f, 0.8);
        gfx.fillRect(x + 20, y + 22, 25, 18);
        gfx.fillRect(x + w - 45, y + 22, 25, 18);
        gfx.fillRect(x + 20, y + 72, 25, 18);
        gfx.fillRect(x + w - 45, y + 72, 25, 18);

        gfx.fillStyle(0x8B4513, 1);
        gfx.fillRect(x + w / 2 - 12, y + h - 40, 24, 40);

        gfx.fillStyle(0xffd700, 1);
        gfx.fillRect(x - 5, y - 8, w + 10, 8);

        gfx.fillStyle(0xcc3300, 1);
        gfx.fillTriangle(x - 10, y - 8, x + w + 10, y - 8, deco.x, y - 50);
        this.solidAreas.push({
            type: 'triangle',
            x1: x - 10, y1: y - 8,
            x2: x + w + 10, y2: y - 8,
            x3: deco.x, y3: y - 50
        });
    }

    /**
     * Torre de teleférico con cables.
     */
    drawTelefericoTower(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const towerH = deco.height || 180;
        const towerW = 20;
        const x = deco.x - towerW / 2;
        const y = baseY - towerH;

        gfx.fillStyle(0x666666, 1);
        gfx.fillRect(x, y, towerW, towerH);
        this.solidAreas.push({ x, y, w: towerW, h: towerH });

        gfx.lineStyle(2, 0x888888, 1);
        for (let i = 0; i < towerH; i += 20) {
            gfx.lineBetween(x, y + i, x + towerW, y + i + 20);
            gfx.lineBetween(x + towerW, y + i, x, y + i + 20);
        }

        gfx.fillStyle(0x444444, 1);
        gfx.fillRect(x - 15, y - 6, towerW + 30, 6);

        gfx.fillStyle(0xaaaaaa, 1);
        gfx.fillCircle(deco.x, y - 3, 6);

        gfx.lineStyle(2, 0x333333, 0.8);
        gfx.lineBetween(deco.x, y - 3, deco.x - 200, y + 60);
        gfx.lineBetween(deco.x, y - 3, deco.x + 200, y + 60);

        const cabX = deco.x + 100;
        const cabY = y + 30;
        gfx.lineStyle(1, 0x333333, 1);
        gfx.lineBetween(cabX, cabY - 15, cabX, cabY);
        gfx.fillStyle(0xdd4400, 1);
        gfx.fillRect(cabX - 10, cabY, 20, 15);
        gfx.fillStyle(0xaaddff, 0.8);
        gfx.fillRect(cabX - 7, cabY + 3, 6, 6);
        gfx.fillRect(cabX + 1, cabY + 3, 6, 6);
    }

    /**
     * Palmera tropical.
     * Usa sprite_palm.png si está cargado (imagen de escena, muy superior visualmente).
     * Fallback al dibujo vectorial si el asset no está disponible.
     */
    drawPalm(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const size  = deco.size || 80;

        if (this.scene.textures.exists('sprite_palm')) {
            // ── Sprite PNG generado con IA ──
            // Se añade directamente a la escena (no al gfx/RT) para máxima calidad.
            const palm = this.scene.add.image(deco.x, baseY, 'sprite_palm');
            palm.setOrigin(0.5, 1);          // Anclar base del tronco a la superficie
            palm.setScale(size / 200);       // 200 es la altura de diseño del sprite
            palm.setDepth(2);

            // Registrar área sólida del tronco (para físicas)
            const trunkW = 12;
            this.solidAreas.push({
                x: deco.x - trunkW / 2,
                y: baseY - size,
                w: trunkW,
                h: size,
            });
        } else {
            // ── Fallback: Palmera vectorial procedimental ──
            const trunkWidth = 8;
            gfx.fillStyle(0x8B4513, 1);
            const segments = 8;
            for (let i = 0; i < segments; i++) {
                const t    = i / segments;
                const segX = deco.x + Math.sin(t * 1.2) * 12;
                const segY = baseY - t * size;
                gfx.fillRect(segX - trunkWidth / 2, segY - size / segments, trunkWidth, size / segments + 2);
            }
            this.solidAreas.push({ x: deco.x - trunkWidth / 2, y: baseY - size, w: trunkWidth, h: size });

            const topX = deco.x + Math.sin(1.2) * 12;
            const topY = baseY - size;
            gfx.fillStyle(0x228B22, 1);
            const leafAngles = [-2.5, -1.8, -1.0, -0.3, 0.3, 1.0, 1.8, 2.5];
            leafAngles.forEach(angle => {
                const leafLen = 30 + Math.random() * 15;
                const endX = topX + Math.cos(angle) * leafLen;
                const endY = topY + Math.sin(angle) * leafLen * 0.6;
                gfx.lineStyle(5, 0x228B22, 1);
                gfx.lineBetween(topX, topY, endX, endY);
                gfx.fillCircle(endX, endY, 8);
            });
            gfx.fillStyle(0x2ecc40, 1);
            gfx.fillCircle(topX, topY, 12);
        }
    }

    /**
     * Casa colonial con columnas blancas y techo de tejas.
     */
    drawColonialHouse(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const w = 140, h = 100;
        const x = deco.x - w / 2;
        const y = baseY - h;

        gfx.fillStyle(0xfff8dc, 1);
        gfx.fillRect(x, y, w, h);
        this.solidAreas.push({ x, y, w, h });

        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(x - 6, y + 10, 8, h - 10);
        gfx.fillRect(x + w - 2, y + 10, 8, h - 10);
        gfx.fillRect(x + w / 3 - 3, y + 10, 6, h - 10);
        gfx.fillRect(x + 2 * w / 3 - 3, y + 10, 6, h - 10);

        gfx.fillStyle(0xaa3333, 1);
        gfx.fillTriangle(x - 20, y, x + w + 20, y, deco.x, y - 50);
        this.solidAreas.push({
            type: 'triangle',
            x1: x - 20, y1: y, x2: x + w + 20, y2: y, x3: deco.x, y3: y - 50,
        });

        gfx.lineStyle(1, 0x882222, 0.5);
        for (let i = 0; i < 5; i++) {
            const ty = y - 10 * i;
            const ratio = i / 5;
            const lx = Phaser.Math.Linear(x - 20, deco.x, ratio);
            const rx = Phaser.Math.Linear(x + w + 20, deco.x, ratio);
            gfx.lineBetween(lx, ty, rx, ty);
        }

        gfx.fillStyle(0x336699, 0.7);
        gfx.fillRect(x + 18, y + 20, 22, 30);
        gfx.fillRect(x + w - 40, y + 20, 22, 30);
        gfx.fillCircle(x + 29, y + 20, 11);
        gfx.fillCircle(x + w - 29, y + 20, 11);

        gfx.lineStyle(2, 0xffffff, 1);
        gfx.strokeRect(x + 18, y + 20, 22, 30);
        gfx.strokeRect(x + w - 40, y + 20, 22, 30);

        gfx.fillStyle(0x654321, 1);
        gfx.fillRect(deco.x - 14, y + h - 45, 28, 45);
        gfx.fillCircle(deco.x, y + h - 45, 14);

        gfx.lineStyle(2, 0xffffff, 1);
        gfx.lineBetween(x, y + 55, x + w, y + 55);
    }

    /**
     * Domo lunar semitransparente.
     */
    drawLunarDome(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const radius = 55;

        gfx.fillStyle(0x888888, 1);
        gfx.fillRect(deco.x - radius - 10, baseY - 12, (radius + 10) * 2, 12);
        this.solidAreas.push({
            x: deco.x - radius - 10, y: baseY - 12,
            w: (radius + 10) * 2, h: 12
        });

        gfx.fillStyle(0x66ccff, 0.3);
        gfx.beginPath();
        gfx.arc(deco.x, baseY - 12, radius, Math.PI, 0, false);
        gfx.closePath();
        gfx.fillPath();

        gfx.lineStyle(1, 0x88ddff, 0.5);
        for (let i = -2; i <= 2; i++) {
            const offsetX = i * (radius / 3);
            gfx.beginPath();
            const arcR = Math.sqrt(radius * radius - offsetX * offsetX);
            gfx.arc(deco.x + offsetX, baseY - 12, arcR, Math.PI, 0, false);
            gfx.strokePath();
        }
        gfx.lineBetween(deco.x - radius * 0.85, baseY - 12 - radius * 0.5, deco.x + radius * 0.85, baseY - 12 - radius * 0.5);

        gfx.fillStyle(0x444444, 1);
        gfx.fillRect(deco.x - 10, baseY - 30, 20, 18);
        gfx.fillStyle(0x88ccff, 0.6);
        gfx.fillRect(deco.x - 6, baseY - 26, 12, 10);
    }

    /**
     * Antena parabólica (radar) orientada al cielo.
     */
    drawRadar(gfx, deco) {
        const baseY = this.getIslandY(deco.x);
        const poleH = 60;

        gfx.fillStyle(0x999999, 1);
        gfx.fillRect(deco.x - 3, baseY - poleH, 6, poleH);
        this.solidAreas.push({ x: deco.x - 3, y: baseY - poleH, w: 6, h: poleH });

        gfx.lineStyle(4, 0xcccccc, 1);
        gfx.beginPath();
        gfx.arc(deco.x, baseY - poleH + 10, 25, Math.PI + 0.3, -0.3, false);
        gfx.strokePath();

        gfx.fillStyle(0xff4444, 1);
        gfx.fillCircle(deco.x, baseY - poleH - 8, 4);
        gfx.lineStyle(2, 0xaaaaaa, 1);
        gfx.lineBetween(deco.x, baseY - poleH + 10, deco.x, baseY - poleH - 8);

        gfx.fillStyle(0x777777, 1);
        gfx.fillRect(deco.x - 12, baseY - 4, 24, 4);
    }

    /**
     * Rover lunar simplificado.
     */
    drawLunarRover(gfx, deco) {
        const baseY = this.getIslandY(deco.x);

        gfx.fillStyle(0xcccccc, 1);
        gfx.fillRect(deco.x - 20, baseY - 18, 40, 10);

        gfx.fillStyle(0xaaaaaa, 1);
        gfx.fillRect(deco.x - 10, baseY - 28, 20, 10);
        gfx.fillStyle(0x66ccff, 0.7);
        gfx.fillRect(deco.x - 7, baseY - 26, 14, 6);

        gfx.fillStyle(0x444444, 1);
        gfx.fillCircle(deco.x - 14, baseY - 6, 6);
        gfx.fillCircle(deco.x + 14, baseY - 6, 6);
        gfx.lineStyle(1, 0x666666, 1);
        gfx.strokeCircle(deco.x - 14, baseY - 6, 6);
        gfx.strokeCircle(deco.x + 14, baseY - 6, 6);

        gfx.lineStyle(1, 0xdddddd, 1);
        gfx.lineBetween(deco.x + 8, baseY - 28, deco.x + 15, baseY - 40);
        gfx.fillStyle(0xff4444, 1);
        gfx.fillCircle(deco.x + 15, baseY - 40, 2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FÍSICAS
    // ═══════════════════════════════════════════════════════════════

    buildPhysicsGrid() {
        for (let x = 0; x < this.width; x += this.blockSize) {
            for (let y = 0; y < this.height; y += this.blockSize) {
                const rx = x + this.blockSize / 2;
                const ry = y + this.blockSize / 2;

                if (ry >= this.waterLevel) continue;

                const isBridge = this.isPointBridge(rx, ry);
                if (isBridge) {
                    const block = this.scene.matter.add.rectangle(rx, ry, this.blockSize, this.blockSize, {
                        isStatic: true,
                        friction: 0.8,
                        label: 'bridge',
                    });
                    this.terrainBlocks.push({ body: block, x: rx, y: ry, isBridge: true });
                    continue;
                }

                const isSolid = this.isPointSolid(rx, ry);
                if (isSolid) {
                    const block = this.scene.matter.add.rectangle(rx, ry, this.blockSize, this.blockSize, {
                        isStatic: true,
                        friction: 1,
                        label: 'terrain',
                    });
                    this.terrainBlocks.push({ body: block, x: rx, y: ry });
                }
            }
        }
    }

    /**
     * Verifica si un punto (rx, ry) pertenece al área de un puente.
     */
    isPointBridge(rx, ry) {
        for (const area of this.solidAreas) {
            if (area.type !== 'bridge') continue;
            if (rx > area.x && rx < area.x + area.w && ry > area.y && ry < area.y + area.h) {
                return true;
            }
        }
        return false;
    }

    /**
     * Verifica si un punto (rx, ry) es sólido revisando:
     * 1. Dentro de la curva del terreno
     * 2. Dentro de alguna decoración sólida (rectángulo o triángulo)
     * 3. Excluye el interior de la cueva (elipse hueca)
     */
    isPointSolid(rx, ry) {
        // ── Exclusión de la cueva ──
        if (this.caveData) {
            const cd = this.caveData;
            const ex = (rx - cd.cx) / cd.rx;
            const ey = (ry - cd.cy) / cd.ry;
            if (ex * ex + ey * ey <= 1.0) return false;
        }

        // Dentro de la isla (debajo de la curva del terreno)
        if (rx > this.islandStartX && rx < this.islandEndX && ry > this.getIslandY(rx)) {
            return true;
        }

        // Dentro de alguna decoración sólida
        for (const area of this.solidAreas) {
            if (area.type === 'bridge') continue; // Los puentes se manejan aparte
            if (area.type === 'triangle') {
                if (this.pointInTriangle(rx, ry, area.x1, area.y1, area.x2, area.y2, area.x3, area.y3)) {
                    return true;
                }
            } else {
                if (rx > area.x && rx < area.x + area.w && ry > area.y && ry < area.y + area.h) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Test de punto dentro de triángulo usando coordenadas baricéntricas.
     */
    pointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
        const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
        const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
        const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);

        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

        return !(hasNeg && hasPos);
    }

    // ═══════════════════════════════════════════════════════════════
    //  API PÚBLICA
    // ═══════════════════════════════════════════════════════════════

    /**
     * Calcula una posición segura de spawn encima del terreno.
     * @param {number} x - Coordenada X deseada
     * @returns {{x: number, y: number}} Posición segura encima del terreno
     */
    getSafeSpawnPosition(x) {
        x = Phaser.Math.Clamp(x, this.islandStartX + 50, this.islandEndX - 50);

        if (this.getIslandY) {
            const terrainY = this.getIslandY(x);
            return { x: x, y: terrainY - 60 };
        }

        return { x: x, y: 200 };
    }

    destroyTerrain(x, y, radius) {
        // 1. ACTUALIZAR LO VISUAL (Borrar del RenderTexture)
        this.eraserShape.clear();
        this.eraserShape.fillStyle(0xffffff, 1);
        this.eraserShape.fillCircle(0, 0, radius);
        this.rt.erase(this.eraserShape, x, y);

        // 2. ACTUALIZAR FÍSICAS (Remover bloques en el radio — terreno y puentes)
        for (let i = this.terrainBlocks.length - 1; i >= 0; i--) {
            const blockData = this.terrainBlocks[i];
            const dist = Phaser.Math.Distance.Between(x, y, blockData.x, blockData.y);

            if (dist <= radius) {
                this.scene.matter.world.remove(blockData.body);
                this.terrainBlocks.splice(i, 1);
            }
        }
    }
}
