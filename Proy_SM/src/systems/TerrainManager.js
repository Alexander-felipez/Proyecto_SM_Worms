import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';

/**
 * TerrainManager
 * Genera terreno destructible estilo Worms con una capa visual (RenderTexture)
 * y una grilla de bloques físicos (Matter.js) sincronizados.
 * 
 * Ahora soporta múltiples biomas: cada bioma cambia los colores del terreno,
 * la forma de las montañas y los objetos decorativos.
 * 
 * Usa dimensiones fijas del mapa (GAME_CONFIG.MAP) para evitar problemas
 * con ventanas de diferentes tamaños.
 */
export class TerrainManager {
    constructor(scene, biomeKey = 'EL_ALTO') {
        this.scene = scene;
        this.blockSize = 16; // Tamaño de cada "píxel" físico del terreno
        this.terrainBlocks = []; // Arreglo para guardar los cuerpos físicos
        
        // Usar dimensiones fijas del mapa, NO las de la cámara
        this.width = GAME_CONFIG.MAP.DEFAULT_WIDTH;
        this.height = GAME_CONFIG.MAP.DEFAULT_HEIGHT;
        
        // Coordenadas donde empieza el terreno visualmente
        this.terrainYStart = this.height / 2 + 50; 

        // Guardar la función de terreno para que GameScene pueda usarla para spawn
        this.getIslandY = null;
        this.islandStartX = 0;
        this.islandEndX = 0;
        this.waterLevel = 0;

        // Obtener configuración del bioma desde GameConfig
        this.biomeKey = biomeKey;
        this.biome = GAME_CONFIG.BIOMES[biomeKey] || GAME_CONFIG.BIOMES.EL_ALTO;
    }

    createTerrain() {
        // 1. CAPA VISUAL (RenderTexture)
        this.rt = this.scene.add.renderTexture(0, 0, this.width, this.height);
        
        // --- GENERACIÓN DE ISLA CON OBJETOS (Estilo Worms) ---
        const terrainGfx = this.scene.make.graphics({ add: false });

        // Usar el color del bioma para el terreno base
        const terrainColor = this.biome.terrainColor || 0xddbb77;
        
        // A) DIBUJAR LA ISLA BASE según el bioma
        terrainGfx.fillStyle(terrainColor, 1);
        terrainGfx.beginPath();
        
        this.islandStartX = 150;
        this.islandEndX = this.width - 150;
        this.waterLevel = this.height - 80;

        terrainGfx.moveTo(this.islandStartX, this.height);
        terrainGfx.lineTo(this.islandStartX - 20, this.waterLevel); // Orilla izquierda
        
        // Curvatura de la isla — DIFERENTE por bioma
        const islandStartX = this.islandStartX;
        const islandEndX = this.islandEndX;
        const waterLevel = this.waterLevel;
        const biomeKey = this.biomeKey;

        this.getIslandY = (x) => {
            let normalizedX = (x - islandStartX) / (islandEndX - islandStartX); // de 0 a 1

            switch (biomeKey) {
                case 'SALAR':
                    // Salar de Uyuni: terreno muy plano con ondulaciones suaves
                    return waterLevel - 80 + Math.sin(normalizedX * Math.PI) * 20 + Math.sin(x * 0.02) * 5;

                case 'LUNA':
                    // Luna: terreno con cráteres (picos y valles irregulares)
                    let lunarBase = Math.sin(normalizedX * Math.PI) * 120;
                    let crater1 = Math.abs(Math.sin(x * 0.03)) * 40;
                    let crater2 = Math.cos(x * 0.07) * 25;
                    return waterLevel - lunarBase + crater1 - crater2;

                case 'SANTA_CRUZ':
                    // Santa Cruz Tropical: terreno ondulado suave con colinas
                    let tropicalArch = Math.sin(normalizedX * Math.PI) * 130;
                    let hills = Math.sin(x * 0.04) * 20 + Math.sin(x * 0.08) * 10;
                    return waterLevel - tropicalArch + hills;

                case 'EL_ALTO':
                default:
                    // El Alto: montañas pronunciadas (el original)
                    let arch = Math.sin(normalizedX * Math.PI) * 150;
                    let noise = Math.sin(x * 0.05) * 10;
                    return waterLevel - arch + noise;
            }
        };

        for (let x = this.islandStartX; x <= this.islandEndX; x += 10) {
            terrainGfx.lineTo(x, this.getIslandY(x));
        }
        
        terrainGfx.lineTo(this.islandEndX + 20, this.waterLevel); // Orilla derecha
        terrainGfx.lineTo(this.islandEndX + 50, this.height);
        terrainGfx.closePath();
        terrainGfx.fillPath();

        // B) DIBUJAR OBJETOS DECORATIVOS según el bioma
        this._drawBiomeDecorations(terrainGfx);

        // Estampar todo el paisaje estático en la textura destructible
        this.rt.draw(terrainGfx, 0, 0);

        // C) AGUA / SUELO EXTRA (debajo de la capa destructible)
        this._drawWaterOrGround();

        // 2. CAPA FÍSICA (Grid de bloques)
        this._createPhysicsGrid(terrainGfx);
        
        // Pincel usado para borrar visualmente (un círculo)
        this.eraserShape = this.scene.make.graphics({ add: false });
        this.eraserShape.fillStyle(0xffffff);
    }

