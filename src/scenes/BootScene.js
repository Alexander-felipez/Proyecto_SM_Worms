import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Cargar barra de progreso básica si aplica
    }

    create() {
        // Iniciar la cadena de carga
        this.scene.start('PreloadScene');
    }
}
