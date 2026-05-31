// Gestor de Socket.io para comunicación
import { io } from 'socket.io-client';

export class SocketManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.roomCode = null;
        this.players = [];
        this.init();
    }

    init() {
        try {
            // Conectar al servidor (usar localhost para desarrollo)
            this.socket = io('http://localhost:3001', {
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: 3
            });

            this.setupEventListeners();
        } catch (error) {
            console.warn('Socket.io no disponible:', error.message);
            // El socket puede no estar disponible en modo local
        }
    }

    setupEventListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            this.connected = true;
            console.log('Conectado al servidor');
        });

        this.socket.on('disconnect', () => {
            this.connected = false;
            console.log('Desconectado del servidor');
        });

        this.socket.on('room-created', (data) => {
            this.roomCode = data.code;
            console.log('Sala creada:', this.roomCode);
        });

        this.socket.on('player-joined', (data) => {
            this.players = data.players;
            this.updatePlayersList();
        });

        this.socket.on('game-started', (data) => {
            console.log('Juego iniciado:', data);
        });

        this.socket.on('error', (error) => {
            console.error('Error de socket:', error);
        });
    }

    createRoom(code) {
        if (this.socket && this.connected) {
            this.socket.emit('create-room', { code });
        } else {
            console.warn('Socket no disponible para crear sala');
        }
    }

    joinRoom(code) {
        if (this.socket && this.connected) {
            this.socket.emit('join-room', { code });
        } else {
            console.warn('Socket no disponible para unirse a sala');
        }
    }

    startGame(settings) {
        if (this.socket && this.connected) {
            this.socket.emit('start-game', { settings });
        } else {
            console.warn('Socket no disponible para iniciar juego');
        }
    }

    updatePlayersList() {
        const playersList = document.getElementById('players-list');
        if (playersList && this.players.length > 0) {
            playersList.innerHTML = '';
            this.players.forEach((player, index) => {
                const playerItem = document.createElement('div');
                playerItem.className = 'player-item';
                playerItem.innerHTML = `
                    <span class="player-name">${player.name || `Jugador ${index + 1}`}</span>
                    <span class="player-status"></span>
                `;
                playersList.appendChild(playerItem);
            });
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