    /**
     * Dibuja las decoraciones propias de cada bioma (casas, árboles, rocas, etc.)
     */
    _drawBiomeDecorations(gfx) {
        const midX = this.width / 2;

        switch (this.biomeKey) {
            case 'EL_ALTO':
                this._drawElAltoDecorations(gfx, midX);
                break;
            case 'SANTA_CRUZ':
                this._drawSantaCruzDecorations(gfx, midX);
                break;
            case 'LUNA':
                this._drawLunaDecorations(gfx, midX);
                break;
            case 'SALAR':
                this._drawSalarDecorations(gfx, midX);
                break;
            default:
                this._drawElAltoDecorations(gfx, midX);
                break;
        }
    }

    // --- DECORACIONES: EL ALTO (La Paz) ---
    _drawElAltoDecorations(gfx, midX) {
        // Casa colonial
        const houseY = this.getIslandY(midX);
        gfx.fillStyle(0xeebbca, 1); // Pared rosada
        gfx.fillRect(midX - 80, houseY - 100, 160, 100);
        gfx.fillStyle(0xaa3333, 1); // Techo rojo
        gfx.fillTriangle(midX - 100, houseY - 100, midX + 100, houseY - 100, midX, houseY - 160);

        // Árbol de la izquierda (Eucalipto)
        let tree1X = 350;
        let tree1Y = this.getIslandY(tree1X);
        gfx.fillStyle(0x5a3a1a, 1); // Tronco marrón oscuro
        gfx.fillRect(tree1X - 5, tree1Y - 80, 10, 80);
        gfx.fillStyle(0x2d5a1e, 1); // Copa verde oscuro
        gfx.fillCircle(tree1X, tree1Y - 90, 35);

        // Roca a la derecha
        let rockX = this.width - 350;
        let rockY = this.getIslandY(rockX);
        gfx.fillStyle(0x777777, 1);
        gfx.fillCircle(rockX, rockY - 15, 25);
        gfx.fillStyle(0x666666, 1);
        gfx.fillCircle(rockX + 15, rockY - 8, 18);
    }

