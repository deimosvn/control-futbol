<p align="center">
  <img src="https://img.shields.io/badge/BRL-Control%20Pro-00e5ff?style=for-the-badge&logo=gamepad&logoColor=white" alt="BRL Control Pro" />
  <img src="https://img.shields.io/badge/PWA-Installable-0070ff?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA" />
  <img src="https://img.shields.io/badge/ESP32-Firmware-333?style=for-the-badge&logo=espressif&logoColor=white" alt="ESP32" />
  <img src="https://img.shields.io/badge/Arduino-Firmware-00979D?style=for-the-badge&logo=arduino&logoColor=white" alt="Arduino" />
</p>

<h1 align="center">⚽ BRL Control Pro</h1>

<p align="center">
  <strong>Control remoto profesional para robots de fútbol — Baja Robotics League</strong>
</p>

<p align="center">
  Aplicación web progresiva (PWA) para controlar robots de fútbol en tiempo real mediante Bluetooth BLE, WiFi o RF, con firmware real para ESP32 y Arduino.
</p>

---

## 👤 Autor

**Diego Eduardo Martínez Cruz**

Elaborado para el **Club de Robótica** del **Instituto Tecnológico de Mexicali** como herramienta de competencia para la **Baja Robotics League**.

---

## 📋 Descripción

BRL Control Pro es un sistema completo de control remoto para robots de fútbol que incluye:

- **Aplicación PWA** instalable en cualquier dispositivo (celular, tablet, PC)
- **Firmware real** listo para subir a ESP32 o Arduino
- **Tres métodos de conexión**: Bluetooth BLE, WiFi (WebSocket) y RF (Serial)
- **Joysticks duales** para movimiento y rotación
- **Acciones de juego**: patada, pase, jugada especial
- **Telemetría en tiempo real**: ping, batería, estado de conexión
- **Parada de emergencia** instantánea

---

## 🛠️ Tecnologías y Herramientas

| Categoría | Tecnología |
|-----------|------------|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) |
| **PWA** | Service Worker, Web App Manifest |
| **Comunicación** | Web Bluetooth API, WebSocket, Web Serial API |
| **Firmware** | C++ (Arduino Framework) |
| **Microcontroladores** | ESP32 DevKit V1, Arduino Uno/Nano |
| **Hardware** | L298N Motor Driver, Servo SG90, HC-12 RF |
| **Fuentes** | Google Fonts (Orbitron, Inter, JetBrains Mono) |
| **Protocolo** | Binario personalizado (8 bytes), JSON, CSV |

### Lenguajes de Programación
- **JavaScript** — Aplicación web (PWA, joysticks, protocolos de comunicación)
- **CSS3** — Diseño responsivo con tema oscuro profesional
- **HTML5** — Estructura de la interfaz
- **C/C++** — Firmware para ESP32 y Arduino

---

## 📁 Estructura del Proyecto

```
control-futbol/
├── index.html                  # Página principal de la PWA
├── manifest.json               # Manifiesto PWA
├── sw.js                       # Service Worker (soporte offline)
├── css/
│   └── style.css               # Estilos profesionales
├── js/
│   ├── app.js                  # Lógica principal (joysticks, protocolo)
│   ├── bluetooth.js            # Conexión Bluetooth BLE
│   ├── wifi.js                 # Conexión WiFi (WebSocket)
│   └── rf.js                   # Conexión RF (Web Serial)
├── firmware/
│   ├── esp32_wifi_ble/
│   │   └── esp32_wifi_ble.ino  # Firmware ESP32: WiFi + Bluetooth
│   ├── esp32_bluetooth_only/
│   │   └── esp32_bluetooth_only.ino  # Firmware ESP32: Solo BLE
│   ├── arduino_rf/
│   │   └── arduino_rf.ino      # Firmware Arduino + HC-12 RF
│   └── WIRING_GUIDE.md         # Guía de cableado y diagramas
├── icons/                      # Íconos de la PWA
├── generate-icons.html         # Generador de íconos
└── generate-icons.js           # Script generador de íconos
```

---

## 🚀 Instalación y Uso

### 1. Abrir la PWA

La forma más sencilla es servir los archivos con cualquier servidor HTTP local:

