/**
 * BRL Control Pro - Módulo Bluetooth BLE
 * Conexión real vía Web Bluetooth API para ESP32/HM-10
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

    // UUIDs para módulos BLE (HM-10, ESP32, etc.)
    this.SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
    this.TX_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
    this.RX_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

    // Nordic UART Service (NUS) - ESP32 BLE
    this.NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.NUS_TX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
    this.NUS_RX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  }

  isAvailable() {
    return 'bluetooth' in navigator;
  }

  async connect() {
    if (!this.isAvailable()) {
      throw new Error('Web Bluetooth no disponible');
    }

    try {
      this._updateStatus('connecting', 'Buscando dispositivo...');

      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [this.SERVICE_UUID] },
          { services: [this.NUS_SERVICE_UUID] },
          { namePrefix: 'BRL' },
          { namePrefix: 'Robo' },
          { namePrefix: 'ESP' },
          { namePrefix: 'BT' },
          { namePrefix: 'HC' },
          { namePrefix: 'HM' }
        ],
        optionalServices: [this.SERVICE_UUID, this.NUS_SERVICE_UUID]
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this._handleDisconnect();
      });

      this._updateStatus('connecting', `Conectando a ${this.device.name || 'dispositivo'}...`);
      this.server = await this.device.gatt.connect();

      // Intentar servicio estándar FFE0
      try {
        this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
        this.txCharacteristic = await this.service.getCharacteristic(this.TX_CHAR_UUID);

        try {
          const rxChar = await this.service.getCharacteristic(this.RX_CHAR_UUID);
          await rxChar.startNotifications();
          rxChar.addEventListener('characteristicvaluechanged', (event) => {
            this._handleData(event.target.value);
          });
        } catch (e) {
          console.log('RX notifications no disponibles (servicio estándar)');
        }
      } catch (e) {
        // Fallback: Nordic UART Service
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
          console.log('RX notifications no disponibles (NUS)');
        }
      }

      this.connected = true;
      this._updateStatus('connected', `BT: ${this.device.name || 'Conectado'}`);
      return true;

    } catch (error) {
      this.connected = false;
      if (error.name === 'NotFoundError') {
        this._updateStatus('disconnected', 'Sin dispositivo seleccionado');
        throw new Error('No se seleccionó dispositivo');
      }
      this._updateStatus('disconnected', 'Error de conexión BT');
      throw error;
    }
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._handleDisconnect();
  }

  async send(data) {
    if (!this.connected || !this.txCharacteristic) return false;

    try {
      let payload;
      if (typeof data === 'string') {
        payload = new TextEncoder().encode(data);
      } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        payload = data;
      } else {
        payload = new TextEncoder().encode(JSON.stringify(data));
      }

      // BLE limit: 20 bytes per write, fragment if needed
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

  _handleData(dataView) {
    const decoder = new TextDecoder();
    const value = decoder.decode(dataView);
    if (this.onDataReceived) {
      this.onDataReceived(value, 'bluetooth');
    }
  }

  _handleDisconnect() {
    this.connected = false;
    this.server = null;
    this.service = null;
    this.txCharacteristic = null;
    this._updateStatus('disconnected', 'BT desconectado');
  }

  _updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange(state, message, 'bluetooth');
    }
  }

  getDeviceName() {
    return this.device ? this.device.name || 'Dispositivo BT' : null;
  }
}

window.bluetoothConn = new BluetoothConnection();
