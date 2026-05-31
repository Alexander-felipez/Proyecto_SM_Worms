import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super('PreloadScene');
    }

    preload() {
        // --- CARGA DEL FONDO DEL MAPA SEGÚN CONFIGURACIÓN ---
        const options = this.registry.get('gameOptions') || {};
        const settings = options.settings || {};
        const mapType = settings.mapType || 'el_alto';

        // Carga la imagen de fondo adecuada. 
        if (mapType === 'luna') {
            this.load.image('bg', 'src/assets/backgrounds/mapa-lunar.png');
        } else if (mapType === 'santa_cruz') {
            this.load.image('bg', 'src/assets/backgrounds/mapa-oriente.png');
        } else {
            this.load.image('bg', 'src/assets/backgrounds/mapa-oriente.png'); // Placeholder general
        }

        // --- GENERACIÓN DE ASSETS PROCEDURALES PARA PROTOTIPO ---
        
        // 1. Textura Base del Personaje (Soldado simple)
        const charGfx = this.make.graphics({x: 0, y: 0, add: false});
        charGfx.fillStyle(0x444444, 1); // Cuerpo gris oscuro
        charGfx.fillRoundedRect(4, 10, 24, 22, 6);
        charGfx.fillStyle(0x111111, 1); // Casco/Cabeza
        charGfx.fillCircle(16, 12, 10);
        charGfx.fillStyle(0x00ffff, 1); // Ojo cibernético / visor (Neon)
        charGfx.fillRect(18, 8, 6, 4);
        charGfx.generateTexture('soldier', 32, 32);

        // 2. Partícula de Humo/Nube
        const smokeGfx = this.make.graphics({x: 0, y: 0, add: false});
        smokeGfx.fillStyle(0xffffff, 0.5);
        smokeGfx.fillCircle(16, 16, 16);
        smokeGfx.generateTexture('smoke-particle', 32, 32);
        
        // 3. Partícula de Fuego
        const fireGfx = this.make.graphics({x: 0, y: 0, add: false});
        fireGfx.fillStyle(0xff7700, 1);
        fireGfx.fillCircle(8, 8, 8);
        fireGfx.generateTexture('fire-particle', 16, 16);

        // 4. Textura de Tierra (Terrain Dirt)
        const dirtGfx = this.make.graphics({x: 0, y: 0, add: false});
        dirtGfx.fillStyle(0x4a3b2c, 1); // Marrón estético
        dirtGfx.fillRect(0, 0, 128, 128);
        dirtGfx.fillStyle(0x5e4b37, 1);
        for(let i=0; i<20; i++) {
            dirtGfx.fillRect(Phaser.Math.Between(0, 128), Phaser.Math.Between(0, 128), 10, 10);
        }
        dirtGfx.generateTexture('dirt-pattern', 128, 128);
    }

    create() {
        // Después de cargar los assets, iniciamos el GameScene
        this.scene.start('GameScene');
    }
}
