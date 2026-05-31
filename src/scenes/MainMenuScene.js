import Phaser from 'phaser';

export class MainMenuScene extends Phaser.Scene {
    constructor() {
        super('MainMenuScene');
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // Título cinematográfico
        this.add.text(width / 2, height / 4, 'BOLIVIA TACTICS 2D', {
            fontSize: '72px',
            fontStyle: 'bold',
            fill: '#00ffff',
            fontFamily: 'monospace',
            shadow: { offsetX: 0, offsetY: 0, color: '#00ccff', blur: 20, stroke: true, fill: true }
        }).setOrigin(0.5);

        // Opciones del Menú
        const options = [
            { text: '> ENTRENAMIENTO LOCAL <', action: () => this.scene.start('GameScene') },
            { text: '> CREAR SALA LAN <', action: () => this.scene.start('LobbyScene', { isHost: true }) },
            { text: '> UNIRSE A SALA <', action: () => this.scene.start('LobbyScene', { isHost: false }) }
        ];

        options.forEach((opt, index) => {
            const btn = this.add.text(width / 2, height / 2 + (index * 70), opt.text, {
                fontSize: '32px',
                fill: '#ffffff',
                fontFamily: 'monospace'
            }).setOrigin(0.5).setInteractive();

            btn.on('pointerdown', opt.action);
            btn.on('pointerover', () => {
                btn.setStyle({ fill: '#ffaa00' });
                // Efecto cinematográfico de scale
                this.tweens.add({ targets: btn, scale: 1.1, duration: 100 });
            });
            btn.on('pointerout', () => {
                btn.setStyle({ fill: '#ffffff' });
                this.tweens.add({ targets: btn, scale: 1, duration: 100 });
            });
        });
    }
}
