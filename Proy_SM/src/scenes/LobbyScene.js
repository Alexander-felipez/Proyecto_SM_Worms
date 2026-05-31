import Phaser from 'phaser';
import { io } from 'socket.io-client';

export class LobbyScene extends Phaser.Scene {
    constructor() {
        super('LobbyScene');
    }

    init(data) {
        this.isHost = data.isHost;
        this.playerName = 'Jugador_' + Math.floor(Math.random() * 1000);
        // Conectar al socket LAN (cambiar localhost por IP de la máquina host en producción LAN)
        this.socket = io('http://localhost:3001');
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        this.add.text(width / 2, 50, this.isHost ? 'CREANDO SALA LAN...' : 'UNIRSE A SALA LAN', {
            fontSize: '48px',
            fill: '#00ff00',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        this.statusText = this.add.text(width / 2, 120, 'Conectando al servidor...', {
            fontSize: '24px',
            fill: '#ffffff'
        }).setOrigin(0.5);

        this.playersList = this.add.text(width / 2, 300, '', {
            fontSize: '28px',
            fill: '#00ffff',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5);

        this.setupSockets();

        // Botón regresar
        const backBtn = this.add.text(50, 50, '< VOLVER', { fontSize: '24px', fill: '#ff0000' }).setInteractive();
        backBtn.on('pointerdown', () => {
            if(this.socket) this.socket.disconnect();
            this.scene.start('MainMenuScene');
        });

        // Solo el host puede iniciar la partida
        if (this.isHost) {
            this.startBtn = this.add.text(width / 2, height - 100, '> INICIAR PARTIDA <', {
                fontSize: '36px',
                fill: '#ffaa00',
                fontStyle: 'bold'
            }).setOrigin(0.5).setInteractive().setVisible(false);

            this.startBtn.on('pointerdown', () => {
                this.socket.emit('startGame');
                // Ya no hace scene.start aquí, sino que esperará el evento gameStarted como todos.
            });
        }
    }

    setupSockets() {
        this.socket.on('connect', () => {
            this.statusText.setText('Conectado. Sincronizando sala...');
            
            if (this.isHost) {
                // El host temporalmente fuerza un mapa al crear, 
                // en una próxima actualización aquí se pondrán botones HTML/DOM o de Phaser
                let mapChoise = prompt("Elige el mapa (luna, el_alto, santa_cruz):", "luna");
                let timeChoise = prompt("Elige la hora (dia o noche):", "dia");

                this.socket.emit('createRoom', { 
                    playerName: this.playerName,
                    map: mapChoise,
                    timeOfDay: timeChoise
                });
            } else {
                // En un juego completo mostrarÃamos input para RoomID, 
                // aquÃ simularemos unirse (en una build avanzada pondrÃamos un server browser)
                const roomIDInput = prompt("Ingrese el ID de la Sala (Mira la pantalla del Host):");
                const teamInput = prompt("Elige tu equipo (Eq.Rojo, Eq.Azul, Eq.Verde):", "Eq.Azul");
                if(roomIDInput) {
                    this.socket.emit('joinRoom', { roomId: roomIDInput, playerName: this.playerName, team: teamInput });
                } else {
                    this.scene.start('MainMenuScene');
                }
            }
        });

        this.socket.on('roomCreated', (room) => {
            this.statusText.setText(`SALA CREADA | ID: ${room.id} | Esperando jugadores...`);
            this.updatePlayersList(room.players);
            if(this.startBtn) this.startBtn.setVisible(true);
        });

        this.socket.on('roomUpdated', (room) => {
            this.statusText.setText(`SALA CREADA | ID: ${room.id}`);
            this.updatePlayersList(room.players);
        });
        
        this.socket.on('gameStarted', (roomData) => {
             this.scene.start('GameScene', { 
                 socket: this.socket, 
                 isHost: this.isHost,
                 room: roomData,
                 myId: this.socket.id 
             });
        });
    }

    updatePlayersList(players) {
        let text = 'JUGADORES CONECTADOS\n--------------------\n';
        players.forEach(p => {
            text += `[ ] ${p.name}\n`;
        });
        this.playersList.setText(text);
    }
}
