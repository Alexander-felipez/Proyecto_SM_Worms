import Phaser from 'phaser';
import { TerrainManager } from '../systems/TerrainManager';
import { TurnManager } from '../systems/TurnManager';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { GAME_CONFIG } from '../config/GameConfig';

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
        // Proteger contra data undefined (PreloadScene no pasa data)
        data = data || {};

        this.socket = data.socket || null;
        this.isHost = data.isHost || false;
        
        // Leer opciones del registry (puestas por GameManager desde navigation.js)
        const gameOptions = this.game.registry.get('gameOptions') || {};
        const settings = gameOptions.settings || {};

        // Si no hay red (Modo Entrenamiento), creamos 2 jugadores locales
        if (data.room) {
            this.room = data.room;
        } else {
            // Modo entrenamiento local: 2 jugadores dummy
            this.room = {
                players: [
                    { id: 'local_1', name: 'Jugador 1', team: 'RED' },
                    { id: 'local_2', name: 'Jugador 2', team: 'BLUE' },
                ],
                map: settings.mapType || 'el_alto',
                timeOfDay: settings.timeOfDay || 'dia',
            };
        }
        this.myId = data.myId || 'local_1';
        
        this.playersLookup = {};     // Diccionario para almacenar Player entities por ID
        this.turnManager = null;
        this.syncTimer = 0;          // FIX: inicializar syncTimer
        this.currentPlayerIndex = 0; // Para control local en modo entrenamiento
    }

    create() {
        this.scene.launch('UIScene');
        
        // --- CONFIGURACIÓN DEL MAPA Y CLIMA ---
        let mapName = this.room.map || 'el_alto'; 
        let timeOfDay = this.room.timeOfDay || 'dia';
        let gravityY = 1; // Gravedad Normal Terrestre
        
        // Aplicar configuración del bioma
        const biomeKey = mapName.toUpperCase().replace(' ', '_');
        const biome = GAME_CONFIG.BIOMES[biomeKey] || GAME_CONFIG.BIOMES.EL_ALTO;
        
        const bgColor = timeOfDay === 'dia' ? biome.bgColorDay : biome.bgColorNight;
        this.cameras.main.setBackgroundColor(bgColor);
        gravityY = biome.gravity;

        // Aplicamos la gravedad seleccionada
        this.matter.world.setGravity(0, gravityY);
        this.matter.world.setBounds(0, 0, GAME_CONFIG.MAP.DEFAULT_WIDTH, GAME_CONFIG.MAP.DEFAULT_HEIGHT, 100, true, true, false, true);

        // --- DIBUJAR FONDO ---
        if (this.textures.exists('bg')) {
            const bg = this.add.image(GAME_CONFIG.MAP.DEFAULT_WIDTH / 2, GAME_CONFIG.MAP.DEFAULT_HEIGHT / 2, 'bg');
            // Hacer que se mueva ligeramente menos que la cámara para efecto parallax
            bg.setScrollFactor(0.2); 
            // Opcional: asegurarnos de que cubra la pantalla
            bg.setDisplaySize(GAME_CONFIG.MAP.DEFAULT_WIDTH, GAME_CONFIG.MAP.DEFAULT_HEIGHT);
            // Mandarlo al fondo de todo
            bg.setDepth(-10);
        }

        // Instanciar y crear terreno destructible — pasar el bioma elegido
        this.terrainManager = new TerrainManager(this, biomeKey);
        this.terrainManager.createTerrain();

        // --- CREAR MÚLTIPLES PERSONAJES ---
        const allPlayers = [];
        const totalPlayers = this.room.players.length;
        this.room.players.forEach((pData, index) => {
            let isLocal;
            
            if (this.socket) {
                // Modo multijugador: solo TU jugador es local
                isLocal = (pData.id === this.myId);
            } else {
                // Modo entrenamiento local: todos son "locales" (controlados por turnos)
                isLocal = true;
            }
            
            // Calcular posición de spawn segura sobre el terreno
            // Distribuir jugadores equidistantemente en la isla
            const spawnSpacing = (GAME_CONFIG.MAP.DEFAULT_WIDTH - 400) / (totalPlayers + 1);
            const spawnX = 200 + spawnSpacing * (index + 1);
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
            // Propagar a UIScene
            this.scene.get('UIScene').events.emit('turnStarted', data);
        });

        this.turnManager.on('turnEnded', (data) => {
            this.scene.get('UIScene').events.emit('turnEnded', data);
        });

        this.turnManager.on('turnTimeTick', (timeRemaining) => {
            this.scene.get('UIScene').events.emit('turnTimeTick', timeRemaining);
        });

        this.turnManager.on('gameOver', (data) => {
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
            this.turnManager.onProjectileResolved();
            // Regresar la cámara al jugador actual después de un tiempo
            this.time.delayedCall(1000, () => {
                const currentPlayer = this.turnManager.getCurrentPlayer();
                if(currentPlayer && currentPlayer.sprite && currentPlayer.sprite.active) {
                    this.cameras.main.startFollow(currentPlayer.sprite, false, 0.05, 0.05);
                }
            });
        });

        // Escuchar cuando un proyectil sale del mapa y desaparece sin explotar
        this.events.on('projectileLost', () => {
            this.turnManager.onProjectileResolved();
            const currentPlayer = this.turnManager.getCurrentPlayer();
            if(currentPlayer && currentPlayer.sprite && currentPlayer.sprite.active) {
                this.cameras.main.startFollow(currentPlayer.sprite, false, 0.05, 0.05);
            }
        });

        // Controles de entrada básicos
        this.cursors = this.input.keyboard.createCursorKeys();
        
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
        
        // Efectos de cámara iniciales (sin zoom - FIT mode maneja el escalado)

        // ¡Comenzar el juego de turnos!
        this.time.delayedCall(1000, () => {
            this.turnManager.startGame();
        });
    }

    fireProjectile(pointer) {
        // Solo el Host o el modo local puede disparar
        if (this.socket && !this.isHost) return;
        
        // Verificar que es el turno del jugador y que puede disparar
        const currentPlayer = this.turnManager.getCurrentPlayer();
        if (!currentPlayer) return;
        if (!this.turnManager.canFire()) return;

        // Avisar al TurnManager inmediatamente para registrar el disparo y frenar el temporizador
        this.turnManager.onPlayerFired();

        // En modo local (entrenamiento), el jugador activo es quien dispara
        const shooter = currentPlayer;

        // Crear proyectil
        const proj = new Projectile(this, shooter.sprite.x, shooter.sprite.y, pointer.worldX, pointer.worldY, shooter);
        
        // Seguir al proyectil con la cámara para una vista táctica y dinámica
        this.cameras.main.startFollow(proj.sprite, false, 0.1, 0.1);
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
        if (this.turnManager.isGameOver) return;

        // Update del TurnManager (countdown, etc.)
        this.turnManager.update(delta);

        // Update de jugadores: solo el jugador activo puede moverse
        Object.values(this.playersLookup).forEach(playerEntity => {
            const canAct = this.turnManager.canPlayerAct(playerEntity.id);
            playerEntity.update(this.cursors, canAct);
        });

        // Sync de red (solo host, cada N frames)
        if (this.isHost && this.socket) {
            this.syncTimer++;
            if (this.syncTimer >= GAME_CONFIG.NETWORK.SYNC_RATE) { 
                this.syncStateToClients();
                this.syncTimer = 0;
            }
        }
    }
}
