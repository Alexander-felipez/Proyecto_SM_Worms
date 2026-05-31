import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super('PreloadScene');
    }

    preload() {
        // --- GENERACIÓN DE ASSETS PROCEDURALES PARA PROTOTIPO ---
        
        // 1. Texturas de Gusanitos Procedurales (por equipo)
        const teams = [
            { key: 'red', color: 0xff3333 },
            { key: 'blue', color: 0x3333ff },
            { key: 'green', color: 0x33ff33 }
        ];

        teams.forEach(t => {
            const charGfx = this.make.graphics({x: 0, y: 0, add: false});
            
            // A) Cuerpo del Gusanito Rosa (curvado y simpático)
            charGfx.fillStyle(0xff8da1, 1); // Rosa base
            charGfx.fillCircle(12, 24, 6);   // Cola/base trasera
            charGfx.fillCircle(15, 23, 6.5); // Cuerpo base
            charGfx.fillCircle(14, 16, 6);   // Pecho/cuerpo medio
            charGfx.fillCircle(16, 9, 6.5);  // Cabeza
            
            // Rellenar conexiones para formar la silueta lisa del gusano
            charGfx.fillRect(7, 20, 8, 4);
            charGfx.fillRect(9, 14, 8, 9);
            charGfx.fillRect(10, 8, 8, 8);
            
            // B) Segmentos del gusanito (líneas de textura)
            charGfx.lineStyle(1.5, 0xe05c75, 0.8);
            charGfx.beginPath();
            charGfx.arc(12, 24, 6, 0.5, 2.5);
            charGfx.strokePath();
            
            charGfx.beginPath();
            charGfx.arc(14, 16, 6, 0.2, 1.8);
            charGfx.strokePath();

            // C) Ojos grandes y divertidos
            // Ojo trasero
            charGfx.fillStyle(0xffffff, 1);
            charGfx.fillCircle(14, 7, 2.5);
            charGfx.fillStyle(0x000000, 1);
            charGfx.fillCircle(15, 7, 1.0); // Mirada

            // Ojo delantero (más grande)
            charGfx.fillStyle(0xffffff, 1);
            charGfx.fillCircle(19, 8, 3.2);
            charGfx.fillStyle(0x000000, 1);
            charGfx.fillCircle(20.2, 8, 1.2); // Mirando al frente (derecha)

            // D) Bandana Militar Táctica de Color de Equipo
            charGfx.fillStyle(t.color, 1);
            charGfx.fillRect(11, 11, 9, 3); // Cinta frente
            
            // Nudo trasero fluyendo hacia la izquierda
            charGfx.beginPath();
            charGfx.moveTo(11, 12);
            charGfx.lineTo(5, 14);
            charGfx.lineTo(6, 17);
            charGfx.lineTo(11, 14);
            charGfx.closePath();
            charGfx.fillPath();

            charGfx.generateTexture(`soldier_${t.key}`, 32, 32);
            charGfx.destroy();
        });

        // 2. Partícula de Humo/Nube
        const smokeGfx = this.make.graphics({x: 0, y: 0, add: false});
        smokeGfx.fillStyle(0xffffff, 0.5);
        smokeGfx.fillCircle(16, 16, 16);
        smokeGfx.generateTexture('smoke-particle', 32, 32);
        smokeGfx.destroy();
        
        // 3. Partícula de Fuego
        const fireGfx = this.make.graphics({x: 0, y: 0, add: false});
        fireGfx.fillStyle(0xff7700, 1);
        fireGfx.fillCircle(8, 8, 8);
        fireGfx.generateTexture('fire-particle', 16, 16);
        fireGfx.destroy();

        // 4. Textura de Granada
        const grenadeGfx = this.make.graphics({x: 0, y: 0, add: false});
        grenadeGfx.fillStyle(0x388e3c, 1); // Verde militar
        grenadeGfx.fillCircle(8, 8, 6);
        grenadeGfx.fillStyle(0x888888, 1); // Pin plateado
        grenadeGfx.fillRect(6, 1, 4, 2);
        grenadeGfx.generateTexture('grenadeTexture', 16, 16);
        grenadeGfx.destroy();

        // 5. Textura de Dinamita
        const dynamiteGfx = this.make.graphics({x: 0, y: 0, add: false});
        dynamiteGfx.fillStyle(0xcc2222, 1); // Rojo dinamita
        dynamiteGfx.fillRect(5, 3, 6, 11);
        dynamiteGfx.fillStyle(0x000000, 1); // Bandas negras
        dynamiteGfx.fillRect(5, 6, 6, 1);
        dynamiteGfx.fillRect(5, 10, 6, 1);
        dynamiteGfx.fillStyle(0xffaa00, 1); // Mecha
        dynamiteGfx.fillRect(7, 0, 2, 3);
        dynamiteGfx.generateTexture('dynamiteTexture', 16, 16);
        dynamiteGfx.destroy();

        // 6. Textura de Bazuca (Arma para sujetar)
        const bazookaGfx = this.make.graphics({x: 0, y: 0, add: false});
        bazookaGfx.fillStyle(0x333333, 1); // Tubo de cañón principal
        bazookaGfx.fillRect(0, 4, 20, 8);
        bazookaGfx.fillStyle(0x78909c, 1); // Detalles metálicos
        bazookaGfx.fillRect(16, 2, 4, 12); // Boca (frente)
        bazookaGfx.fillRect(2, 5, 14, 2); // Línea decorativa
        bazookaGfx.fillStyle(0x556633, 1); // Mango
        bazookaGfx.fillRect(4, 12, 4, 4);
        bazookaGfx.generateTexture('bazookaWeapon', 20, 16);
        bazookaGfx.destroy();

        // ── Assets de Santa Cruz (generados con IA) ──
        // Se cargan con error-handler para no romper si el archivo no existe.
        this.load.on('loaderror', (file) => {
            console.warn(`[PreloadScene] Asset no encontrado: ${file.key} (${file.src}) — se usará fallback procedimental.`);
            const messageEl = document.getElementById('error-message');
            const consoleEl = document.getElementById('error-console');
            if (messageEl && consoleEl) {
                consoleEl.style.display = 'block';
                const currentText = messageEl.textContent;
                messageEl.textContent = (currentText ? currentText + '\n' : '') + `⚠️ [Phaser Loader Error] No se pudo cargar el asset "${file.key}" desde la ruta "${file.src}". Asegúrate de que el archivo existe en public/assets/images/.`;
            }
        });

        const buster = `?t=${Date.now()}`;
        this.load.image('sky_sunset',   'assets/images/sky_sunset.png' + buster);
        this.load.image('terrain_dirt', 'assets/images/terrain_dirt.png' + buster);
        this.load.image('terrain_grass','assets/images/terrain_grass4.png' + buster);
        this.load.image('sprite_palm',  'assets/images/sprite_palm.png' + buster);
        this.load.image('sprite_billboard', 'assets/images/welcome_sign.png' + buster);
        this.load.image('sprite_crane', 'assets/images/crane.png' + buster);
        this.load.image('sprite_hut', 'assets/images/el_aljibe_hut.png' + buster);
        this.load.image('sprite_antenna', 'assets/images/radio_tower.png' + buster);
    }

    create() {
        // Después de cargar los assets, iniciamos el GameScene
        this.scene.start('GameScene');
    }
}