    // --- DECORACIONES: SANTA CRUZ TROPICAL ---
    _drawSantaCruzDecorations(gfx, midX) {
        // Cabaña tropical
        const hutY = this.getIslandY(midX);
        gfx.fillStyle(0xc8a050, 1); // Pared de madera clara
        gfx.fillRect(midX - 60, hutY - 80, 120, 80);
        gfx.fillStyle(0x228B22, 1); // Techo de hojas
        gfx.fillTriangle(midX - 80, hutY - 80, midX + 80, hutY - 80, midX, hutY - 130);

        // Palmera izquierda
        let palm1X = 300;
        let palm1Y = this.getIslandY(palm1X);
        gfx.fillStyle(0x8B4513, 1); // Tronco
        gfx.fillRect(palm1X - 5, palm1Y - 90, 10, 90);
        gfx.fillStyle(0x32CD32, 1); // Hojas verdes brillantes
        gfx.fillCircle(palm1X, palm1Y - 95, 40);

        // Palmera derecha
        let palm2X = this.width - 300;
        let palm2Y = this.getIslandY(palm2X);
        gfx.fillStyle(0x8B4513, 1);
        gfx.fillRect(palm2X - 5, palm2Y - 85, 10, 85);
        gfx.fillStyle(0x32CD32, 1);
        gfx.fillCircle(palm2X, palm2Y - 90, 35);

        // Arbusto tropical
        let bushX = midX + 200;
        let bushY = this.getIslandY(bushX);
        gfx.fillStyle(0x006400, 1);
        gfx.fillCircle(bushX, bushY - 15, 20);
        gfx.fillCircle(bushX + 18, bushY - 10, 16);
    }

    // --- DECORACIONES: LUNA / ESPACIO ---
    _drawLunaDecorations(gfx, midX) {
        // Módulo lunar (base espacial)
        const baseY = this.getIslandY(midX);
        gfx.fillStyle(0xaaaaaa, 1); // Cuerpo gris metálico
        gfx.fillRect(midX - 50, baseY - 60, 100, 60);
        gfx.fillStyle(0xcccccc, 1); // Cúpula
        gfx.fillCircle(midX, baseY - 60, 40);
        // Ventana
        gfx.fillStyle(0x00ccff, 1);
        gfx.fillCircle(midX, baseY - 65, 12);

        // Roca lunar izquierda (grande)
        let rock1X = 350;
        let rock1Y = this.getIslandY(rock1X);
        gfx.fillStyle(0x777777, 1);
        gfx.fillCircle(rock1X, rock1Y - 20, 30);
        gfx.fillStyle(0x555555, 1);
        gfx.fillCircle(rock1X + 10, rock1Y - 10, 15);

        // Roca lunar derecha
        let rock2X = this.width - 350;
        let rock2Y = this.getIslandY(rock2X);
        gfx.fillStyle(0x888888, 1);
        gfx.fillCircle(rock2X, rock2Y - 18, 25);
        gfx.fillStyle(0x666666, 1);
        gfx.fillCircle(rock2X - 12, rock2Y - 8, 18);

        // Bandera (estilo luna)
        let flagX = midX + 120;
        let flagY = this.getIslandY(flagX);
        gfx.fillStyle(0xcccccc, 1); // Poste
        gfx.fillRect(flagX - 2, flagY - 70, 4, 70);
        gfx.fillStyle(0xff0000, 1); // Bandera roja
        gfx.fillRect(flagX + 2, flagY - 70, 30, 18);
    }

    // --- DECORACIONES: SALAR DE UYUNI ---
    _drawSalarDecorations(gfx, midX) {
        // Monolito de sal / formación rocosa
        const monoY = this.getIslandY(midX);
        gfx.fillStyle(0xd0d0e0, 1);
        gfx.fillRect(midX - 30, monoY - 90, 60, 90);
        gfx.fillStyle(0xe0e0f0, 1);
        gfx.fillTriangle(midX - 40, monoY - 90, midX + 40, monoY - 90, midX, monoY - 130);

        // Cactus izquierdo (cardón)
        let cactus1X = 380;
        let cactus1Y = this.getIslandY(cactus1X);
        gfx.fillStyle(0x2e7d32, 1); // Verde cactus
        gfx.fillRect(cactus1X - 6, cactus1Y - 70, 12, 70);
        // Brazos del cactus
        gfx.fillRect(cactus1X - 20, cactus1Y - 55, 14, 8);
        gfx.fillRect(cactus1X - 20, cactus1Y - 55, 8, -25);
        gfx.fillRect(cactus1X + 6, cactus1Y - 45, 14, 8);
        gfx.fillRect(cactus1X + 12, cactus1Y - 45, 8, -20);

        // Cactus derecho
        let cactus2X = this.width - 380;
        let cactus2Y = this.getIslandY(cactus2X);
        gfx.fillStyle(0x388e3c, 1);
        gfx.fillRect(cactus2X - 5, cactus2Y - 60, 10, 60);
        gfx.fillRect(cactus2X - 18, cactus2Y - 45, 13, 7);
        gfx.fillRect(cactus2X - 18, cactus2Y - 45, 7, -20);

        // Cristales de sal decorativos
        let crystalX = midX - 200;
        let crystalY = this.getIslandY(crystalX);
        gfx.fillStyle(0xf0f0ff, 0.8);
        gfx.fillTriangle(crystalX - 10, crystalY, crystalX + 10, crystalY, crystalX, crystalY - 30);
        gfx.fillTriangle(crystalX + 15, crystalY, crystalX + 30, crystalY, crystalX + 22, crystalY - 22);
    }