```bash
# Opción A: Python
python -m http.server 8080

# Opción B: Node.js
npx serve .

# Opción C: VS Code
# Instalar extensión "Live Server" y hacer clic en "Go Live"
```

Abre `http://localhost:8080` en **Google Chrome** o **Microsoft Edge**.

> **💡 Tip:** En el celular, abre la URL y selecciona **"Añadir a pantalla de inicio"** para instalarla como app nativa.

### 2. Subir Firmware al Microcontrolador

#### ESP32 (WiFi + Bluetooth)

1. Abre **Arduino IDE**
2. Agrega el ESP32 Board Package:
   - `Archivo` → `Preferencias` → Board Manager URL:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Instala las librerías:
   - **WebSocketsServer** (Markus Sattler)
   - **ArduinoJson** (Benoit Blanchon)
   - **ESP32Servo** (Kevin Harrington)
4. Abre `firmware/esp32_wifi_ble/esp32_wifi_ble.ino`
5. Selecciona placa: **ESP32 Dev Module**
6. Selecciona el puerto COM
7. Haz clic en **Subir**

#### Arduino + RF

1. Abre `firmware/arduino_rf/arduino_rf.ino`
2. **Desconecta el módulo HC-12** de los pines 0/1
3. Selecciona placa: **Arduino Uno** (o Nano)
4. Haz clic en **Subir**
5. Reconecta el HC-12 después de subir

### 3. Conectar la PWA al Robot

1. Enciende el robot
2. Abre la PWA en tu navegador
3. Selecciona el método de conexión:
   - **Bluetooth**: Presiona "Conectar" → selecciona `BRL-BOT-01`
   - **WiFi**: Conéctate a la red `BRL-BOT-01` (contraseña: `brl12345`) → IP: `192.168.4.1`
   - **RF**: Conecta el HC-12 transmisor por USB → presiona "Conectar" → selecciona el puerto serial
4. Usa los **joysticks** para mover el robot
5. Usa los botones de **Kick**, **Pass** y **Special** para acciones de juego

### 4. Cableado del Hardware

Consulta la guía completa de conexiones en [`firmware/WIRING_GUIDE.md`](firmware/WIRING_GUIDE.md), que incluye:
- Diagrama ESP32 + L298N
- Diagrama Arduino + HC-12
- Divisor de voltaje para batería
- Mecanismo de patada con servo
- Checklist pre-competencia

---

## 🎮 Controles

| Control | Función |
|---------|---------|
| Joystick izquierdo | Movimiento (adelante/atrás/lateral) |
| Joystick derecho | Rotación |
| Botón KICK | Patada fuerte |
| Botón PASS | Pase suave |
| Botón SPECIAL | Giro + patada combinada |
| Barra de velocidad | Ajustar velocidad (0-100%) |
| Botón ⚠️ EMERGENCY | Parada de emergencia inmediata |

---

## 📡 Protocolo de Comunicación

El sistema usa un protocolo binario de **8 bytes** optimizado para baja latencia:

```
[0xAA] [CMD] [MX] [MY] [RX] [RY] [SPD] [0x55]
  │      │     │    │    │    │     │      │
  │      │     │    │    │    │     │      └─ Byte final (validación)
  │      │     │    │    │    │     └──────── Velocidad (0-100)
  │      │     │    │    │    └───────────── Rotación Y (0-255, 128=centro)
  │      │     │    │    └────────────────── Rotación X (0-255, 128=centro)
  │      │     │    └─────────────────────── Movimiento Y (0-255, 128=centro)
  │      │     └──────────────────────────── Movimiento X (0-255, 128=centro)
  │      └────────────────────────────────── Comando (0x01=move, 0x02=kick...)
  └───────────────────────────────────────── Byte de inicio (validación)
```

También soporta **JSON** y **CSV** como protocolos alternativos.

---

## 📄 Licencia

Proyecto desarrollado con fines educativos y de competencia para el Club de Robótica del Instituto Tecnológico de Mexicali.

---

<p align="center">
  <strong>Instituto Tecnológico de Mexicali — Club de Robótica</strong><br>
  Baja Robotics League 2026
</p>
