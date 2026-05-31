import Phaser from 'phaser';

/**
 * GameOverScene
 * Pantalla de fin de partida con estadísticas y opción de volver al menú.
 */
export class GameOverScene extends Phaser.Scene {
    constructor() {
        super('GameOverScene');
    }

    init(data) {
        this.winnerName = data.winnerName || 'Nadie';
        this.winnerTeam = data.winnerTeam || 'Desconocido';
        this.stats = data.stats || {};
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Fondo oscuro con overlay
        this.cameras.main.setBackgroundColor('#050510');

        // Partículas de victoria (confetti-like)
        const confettiGfx = this.make.graphics({ add: false });
        confettiGfx.fillStyle(0xffaa00, 1);
        confettiGfx.fillRect(0, 0, 8, 8);
        confettiGfx.generateTexture('confetti', 8, 8);
        confettiGfx.destroy();

        this.add.particles(width / 2, -20, 'confetti', {
            speed: { min: 50, max: 150 },
            angle: { min: 60, max: 120 },
            scale: { start: 1, end: 0.3 },
            lifespan: 4000,
            gravityY: 80,
            tint: [0xff4444, 0x4444ff, 0x44ff44, 0xffff00, 0xff00ff, 0x00ffff],
            frequency: 100,
            emitZone: {
                type: 'random',
                source: new Phaser.Geom.Rectangle(-width / 2, 0, width, 10),
            }
        });

        // Título "VICTORIA"
        const titleText = this.add.text(width / 2, height / 5, '¡VICTORIA!', {
            fontSize: '80px',
            fontStyle: 'bold',
            fill: '#ffaa00',
            fontFamily: 'monospace',
            shadow: { offsetX: 0, offsetY: 0, color: '#ff6600', blur: 30, stroke: true, fill: true }
        }).setOrigin(0.5).setAlpha(0);

        // Animación de entrada del título
        this.tweens.add({
            targets: titleText,
            alpha: 1,
            scale: { from: 0.5, to: 1 },
            duration: 800,
            ease: 'Back.easeOut'
        });

        // Nombre del ganador
        const winnerText = this.add.text(width / 2, height / 2 - 40, `${this.winnerName}`, {
            fontSize: '48px',
            fontStyle: 'bold',
            fill: '#00ffff',
            fontFamily: 'monospace',
            shadow: { offsetX: 0, offsetY: 0, color: '#00ccff', blur: 15, stroke: true, fill: true }
        }).setOrigin(0.5).setAlpha(0);

        const teamText = this.add.text(width / 2, height / 2 + 20, `Equipo: ${this.winnerTeam}`, {
            fontSize: '24px',
            fill: '#b0b0c0',
            fontFamily: 'monospace'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: [winnerText, teamText],
            alpha: 1,
            y: '-=20',
            duration: 600,
            delay: 500,
            ease: 'Power2'
        });

        // Estadísticas
        if (this.stats && Object.keys(this.stats).length > 0) {
            let statsStr = '--- ESTADÍSTICAS ---\n';
            for (let playerId in this.stats) {
                const s = this.stats[playerId];
                statsStr += `${s.name}: ${s.kills || 0} kills | ${s.damageDealt || 0} daño\n`;
            }

            this.add.text(width / 2, height / 2 + 100, statsStr, {
                fontSize: '18px',
                fill: '#cccccc',
                fontFamily: 'monospace',
                align: 'center',
                lineSpacing: 8
            }).setOrigin(0.5).setAlpha(0).setData('delay', true);

            // Fade in con delay
            this.time.delayedCall(1200, () => {
                this.children.each(child => {
                    if (child.getData && child.getData('delay')) {
                        this.tweens.add({ targets: child, alpha: 1, duration: 400 });
                    }
                });
            });
        }

        // Botón volver al menú
        const menuBtn = this.add.text(width / 2, height - 120, '> VOLVER AL MENÚ <', {
            fontSize: '32px',
            fill: '#ffffff',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive().setAlpha(0);

        this.tweens.add({
            targets: menuBtn,
            alpha: 1,
            duration: 400,
            delay: 1800
        });

        menuBtn.on('pointerover', () => {
            menuBtn.setStyle({ fill: '#ffaa00' });
            this.tweens.add({ targets: menuBtn, scale: 1.1, duration: 100 });
        });
        menuBtn.on('pointerout', () => {
            menuBtn.setStyle({ fill: '#ffffff' });
            this.tweens.add({ targets: menuBtn, scale: 1, duration: 100 });
        });
        menuBtn.on('pointerdown', () => {
            // Detener todas las escenas activas del juego
            this.scene.stop('UIScene');
            this.scene.stop('GameScene');
            this.scene.stop('GameOverScene');

            // Volver al menú HTML (emitir evento global)
            this.game.events.emit('returnToMenu');
        });

        // Botón reiniciar partida
        const retryBtn = this.add.text(width / 2, height - 70, '> REVANCHA <', {
            fontSize: '28px',
            fill: '#00ff88',
            fontFamily: 'monospace'
        }).setOrigin(0.5).setInteractive().setAlpha(0);

        this.tweens.add({
            targets: retryBtn,
            alpha: 1,
            duration: 400,
            delay: 2000
        });

        retryBtn.on('pointerover', () => {
            retryBtn.setStyle({ fill: '#00ffcc' });
            this.tweens.add({ targets: retryBtn, scale: 1.1, duration: 100 });
        });
        retryBtn.on('pointerout', () => {
            retryBtn.setStyle({ fill: '#00ff88' });
            this.tweens.add({ targets: retryBtn, scale: 1, duration: 100 });
        });
        retryBtn.on('pointerdown', () => {
            this.scene.stop('UIScene');
            this.scene.stop('GameOverScene');
            this.scene.start('GameScene');
        });
    }
}
