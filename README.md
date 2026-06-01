# 🪱 Proyecto SM - Worms Clone (Simulador Multimedia Interactivo)

Este repositorio contiene el código fuente y los activos multimedia optimizados de un ecosistema interactivo bidimensional basado en físicas y turnos, inspirado en el clásico "Worms". El proyecto está desarrollado utilizando **Phaser 3**, **Vite** y **Node.js** con WebSockets para capacidades multijugador en tiempo real.

## 📁 Estructura del Proyecto y Activos Multimedia

La arquitectura del proyecto garantiza una separación estricta entre la lógica algorítmica y los activos multimedia (assets), permitiendo un pipeline de pre-procesamiento escalable:

- `/public/assets/images/`: Texturas optimizadas, spritesheets y gráficos rasterizados.
- `/public/assets/audio/`: Archivos de audio (SFX y música) comprimidos (.mp3 y .wav) para retroalimentación interactiva y procedural.
- `/src/`: Lógica algorítmica estructurada (Sistemas, Entidades, Escenas y Configuración).
- `/server/`: Lógica del servidor para sincronización multijugador vía WebSockets.
- `/styles/`: Hojas de estilo CSS que componen la interfaz de usuario externa al canvas de WebGL.

## 🚀 Requisitos Previos

Para la correcta ejecución del simulador interactivo y evitar bloqueos de seguridad del navegador (CORS) al cargar texturas en el contexto de WebGL, el proyecto **debe** ejecutarse a través de un servidor local.

- **Node.js** (v16.x o superior recomendado)
- **NPM** (Node Package Manager)

## 🛠️ Instalación y Despliegue Local

Sigue estos pasos para levantar ambos entornos (Backend y Frontend):

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Alexander-felipez/Proyecto_SM_Worms.git
   cd Proyecto_SM_Worms
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Ejecutar el servidor local y el entorno de desarrollo Vite:**
   ```bash
   npm run dev
   ```

4. **Acceder a la aplicación:**
   Abre tu navegador de preferencia y dirígete a la dirección local que Vite indique en la terminal (usualmente `http://localhost:5173`).

## ⚙️ Tecnologías Utilizadas
- **Motor Gráfico:** Phaser 3 (Renderizado dinámico con WebGL/Canvas2D).
- **Control de Paquetes y Bundler:** Vite.
- **Backend y Red:** Node.js, Express y Socket.io.
- **Activos:** Imágenes optimizadas y audios procesados para balancear calidad de fidelidad y rendimiento de la GPU/CPU.
