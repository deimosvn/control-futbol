/**
 * BRL Control Pro - Módulo WiFi
 * Conexión real vía WebSocket a ESP32
 */
class WiFiConnection {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.reconnectTimer = null;
    this.autoReconnect = true;
    this.onStatusChange = null;
    this.onDataReceived = null;
    this.pingInterval = null;
    this.lastPong = 0;
  }

  isAvailable() {
    return 'WebSocket' in window;
  }

  async connect(ip = '192.168.4.1', port = 81) {
    if (!this.isAvailable()) {
      throw new Error('WebSocket no disponible');
    }

    if (this.socket) {
      this.autoReconnect = false;
      this.socket.close();
      await this._waitForClose();
    }

    this.autoReconnect = true;
    this.reconnectAttempts = 0;

    return new Promise((resolve, reject) => {
      try {
        this._updateStatus('connecting', `Conectando a ${ip}:${port}...`);

        // ESP32 en modo AP siempre usa ws:// (sin SSL)
        this.socket = new WebSocket(`ws://${ip}:${port}`);
        this.socket.binaryType = 'arraybuffer';

        const connectTimeout = setTimeout(() => {
          if (this.socket.readyState !== WebSocket.OPEN) {
            this.socket.close();
            this._updateStatus('disconnected', 'Timeout de conexión');
            reject(new Error('Timeout: no se pudo conectar al robot'));
          }
        }, 8000);

        this.socket.onopen = () => {
          clearTimeout(connectTimeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          this._updateStatus('connected', `WiFi: ${ip}`);
          this._startPing();
          resolve(true);
        };

        this.socket.onmessage = (event) => {
          this._handleData(event.data);
        };

        this.socket.onclose = (event) => {
          clearTimeout(connectTimeout);
          this.connected = false;
          this._stopPing();

          if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this._updateStatus('connecting', `Reconectando (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.reconnectTimer = setTimeout(() => {
              this.connect(ip, port).catch(() => {});
            }, this.reconnectDelay);
          } else {
            this._updateStatus('disconnected', 'WiFi desconectado');
          }
        };

        this.socket.onerror = (error) => {
          console.error('Error WebSocket:', error);
        };

      } catch (error) {
        this._updateStatus('disconnected', 'Error de conexión WiFi');
        reject(error);
      }
    });
  }

  async disconnect() {
    this.autoReconnect = false;
    clearTimeout(this.reconnectTimer);
    this._stopPing();

    if (this.socket) {
      this.socket.close(1000, 'Desconexión manual');
    }

    this.connected = false;
    this._updateStatus('disconnected', 'WiFi desconectado');
  }

  send(data) {
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      if (typeof data === 'string') {
        this.socket.send(data);
      } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        this.socket.send(data);
      } else {
        this.socket.send(JSON.stringify(data));
      }
      return true;
    } catch (error) {
      console.error('Error enviando datos WiFi:', error);
      return false;
    }
  }

  _handleData(data) {
    let parsedData;
    if (data instanceof ArrayBuffer) {
      parsedData = new TextDecoder().decode(data);
    } else {
      parsedData = data;
    }

    if (parsedData === 'pong') {
      this.lastPong = Date.now();
      return;
    }

    if (this.onDataReceived) {
      this.onDataReceived(parsedData, 'wifi');
    }
  }

  _startPing() {
    this._stopPing();
    this.lastPong = Date.now();

    this.pingInterval = setInterval(() => {
      if (this.connected && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send('ping');

        if (Date.now() - this.lastPong > 10000 && this.lastPong > 0) {
          console.warn('Sin respuesta de ping, posible desconexión');
        }
      }
    }, 5000);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  _waitForClose() {
    return new Promise((resolve) => {
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      const check = setInterval(() => {
        if (this.socket.readyState === WebSocket.CLOSED) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 2000);
    });
  }

  _updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange(state, message, 'wifi');
    }
  }

  getLatency() {
    return this.lastPong > 0 ? Date.now() - this.lastPong : null;
  }
}

window.wifiConn = new WiFiConnection();
