/**
 * RoboFútbol Control - Aplicación Principal
 * Maneja la interfaz, joysticks, conexiones y protocolo de comunicación
 */
(function () {
  'use strict';

  // ==========================================
  // Estado de la aplicación
  // ==========================================
  const state = {
    connectionType: null, // 'bluetooth' | 'wifi' | 'rf'
    connected: false,
    speed: 50,
    sensitivity: 5,
    controlType: 'joystick', // 'joystick' | 'dpad' | 'gyro'
    vibration: true,
    sendRate: 50,
    protocol: 'json', // 'json' | 'binary' | 'csv'
    robotName: 'RoboFútbol-01',
    battery: null,
    mode: 'manual', // 'manual' | 'auto' | 'defend'
    moveX: 0,
    moveY: 0,
    rotateX: 0,
    rotateY: 0,
    lastSendTime: 0,
    gyroEnabled: false
  };

  // ==========================================
  // Referencias DOM
  // ==========================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    splash: $('#splash'),
    app: $('#app'),
    connectionStatus: $('#connectionStatus'),
    connectionPanel: $('#connectionPanel'),
    panelOverlay: $('#panelOverlay'),
    settingsModal: $('#settingsModal'),
    toast: $('#toast'),
    speedSlider: $('#speedSlider'),
    speedValue: $('#speedValue'),
    batteryLevel: $('#batteryLevel'),
    batteryText: $('#batteryText'),
    joystickMoveZone: $('#joystickMoveZone'),
    joystickMoveStick: $('#joystickMoveStick'),
    joystickRotateZone: $('#joystickRotateZone'),
    joystickRotateStick: $('#joystickRotateStick'),
    dpadContainer: $('#dpadContainer'),
    btnSettings: $('#btnSettings'),
    btnClosePanel: $('#btnClosePanel'),
    btnBluetooth: $('#btnBluetooth'),
    btnWifi: $('#btnWifi'),
    btnRF: $('#btnRF'),
    btnSaveSettings: $('#btnSaveSettings'),
    btnCloseSettings: $('#btnCloseSettings'),
    btnEmergency: $('#btnEmergency'),
    btnCalibrate: $('#btnCalibrate'),
    btnMode: $('#btnMode'),
    btnKick: $('#btnKick'),
    btnPass: $('#btnPass'),
    btnSpecial: $('#btnSpecial'),
    btnStop: $('#btnStop'),
    wifiIP: $('#wifiIP'),
    wifiPort: $('#wifiPort'),
    rfBaudRate: $('#rfBaudRate'),
    settingControlType: $('#settingControlType'),
    settingVibration: $('#settingVibration'),
    settingSensitivity: $('#settingSensitivity'),
    settingSendRate: $('#settingSendRate'),
    settingRobotName: $('#settingRobotName'),
    settingProtocol: $('#settingProtocol'),
    btStatus: $('#btStatus'),
    wifiStatus: $('#wifiStatus'),
    rfStatus: $('#rfStatus'),
    connBluetooth: $('#connBluetooth'),
    connWifi: $('#connWifi'),
    connRF: $('#connRF')
  };

  // ==========================================
  // Inicialización
  // ==========================================
  function init() {
    // Cargar configuración guardada
    loadSettings();

    // Ocultar splash después de 1.5s
    setTimeout(() => {
      dom.splash.classList.add('fade-out');
      dom.app.classList.remove('hidden');
      setTimeout(() => dom.splash.classList.add('hidden'), 500);
    }, 1500);

    // Inicializar módulos de conexión
    initConnections();

    // Configurar event listeners
    setupEventListeners();

    // Inicializar joysticks
    setupJoystick(dom.joystickMoveZone, dom.joystickMoveStick, 'move');
    setupJoystick(dom.joystickRotateZone, dom.joystickRotateStick, 'rotate');

    // Verificar APIs disponibles
    checkAPIs();

    // Iniciar loop de envío
    startSendLoop();

    // Registrar Service Worker
    registerSW();

    // Prevenir zoom
    preventZoom();

    console.log('🤖 RoboFútbol Control iniciado');
  }

  // ==========================================
  // Verificar APIs disponibles
  // ==========================================
  function checkAPIs() {
    if (!window.bluetoothConn.isAvailable()) {
      dom.btStatus.textContent = 'No disponible';
      dom.btnBluetooth.disabled = true;
      dom.btnBluetooth.textContent = 'No soportado';
    }

    if (!window.wifiConn.isAvailable()) {
      dom.wifiStatus.textContent = 'No disponible';
      dom.btnWifi.disabled = true;
    }

    if (!window.rfConn.isAvailable()) {
      dom.rfStatus.textContent = 'No disponible en móvil';
      dom.btnRF.disabled = true;
      dom.btnRF.textContent = 'Solo PC';
    }
  }

  // ==========================================
  // Conexiones
  // ==========================================
  function initConnections() {
    const handlers = {
      onStatusChange: handleConnectionStatus,
      onDataReceived: handleDataReceived
    };

    window.bluetoothConn.onStatusChange = handlers.onStatusChange;
    window.bluetoothConn.onDataReceived = handlers.onDataReceived;
    window.wifiConn.onStatusChange = handlers.onStatusChange;
    window.wifiConn.onDataReceived = handlers.onDataReceived;
    window.rfConn.onStatusChange = handlers.onStatusChange;
    window.rfConn.onDataReceived = handlers.onDataReceived;
  }

  function handleConnectionStatus(statusState, message, type) {
    const statusDot = dom.connectionStatus.querySelector('.status-dot');
    const statusText = dom.connectionStatus.querySelector('.status-text');

    // Actualizar indicador principal
    statusDot.className = 'status-dot ' + statusState;
    statusText.textContent = message;

    // Actualizar estado
    if (statusState === 'connected') {
      state.connected = true;
      state.connectionType = type;
      vibrate(50);
      showToast(`✅ ${message}`, 'success');
    } else if (statusState === 'disconnected') {
      if (state.connectionType === type) {
        state.connected = false;
        state.connectionType = null;
      }
    }

    // Actualizar botones del panel
    updateConnectionButtons(type, statusState);

    // Actualizar texto de estado en panel
    const statusEl = type === 'bluetooth' ? dom.btStatus :
                     type === 'wifi' ? dom.wifiStatus : dom.rfStatus;
    if (statusEl) statusEl.textContent = message;

    // Marcar opción activa
    const connEl = type === 'bluetooth' ? dom.connBluetooth :
                   type === 'wifi' ? dom.connWifi : dom.connRF;
    if (connEl) {
      connEl.classList.toggle('active', statusState === 'connected');
    }
  }

  function updateConnectionButtons(type, status) {
    const btn = type === 'bluetooth' ? dom.btnBluetooth :
                type === 'wifi' ? dom.btnWifi : dom.btnRF;
    
    if (status === 'connected') {
      btn.textContent = 'Desconectar';
      btn.classList.add('connected');
    } else if (status === 'connecting') {
      btn.textContent = 'Conectando...';
      btn.disabled = true;
    } else {
      btn.textContent = 'Conectar';
      btn.classList.remove('connected');
      btn.disabled = false;
    }
  }

  function handleDataReceived(data, type) {
    console.log(`📥 [${type}]:`, data);

    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;

      // Actualizar batería si viene en los datos
      if (parsed.battery !== undefined) {
        updateBattery(parsed.battery);
      }

      // Otros datos del robot
      if (parsed.mode !== undefined) {
        state.mode = parsed.mode;
      }

    } catch (e) {
      // Si no es JSON, procesar como texto
      if (typeof data === 'string') {
        // Formato simple: "BAT:85"
        if (data.startsWith('BAT:')) {
          updateBattery(parseInt(data.split(':')[1]));
        }
      }
    }
  }

  function updateBattery(level) {
    state.battery = Math.max(0, Math.min(100, level));
    dom.batteryLevel.style.width = state.battery + '%';
    dom.batteryText.textContent = state.battery + '%';

    dom.batteryLevel.classList.remove('low', 'medium');
    if (state.battery < 20) {
      dom.batteryLevel.classList.add('low');
    } else if (state.battery < 50) {
      dom.batteryLevel.classList.add('medium');
    }
  }

  // ==========================================
  // Envío de datos
  // ==========================================
  function startSendLoop() {
    setInterval(() => {
      if (!state.connected) return;

      const now = Date.now();
      if (now - state.lastSendTime < state.sendRate) return;

      // Solo enviar si hay movimiento
      if (state.moveX === 0 && state.moveY === 0 && 
          state.rotateX === 0 && state.rotateY === 0) {
        return;
      }

      sendControlData();
      state.lastSendTime = now;
    }, 16); // ~60fps check
  }

  function sendControlData() {
    const data = buildPayload('move', {
      mx: Math.round(state.moveX * 100) / 100,
      my: Math.round(state.moveY * 100) / 100,
      rx: Math.round(state.rotateX * 100) / 100,
      ry: Math.round(state.rotateY * 100) / 100,
      spd: state.speed
    });

    sendData(data);
  }

  function sendAction(action, params = {}) {
    const data = buildPayload(action, params);
    sendData(data);
  }

  function buildPayload(command, params = {}) {
    switch (state.protocol) {
      case 'json':
        return JSON.stringify({ cmd: command, ...params, t: Date.now() % 100000 });
      
      case 'csv': {
        const values = [command, ...Object.values(params)];
        return values.join(',') + '\n';
      }

      case 'binary': {
        // Protocolo binario compacto: [CMD(1)][MX(1)][MY(1)][RX(1)][RY(1)][SPD(1)]
        const cmdMap = {
          'move': 0x01, 'kick': 0x02, 'pass': 0x03,
          'special': 0x04, 'stop': 0x05, 'emergency': 0xFF,
          'calibrate': 0x10, 'mode': 0x11
        };
        
        const buf = new Uint8Array(8);
        buf[0] = 0xAA; // Header
        buf[1] = cmdMap[command] || 0x00;
        buf[2] = Math.round((params.mx || 0) * 127) + 128; // -1..1 → 1..255
        buf[3] = Math.round((params.my || 0) * 127) + 128;
        buf[4] = Math.round((params.rx || 0) * 127) + 128;
        buf[5] = Math.round((params.ry || 0) * 127) + 128;
        buf[6] = params.spd || state.speed;
        buf[7] = 0x55; // Footer
        return buf;
      }

      default:
        return JSON.stringify({ cmd: command, ...params });
    }
  }

  function sendData(data) {
    if (!state.connected) return;

    const conn = getActiveConnection();
    if (conn) {
      conn.send(data);
    }
  }

  function getActiveConnection() {
    switch (state.connectionType) {
      case 'bluetooth': return window.bluetoothConn;
      case 'wifi': return window.wifiConn;
      case 'rf': return window.rfConn;
      default: return null;
    }
  }

  // ==========================================
  // Joystick Virtual
  // ==========================================
  function setupJoystick(zone, stick, type) {
    const baseEl = zone.querySelector('.joystick-base');
    let active = false;
    let touchId = null;
    let baseRect = null;
    let maxRadius = 0;

    function getPosition(clientX, clientY) {
      if (!baseRect) return { x: 0, y: 0 };

      const centerX = baseRect.left + baseRect.width / 2;
      const centerY = baseRect.top + baseRect.height / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;

      // Limitar al radio máximo
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > maxRadius) {
        dx = (dx / distance) * maxRadius;
        dy = (dy / distance) * maxRadius;
      }

      return { x: dx, y: dy };
    }

    function updateStick(dx, dy) {
      stick.style.transform = `translate(${dx}px, ${dy}px)`;

      // Normalizar a -1..1
      const nx = maxRadius > 0 ? dx / maxRadius : 0;
      const ny = maxRadius > 0 ? -(dy / maxRadius) : 0; // Invertir Y

      // Aplicar sensibilidad y dead zone
      const deadZone = 0.1;
      const sens = state.sensitivity / 5; // 0.2..2.0

      if (type === 'move') {
        state.moveX = applyDeadZone(nx * sens, deadZone);
        state.moveY = applyDeadZone(ny * sens, deadZone);
      } else {
        state.rotateX = applyDeadZone(nx * sens, deadZone);
        state.rotateY = applyDeadZone(ny * sens, deadZone);
      }
    }

    function applyDeadZone(value, threshold) {
      if (Math.abs(value) < threshold) return 0;
      const sign = value > 0 ? 1 : -1;
      return sign * ((Math.abs(value) - threshold) / (1 - threshold));
    }

    function onStart(e) {
      e.preventDefault();
      if (active) return;

      const touch = e.touches ? e.touches[0] : e;
      touchId = e.touches ? e.touches[0].identifier : -1;
      active = true;

      baseRect = baseEl.getBoundingClientRect();
      maxRadius = (baseRect.width / 2) - (stick.offsetWidth / 2);

      stick.classList.add('active');
      
      const pos = getPosition(touch.clientX, touch.clientY);
      updateStick(pos.x, pos.y);
      vibrate(10);
    }

    function onMove(e) {
      if (!active) return;
      e.preventDefault();

      let touch;
      if (e.touches) {
        touch = Array.from(e.touches).find(t => t.identifier === touchId);
        if (!touch) return;
      } else {
        touch = e;
      }

      const pos = getPosition(touch.clientX, touch.clientY);
      updateStick(pos.x, pos.y);
    }

    function onEnd(e) {
      if (!active) return;

      if (e.changedTouches) {
        const ended = Array.from(e.changedTouches).find(t => t.identifier === touchId);
        if (!ended) return;
      }

      active = false;
      touchId = null;
      stick.classList.remove('active');

      // Volver al centro con animación
      stick.style.transition = 'transform 0.15s ease-out';
      stick.style.transform = 'translate(0, 0)';
      setTimeout(() => { stick.style.transition = 'none'; }, 150);

      if (type === 'move') {
        state.moveX = 0;
        state.moveY = 0;
      } else {
        state.rotateX = 0;
        state.rotateY = 0;
      }

      // Enviar parada inmediatamente
      sendControlData();
    }

    // Touch events
    zone.addEventListener('touchstart', onStart, { passive: false });
    zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onEnd, { passive: false });
    zone.addEventListener('touchcancel', onEnd, { passive: false });

    // Mouse events (para pruebas en desktop)
    zone.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', (e) => { if (active && touchId === -1) onMove(e); });
    document.addEventListener('mouseup', (e) => { if (active && touchId === -1) onEnd(e); });
  }

  // ==========================================
  // D-Pad
  // ==========================================
  function setupDPad() {
    const directions = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };

    $$('.dpad-btn').forEach(btn => {
      const dir = btn.dataset.dir;
      const [dx, dy] = directions[dir];

      const startHandler = (e) => {
        e.preventDefault();
        state.moveX = dx;
        state.moveY = dy;
        vibrate(15);
        sendControlData();
      };

      const endHandler = (e) => {
        e.preventDefault();
        state.moveX = 0;
        state.moveY = 0;
        sendControlData();
      };

      btn.addEventListener('touchstart', startHandler, { passive: false });
      btn.addEventListener('touchend', endHandler, { passive: false });
      btn.addEventListener('mousedown', startHandler);
      btn.addEventListener('mouseup', endHandler);
    });
  }

  setupDPad();

  // ==========================================
  // Giroscopio
  // ==========================================
  function enableGyro() {
    if (!('DeviceOrientationEvent' in window)) {
      showToast('⚠️ Giroscopio no disponible', 'warning');
      return;
    }

    // Pedir permiso en iOS 13+
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permission => {
          if (permission === 'granted') {
            startGyro();
          } else {
            showToast('⚠️ Permiso de giroscopio denegado', 'warning');
          }
        })
        .catch(console.error);
    } else {
      startGyro();
    }
  }

  function startGyro() {
    state.gyroEnabled = true;
    window.addEventListener('deviceorientation', handleGyro);
    showToast('🎮 Control por giroscopio activado', 'success');
  }

  function stopGyro() {
    state.gyroEnabled = false;
    window.removeEventListener('deviceorientation', handleGyro);
  }

  function handleGyro(event) {
    if (!state.gyroEnabled || state.controlType !== 'gyro') return;

    // beta = inclinación adelante/atrás (-180..180)
    // gamma = inclinación izquierda/derecha (-90..90)
    const beta = event.beta || 0;
    const gamma = event.gamma || 0;

    // Normalizar a -1..1 con rango cómodo
    state.moveX = Math.max(-1, Math.min(1, gamma / 30));
    state.moveY = Math.max(-1, Math.min(1, -(beta - 30) / 30)); // 30° es la posición neutral
  }

  // ==========================================
  // Event Listeners
  // ==========================================
  function setupEventListeners() {
    // Conexión panel - abrir/cerrar
    dom.connectionStatus.addEventListener('click', () => {
      dom.connectionPanel.classList.toggle('hidden');
    });

    dom.panelOverlay.addEventListener('click', () => {
      dom.connectionPanel.classList.add('hidden');
    });

    dom.btnClosePanel.addEventListener('click', () => {
      dom.connectionPanel.classList.add('hidden');
    });

    // Botones de conexión
    dom.btnBluetooth.addEventListener('click', async () => {
      if (window.bluetoothConn.connected) {
        await window.bluetoothConn.disconnect();
      } else {
        try { await window.bluetoothConn.connect(); } 
        catch (e) { showToast(`❌ ${e.message}`, 'error'); }
      }
    });

    dom.btnWifi.addEventListener('click', async () => {
      if (window.wifiConn.connected) {
        await window.wifiConn.disconnect();
      } else {
        try {
          const ip = dom.wifiIP.value || '192.168.4.1';
          const port = parseInt(dom.wifiPort.value) || 81;
          await window.wifiConn.connect(ip, port);
        } catch (e) { showToast(`❌ ${e.message}`, 'error'); }
      }
    });

    dom.btnRF.addEventListener('click', async () => {
      if (window.rfConn.connected) {
        await window.rfConn.disconnect();
      } else {
        try {
          const baudRate = parseInt(dom.rfBaudRate.value) || 115200;
          await window.rfConn.connect(baudRate);
        } catch (e) { showToast(`❌ ${e.message}`, 'error'); }
      }
    });

    // Velocidad
    dom.speedSlider.addEventListener('input', (e) => {
      state.speed = parseInt(e.target.value);
      dom.speedValue.textContent = state.speed;
    });

    $$('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseInt(btn.dataset.speed);
        state.speed = speed;
        dom.speedSlider.value = speed;
        dom.speedValue.textContent = speed;
        $$('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        vibrate(20);
      });
    });

    // Botones de acción
    const actionHandler = (btn, action) => {
      const handler = (e) => {
        e.preventDefault();
        vibrate(30);
        sendAction(action, { spd: state.speed });
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => { btn.style.transform = ''; }, 100);
      };

      btn.addEventListener('touchstart', handler, { passive: false });
      btn.addEventListener('mousedown', handler);
    };

    actionHandler(dom.btnKick, 'kick');
    actionHandler(dom.btnPass, 'pass');
    actionHandler(dom.btnSpecial, 'special');
    actionHandler(dom.btnStop, 'stop');

    // Botones rápidos
    dom.btnEmergency.addEventListener('click', () => {
      vibrate([100, 50, 100]);
      sendAction('emergency');
      state.moveX = 0;
      state.moveY = 0;
      state.rotateX = 0;
      state.rotateY = 0;
      showToast('🛑 ¡PARADA DE EMERGENCIA!', 'error');
    });

    dom.btnCalibrate.addEventListener('click', () => {
      vibrate(50);
      sendAction('calibrate');
      showToast('🔧 Calibrando...', 'warning');
    });

    dom.btnMode.addEventListener('click', () => {
      const modes = ['manual', 'auto', 'defend'];
      const currentIndex = modes.indexOf(state.mode);
      state.mode = modes[(currentIndex + 1) % modes.length];
      
      vibrate(20);
      sendAction('mode', { mode: state.mode });
      
      const modeNames = { manual: '🎮 Manual', auto: '🤖 Automático', defend: '🛡️ Defensa' };
      showToast(`Modo: ${modeNames[state.mode]}`, 'success');
    });

    // Configuración
    dom.btnSettings.addEventListener('click', () => {
      dom.settingsModal.classList.remove('hidden');
      loadSettingsToUI();
    });

    dom.btnCloseSettings.addEventListener('click', () => {
      dom.settingsModal.classList.add('hidden');
    });

    dom.btnSaveSettings.addEventListener('click', () => {
      saveSettingsFromUI();
      dom.settingsModal.classList.add('hidden');
      showToast('✅ Configuración guardada', 'success');
    });

    // Prevenir menú contextual en controles
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.controls')) {
        e.preventDefault();
      }
    });
  }

  // ==========================================
  // Configuración
  // ==========================================
  function loadSettings() {
    try {
      const saved = localStorage.getItem('robofutbol_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        Object.assign(state, settings);
        dom.speedSlider.value = state.speed;
        dom.speedValue.textContent = state.speed;
      }
    } catch (e) {
      console.error('Error cargando configuración:', e);
    }
  }

  function loadSettingsToUI() {
    dom.settingControlType.value = state.controlType;
    dom.settingVibration.checked = state.vibration;
    dom.settingSensitivity.value = state.sensitivity;
    dom.settingSendRate.value = state.sendRate;
    dom.settingRobotName.value = state.robotName;
    dom.settingProtocol.value = state.protocol;
  }

  function saveSettingsFromUI() {
    const oldControlType = state.controlType;

    state.controlType = dom.settingControlType.value;
    state.vibration = dom.settingVibration.checked;
    state.sensitivity = parseInt(dom.settingSensitivity.value);
    state.sendRate = parseInt(dom.settingSendRate.value);
    state.robotName = dom.settingRobotName.value;
    state.protocol = dom.settingProtocol.value;

    // Cambiar tipo de control
    if (oldControlType !== state.controlType) {
      applyControlType();
    }

    // Guardar en localStorage
    const toSave = {
      speed: state.speed,
      sensitivity: state.sensitivity,
      controlType: state.controlType,
      vibration: state.vibration,
      sendRate: state.sendRate,
      protocol: state.protocol,
      robotName: state.robotName
    };

    try {
      localStorage.setItem('robofutbol_settings', JSON.stringify(toSave));
    } catch (e) {
      console.error('Error guardando configuración:', e);
    }
  }

  function applyControlType() {
    const joysticks = $$('.joystick-container');
    const dpad = dom.dpadContainer;

    switch (state.controlType) {
      case 'joystick':
        joysticks.forEach(j => j.classList.remove('hidden'));
        dpad.classList.add('hidden');
        stopGyro();
        break;
      case 'dpad':
        joysticks.forEach(j => j.classList.add('hidden'));
        dpad.classList.remove('hidden');
        stopGyro();
        break;
      case 'gyro':
        joysticks.forEach(j => j.classList.remove('hidden'));
        dpad.classList.add('hidden');
        enableGyro();
        break;
    }
  }

  // ==========================================
  // Utilidades
  // ==========================================
  function vibrate(pattern) {
    if (state.vibration && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  let toastTimer = null;
  function showToast(message, type = '') {
    clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.className = 'toast ' + type;
    toastTimer = setTimeout(() => {
      dom.toast.classList.add('hidden');
    }, 2500);
  }

  function preventZoom() {
    // Prevenir doble-tap zoom
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, false);

    // Prevenir pinch zoom
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
  }

  // ==========================================
  // Service Worker
  // ==========================================
  async function registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        console.log('✅ Service Worker registrado:', reg.scope);
      } catch (error) {
        console.error('❌ Error registrando Service Worker:', error);
      }
    }
  }

  // ==========================================
  // Arrancar
  // ==========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
