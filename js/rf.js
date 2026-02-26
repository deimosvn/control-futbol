/**
 * BRL Control Pro - Módulo Radio Frecuencia
 * Conexión real vía Web Serial API para módulos RF (nRF24L01, HC-12, etc.)
 */
class RFConnection {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.connected = false;
    this.readLoop = null;
    this.onStatusChange = null;
    this.onDataReceived = null;
    this.baudRate = 115200;
    this._readBuffer = '';
  }

  isAvailable() {
    return 'serial' in navigator;
  }

  async connect(baudRate = 115200) {
    if (!this.isAvailable()) {
      throw new Error('Web Serial API no disponible. Usa Chrome/Edge en escritorio.');
    }

    try {
      this._updateStatus('connecting', 'Selecciona el puerto serial...');
      this.baudRate = baudRate;

      this.port = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x1A86 }, // CH340
          { usbVendorId: 0x0403 }, // FTDI
          { usbVendorId: 0x10C4 }, // CP210x
          { usbVendorId: 0x067B }, // Prolific
          { usbVendorId: 0x2341 }, // Arduino
          { usbVendorId: 0x239A }, // Adafruit
          { usbVendorId: 0x303A }, // Espressif
        ]
      });

      this._updateStatus('connecting', `Abriendo puerto a ${baudRate} baud...`);

      await this.port.open({
        baudRate: baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });

      this.writer = this.port.writable.getWriter();
      this._startReading();

      this.connected = true;
      this._updateStatus('connected', `RF: ${baudRate} baud`);

      navigator.serial.addEventListener('disconnect', (event) => {
        if (event.target === this.port) {
          this._handleDisconnect();
        }
      });

      return true;

    } catch (error) {
      this.connected = false;
      if (error.name === 'NotFoundError') {
        this._updateStatus('disconnected', 'Sin puerto seleccionado');
        throw new Error('No se seleccionó puerto serial');
      }
      this._updateStatus('disconnected', 'Error abriendo puerto');
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
      }
    } catch (error) {
      console.error('Error cerrando puerto serial:', error);
    }
    this._handleDisconnect();
  }

  async send(data) {
    if (!this.connected || !this.writer) return false;

    try {
      let payload;
      if (typeof data === 'string') {
        payload = data;
      } else if (data instanceof Uint8Array) {
        await this.writer.write(data);
        return true;
      } else {
        payload = JSON.stringify(data);
      }

      const encoded = new TextEncoder().encode(payload + '\n');
      await this.writer.write(encoded);
      return true;
    } catch (error) {
      console.error('Error enviando datos RF:', error);
      return false;
    }
  }

  async _startReading() {
    this.reader = this.port.readable.getReader();

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;

        if (value) {
          const text = new TextDecoder().decode(value);
          this._readBuffer += text;

          let lineEnd;
          while ((lineEnd = this._readBuffer.indexOf('\n')) !== -1) {
            const line = this._readBuffer.substring(0, lineEnd).trim();
            this._readBuffer = this._readBuffer.substring(lineEnd + 1);
            if (line.length > 0) {
              this._handleData(line);
            }
          }

          if (this._readBuffer.length > 1024) {
            this._handleData(this._readBuffer);
            this._readBuffer = '';
          }
        }
      }
    } catch (error) {
      if (error.name !== 'TypeError' && error.message !== 'The device has been lost.') {
        console.error('Error leyendo puerto serial:', error);
      }
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
      }
    }
  }

  _handleData(data) {
    if (this.onDataReceived) {
      this.onDataReceived(data, 'rf');
    }
  }

  _handleDisconnect() {
    this.connected = false;
    this.reader = null;
    this.writer = null;
    this._readBuffer = '';
    this._updateStatus('disconnected', 'RF desconectado');
  }

  _updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange(state, message, 'rf');
    }
  }

  async sendATCommand(command) {
    if (!this.connected) return null;
    return new Promise(async (resolve) => {
      let response = '';
      const originalHandler = this.onDataReceived;
      this.onDataReceived = (data) => { response += data; };
      await this.send(command);
      setTimeout(() => {
        this.onDataReceived = originalHandler;
        resolve(response);
      }, 500);
    });
  }
}

window.rfConn = new RFConnection();
