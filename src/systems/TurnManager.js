import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';

/**
 * TurnManager
 * Sistema de turnos completo: rotación de jugadores, countdown,
 * eventos para UI, bloqueo de inputs, y sincronización por red.
 */
export class TurnManager extends Phaser.Events.EventEmitter {
    constructor(scene, isHost) {
        super();
        this.scene = scene;
        this.isHost = isHost;
        
        this.players = [];          // Array ordenado de Player entities
        this.currentIndex = 0;      // Índice del jugador activo
        
        this.turnDuration = GAME_CONFIG.TURN.DURATION;
        this.timeRemaining = this.turnDuration;
        this.pauseBetween = GAME_CONFIG.TURN.PAUSE_BETWEEN;
        
        this.isTurnActive = false;
        this.isPaused = false;      // Pausa cinemática entre turnos
        this.hasFired = false;      // Si el jugador ya disparó en este turno

        this.isGameOver = false;
        this.windSpeed = 0; // Viento del turno
    }

    /**
     * Registra los jugadores que participan en la rotación de turnos.
     * @param {Player[]} players - Array de entidades Player
     */
    setPlayers(players) {
        this.players = players.filter(p => p.alive);
    }

    /**
     * Inicia el primer turno del juego.
     */
    startGame() {
        if (this.players.length < 1) return;
        this.currentIndex = 0;
        this.startTurn();
    }

    /**
     * Devuelve el jugador cuyo turno es actualmente.
     * @returns {Player|null}
     */
    getCurrentPlayer() {
        if (this.players.length === 0) return null;
        return this.players[this.currentIndex % this.players.length];
    }

    /**
     * Verifica si un jugador específico puede actuar ahora.
     * @param {string} playerId 
     * @returns {boolean}
     */
    canPlayerAct(playerId) {
        if (!this.isTurnActive || this.isPaused || this.isGameOver) return false;
        const current = this.getCurrentPlayer();
        return current && current.id === playerId;
    }

    /**
     * Verifica si el jugador actual puede disparar (solo 1 disparo por turno).
     * @returns {boolean}
     */
    canFire() {
        return this.isTurnActive && !this.isPaused && !this.hasFired && !this.isGameOver;
    }

    /**
     * Llamado cuando el jugador dispara. Marca que ya disparó y programa fin de turno.
     */
    onPlayerFired() {
        if (!this.isTurnActive) return;
        this.hasFired = true;
        
        // Dar ~1.5 segundos para ver la explosión y sus efectos antes de cambiar turno
        this.scene.time.delayedCall(1500, () => {
            if (this.isTurnActive && !this.isGameOver) {
                this.endTurn();
            }
        });
    }
    
    /**
     * Inicia un nuevo turno.
     */
    startTurn() {
        if (this.isGameOver) return;

        // Remover jugadores muertos
        this.players = this.players.filter(p => p.alive);
        
        // Verificar condición de victoria
        if (this.checkVictory()) return;

        // Ajustar índice si se pasó del array
        if (this.currentIndex >= this.players.length) {
            this.currentIndex = 0;
        }

        this.isTurnActive = true;
        this.isPaused = false;
        this.hasFired = false;
        this.timeRemaining = this.turnDuration;

        // Generar viento aleatorio para este turno si el viento está habilitado
        this.windSpeed = GAME_CONFIG.WIND.ENABLED 
            ? Phaser.Math.FloatBetween(GAME_CONFIG.WIND.MIN, GAME_CONFIG.WIND.MAX)
            : 0;

        const currentPlayer = this.getCurrentPlayer();
        
        // Emitir evento para UI y cámara
        this.emit('turnStarted', {
            player: currentPlayer,
            playerIndex: this.currentIndex,
            timeRemaining: this.timeRemaining,
            windSpeed: this.windSpeed,
        });
    }
    
    /**
     * Finaliza el turno actual y programa el siguiente.
     */
    endTurn() {
        if (!this.isTurnActive || this.isGameOver) return;
        this.isTurnActive = false;
        this.isPaused = true;

        const endedPlayer = this.getCurrentPlayer();
        
        // Rotar al siguiente jugador vivo
        this.currentIndex = (this.currentIndex + 1) % Math.max(1, this.players.length);
        
        this.emit('turnEnded', {
            endedPlayer: endedPlayer,
            nextPlayer: this.getCurrentPlayer(),
        });

        // Pausa cinemática antes del siguiente turno
        this.scene.time.delayedCall(this.pauseBetween, () => {
            if (!this.isGameOver) {
                this.startTurn();
            }
        });
    }

    /**
     * Llamado cuando un jugador muere. Re-evalúa la rotación.
     * @param {Player} deadPlayer 
     */
    onPlayerDied(deadPlayer) {
        // Remover de la lista activa
        this.players = this.players.filter(p => p.alive);
        
        // Si murió el jugador activo, terminar su turno
        if (this.getCurrentPlayer() === deadPlayer || !this.getCurrentPlayer()) {
            if (this.isTurnActive) {
                this.endTurn();
            }
        }

        // Ajustar índice
        if (this.currentIndex >= this.players.length) {
            this.currentIndex = 0;
        }
        
        this.checkVictory();
    }

    /**
     * Verifica si hay un ganador.
     * @returns {boolean} true si el juego terminó
     */
    checkVictory() {
        const alivePlayers = this.players.filter(p => p.alive);
        
        if (alivePlayers.length <= 1) {
            this.isGameOver = true;
            this.isTurnActive = false;
            
            const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
            
            this.emit('gameOver', {
                winner: winner,
                winnerName: winner ? winner.name : 'Nadie',
                winnerTeam: winner ? (GAME_CONFIG.TEAMS[winner.teamKey]?.name || 'Desconocido') : 'Empate',
            });
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Update del sistema de turnos (llamar desde GameScene.update).
     * @param {number} delta - Tiempo desde el último frame en ms
     */
    update(delta) {
        if (!this.isTurnActive || this.isPaused || this.isGameOver) return;
        
        this.timeRemaining -= delta;
        
        // Emitir tick cada ~500ms para UI (no cada frame)
        if (Math.floor(this.timeRemaining / 500) !== Math.floor((this.timeRemaining + delta) / 500)) {
            this.emit('turnTimeTick', this.timeRemaining);
        }

        if (this.timeRemaining <= 0) {
            this.endTurn();
        }
    }

    getTurnState() {
        return {
            timeRemaining: this.timeRemaining,
            currentIndex: this.currentIndex,
            isTurnActive: this.isTurnActive,
            currentPlayerId: this.getCurrentPlayer()?.id,
            windSpeed: this.windSpeed,
        };
    }
    
    // Método para ser llamado por los clientes cuando reciben datos del socket coordinador
    syncFromHost(data) {
        if (this.isHost) return;
        
        this.timeRemaining = data.timeRemaining;
        this.currentIndex = data.currentIndex;
        this.isTurnActive = data.isTurnActive;
        this.windSpeed = data.windSpeed || 0;

        // Avisar a la UI del cliente que el estado cambió
        this.emit('turnStateChanged', this.getTurnState());
    }
}
