// Gestor del Juego Phaser
import Phaser from 'phaser';
import { BootScene } from '../src/scenes/BootScene.js';
import { PreloadScene } from '../src/scenes/PreloadScene.js';
import { GameScene } from '../src/scenes/GameScene.js';
import { UIScene } from '../src/scenes/UIScene.js';
import { GameOverScene } from '../src/scenes/GameOverScene.js';

export class GameManager {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = options;
        this.game = null;
        this.initGame();
    }

    initGame() {
        const config = {
            type: Phaser.AUTO,
            scale: {
                mode: Phaser.Scale.FIT,
                parent: this.containerId,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: 1280,
                height: 720
            },
            physics: {
                default: 'matter',
                matter: {
                    gravity: { y: 1 },
                    debug: false
                }
            },
            scene: [BootScene, PreloadScene, GameScene, UIScene, GameOverScene],
            pixelArt: false,
            backgroundColor: '#000000',
            render: {
                antialias: true,
                antialiasGL: true
            }
        };

        this.game = new Phaser.Game(config);

        // Pasar opciones a las escenas
        this.game.registry.set('gameOptions', this.options);
        this.game.registry.set('selectedMap', this.options.map || (this.options.settings && this.options.settings.map) || 'el_alto');

        // Escuchar evento de "volver al menú" desde GameOverScene
        this.game.events.on('returnToMenu', () => {
            this.destroy();
            // Emitir evento global para que navigation.js lo capture
            window.dispatchEvent(new CustomEvent('gameReturnToMenu'));
        });

        // FIT mode maneja el redimensionamiento automáticamente
    }

    destroy() {
        if (this.game) {
            this.game.destroy(true);
            this.game = null;
        }
    }

    getGame() {
        return this.game;
    }
}
