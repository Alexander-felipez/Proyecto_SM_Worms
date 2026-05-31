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
        // --- 1. PANEL DE TURNO (Glassmorphism) ---
        // Panel izquierdo superior
        this.turnPanelGfx = this.drawGlassPanel(10, 10, 260, 80, 0x00ffff);
        
        // Indicador de barra de color de equipo lateral
        this.teamBar = this.add.rectangle(15, 18, 6, 64, 0x00ff88, 1).setOrigin(0);

        this.turnText = this.add.text(32, 20, 'PREPARANDO...', {
            fontSize: '18px',
            color: '#00ff88',
            fontStyle: 'bold',
            fontFamily: 'Chakra Petch, monospace',
        });

        // Barra de timer
        this.timerBg = this.add.rectangle(32, 58, 226, 16, 0x000000, 0.4).setOrigin(0);
        this.timerBar = this.add.rectangle(34, 60, 222, 12, 0x00ffff, 0.95).setOrigin(0);
        
        this.timerText = this.add.text(145, 58, '30s', {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: 'monospace',
            fontStyle: 'bold',
        }).setOrigin(0.5, 0);

        // --- 2. PANEL DE VIENTO + FÍSICAS (Glassmorphism) ---
        this.windPanelGfx = this.drawGlassPanel(10, 96, 260, 168, 0x00ffff);
        
        this.windText = this.add.text(22, 102, 'VIENTO: CALMA', {
            fontSize: '13px',
            color: '#b0b0c0',
            fontStyle: 'bold',
            fontFamily: 'Chakra Petch, monospace',
        });
        
        this.windGfx = this.add.graphics();

        // --- PANEL DE FÍSICAS EN VIVO (debajo del viento) ---
        // Separador
        this.physSepGfx = this.add.graphics();
        this.physSepGfx.lineStyle(1, 0x334455, 0.7);
        this.physSepGfx.lineBetween(20, 152, 260, 152);

        // Título
        this.add.text(22, 156, 'FÍSICAS DEL DISPARO', {
            fontSize: '10px',
            color: '#445566',
            fontStyle: 'bold',
            fontFamily: 'Chakra Petch, monospace',
        });

        // Fórmulas estáticas
        this.add.text(22, 170, 'Vx = V·cos(θ)   Vy = V·sin(θ) + G', {
            fontSize: '9px',
            color: '#334455',
            fontFamily: 'monospace',
        });

        // Datos dinámicos — arrancan en guiones hasta que el jugador apunte
        this.physAngleText = this.add.text(22, 183, 'Ángulo  :  —', {
            fontSize: '11px', color: '#7799bb', fontFamily: 'Chakra Petch, monospace',
        });
        this.physSpeedText = this.add.text(22, 197, 'Fuerza  :  —', {
            fontSize: '11px', color: '#7799bb', fontFamily: 'Chakra Petch, monospace',
        });
        this.physVxText    = this.add.text(22, 211, 'Vx      :  —', {
            fontSize: '11px', color: '#556677', fontFamily: 'monospace',
        });
        this.physVyText    = this.add.text(140, 211, 'Vy  :  —', {
            fontSize: '11px', color: '#556677', fontFamily: 'monospace',
        });
        this.physWindText  = this.add.text(22, 225, 'Viento  :  —', {
            fontSize: '11px', color: '#557799', fontFamily: 'Chakra Petch, monospace',
        });

        // Escuchar datos de físicas en vivo desde GameScene
        this.events.on('updatePhysicsInfo', (data) => {
            this.onPhysicsUpdate(data);
        });

        // --- BARRA DE CARGA (Espacio) ---
        // Se dibuja sobre el personaje activo; se oculta cuando power=0
        this.chargeBarContainer = this.add.container(0, 0).setDepth(30).setVisible(false);

        const barBg = this.add.rectangle(0, 0, 54, 10, 0x000000, 0.6).setOrigin(0.5);
        this.chargeBarFill = this.add.rectangle(-27, 0, 0, 8, 0x00ff88, 1).setOrigin(0, 0.5);
        this.chargeBarBorder = this.add.graphics();
        this.chargeBarBorder.lineStyle(1.5, 0xffffff, 0.6);
        this.chargeBarBorder.strokeRect(-27, -4, 54, 8);

        this.chargeLabel = this.add.text(0, -14, 'CARGANDO...', {
            fontSize: '9px', fontFamily: 'Chakra Petch, monospace',
            color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5, 1);

        this.chargeBarContainer.add([barBg, this.chargeBarFill, this.chargeBarBorder, this.chargeLabel]);

        this.events.on('chargeUpdate', (power) => {
            this._updateChargeBar(power);
        });

        // --- 3. PANEL DE ARSENAL (Glassmorphism) ---
        const camWidth = this.cameras.main.width;
        this.weaponPanelGfx = this.drawGlassPanel(camWidth - 280, 10, 270, 80, 0xffaa00);
        
        // Crear selector de armas interactivo
        this.createWeaponSelector();

        // --- 4. INDICADOR DE ACCIÓN (Centro Inferior) ---
        this.actionText = this.add.text(camWidth / 2, this.cameras.main.height - 40, '', {
            fontSize: '18px',
            color: '#ffffff',
            fontFamily: 'Chakra Petch, monospace',
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 6, fill: true }
        }).setOrigin(0.5).setAlpha(0);

        // --- 5. PARTÍCULAS AMBIENTALES flotantes de fondo ---
        // Le da una atmósfera premium espacial/andina flotando suavemente en la UI
        this.addAmbientParticles();

        // --- ESCUCHAR EVENTOS ---
        this.events.on('turnStarted', (data) => {
            this.onTurnStarted(data);
        });

        this.events.on('turnEnded', (data) => {
            this.onTurnEnded(data);
        });

        this.events.on('turnTimeTick', (timeRemaining) => {
            this.onTimerTick(timeRemaining);
        });

        // Registrar listener del GameScene para cambios de arma
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
            gameScene.events.on('weaponChanged', (data) => {
                this.updateWeaponHUD(data.weaponKey, data.ammo);
            });
        }
    }

    drawGlassPanel(x, y, w, h, strokeColor = 0x00ffff) {
        const gfx = this.add.graphics();
        
        // Fondo translúcido oscuro
        gfx.fillStyle(0x060a1c, 0.65);
        gfx.fillRoundedRect(x, y, w, h, 10);
        
        // Borde neón brillante fino
        gfx.lineStyle(1.5, strokeColor, 0.6);
        gfx.strokeRoundedRect(x, y, w, h, 10);
        
        return gfx;
    }

    addAmbientParticles() {
        if (this.textures.exists('fire-particle')) {
            this.add.particles(0, 0, 'fire-particle', {
                x: { min: 0, max: this.cameras.main.width },
                y: { min: 0, max: 200 },
                speedY: { min: 2, max: 8 },
                speedX: { min: -5, max: 5 },
                scale: { start: 0.1, end: 0.2 },
                alpha: { start: 0.1, end: 0.3 },
                lifespan: 10000,
                frequency: 1500,
                blendMode: 'ADD'
            });
        }
    }

    createWeaponSelector() {
        const camWidth = this.cameras.main.width;
        const startX = camWidth - 275;
        const startY = 15;
        const itemW = 80;
        const itemH = 70;
        const spacing = 5;
        
        this.weaponBoxes = {};
        
        const weapons = [
            { key: 'BAZOOKA', label: 'BAZ', color: '#ffea00' },
            { key: 'GRENADE', label: 'GRN', color: '#00ff88' },
            { key: 'DYNAMITE', label: 'DYN', color: '#ff3333' }
        ];
        
        weapons.forEach((w, index) => {
            const wx = startX + index * (itemW + spacing);
            const wy = startY;
            
            // Zona interactiva de Phaser
            const zone = this.add.rectangle(wx + itemW/2, wy + itemH/2, itemW, itemH, 0x000000, 0.01)
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true });
            
            // Gráficos individuales de la caja
            const boxGfx = this.add.graphics();
            
            // Etiqueta del arma
            const label = this.add.text(wx + itemW/2, wy + 20, w.label, {
                fontSize: '15px',
                fontFamily: 'Chakra Petch, monospace',
                fontStyle: 'bold',
                color: '#ffffff'
            }).setOrigin(0.5);
            
            // Texto de munición
            const ammoText = this.add.text(wx + itemW/2, wy + 48, '', {
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#888899',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            
            this.weaponBoxes[w.key] = { 
                gfx: boxGfx, 
                label: label, 
                ammoText: ammoText, 
                zone: zone, 
                x: wx, 
                y: wy, 
                w: itemW, 
                h: itemH, 
                cfg: w 
            };
            
            // Evento de clic
            zone.on('pointerdown', () => {
                const gameScene = this.scene.get('GameScene');
                if (gameScene) {
                    gameScene.events.emit('hudWeaponClicked', w.key);
                }
            });
            
            // Efecto Hover
            zone.on('pointerover', () => {
                this.hoverBox(w.key, true);
            });
            zone.on('pointerout', () => {
                this.hoverBox(w.key, false);
            });
        });
        
        this.updateWeaponHUD('NONE', null);
    }

    hoverBox(key, isHover) {
        const gameScene = this.scene.get('GameScene');
        const activeKey = (gameScene && gameScene.currentWeaponKey) || 'BAZOOKA';
        if (key === activeKey) return; // Mantener resaltado activo
        
        const box = this.weaponBoxes[key];
        box.gfx.clear();
        
        box.gfx.fillStyle(isHover ? 0x1a223f : 0x000000, 0.3);
        box.gfx.fillRoundedRect(box.x, box.y, box.w, box.h, 8);
        
        box.gfx.lineStyle(1.5, isHover ? 0x00ffff : 0x444455, isHover ? 0.8 : 0.5);
        box.gfx.strokeRoundedRect(box.x, box.y, box.w, box.h, 8);
    }

    updateWeaponHUD(activeKey, currentAmmo) {
        // Con NONE todas las cajas se apagan — nadie está seleccionado
        const noneSelected = (!activeKey || activeKey === 'NONE');

        for (let key in this.weaponBoxes) {
            const box = this.weaponBoxes[key];
            box.gfx.clear();
            
            const isActive = !noneSelected && (key === activeKey);
            
            // Fondo de la caja
            box.gfx.fillStyle(isActive ? 0x11223f : 0x000000, noneSelected ? 0.2 : 0.4);
            box.gfx.fillRoundedRect(box.x, box.y, box.w, box.h, 8);
            
            // Borde brillante o apagado
            const borderClr   = isActive ? 0xffaa00 : 0x333344;
            const borderAlpha = isActive ? 1.0 : (noneSelected ? 0.25 : 0.5);
            const thickness   = isActive ? 2.5 : 1;
            
            box.gfx.lineStyle(thickness, borderClr, borderAlpha);
            box.gfx.strokeRoundedRect(box.x, box.y, box.w, box.h, 8);
            
            // Color de etiqueta
            box.label.setColor(isActive ? box.cfg.color : (noneSelected ? '#555566' : '#a0a0c0'));
            
            // Cantidad de munición
            let ammoStr = key === 'BAZOOKA' ? 'INF' : `x${box.ammoText.getData('ammo') ?? GAME_CONFIG.WEAPONS[key].ammo}`;
            if (isActive && currentAmmo !== undefined) {
                ammoStr = key === 'BAZOOKA' ? 'INF' : `x${currentAmmo}`;
                box.ammoText.setData('ammo', currentAmmo);
            }
            
            box.ammoText.setText(noneSelected ? '' : ammoStr);
            box.ammoText.setColor(isActive ? '#ffffff' : '#777788');
        }
    }

    onTurnStarted(data) {
        const player = data.player;
        if (!player) return;

        const teamData = GAME_CONFIG.TEAMS[player.teamKey] || GAME_CONFIG.TEAMS.RED;
        const colorHex = '#' + teamData.tint.toString(16).padStart(6, '0');
        
        this.turnText.setText(`TURNO: ${player.name.toUpperCase()}`);
        this.turnText.setColor(colorHex);
        this.teamBar.fillColor = teamData.tint;

        // Reset visual timer
        this.timerBar.width = 222;
        this.timerBar.fillColor = 0x00ffff;
        this.timerText.setText('30s');

        // Mostrar indicador de acción
        this.showAction(`¡TURNO DE ${player.name.toUpperCase()}! CLICK PARA DISPARAR`);
        
        // Actualizar indicador de viento
        this.updateWindIndicator(data.windSpeed || 0);

        // Micro-animación de entrada al cambiar panel
        this.tweens.add({
            targets: this.teamBar,
            scaleX: { from: 2, to: 1 },
            duration: 200,
        });
    }

    onTurnEnded(data) {
        this.turnText.setText('CAMBIANDO...');
        this.turnText.setColor('#888888');
        this.hideAction();
    }

    onTimerTick(timeRemaining) {
        const seconds = Math.max(0, Math.ceil(timeRemaining / 1000));
        this.timerText.setText(`${seconds}s`);
        
        const percent = Math.max(0, timeRemaining / GAME_CONFIG.TURN.DURATION);
        this.timerBar.width = 222 * percent;

        if (percent > 0.5) {
            this.timerBar.fillColor = 0x00ffff;
        } else if (percent > 0.25) {
            this.timerBar.fillColor = 0xffaa00;
        } else {
            this.timerBar.fillColor = 0xff4444;
            if (seconds <= 5) {
                this.tweens.add({
                    targets: this.timerText,
                    scale: { from: 1, to: 1.25 },
                    duration: 150,
                    yoyo: true,
                });
            }
        }
    }

    updateWindIndicator(windSpeed) {
        this.windGfx.clear();
        
        const baseX = 20;
        const baseY = 130;
        const maxW = 100; // Ancho máximo hacia cada lado
        
        // Línea base del indicador de viento
        this.windGfx.lineStyle(1.5, 0x444466, 0.6);
        this.windGfx.lineBetween(baseX + 10, baseY, baseX + 210, baseY);
        
        // Punto central (Calma)
        this.windGfx.fillStyle(0xffffff, 0.7);
        this.windGfx.fillCircle(baseX + 110, baseY, 3.5);
        
        // Calcular porcentaje e intensidad
        const maxWindValue = GAME_CONFIG.WIND.MAX;
        const percent = Math.min(1, Math.max(-1, windSpeed / maxWindValue)); // Rango -1 a 1
        const windPixels = percent * maxW;
        
        if (Math.abs(windPixels) > 1) {
            let color = 0x00ffff; // Suave (Cyan)
            const absPercent = Math.abs(percent);
            
            if (absPercent > 0.7) {
                color = 0xff3333; // Fuerte (Rojo)
            } else if (absPercent > 0.35) {
                color = 0xffaa00; // Moderado (Naranja)
            }
            
            // Dibujar barra de viento coloreada
            this.windGfx.lineStyle(3, color, 0.95);
            this.windGfx.lineBetween(baseX + 110, baseY, baseX + 110 + windPixels, baseY);
            
            // Flecha de dirección
            const arrowX = baseX + 110 + windPixels;
            const arrowDir = windPixels > 0 ? 1 : -1;
            this.windGfx.fillStyle(color, 0.95);
            this.windGfx.beginPath();
            this.windGfx.moveTo(arrowX, baseY - 5);
            this.windGfx.lineTo(arrowX + arrowDir * 6, baseY);
            this.windGfx.lineTo(arrowX, baseY + 5);
            this.windGfx.closePath();
            this.windGfx.fillPath();
        }
        
        // Actualizar texto informativo
        const kmh = Math.round(Math.abs(percent) * 60); // Escala 0-60 km/h
        const dirText = percent > 0 ? '➔ DERECHA' : percent < 0 ? '➔ IZQUIERDA' : 'CALMA';
        
        this.windText.setText(`VIENTO: ${kmh} KM/H ${dirText}`);
        if (kmh > 40) {
            this.windText.setColor('#ff3333');
        } else if (kmh > 20) {
            this.windText.setColor('#ffaa00');
        } else if (kmh > 0) {
            this.windText.setColor('#00ffff');
        } else {
            this.windText.setColor('#888899');
        }
    }

    showAction(text) {
        this.actionText.setText(text);
        this.tweens.add({
            targets: this.actionText,
            alpha: { from: 0, to: 1 },
            y: this.cameras.main.height - 50,
            duration: 400,
            ease: 'Power2',
        });

        this.time.delayedCall(3000, () => {
            this.hideAction();
        });
    }

    hideAction() {
        this.tweens.add({
            targets: this.actionText,
            alpha: 0,
            duration: 300,
        });
    }

    /**
     * Dibuja la barra de carga sobre el jugador activo.
     * power: 0 → ocultar, 0-1 → mostrar con color verde→rojo
     */
    _updateChargeBar(power) {
        if (!power || power <= 0) {
            this.chargeBarContainer.setVisible(false);
            return;
        }

        const gameScene = this.scene.get('GameScene');
        const player = gameScene && gameScene.turnManager && gameScene.turnManager.getCurrentPlayer();
        if (!player || !player.alive || !player.sprite) {
            this.chargeBarContainer.setVisible(false);
            return;
        }

        // Convertir posición del mundo a coordenadas de pantalla
        const cam = gameScene.cameras.main;
        const sx = (player.sprite.x - cam.scrollX) * cam.zoom;
        const sy = (player.sprite.y - cam.scrollY) * cam.zoom - 55;

        this.chargeBarContainer.setPosition(sx, sy).setVisible(true);

        // Ancho de la barra (max 54px)
        this.chargeBarFill.width = power * 54;

        const color = power < 0.4 ? 0x00ff88 : power < 0.75 ? 0xffdd00 : 0xff4444;
        this.chargeBarFill.fillColor = color;

        this.chargeLabel.setText(`${Math.round(power * 100)}%`);
        this.chargeLabel.setColor(power > 0.75 ? '#ff4444' : '#ffffff');
    }

    /**
     * Actualiza los datos de físicas en vivo.
     * Llamado desde GameScene vía evento 'updatePhysicsInfo'.
     * data: { angle, speed, vx, vy, wind, active }
     */
    onPhysicsUpdate(data) {
        if (!data.active) {
            // Sin arma activa o turno inactivo — mostrar guiones
            this.physAngleText.setText('Ángulo  :  —').setColor('#445566');
            this.physSpeedText.setText('Fuerza  :  —').setColor('#445566');
            this.physVxText.setText('Vx      :  —').setColor('#445566');
            this.physVyText.setText('Vy  :  —').setColor('#445566');
            this.physWindText.setText('Viento  :  —').setColor('#445566');
            return;
        }

        const deg   = Math.round(data.angle);
        const spd   = data.speed.toFixed(1);
        const vx    = data.vx.toFixed(1);
        const vy    = data.vy.toFixed(1);
        const kmh   = Math.round(Math.abs(data.wind / GAME_CONFIG.WIND.MAX) * 60);
        const wDir  = data.wind > 0.00001 ? '→' : data.wind < -0.00001 ? '←' : '~';

        // Color de fuerza: verde → amarillo → rojo
        const pct = data.speed / 22; // 22 = max speed de LaunchConfig
        const speedColor = pct < 0.4 ? '#00ff88' : pct < 0.75 ? '#ffdd00' : '#ff4444';

        this.physAngleText.setText(`Ángulo  :  ${deg}°`).setColor('#aaccee');
        this.physSpeedText.setText(`Fuerza  :  ${spd} px/f`).setColor(speedColor);
        this.physVxText.setText(`Vx      :  ${vx}`).setColor('#7788aa');
        this.physVyText.setText(`Vy  :  ${vy}`).setColor('#7788aa');
        this.physWindText.setText(`Viento  :  ${kmh} km/h ${wDir}`).setColor('#5599bb');
    }
}
    