    /**
     * Dibuja el agua o suelo extra debajo de la capa destructible según el bioma
     */
    _drawWaterOrGround() {
        let waterColor, waterAlpha;

        switch (this.biomeKey) {
            case 'LUNA':
                // En la luna no hay agua, sino vacío oscuro
                waterColor = 0x111122;
                waterAlpha = 0.5;
                break;
            case 'SALAR':
                // Salar: reflejo blanquecino/espejo
                waterColor = 0xc0c0dd;
                waterAlpha = 0.6;
                break;
            case 'SANTA_CRUZ':
                // Agua tropical más verde
                waterColor = 0x008866;
                waterAlpha = 0.7;
                break;
            case 'EL_ALTO':
            default:
                // Agua azul clásica
                waterColor = 0x0066aa;
                waterAlpha = 0.7;
                break;
        }

        this.scene.add.rectangle(
            this.width / 2, this.height - 40,
            this.width, 80,
            waterColor, waterAlpha
        );
    }

    /**
     * Crea la grilla de bloques físicos que coinciden con el terreno visual
     */
    _createPhysicsGrid(terrainGfx) {
        const midX = this.width / 2;

        for (let x = 0; x < this.width; x += this.blockSize) {
            for (let y = 0; y < this.height; y += this.blockSize) {
                let rx = x + this.blockSize / 2;
                let ry = y + this.blockSize / 2;
                let isSolid = false;

                // Dentro de la Isla (para todos los biomas)
                if (rx > this.islandStartX && rx < this.islandEndX && ry > this.getIslandY(rx)) {
                    isSolid = true;
                }

                // Dentro de las decoraciones sólidas según bioma
                isSolid = isSolid || this._isInsideDecoration(rx, ry, midX);

                if (isSolid && ry < this.waterLevel) { // No poner físicas en el agua
                    let block = this.scene.matter.add.rectangle(rx, ry, this.blockSize, this.blockSize, {
                        isStatic: true,
                        friction: 1,
                        label: 'terrain'
                    });
                    this.terrainBlocks.push({ body: block, x: rx, y: ry });
                }
            }
        }
    }

