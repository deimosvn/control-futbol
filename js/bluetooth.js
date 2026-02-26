/**
 * RoboFútbol Control - Módulo Bluetooth
 * Conexión vía Web Bluetooth API
 */
class BluetoothConnection {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
    this.connected = false;
    this.onStatusChange = null;
    this.onDataReceived = null;

    // UUIDs comunes para módulos BLE (HM-10, BLE-Nano, ESP32, etc.)
    this.SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
    this.TX_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
    this.RX_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

    // UUIDs alternativos para Nordic UART Service (NUS)
    this.NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.NUS_TX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
    this.NUS_RX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  }

  /**
   * Verifica si Web Bluetooth está disponible
   */
  isAvailable() {
    return 'bluetooth' in navigator;
  }

  /**
   * Conectar al dispositivo Bluetooth
   */
  async connect() {
    if (!this.isAvailable()) {
      throw new Error('Web Bluetooth no está disponible en este navegador');
    }

    try {
      this._updateStatus('connecting', 'Buscando dispositivo...');

      // Solicitar dispositivo con filtros para servicios comunes de robots
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [this.SERVICE_UUID] },
          { services: [this.NUS_SERVICE_UUID] },
          { namePrefix: 'Robo' },
          { namePrefix: 'BT' },
          { namePrefix: 'HC' },
          { namePrefix: 'HM' },
          { namePrefix: 'ESP' }
        ],
        optionalServices: [this.SERVICE_UUID, this.NUS_SERVICE_UUID]
      });

      // Listener para desconexión
      this.device.addEventListener('gattserverdisconnected', () => {
        this._handleDisconnect();
      });

      this._updateStatus('connecting', `Conectando a ${this.device.name || 'dispositivo'}...`);

      // Conectar al servidor GATT
      this.server = await this.device.gatt.connect();

      // Intentar obtener el servicio principal
      try {
        this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
        this.txCharacteristic = await this.service.getCharacteristic(this.TX_CHAR_UUID);
        
        // Intentar suscribirse a notificaciones RX
        try {
          const rxChar = await this.service.getCharacteristic(this.RX_CHAR_UUID);
          await rxChar.startNotifications();
          rxChar.addEventListener('characteristicvaluechanged', (event) => {
            this._handleData(event.target.value);
          });
        } catch (e) {
          console.log('RX notifications no disponibles en servicio estándar');
        }
      } catch (e) {
        // Intentar con Nordic UART Service
        console.log('Intentando Nordic UART Service...');
        this.service = await this.server.getPrimaryService(this.NUS_SERVICE_UUID);
        this.txCharacteristic = await this.service.getCharacteristic(this.NUS_TX_UUID);
        
        try {
          const rxChar = await this.service.getCharacteristic(this.NUS_RX_UUID);
          await rxChar.startNotifications();
          rxChar.addEventListener('characteristicvaluechanged', (event) => {
            this._handleData(event.target.value);
          });
        } catch (e2) {
          console.log('RX notifications no disponibles en NUS');
        }
      }

      this.connected = true;
      this._updateStatus('connected', `Conectado a ${this.device.name || 'dispositivo BT'}`);
      return true;

    } catch (error) {
      this.connected = false;
      if (error.name === 'NotFoundError') {
        this._updateStatus('disconnected', 'No se seleccionó ningún dispositivo');
        throw new Error('No se seleccionó ningún dispositivo');
      }
      this._updateStatus('disconnected', 'Error de conexión');
      throw error;
    }
  }

  /**
   * Desconectar
   */
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._handleDisconnect();
  }

  /**
   * Enviar datos al robot
   * @param {Object|string} data - Datos para enviar
   */
  async send(data) {
    if (!this.connected || !this.txCharacteristic) {
      return false;
    }

    try {
      let payload;
      if (typeof data === 'string') {
        payload = new TextEncoder().encode(data);
      } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        payload = data;
      } else {
        payload = new TextEncoder().encode(JSON.stringify(data));
      }

      // BLE tiene límite de 20 bytes por escritura, fragmentar si es necesario
      const maxChunkSize = 20;
      const dataArray = payload instanceof Uint8Array ? payload : new Uint8Array(payload);

      for (let i = 0; i < dataArray.length; i += maxChunkSize) {
        const chunk = dataArray.slice(i, i + maxChunkSize);
        await this.txCharacteristic.writeValueWithoutResponse(chunk);
      }

      return true;
    } catch (error) {
      console.error('Error enviando datos BT:', error);
      return false;
    }
  }

  /**
   * Manejar datos recibidos
   */
  _handleData(dataView) {
    const decoder = new TextDecoder();
    const value = decoder.decode(dataView);
    
    if (this.onDataReceived) {
      this.onDataReceived(value, 'bluetooth');
    }
  }

  /**
   * Manejar desconexión
   */
  _handleDisconnect() {
    this.connected = false;
    this.server = null;
    this.service = null;
    this.txCharacteristic = null;
    this._updateStatus('disconnected', 'Bluetooth desconectado');
  }

  /**
   * Actualizar estado
   */
  _updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange(state, message, 'bluetooth');
    }
  }

  /**
   * Obtener nombre del dispositivo
   */
  getDeviceName() {
    return this.device ? this.device.name || 'Dispositivo BT' : null;
  }
}

// Exportar como singleton
window.bluetoothConn = new BluetoothConnection();
