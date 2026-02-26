/**
 * RoboFútbol Control - Módulo Radio Frecuencia
 * Conexión vía Web Serial API (para módulos RF como nRF24L01, HC-12, LoRa, etc.)
 * Requiere un adaptador USB-Serial conectado al transmisor RF
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

  /**
   * Verifica si Web Serial está disponible
   */
  isAvailable() {
    return 'serial' in navigator;
  }

  /**
   * Conectar al transmisor RF vía puerto serial
   * @param {number} baudRate - Velocidad de baudios
   */
  async connect(baudRate = 115200) {
    if (!this.isAvailable()) {
      throw new Error('Web Serial API no está disponible. Usa Chrome/Edge en escritorio.');
    }

    try {
      this._updateStatus('connecting', 'Selecciona el puerto serial...');
      this.baudRate = baudRate;

      // Solicitar puerto serial al usuario
      this.port = await navigator.serial.requestPort({
        filters: [
          // Filtros comunes para adaptadores USB-Serial
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

      // Abrir puerto
      await this.port.open({
        baudRate: baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });

      // Configurar writer
      this.writer = this.port.writable.getWriter();

      // Iniciar lectura
      this._startReading();

      this.connected = true;
      this._updateStatus('connected', `RF conectado a ${baudRate} baud`);

      // Listener para desconexión del puerto
      navigator.serial.addEventListener('disconnect', (event) => {
        if (event.target === this.port) {
          this._handleDisconnect();
        }
      });

      return true;

    } catch (error) {
      this.connected = false;
      if (error.name === 'NotFoundError') {
        this._updateStatus('disconnected', 'No se seleccionó ningún puerto');
        throw new Error('No se seleccionó ningún puerto serial');
      }
      this._updateStatus('disconnected', 'Error abriendo puerto serial');
      throw error;
    }
  }

  /**
   * Desconectar
   */
  async disconnect() {
    try {
      // Cancelar lectura
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }

      // Cerrar writer
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }

      // Cerrar puerto
      if (this.port) {
        await this.port.close();
      }
    } catch (error) {
      console.error('Error cerrando puerto serial:', error);
    }

    this._handleDisconnect();
  }

  /**
   * Enviar datos al transmisor RF
   * @param {Object|string} data
   */
  async send(data) {
    if (!this.connected || !this.writer) {
      return false;
    }

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

      // Agregar terminador de línea
      const encoded = new TextEncoder().encode(payload + '\n');
      await this.writer.write(encoded);
      return true;

    } catch (error) {
      console.error('Error enviando datos RF:', error);
      return false;
    }
  }

  /**
   * Iniciar loop de lectura
   */
  async _startReading() {
    this.reader = this.port.readable.getReader();

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        
        if (done) {
          break;
        }

        if (value) {
          const text = new TextDecoder().decode(value);
          this._readBuffer += text;

          // Procesar líneas completas
          let lineEnd;
          while ((lineEnd = this._readBuffer.indexOf('\n')) !== -1) {
            const line = this._readBuffer.substring(0, lineEnd).trim();
            this._readBuffer = this._readBuffer.substring(lineEnd + 1);

            if (line.length > 0) {
              this._handleData(line);
            }
          }

          // Limpiar buffer si es muy largo (datos sin newline)
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

  /**
   * Manejar datos recibidos
   */
  _handleData(data) {
    if (this.onDataReceived) {
      this.onDataReceived(data, 'rf');
    }
  }

  /**
   * Manejar desconexión
   */
  _handleDisconnect() {
    this.connected = false;
    this.reader = null;
    this.writer = null;
    this._readBuffer = '';
    this._updateStatus('disconnected', 'RF desconectado');
  }

  /**
   * Actualizar estado
   */
  _updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange(state, message, 'rf');
    }
  }

  /**
   * Enviar comando AT (para configurar módulo RF)
   * @param {string} command - Comando AT
   */
  async sendATCommand(command) {
    if (!this.connected) return null;
    
    return new Promise(async (resolve) => {
      let response = '';
      const originalHandler = this.onDataReceived;
      
      this.onDataReceived = (data) => {
        response += data;
      };

      await this.send(command);

      setTimeout(() => {
        this.onDataReceived = originalHandler;
        resolve(response);
      }, 500);
    });
  }
}

// Exportar como singleton
window.rfConn = new RFConnection();
