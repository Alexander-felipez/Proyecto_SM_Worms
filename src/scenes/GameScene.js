import Phaser from 'phaser';
import { TerrainManager } from '../systems/TerrainManager';
import { TurnManager } from '../systems/TurnManager';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { AimingSystem } from '../systems/AimingSystem';
import { ChargeSystem } from '../systems/ChargeSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { SoundManager } from '../systems/SoundManager';
import { GAME_CONFIG } from '../config/GameConfig';
import { getMapConfig } from '../config/MapConfig';
import { calcLaunchVelocityFromPower } from '../config/LaunchConfig';

/**
 * GameScene
 * Escena principal del juego. Maneja terreno, jugadores, turnos,
 * disparos, cámara, y sincronización de red.
 */
export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        this.socket = data.socket || null;
        this.isHost = data.isHost || false;
        
        // Si no hay red (Modo Entrenamiento), creamos 2 jugadores locales
        const selectedMap = this.registry.get('selectedMap') || 'el_alto';
        
        if (data.room) {
            this.room = data.room;
        } else {
            // Modo entrenamiento local: 2 jugadores dummy
            this.room = {
                players: [
                    { id: 'local_1', name: 'Jugador 1', team: 'RED' },
                    { id: 'local_2', name: 'Jugador 2', team: 'BLUE' },
                ],
                map: selectedMap,
                timeOfDay: 'dia',
            };
        }
        this.myId = data.myId || 'local_1';
        
        this.playersLookup = {};     // Diccionario para almacenar Player entities por ID
        this.turnManager = null;
        this.syncTimer = 0;
        this.currentPlayerIndex = 0;
        this._lastPhysAngle = null;
        this.chargeSystem = null;    // Sistema de carga con Espacio
    }

    create() {
        this.scene.launch('UIScene');
        
        // --- CONFIGURACIÓN DEL MAPA DESDE MapConfig ---
        const mapKey = this.room.map || 'el_alto';
        this.mapConfig = getMapConfig(mapKey);
        
        // Aplicar cielo y gravedad desde el mapa
        this.cameras.main.setBackgroundColor(this.mapConfig.skyColor);
        this.matter.world.setGravity(0, this.mapConfig.gravity);
        this.matter.world.setBounds(0, 0, GAME_CONFIG.MAP.DEFAULT_WIDTH, GAME_CONFIG.MAP.DEFAULT_HEIGHT, 100, true, true, false, true);
        
        // Almacenar hasWater para que Player pueda adaptar su muerte
        this.hasWater = this.mapConfig.hasWater;

        // Instanciar y crear terreno destructible
        this.terrainManager = new TerrainManager(this);
        this.terrainManager.createTerrain();

        // --- SISTEMA DE APUNTADO ---
        this.aimingSystem = new AimingSystem(this);

        // --- SISTEMA DE CARGA (Espacio) ---
        this.chargeSystem = new ChargeSystem(this);
        this.events.on('chargeReleased', ({ power, angle }) => {
            this._fireWithCharge(power, angle);
        });

        // --- CREAR MÚLTIPLES PERSONAJES ---
        const allPlayers = [];
        const totalPlayers = this.room.players.length;

        // ── Spawn central: todos los jugadores aparecen juntos en el centro del mapa ──
        const mapCenterX = (this.mapConfig.mapWidth || GAME_CONFIG.MAP.DEFAULT_WIDTH) / 2;
        // Separación horizontal pequeña entre jugadores (ej: -30, 0, +30 para 3 jugadores)
        const spawnSpreadX = 40; // píxeles entre cada jugador

        this.room.players.forEach((pData, index) => {
            let isLocal;
            
            if (this.socket) {
                // Modo multijugador: solo TU jugador es local
                isLocal = (pData.id === this.myId);
            } else {
                // Modo entrenamiento local: todos son "locales" (controlados por turnos)
                isLocal = true;
            }

            // Spawn centrado: el primer jugador queda un poco a la izquierda del centro,
            // el segundo un poco a la derecha, etc.
            const offset = (index - (totalPlayers - 1) / 2) * spawnSpreadX;
            let spawnX = mapCenterX + offset;
            const spawnPos = this.terrainManager.getSafeSpawnPosition(spawnX);
            
            let teamKey = pData.team || (index === 0 ? 'RED' : 'BLUE');
            let playerEntity = new Player(this, spawnPos.x, spawnPos.y, pData.id, pData.name, isLocal, this.isHost || !this.socket, teamKey);
            
            this.playersLookup[pData.id] = playerEntity;
            allPlayers.push(playerEntity);

            // Identificar MI jugador principal para la cámara (primer jugador en modo local)
            if (index === 0 && !this.socket) {
                this.myPlayer = playerEntity;
            } else if (pData.id === this.myId) {
                this.myPlayer = playerEntity;
            }
        });
        
        // Fallback por seguridad
        if (!this.myPlayer) this.myPlayer = Object.values(this.playersLookup)[0];

        // --- SISTEMA DE TURNOS ---
        this.turnManager = new TurnManager(this, this.isHost || !this.socket);
        this.turnManager.setPlayers(allPlayers);

        // Escuchar eventos del TurnManager
        this.turnManager.on('turnStarted', (data) => {
            const currentPlayer = data.player;
            if (currentPlayer) {
                this.currentWeaponKey = 'NONE';
                this.events.emit('weaponChanged', { weaponKey: 'NONE', ammo: null });
                if (this.cameraSystem) {
                    this.cameraSystem.followPlayer(currentPlayer.sprite);
                } else if (!this.introCinematicActive) {
                    this.cameras.main.startFollow(currentPlayer.sprite, true, 0.08, 0.08);
                }
                
                if (this.soundManager) {
                    this.soundManager.playTurnStart();
                }
            }
            // Resetear bloqueo post-disparo para todos los jugadores
            Object.values(this.playersLookup).forEach(p => { p.hasFired = false; });

            // --- Actualizar partículas de viento ambiental ---
            const wind = data.windSpeed || 0;
            // Destruir emitter anterior si existe
            if (this.windParticles) {
                this.windParticles.destroy();
                this.windParticles = null;
            }

            if (Math.abs(wind) > 0.00001) {
                const mapW = (this.mapConfig && this.mapConfig.mapWidth) || GAME_CONFIG.MAP.DEFAULT_WIDTH;
                const mapH = (this.mapConfig && this.mapConfig.mapHeight) || GAME_CONFIG.MAP.DEFAULT_HEIGHT;
                const windVelX = wind * 850000;
                const dir = Math.sign(wind);

                // Crear nuevo emitter con la velocidad correcta para este turno
                const emitX = dir > 0 ? -40 : mapW + 40;
                this.windParticles = this.add.particles(emitX, 0, 'smoke-particle', {
                    scale: { start: 0.05, end: 0.015 },
                    alpha: { start: 0.18, end: 0 },
                    lifespan: 5500,
                    frequency: 75,
                    quantity: 1,
                    tint: 0xeeeeee,
                    speedX: { min: windVelX * 0.8, max: windVelX * 1.2 },
                    speedY: { min: -8, max: 8 },
                    gravityY: 15,
                    emitZone: {
                        type: 'random',
                        source: new Phaser.Geom.Rectangle(0, 0, 5, mapH)
                    }
                });
                this.windParticles.setDepth(1);
            }

            if (!this.socket || this.isHost) {
                this.chargeSystem.enable();
            }
            this.scene.get('UIScene').events.emit('turnStarted', data);
        });

        this.turnManager.on('turnEnded', (data) => {
            this.aimingSystem.hide();
            this.chargeSystem.disable();
            this.scene.get('UIScene').events.emit('chargeUpdate', 0);
            this.scene.get('UIScene').events.emit('turnEnded', data);
            this.soundManager.playTurnEnd();
        });

        this.turnManager.on('turnTimeTick', (timeRemaining) => {
            this.scene.get('UIScene').events.emit('turnTimeTick', timeRemaining);
        });

        this.turnManager.on('gameOver', (data) => {
            this.soundManager.stopMusic();
            this.soundManager.playGameOver();
            // Recopilar estadísticas de todos los jugadores
            const stats = {};
            for (let id in this.playersLookup) {
                const p = this.playersLookup[id];
                stats[id] = {
                    name: p.name,
                    kills: p.stats.kills,
                    damageDealt: Math.round(p.stats.damageDealt),
                    damageTaken: Math.round(p.stats.damageTaken),
                };
            }

            // Esperar un momento antes de ir al Game Over
            this.time.delayedCall(2000, () => {
                this.scene.stop('UIScene');
                this.scene.start('GameOverScene', {
                    winnerName: data.winnerName,
                    winnerTeam: data.winnerTeam,
                    stats: stats,
                });
            });
        });

        // Escuchar muerte de jugadores
        this.events.on('playerDied', (deadPlayer) => {
            this.turnManager.onPlayerDied(deadPlayer);
        });

        // Escuchar explosiones (para auto-end turn después de disparar)
        this.events.on('explosionOccurred', () => {
            this.turnManager.onPlayerFired();
        });

        // Controles de entrada básicos
        this.cursors = this.input.keyboard.createCursorKeys();
        
        // Cambiar de arma (tecla Q — ciclo)
        this.input.keyboard.on('keydown-Q', () => {
            this.cycleWeapon();
        });

        // Teclas numéricas de selección directa
        this.input.keyboard.on('keydown-ONE',   () => this.setWeapon('NONE'));
        this.input.keyboard.on('keydown-TWO',   () => this.setWeapon('BAZOOKA'));
        this.input.keyboard.on('keydown-THREE', () => this.setWeapon('GRENADE'));
        this.input.keyboard.on('keydown-FOUR',  () => this.setWeapon('DYNAMITE'));

        // Registrar evento de clic en el HUD para cambiar arma
        this.events.on('hudWeaponClicked', (weaponKey) => {
            this.setWeapon(weaponKey);
        });
        
        // Mouse click para disparar
        this.input.on('pointerdown', (pointer) => {
            this.fireProjectile(pointer);
        });
        
        // Si somos clientes, recibir y actualizar estado del host
        if (this.socket && !this.isHost) {
            this.socket.on('stateUpdate', (state) => {
                this.updateFromHost(state);
            });
        }

        // --- PARTÍCULAS AMBIENTALES DE VIENTO ---
        // Se inicializa null; se crea/recrea en cada turno con las params adecuadas
        this.windParticles = null;
        this.windParticlesActive = false;

        // --- EVENTO REACTIVO DE SALPICADURA DE AGUA (Splash y Ondas) ---
        this.events.on('waterSplash', ({ x, y, force }) => {
            // 1. Gotas físicas de agua proyectadas hacia arriba
            const droplets = this.add.particles(x, y, 'smoke-particle', {
                speedY: { min: -100 * force, max: -220 * force },
                speedX: { min: -60 * force, max: 60 * force },
                scale: { start: 0.12 * force, end: 0.02 },
                alpha: { start: 0.8, end: 0 },
                tint: 0x90caf9, // Azul celeste traslúcido
                lifespan: { min: 400, max: 800 },
                gravityY: 450, // Gravedad
            });
            droplets.setDepth(6);
            droplets.explode(18);
            this.time.delayedCall(1000, () => droplets.destroy()); // Liberar memoria

            // 2. Ripple elíptico en la superficie
            const ripple = this.add.circle(x, y, 5, 0xe3f2fd, 0.55);
            ripple.setDepth(6);
            this.tweens.add({
                targets: ripple,
                scaleX: 12 * force,
                scaleY: 2.2 * force, // Ovalo aplanado
                alpha: 0,
                duration: 600,
                ease: 'Quad.easeOut',
                onComplete: () => ripple.destroy()
            });
        });
        
        // 🎥 CONFIGURAR CÁMARA SEGUIDORA
        const mapW = this.mapConfig.mapWidth || GAME_CONFIG.MAP.DEFAULT_WIDTH;
        const mapH = this.mapConfig.mapHeight || GAME_CONFIG.MAP.DEFAULT_HEIGHT;
        this.cameras.main.setBounds(0, 0, mapW, mapH);

        // 🎥 SISTEMA DE CÁMARA — delegar toda la lógica a CameraSystem (nuestra refact)
        this.cameraSystem = new CameraSystem(this);
        this.cameraSystem.init(this.mapConfig, this.myPlayer);

        // 🔊 SISTEMA DE SONIDO PROCEDURAL
        this.soundManager = new SoundManager(this);
        this.soundManager.startMusic();

        // ¡Comenzar el juego! (Lógica cinemática combinada con inicio de turnos)
        if (this.mapConfig.biome === 'SANTA_CRUZ') {
            this.introCinematicActive = true;
            
            // 1. Iniciar cámara con vista panorámica amplia centrada en el mapa
            this.cameras.main.setZoom(0.45);
            this.cameras.main.centerOn(mapW / 2, mapH / 2);
            
            // 2. Primera fase: Zoom suave hacia los jugadores en el centro
            this.cameras.main.pan(mapW / 2, mapH / 2, 3200, 'Cubic.easeInOut');
            this.cameras.main.zoomTo(1.0, 3200, 'Cubic.easeInOut');

            // 3. Segunda fase: Paneo y zoom de vuelta al jugador activo tras 3200ms
            this.time.delayedCall(3200, () => {
                const targetPlayer = this.myPlayer || Object.values(this.playersLookup)[0];
                const tx = targetPlayer ? targetPlayer.sprite.x : mapW / 2;
                const ty = targetPlayer ? targetPlayer.sprite.y : mapH / 2;
                
                this.cameras.main.pan(tx, ty, 1600, 'Sine.easeInOut');
                this.cameras.main.zoomTo(0.85, 1600, 'Sine.easeInOut');

                // 4. Tercera fase: Iniciar juego y seguimiento tras terminar el segundo paneo (1600ms adicionales)
                this.time.delayedCall(1600, () => {
                    this.introCinematicActive = false;
                    if (targetPlayer) {
                        this.cameraSystem.followPlayer(targetPlayer.sprite);
                    }
                    this.cameras.main.setDeadzone(120, 80);
                    this.turnManager.startGame();
                });
            });
        } else {
            // Comportamiento original rápido para otros mapas
            this.introCinematicActive = false;
            if (this.myPlayer) {
                this.cameraSystem.followPlayer(this.myPlayer.sprite);
            }
            this.time.delayedCall(1000, () => {
                this.turnManager.startGame();
            });
        }
    }

    fireProjectile(pointer) {
        // Solo el Host o el modo local puede disparar
        if (this.socket && !this.isHost) return;

        // Sin arma equipada: ignorar el clic
        if (!this.currentWeaponKey || this.currentWeaponKey === 'NONE') return;
        
        // Verificar que es el turno del jugador y que puede disparar
        const currentPlayer = this.turnManager.getCurrentPlayer();
        if (!currentPlayer) return;
        if (!this.turnManager.canFire()) return;

        // Verificar munición
        if (!currentPlayer.hasAmmo(this.currentWeaponKey)) {
            this.scene.get('UIScene').showAction('¡Sin munición para esta arma!');
            return;
        }

        const shooter = currentPlayer;

        // Descontar munición
        shooter.deductAmmo(this.currentWeaponKey);

        // Notificar a la UI
        this.events.emit('weaponChanged', {
            weaponKey: this.currentWeaponKey,
            ammo: shooter.ammo[this.currentWeaponKey]
        });

        // Crear proyectil con el arma seleccionada
        const proj = new Projectile(this, shooter.sprite.x, shooter.sprite.y, pointer.worldX, pointer.worldY, shooter, this.currentWeaponKey);

        // 🔊 Sonido de disparo
        this.soundManager.playShoot(this.currentWeaponKey);

        // 🎥 Cámara sigue al proyectil
        this.cameraSystem.followProjectile(proj.sprite, this.currentWeaponKey);

        // Bazooka y Granada: bloqueo inmediato
        // Dinamita: 5 segundos de movilidad para alejarse (mecha dura 4s)
        if (this.currentWeaponKey === 'DYNAMITE') {
            this.time.delayedCall(5000, () => {
                if (shooter.alive) shooter.hasFired = true;
            });
        } else {
            shooter.hasFired = true;
        }

        this.aimingSystem.hide();
    }
    
    syncStateToClients() {
        if (!this.socket || !this.isHost) return;
        
        // Empaquetar posiciones de TODOS
        const playersState = {};
        for (let id in this.playersLookup) {
            let pEntity = this.playersLookup[id];
            playersState[id] = { 
                x: pEntity.sprite.x, 
                y: pEntity.sprite.y,
                hp: pEntity.hp,
                alive: pEntity.alive,
            };
        }
        
        const gameState = {
            players: playersState,
            turn: this.turnManager.getTurnState(),
        };
        
        this.socket.emit('syncState', gameState);
    }
    
    updateFromHost(state) {
        if (!state.players) return;
        
        // Actualizar posiciones y HP desde el host
        for (let id in state.players) {
            let pData = state.players[id];
            let pEntity = this.playersLookup[id];
            if (pEntity) {
                pEntity.setPosition(pData.x, pData.y);
                // Sincronizar HP si cambió
                if (pData.hp !== undefined && pData.hp !== pEntity.hp) {
                    pEntity.hp = pData.hp;
                    pEntity.updateHpBar();
                }
            }
        }

        // Sincronizar turnos
        if (state.turn) {
            this.turnManager.syncFromHost(state.turn);
        }
    }

    update(time, delta) {
        if (this.terrainManager) {
            this.terrainManager.update(time, delta);
        }

        if (this.turnManager.isGameOver) return;

        // Update del TurnManager (countdown, etc.)
        this.turnManager.update(delta);

        // Update de jugadores: solo el jugador activo puede moverse
        Object.values(this.playersLookup).forEach(playerEntity => {
            const canAct = this.turnManager.canPlayerAct(playerEntity.id);
            playerEntity.update(this.cursors, canAct);
        });

        // --- SISTEMA DE APUNTADO + PANEL DE FÍSICAS ---
        const aimWeapons  = ['BAZOOKA', 'GRENADE'];
        const weaponReady = aimWeapons.includes(this.currentWeaponKey);
        const canShowAim  = weaponReady && this.turnManager.canFire() && (!this.socket || this.isHost);

        if (canShowAim) {
            const currentPlayer = this.turnManager.getCurrentPlayer();
            if (currentPlayer && currentPlayer.alive) {
                const wind = this.turnManager.windSpeed || 0;
                const physData = this.aimingSystem.update(
                    currentPlayer.sprite,
                    this.input.activePointer,
                    this.currentWeaponKey,
                    wind
                );
                if (physData && physData.angle !== this._lastPhysAngle) {
                    this._lastPhysAngle = physData.angle;
                    this.scene.get('UIScene').events.emit('updatePhysicsInfo', physData);
                }
            }
        } else {
            this.aimingSystem.hide();
            if (this._lastPhysAngle !== null) {
                this._lastPhysAngle = null;
                this.scene.get('UIScene').events.emit('updatePhysicsInfo', { active: false });
            }
        }

        // --- SISTEMA DE CARGA ---
        if (this.chargeSystem && this.currentWeaponKey !== 'NONE') {
            const power = this.chargeSystem.update();
            this.scene.get('UIScene').events.emit('chargeUpdate', power);
        }

        // Sync de red (solo host, cada N frames)
        if (this.isHost && this.socket) {
            this.syncTimer++;
            if (this.syncTimer >= GAME_CONFIG.NETWORK.SYNC_RATE) { 
                this.syncStateToClients();
                this.syncTimer = 0;
            }
        }
    }

    /**
     * Disparo por carga (Espacio). Usa el ángulo del ratón + potencia acumulada.
     */
    _fireWithCharge(power, angle) {
        if (!this.currentWeaponKey || this.currentWeaponKey === 'NONE') return;
        if (!this.turnManager.canFire()) return;
        if (this.socket && !this.isHost) return;

        const shooter = this.turnManager.getCurrentPlayer();
        if (!shooter || !shooter.alive) return;
        if (!shooter.hasAmmo(this.currentWeaponKey)) {
            this.scene.get('UIScene').showAction('¡Sin munición!');
            return;
        }

        shooter.deductAmmo(this.currentWeaponKey);
        this.events.emit('weaponChanged', {
            weaponKey: this.currentWeaponKey,
            ammo: shooter.ammo[this.currentWeaponKey],
        });

        // Calcular velocidad usando potencia manual en lugar de distancia de ratón
        const launch = calcLaunchVelocityFromPower(angle, power, this.currentWeaponKey);

        const proj = new Projectile(
            this,
            shooter.sprite.x, shooter.sprite.y,
            shooter.sprite.x + Math.cos(angle) * 100,
            shooter.sprite.y + Math.sin(angle) * 100,
            shooter,
            this.currentWeaponKey,
            launch
        );

        // 🔊 Sonido de disparo
        this.soundManager.playShoot(this.currentWeaponKey);

        // 🎥 Cámara sigue al proyectil
        this.cameraSystem.followProjectile(proj.sprite, this.currentWeaponKey);

        // Bloquear movimiento del jugador hasta el próximo turno
        if (this.currentWeaponKey === 'DYNAMITE') {
            this.time.delayedCall(5000, () => {
                if (shooter.alive) shooter.hasFired = true;
            });
        } else {
            shooter.hasFired = true;
        }

        this.aimingSystem.hide();
        this.chargeSystem.reset();
        this.scene.get('UIScene').events.emit('chargeUpdate', 0);
    }

    cycleWeapon() {
        const weapons = ['BAZOOKA', 'GRENADE', 'DYNAMITE'];
        const currentIndex = weapons.indexOf(this.currentWeaponKey);
        const nextIndex = (currentIndex + 1) % weapons.length;
        this.setWeapon(weapons[nextIndex]);
    }

    setWeapon(weaponKey) {
        const currentPlayer = this.turnManager.getCurrentPlayer();
        if (!currentPlayer) return;
        
        // Si hay socket (multijugador), solo permitir si eres tú
        if (this.socket && currentPlayer.id !== this.myId) return;

        this.currentWeaponKey = weaponKey;

        // 🔊 Sonido de cambio de arma
        if (weaponKey !== 'NONE') this.soundManager.playWeaponSwitch();

        // Limpiar mira de inmediato si el arma nueva no la necesita
        if (weaponKey === 'NONE' || weaponKey === 'DYNAMITE') {
            this.aimingSystem.hide();
        }

        this.events.emit('weaponChanged', {
            weaponKey: weaponKey,
            ammo: currentPlayer.ammo[weaponKey]
        });
    }
}