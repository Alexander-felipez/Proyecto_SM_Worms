import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';

/**
 * UIScene
 * Overlay de UI que muestra información del turno, HP, timer,
 * arma actual y jugador activo. Se actualiza dinámicamente
 * mediante eventos del TurnManager.
 */
export class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene', active: false });
    }

    create() {
        // --- Indicador de turno (esquina superior izquierda) ---
        this.turnIndicatorBg = this.add.rectangle(140, 35, 260, 50, 0x000000, 0.6)
            .setOrigin(0.5)
            .setStrokeStyle(2, 0x00ffff);

        this.turnText = this.add.text(20, 18, 'PREPARANDO...', {
            fontSize: '22px',
            color: '#00ff00',
            fontStyle: 'bold',
            fontFamily: 'monospace',
        });

        // --- Timer del turno ---
        this.timerBg = this.add.rectangle(140, 75, 260, 30, 0x000000, 0.5)
            .setOrigin(0.5);
        
        this.timerBar = this.add.rectangle(12, 63, 256, 22, 0x00ffff, 0.8)
            .setOrigin(0, 0);

        this.timerText = this.add.text(140, 75, '30s', {
            fontSize: '16px',
            color: '#ffffff',
            fontFamily: 'monospace',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        // --- Indicador de viento (futuro, por ahora placeholder) ---
        this.windText = this.add.text(20, 100, 'VIENTO: ---', {
            fontSize: '14px',
            color: '#b0b0c0',
            fontFamily: 'monospace',
        });
        
        // --- Arma actual (esquina superior derecha) ---
        const camWidth = this.cameras.main.width;
        
        this.weaponBg = this.add.rectangle(camWidth - 120, 35, 220, 50, 0x000000, 0.6)
            .setOrigin(0.5)
            .setStrokeStyle(2, 0xffaa00);

        this.weaponText = this.add.text(camWidth - 220, 18, 'Arma: BAZOOKA', {
            fontSize: '20px',
            color: '#ffaa00',
            fontStyle: 'bold',
            fontFamily: 'monospace',
        });

        // --- Indicador de acción (centro inferior) ---
        this.actionText = this.add.text(camWidth / 2, this.cameras.main.height - 40, '', {
            fontSize: '18px',
            color: '#ffffff',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 5, fill: true }
        }).setOrigin(0.5).setAlpha(0);

        // --- HP Panel (esquina inferior izquierda) ---
        this.hpTexts = {};

        // --- Escuchar eventos del GameScene / TurnManager ---
        this.events.on('turnStarted', (data) => {
            this.onTurnStarted(data);
        });

        this.events.on('turnEnded', (data) => {
            this.onTurnEnded(data);
        });

        this.events.on('turnTimeTick', (timeRemaining) => {
            this.onTimerTick(timeRemaining);
        });
    }

    /**
     * Cuando inicia un turno nuevo.
     */
    onTurnStarted(data) {
        const player = data.player;
        if (!player) return;

        // Actualizar texto del turno
        const teamData = GAME_CONFIG.TEAMS[player.teamKey] || GAME_CONFIG.TEAMS.RED;
        const colorHex = '#' + teamData.tint.toString(16).padStart(6, '0');
        
        this.turnText.setText(`TURNO: ${player.name}`);
        this.turnText.setColor(colorHex);
        this.turnIndicatorBg.setStrokeStyle(2, teamData.tint);

        // Reset timer visual
        this.timerBar.width = 256;
        this.timerBar.fillColor = 0x00ffff;
        this.timerText.setText('30s');

        // Mostrar indicación de acción
        this.showAction(`¡Turno de ${player.name}! Click para disparar`);

        // Efecto de flash en el indicador
        this.tweens.add({
            targets: this.turnIndicatorBg,
            alpha: { from: 0.3, to: 0.6 },
            duration: 300,
            yoyo: true,
            repeat: 1,
        });
    }

    /**
     * Cuando termina un turno.
     */
    onTurnEnded(data) {
        this.turnText.setText('CAMBIANDO...');
        this.turnText.setColor('#888888');
        this.hideAction();
    }

    /**
     * Actualización del timer.
     */
    onTimerTick(timeRemaining) {
        const seconds = Math.max(0, Math.ceil(timeRemaining / 1000));
        this.timerText.setText(`${seconds}s`);
        
        // Actualizar barra visual
        const percent = Math.max(0, timeRemaining / GAME_CONFIG.TURN.DURATION);
        this.timerBar.width = 256 * percent;

        // Cambiar color según tiempo restante
        if (percent > 0.5) {
            this.timerBar.fillColor = 0x00ffff;
        } else if (percent > 0.25) {
            this.timerBar.fillColor = 0xffaa00;
        } else {
            this.timerBar.fillColor = 0xff4444;
            // Parpadeo cuando queda poco
            if (seconds <= 5) {
                this.tweens.add({
                    targets: this.timerText,
                    scale: { from: 1, to: 1.3 },
                    duration: 200,
                    yoyo: true,
                });
            }
        }
    }

    /**
     * Muestra un texto de acción temporal en la parte inferior.
     */
    showAction(text) {
        this.actionText.setText(text);
        this.tweens.add({
            targets: this.actionText,
            alpha: { from: 0, to: 1 },
            y: this.cameras.main.height - 50,
            duration: 400,
            ease: 'Power2',
        });

        // Auto-hide después de 3 segundos
        this.time.delayedCall(3000, () => {
            this.hideAction();
        });
    }

    /**
     * Oculta el texto de acción.
     */
    hideAction() {
        this.tweens.add({
            targets: this.actionText,
            alpha: 0,
            duration: 300,
        });
    }
}
