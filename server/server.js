import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './RoomManager.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Permitimos cualquier origen para red LAN
        methods: ["GET", "POST"]
    }
});

const roomManager = new RoomManager();

io.on('connection', (socket) => {
    console.log(`Jugador conectado: ${socket.id}`);

    // Crear sala
    socket.on('createRoom', (data) => {
        const room = roomManager.createRoom(socket.id, data);
        socket.join(room.id);
        socket.emit('roomCreated', room);
        console.log(`Sala creada: ${room.id} por ${socket.id}`);
    });

    // Unirse a sala
    socket.on('joinRoom', (data) => {
        const { roomId, playerName, team } = data;
        const room = roomManager.joinRoom(roomId, socket.id, playerName, team);

        if (room) {
            socket.join(roomId);
            io.to(roomId).emit('roomUpdated', room);
            console.log(`Jugador ${socket.id} se unió a ${roomId}`);
        } else {
            socket.emit('error', { message: 'Sala no encontrada o llena' });
        }
    });

    // Sincronización Básica del host
    socket.on('syncState', (state) => {
        const room = roomManager.getRoomByPlayer(socket.id);
        if(room) {
            socket.to(room.id).emit('stateUpdate', state);
        }
    });
    
    // Sincronizar Turnos
    socket.on('syncTurn', (turnData) => {
        const room = roomManager.getRoomByPlayer(socket.id);
        if(room) {
            socket.to(room.id).emit('turnUpdate', turnData);
        }
    });

    // Iniciar partida
    socket.on('startGame', () => {
        const room = roomManager.getRoomByHost(socket.id);
        if (room) {
            room.status = 'playing';
            io.to(room.id).emit('gameStarted', room);
            console.log(`Partida iniciada en sala: ${room.id}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Jugador desconectado: ${socket.id}`);
        // Notificar a las salas de la desconexión
        const room = roomManager.getRoomByPlayer(socket.id);
        if (room) {
           roomManager.removePlayerFromRooms(socket.id);
           io.to(room.id).emit('roomUpdated', room); 
        }
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => { // 0.0.0.0 para acceso LAN
    console.log(`Backend Server corriendo en el puerto ${PORT} (LAN Ready)`);
});
