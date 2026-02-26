/**
 * RoboFútbol Control - Módulo WiFi
 * Conexión vía WebSocket
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

  /**
   * Verifica si WebSocket está disponible
   */
  isAvailable() {
    return 'WebSocket' in window;
  }

  /**
   * Conectar al robot vía WebSocket
   * @param {string} ip - Dirección IP del robot
   * @param {number} port - Puerto WebSocket
   */
  async connect(ip = '192.168.4.1', port = 81) {
    if (!this.isAvailable()) {
      throw new Error('WebSocket no está disponible');
    }

    // Cerrar conexión previa si existe
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
        
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        this.socket = new WebSocket(`${protocol}://${ip}:${port}`);
        this.socket.binaryType = 'arraybuffer';

        // Timeout de conexión
        const connectTimeout = setTimeout(() => {
          if (this.socket.readyState !== WebSocket.OPEN) {
            this.socket.close();
            this._updateStatus('disconnected', 'Timeout de conexión');
            reject(new Error('Timeout de conexión WiFi'));
          }
        }, 8000);

        this.socket.onopen = () => {
          clearTimeout(connectTimeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          this._updateStatus('connected', `Conectado a ${ip}:${port}`);
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
          this._updateStatus('disconnected', 'Error de conexión WiFi');
        };

      } catch (error) {
        this._updateStatus('disconnected', 'Error creando conexión WiFi');
        reject(error);
      }
    });
  }

  /**
   * Desconectar
   */
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

  /**
   * Enviar datos al robot
   * @param {Object|string} data
   */
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

  /**
   * Manejar datos recibidos
   */
  _handleData(data) {
    let parsedData;
    
    if (data instanceof ArrayBuffer) {
      parsedData = new TextDecoder().decode(data);
    } else {
      parsedData = data;
    }

    // Manejar pong
    if (parsedData === 'pong') {
      this.lastPong = Date.now();
      return;
    }

    if (this.onDataReceived) {
      this.onDataReceived(parsedData, 'wifi');
    }
  }

  /**
   * Iniciar heartbeat ping
   */
  _startPing() {
    this._stopPing();
    this.lastPong = Date.now();
    
    this.pingInterval = setInterval(() => {
      if (this.connected && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send('ping');
        
        // Verificar si el último pong fue hace más de 10 segundos
        if (Date.now() - this.lastPong > 10000 && this.lastPong > 0) {
          console.warn('Sin respuesta de ping, posible desconexión');
        }
      }
    }, 5000);
  }

  /**
   * Detener heartbeat
   */
  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Esperar a que el socket se cierre
   */
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
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 2000);
    });
  }

  /**
   * Actualizar estado
   */
  _updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange(state, message, 'wifi');
    }
  }

  /**
   * Obtener latencia estimada
   */
  getLatency() {
    return this.lastPong > 0 ? Date.now() - this.lastPong : null;
  }
}

// Exportar como singleton
window.wifiConn = new WiFiConnection();