    /**
     * Determina si un punto (rx, ry) está dentro de alguna decoración sólida del bioma.
     * Esto es necesario para que las casas, rocas, etc. tengan colisión física.
     */
    _isInsideDecoration(rx, ry, midX) {
        switch (this.biomeKey) {
            case 'EL_ALTO': {
                const houseY = this.getIslandY(midX);
                // Casa
                if (rx > midX - 80 && rx < midX + 80 && ry > houseY - 100 && ry < houseY) return true;
                // Techo
                if (ry < houseY - 100 && ry > houseY - 160 && rx > midX - 100 && rx < midX + 100) return true;
                // Tronco del árbol
                let tree1X = 350;
                let tree1Y = this.getIslandY(tree1X);
                if (rx > tree1X - 5 && rx < tree1X + 5 && ry > tree1Y - 80 && ry < tree1Y) return true;
                break;
            }
            case 'SANTA_CRUZ': {
                const hutY = this.getIslandY(midX);
                // Cabaña
                if (rx > midX - 60 && rx < midX + 60 && ry > hutY - 80 && ry < hutY) return true;
                // Techo
                if (ry < hutY - 80 && ry > hutY - 130 && rx > midX - 80 && rx < midX + 80) return true;
                // Troncos de palmeras
                let palm1X = 300;
                let palm1Y = this.getIslandY(palm1X);
                if (rx > palm1X - 5 && rx < palm1X + 5 && ry > palm1Y - 90 && ry < palm1Y) return true;
                let palm2X = this.width - 300;
                let palm2Y = this.getIslandY(palm2X);
                if (rx > palm2X - 5 && rx < palm2X + 5 && ry > palm2Y - 85 && ry < palm2Y) return true;
                break;
            }
            case 'LUNA': {
                const baseY = this.getIslandY(midX);
                // Módulo lunar
                if (rx > midX - 50 && rx < midX + 50 && ry > baseY - 60 && ry < baseY) return true;
                // Poste bandera
                let flagX = midX + 120;
                let flagY = this.getIslandY(flagX);
                if (rx > flagX - 2 && rx < flagX + 2 && ry > flagY - 70 && ry < flagY) return true;
                break;
            }
            case 'SALAR': {
                const monoY = this.getIslandY(midX);
                // Monolito
                if (rx > midX - 30 && rx < midX + 30 && ry > monoY - 90 && ry < monoY) return true;
                // Techo del monolito
                if (ry < monoY - 90 && ry > monoY - 130 && rx > midX - 40 && rx < midX + 40) return true;
                // Cactus izquierdo
                let cactus1X = 380;
                let cactus1Y = this.getIslandY(cactus1X);
                if (rx > cactus1X - 6 && rx < cactus1X + 6 && ry > cactus1Y - 70 && ry < cactus1Y) return true;
                // Cactus derecho
                let cactus2X = this.width - 380;
                let cactus2Y = this.getIslandY(cactus2X);
                if (rx > cactus2X - 5 && rx < cactus2X + 5 && ry > cactus2Y - 60 && ry < cactus2Y) return true;
                break;
            }
        }
        return false;
    }

    /**
     * Calcula una posición segura de spawn encima del terreno.
     * @param {number} x - Coordenada X deseada
     * @returns {{x: number, y: number}} Posición segura encima del terreno
     */
    getSafeSpawnPosition(x) {
        // Clampear X dentro de la isla
        x = Phaser.Math.Clamp(x, this.islandStartX + 50, this.islandEndX - 50);
        
        if (this.getIslandY) {
            // Spawnear 60px ARRIBA de la superficie del terreno
            const terrainY = this.getIslandY(x);
            return { x: x, y: terrainY - 60 };
        }
        
        // Fallback
        return { x: x, y: 200 };
    }

    destroyTerrain(x, y, radius) {
        // 1. ACTUALIZAR LO VISUAL (Borrar del RenderTexture)
        this.eraserShape.clear();
        this.eraserShape.fillStyle(0xffffff, 1);
        this.eraserShape.fillCircle(0, 0, radius);
        
        // Usamos el modo de mezcla 'ERASE' nativo de Phaser
        this.rt.erase(this.eraserShape, x, y);

        // 2. ACTUALIZAR FÍSICAS (Remover bloques en el radio)
        for (let i = this.terrainBlocks.length - 1; i >= 0; i--) {
            let blockData = this.terrainBlocks[i];
            
            // Calculamos distancia desde el centro de la explosión al bloque
            let dist = Phaser.Math.Distance.Between(x, y, blockData.x, blockData.y);
            
            // Si el bloque está dentro del radio de destrucción, lo eliminamos
            if (dist <= radius) {
                // Remover del mundo físico de Matter
                this.scene.matter.world.remove(blockData.body);
                // Remover del arreglo
                this.terrainBlocks.splice(i, 1);
            }
        }
    }
}
