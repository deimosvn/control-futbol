/*
 * ============================================================================
 *  BRL CONTROL PRO - ESP32 Firmware (WiFi + Bluetooth BLE)
 *  Baja Robotics League - Robot de Fútbol
 * ============================================================================
 *
 *  Este firmware corre en la ESP32 del robot.
 *  Soporta control simultáneo vía WiFi (WebSocket) y Bluetooth BLE.
 *
 *  PROTOCOLO BINARIO (8 bytes):
 *    [0xAA][CMD][MX][MY][RX][RY][SPD][0x55]
 *    - 0xAA = Header
 *    - CMD  = Comando (0x01=move, 0x02=kick, 0x03=pass, 0x04=special,
 *             0x05=stop, 0xFF=emergency, 0x10=calibrate, 0x11=mode)
 *    - MX   = Movimiento X (0-255, 128=centro)
 *    - MY   = Movimiento Y (0-255, 128=centro)
 *    - RX   = Rotación X (0-255, 128=centro)
 *    - RY   = Rotación Y (0-255, 128=centro)
 *    - SPD  = Velocidad (0-100)
 *    - 0x55 = Footer
 *
 *  TAMBIÉN soporta JSON: {"cmd":"move","mx":0.5,"my":-0.3,"spd":75}
 *  TAMBIÉN soporta CSV:  move,0.5,-0.3,0,0,75
 *
 *  HARDWARE REQUERIDO:
 *    - ESP32 DevKit V1 (o similar)
 *    - Puente H L298N (2 motores DC) o L293D
 *    - Servo/Solenoide para mecanismo de pateo
 *    - LED indicador de estado (opcional)
 *    - Buzzer (opcional)
 *    - Divisor de voltaje para lectura de batería (opcional)
 *
 *  CONEXIONES (ver archivo WIRING.md para diagrama completo):
 *    Motor Izquierdo:  IN1=GPIO 27, IN2=GPIO 26, ENA=GPIO 14 (PWM)
 *    Motor Derecho:    IN3=GPIO 25, IN4=GPIO 33, ENB=GPIO 32 (PWM)
 *    Kick Servo/Solen: GPIO 13
 *    LED Status:       GPIO 2 (LED builtin)
 *    Buzzer:           GPIO 4
 *    Battery ADC:      GPIO 34 (ADC1_CH6)
 *
 *  INSTALACIÓN:
 *    1. Abrir en Arduino IDE o PlatformIO
 *    2. Seleccionar placa: "ESP32 Dev Module"
 *    3. Instalar librería: WebSocketsServer (por Markus Sattler)
 *       -> En Arduino IDE: Sketch > Include Library > Manage Libraries
 *       -> Buscar "WebSockets" por Markus Sattler
 *    4. Instalar librería: ArduinoJson (por Benoit Blanchon)
 *    5. Subir el código a la ESP32
 *
 * ============================================================================
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// ============================================================================
//  CONFIGURACIÓN - MODIFICA ESTOS VALORES SEGÚN TU ROBOT
// ============================================================================

// --- WiFi Access Point ---
const char* AP_SSID     = "BRL-BOT-01";     // Nombre de la red WiFi del robot
const char* AP_PASSWORD = "brl12345";         // Contraseña (mínimo 8 caracteres)
const int   WS_PORT     = 81;                 // Puerto WebSocket

// --- Pines de Motor (L298N) ---
// Motor Izquierdo
#define MOTOR_L_IN1   27
#define MOTOR_L_IN2   26
#define MOTOR_L_PWM   14

// Motor Derecho
#define MOTOR_R_IN1   25
#define MOTOR_R_IN2   33
#define MOTOR_R_PWM   32

// --- Pin de Pateo (Servo o Solenoide) ---
#define KICK_PIN      13

// --- Indicadores ---
#define LED_PIN       2     // LED integrado ESP32
#define BUZZER_PIN    4     // Buzzer (opcional, -1 para desactivar)

// --- Batería ---
#define BATTERY_PIN   34    // ADC para lectura de batería (-1 para desactivar)
#define BATTERY_MAX   4.2   // Voltaje máximo de la batería (LiPo)
#define BATTERY_MIN   3.3   // Voltaje mínimo
// Divisor de voltaje: R1=100K, R2=100K -> factor = 2
#define BATTERY_DIVIDER_FACTOR 2.0

// --- PWM Config ---
#define PWM_FREQ      5000
#define PWM_RESOLUTION 8    // 8 bits = 0-255
#define PWM_CHANNEL_L  0
#define PWM_CHANNEL_R  1

// --- BLE UUIDs ---
#define SERVICE_UUID        "0000ffe0-0000-1000-8000-00805f9b34fb"
#define CHARACTERISTIC_UUID "0000ffe1-0000-1000-8000-00805f9b34fb"

// --- Timeouts ---
#define COMMAND_TIMEOUT_MS  500   // Si no recibe comando en 500ms, para motores
#define BATTERY_READ_INTERVAL 5000 // Leer batería cada 5 segundos

// ============================================================================
//  VARIABLES GLOBALES
// ============================================================================

WebSocketsServer webSocket(WS_PORT);
Servo kickServo;

// BLE
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool bleDeviceConnected = false;
bool bleOldDeviceConnected = false;

// Estado del robot
struct RobotState {
  float moveX = 0;      // -1.0 a 1.0
  float moveY = 0;      // -1.0 a 1.0
  float rotateX = 0;    // -1.0 a 1.0
  float rotateY = 0;    // -1.0 a 1.0
  int speed = 50;        // 0-100
  String mode = "manual"; // manual, auto, defend
  bool emergency = false;
  unsigned long lastCommandTime = 0;
  int batteryPercent = -1;
} robot;

// Control de motores
int leftMotorSpeed = 0;
int rightMotorSpeed = 0;

// Timers
unsigned long lastBatteryRead = 0;

// Buffer para BLE
String bleBuffer = "";

// ============================================================================
//  BLE CALLBACKS
// ============================================================================

class BLEServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    bleDeviceConnected = true;
    Serial.println("[BLE] Dispositivo conectado");
    blinkLED(2, 100);
  }

  void onDisconnect(BLEServer* pServer) {
    bleDeviceConnected = false;
    Serial.println("[BLE] Dispositivo desconectado");
    // Reiniciar advertising para aceptar nueva conexión
    pServer->startAdvertising();
  }
};

class BLECharCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    String value = pCharacteristic->getValue().c_str();

    if (value.length() > 0) {
      // Verificar si es protocolo binario
      if (value.length() >= 8 &&
          (uint8_t)value[0] == 0xAA &&
          (uint8_t)value[7] == 0x55) {
        processBinaryCommand((uint8_t*)value.c_str(), value.length());
      } else {
        // Acumular en buffer para datos de texto (pueden llegar fragmentados)
        bleBuffer += value;

        // Procesar líneas completas o JSON completo
        int newlinePos = bleBuffer.indexOf('\n');
        int braceEnd = bleBuffer.indexOf('}');

        if (newlinePos >= 0) {
          String line = bleBuffer.substring(0, newlinePos);
          bleBuffer = bleBuffer.substring(newlinePos + 1);
          processTextCommand(line);
        } else if (braceEnd >= 0 && bleBuffer.indexOf('{') >= 0) {
          String json = bleBuffer.substring(bleBuffer.indexOf('{'), braceEnd + 1);
          bleBuffer = bleBuffer.substring(braceEnd + 1);
          processTextCommand(json);
        }
      }
    }
  }
};

// ============================================================================
//  SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("  BRL CONTROL PRO - ESP32 Firmware");
  Serial.println("  Baja Robotics League");
  Serial.println("========================================");

  // --- Configurar pines ---
  setupMotors();
  setupKick();
  setupIndicators();

  // --- Iniciar WiFi AP ---
  setupWiFi();

  // --- Iniciar WebSocket ---
  setupWebSocket();

  // --- Iniciar BLE ---
  setupBLE();

  // --- Listo ---
  Serial.println("[READY] Robot listo para recibir comandos");
  Serial.printf("[WiFi] SSID: %s | IP: %s | WS Port: %d\n",
                AP_SSID, WiFi.softAPIP().toString().c_str(), WS_PORT);
  Serial.println("[BLE] Nombre: " + String(AP_SSID));

  blinkLED(3, 150);
  if (BUZZER_PIN >= 0) {
    tone(BUZZER_PIN, 1000, 100);
    delay(150);
    tone(BUZZER_PIN, 1500, 100);
  }
}

// ============================================================================
//  LOOP PRINCIPAL
// ============================================================================

void loop() {
  // Procesar WebSocket
  webSocket.loop();

  // Verificar timeout de comandos (seguridad)
  if (millis() - robot.lastCommandTime > COMMAND_TIMEOUT_MS && !robot.emergency) {
    if (robot.moveX != 0 || robot.moveY != 0 || robot.rotateX != 0 || robot.rotateY != 0) {
      robot.moveX = 0;
      robot.moveY = 0;
      robot.rotateX = 0;
      robot.rotateY = 0;
      updateMotors();
    }
  }

  // Parada de emergencia
  if (robot.emergency) {
    stopAllMotors();
  }

  // Leer batería periódicamente
  if (BATTERY_PIN >= 0 && millis() - lastBatteryRead > BATTERY_READ_INTERVAL) {
    readBattery();
    lastBatteryRead = millis();

    // Enviar estado de batería
    String batMsg = "{\"bat\":" + String(robot.batteryPercent) + "}";
    broadcastMessage(batMsg);
  }

  // BLE: manejar reconexión
  if (!bleDeviceConnected && bleOldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    bleOldDeviceConnected = bleDeviceConnected;
  }
  if (bleDeviceConnected && !bleOldDeviceConnected) {
    bleOldDeviceConnected = bleDeviceConnected;
  }

  // LED de estado
  updateStatusLED();
}

// ============================================================================
//  SETUP DE HARDWARE
// ============================================================================

void setupMotors() {
  // Pines de dirección
  pinMode(MOTOR_L_IN1, OUTPUT);
  pinMode(MOTOR_L_IN2, OUTPUT);
  pinMode(MOTOR_R_IN1, OUTPUT);
  pinMode(MOTOR_R_IN2, OUTPUT);

  // PWM para velocidad
  ledcSetup(PWM_CHANNEL_L, PWM_FREQ, PWM_RESOLUTION);
  ledcSetup(PWM_CHANNEL_R, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(MOTOR_L_PWM, PWM_CHANNEL_L);
  ledcAttachPin(MOTOR_R_PWM, PWM_CHANNEL_R);

  // Motores apagados
  stopAllMotors();

  Serial.println("[MOTORS] Configurados - L298N");
}

void setupKick() {
  kickServo.attach(KICK_PIN);
  kickServo.write(0); // Posición inicial (recogido)
  Serial.println("[KICK] Servo configurado en pin " + String(KICK_PIN));
}

void setupIndicators() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  if (BUZZER_PIN >= 0) {
    pinMode(BUZZER_PIN, OUTPUT);
  }
}

void setupWiFi() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  Serial.println("[WiFi] Access Point creado");
  Serial.println("[WiFi] IP: " + WiFi.softAPIP().toString());
}

void setupWebSocket() {
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("[WS] WebSocket iniciado en puerto " + String(WS_PORT));
}

void setupBLE() {
  BLEDevice::init(AP_SSID);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new BLEServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setCallbacks(new BLECharCallbacks());

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Servicio BLE iniciado");
}

// ============================================================================
//  WEBSOCKET EVENTS
// ============================================================================

void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Cliente #%u desconectado\n", num);
      break;

    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[WS] Cliente #%u conectado desde %s\n", num, ip.toString().c_str());
      blinkLED(1, 200);

      // Enviar estado inicial
      String welcome = "{\"status\":\"connected\",\"bat\":" + String(robot.batteryPercent) +
                       ",\"mode\":\"" + robot.mode + "\"}";
      webSocket.sendTXT(num, welcome);
      break;
    }

    case WStype_TEXT: {
      String text = String((char*)payload);

      // Manejar ping/pong
      if (text == "ping") {
        webSocket.sendTXT(num, "pong");
        return;
      }

      processTextCommand(text);
      break;
    }

    case WStype_BIN: {
      if (length >= 8 && payload[0] == 0xAA && payload[7] == 0x55) {
        processBinaryCommand(payload, length);
      }
      break;
    }
  }
}

// ============================================================================
//  PROCESAMIENTO DE COMANDOS
// ============================================================================

/**
 * Procesar comando binario (8 bytes) - PROTOCOLO PRINCIPAL
 * [0xAA][CMD][MX][MY][RX][RY][SPD][0x55]
 */
void processBinaryCommand(uint8_t* data, size_t len) {
  if (len < 8 || data[0] != 0xAA || data[7] != 0x55) return;

  uint8_t cmd = data[1];
  float mx = ((int)data[2] - 128) / 127.0;  // 0-255 → -1.0..1.0
  float my = ((int)data[3] - 128) / 127.0;
  float rx = ((int)data[4] - 128) / 127.0;
  float ry = ((int)data[5] - 128) / 127.0;
  int spd = data[6];

  robot.lastCommandTime = millis();

  switch (cmd) {
    case 0x01: // Move
      robot.moveX = mx;
      robot.moveY = my;
      robot.rotateX = rx;
      robot.rotateY = ry;
      robot.speed = constrain(spd, 0, 100);
      robot.emergency = false;
      updateMotors();
      break;

    case 0x02: // Kick
      executeKick(spd);
      break;

    case 0x03: // Pass (pateo suave)
      executePass(spd);
      break;

    case 0x04: // Special
      executeSpecial(spd);
      break;

    case 0x05: // Stop
      robot.moveX = 0;
      robot.moveY = 0;
      robot.rotateX = 0;
      robot.rotateY = 0;
      robot.emergency = false;
      updateMotors();
      break;

    case 0xFF: // Emergency
      robot.emergency = true;
      stopAllMotors();
      Serial.println("[!!!] PARADA DE EMERGENCIA");
      if (BUZZER_PIN >= 0) {
        tone(BUZZER_PIN, 2000, 500);
      }
      break;

    case 0x10: // Calibrate
      calibrateRobot();
      break;

    case 0x11: // Mode change
      cycleMode();
      break;
  }
}

/**
 * Procesar comando de texto (JSON o CSV)
 */
void processTextCommand(String text) {
  text.trim();
  if (text.length() == 0) return;

  robot.lastCommandTime = millis();

  // Intentar JSON
  if (text.startsWith("{")) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, text);

    if (!error) {
      String cmd = doc["cmd"] | "unknown";

      if (cmd == "move") {
        robot.moveX = doc["mx"] | 0.0;
        robot.moveY = doc["my"] | 0.0;
        robot.rotateX = doc["rx"] | 0.0;
        robot.rotateY = doc["ry"] | 0.0;
        robot.speed = doc["spd"] | 50;
        robot.emergency = false;
        updateMotors();
      }
      else if (cmd == "kick")      executeKick(doc["spd"] | 100);
      else if (cmd == "pass")      executePass(doc["spd"] | 50);
      else if (cmd == "special")   executeSpecial(doc["spd"] | 100);
      else if (cmd == "stop") {
        robot.moveX = 0;
        robot.moveY = 0;
        robot.rotateX = 0;
        robot.rotateY = 0;
        robot.emergency = false;
        updateMotors();
      }
      else if (cmd == "emergency") {
        robot.emergency = true;
        stopAllMotors();
        if (BUZZER_PIN >= 0) tone(BUZZER_PIN, 2000, 500);
      }
      else if (cmd == "calibrate") calibrateRobot();
      else if (cmd == "mode")      cycleMode();
    }
    return;
  }

  // Intentar CSV: cmd,mx,my,rx,ry,spd
  int commaIndex = text.indexOf(',');
  if (commaIndex > 0) {
    String cmd = text.substring(0, commaIndex);
    // Parse remaining values
    String remaining = text.substring(commaIndex + 1);
    float values[5] = {0, 0, 0, 0, 50};
    int vi = 0;

    while (remaining.length() > 0 && vi < 5) {
      int nextComma = remaining.indexOf(',');
      if (nextComma >= 0) {
        values[vi++] = remaining.substring(0, nextComma).toFloat();
        remaining = remaining.substring(nextComma + 1);
      } else {
        values[vi++] = remaining.toFloat();
        break;
      }
    }

    if (cmd == "move") {
      robot.moveX = values[0];
      robot.moveY = values[1];
      robot.rotateX = values[2];
      robot.rotateY = values[3];
      robot.speed = (int)values[4];
      robot.emergency = false;
      updateMotors();
    }
    else if (cmd == "kick")      executeKick((int)values[0]);
    else if (cmd == "pass")      executePass((int)values[0]);
    else if (cmd == "special")   executeSpecial((int)values[0]);
    else if (cmd == "stop") {
      robot.moveX = 0;
      robot.moveY = 0;
      robot.rotateX = 0;
      robot.rotateY = 0;
      updateMotors();
    }
    else if (cmd == "emergency") {
      robot.emergency = true;
      stopAllMotors();
    }
  }
}

// ============================================================================
//  CONTROL DE MOTORES
// ============================================================================

/**
 * Actualizar motores usando control diferencial (tank drive)
 * moveY = avanzar/retroceder, moveX o rotateX = girar
 */
void updateMotors() {
  // Mezcla diferencial: combinar movimiento lineal con rotación
  float forward = robot.moveY;         // -1 a 1 (adelante/atrás)
  float turn = robot.rotateX;          // -1 a 1 (izquierda/derecha)

  // Si no hay rotación del joystick derecho, usar moveX para giro
  if (abs(turn) < 0.05) {
    turn = robot.moveX * 0.7; // El moveX también puede girar, con menor intensidad
  }

  // Calcular velocidad de cada motor (tank drive mixing)
  float leftPower  = forward + turn;
  float rightPower = forward - turn;

  // Limitar a -1..1
  leftPower  = constrain(leftPower, -1.0, 1.0);
  rightPower = constrain(rightPower, -1.0, 1.0);

  // Aplicar velocidad global (0-100 → factor 0.0-1.0)
  float speedFactor = robot.speed / 100.0;
  leftPower  *= speedFactor;
  rightPower *= speedFactor;

  // Convertir a PWM (0-255)
  int leftPWM  = abs(leftPower) * 255;
  int rightPWM = abs(rightPower) * 255;

  // Zona muerta del motor (evitar zumbido sin movimiento)
  if (leftPWM < 25) leftPWM = 0;
  if (rightPWM < 25) rightPWM = 0;

  // Motor izquierdo
  if (leftPower > 0) {
    digitalWrite(MOTOR_L_IN1, HIGH);
    digitalWrite(MOTOR_L_IN2, LOW);
  } else if (leftPower < 0) {
    digitalWrite(MOTOR_L_IN1, LOW);
    digitalWrite(MOTOR_L_IN2, HIGH);
  } else {
    digitalWrite(MOTOR_L_IN1, LOW);
    digitalWrite(MOTOR_L_IN2, LOW);
  }
  ledcWrite(PWM_CHANNEL_L, leftPWM);

  // Motor derecho
  if (rightPower > 0) {
    digitalWrite(MOTOR_R_IN1, HIGH);
    digitalWrite(MOTOR_R_IN2, LOW);
  } else if (rightPower < 0) {
    digitalWrite(MOTOR_R_IN1, LOW);
    digitalWrite(MOTOR_R_IN2, HIGH);
  } else {
    digitalWrite(MOTOR_R_IN1, LOW);
    digitalWrite(MOTOR_R_IN2, LOW);
  }
  ledcWrite(PWM_CHANNEL_R, rightPWM);

  leftMotorSpeed = leftPWM;
  rightMotorSpeed = rightPWM;
}

void stopAllMotors() {
  digitalWrite(MOTOR_L_IN1, LOW);
  digitalWrite(MOTOR_L_IN2, LOW);
  digitalWrite(MOTOR_R_IN1, LOW);
  digitalWrite(MOTOR_R_IN2, LOW);
  ledcWrite(PWM_CHANNEL_L, 0);
  ledcWrite(PWM_CHANNEL_R, 0);
  leftMotorSpeed = 0;
  rightMotorSpeed = 0;
}

// ============================================================================
//  ACCIONES ESPECIALES
// ============================================================================

/**
 * Patear: mover servo rápido hacia adelante y regresar
 * El ángulo se ajusta según la velocidad (potencia)
 */
void executeKick(int power) {
  int angle = map(constrain(power, 0, 100), 0, 100, 45, 120);
  Serial.printf("[KICK] Potencia: %d, Ángulo: %d°\n", power, angle);

  kickServo.write(angle);
  delay(150);             // Mantener posición de pateo
  kickServo.write(0);     // Regresar

  if (BUZZER_PIN >= 0) tone(BUZZER_PIN, 800, 50);

  broadcastMessage("{\"action\":\"kick\",\"power\":" + String(power) + "}");
}

/**
 * Pasar: pateo suave controlado
 */
void executePass(int power) {
  int angle = map(constrain(power, 0, 100), 0, 100, 20, 60);
  Serial.printf("[PASS] Potencia: %d, Ángulo: %d°\n", power, angle);

  kickServo.write(angle);
  delay(200);
  kickServo.write(0);

  if (BUZZER_PIN >= 0) tone(BUZZER_PIN, 600, 50);

  broadcastMessage("{\"action\":\"pass\",\"power\":" + String(power) + "}");
}

/**
 * Especial: movimiento rápido + pateo (gambeta + disparo)
 */
void executeSpecial(int power) {
  Serial.println("[SPECIAL] Ejecutando movimiento especial");

  // Giro rápido de 180ms
  digitalWrite(MOTOR_L_IN1, HIGH);
  digitalWrite(MOTOR_L_IN2, LOW);
  digitalWrite(MOTOR_R_IN1, LOW);
  digitalWrite(MOTOR_R_IN2, HIGH);
  ledcWrite(PWM_CHANNEL_L, 255);
  ledcWrite(PWM_CHANNEL_R, 255);
  delay(180);

  // Pateo fuerte
  kickServo.write(120);
  delay(100);
  kickServo.write(0);

  // Detener motores
  stopAllMotors();

  if (BUZZER_PIN >= 0) {
    tone(BUZZER_PIN, 1200, 50);
    delay(60);
    tone(BUZZER_PIN, 1500, 50);
  }

  broadcastMessage("{\"action\":\"special\"}");
}

void calibrateRobot() {
  Serial.println("[CALIBRATE] Calibrando robot...");
  stopAllMotors();
  kickServo.write(0);

  // Test rápido de motores
  Serial.println("[CALIBRATE] Test motor izquierdo...");
  digitalWrite(MOTOR_L_IN1, HIGH);
  digitalWrite(MOTOR_L_IN2, LOW);
  ledcWrite(PWM_CHANNEL_L, 150);
  delay(300);
  ledcWrite(PWM_CHANNEL_L, 0);
  digitalWrite(MOTOR_L_IN1, LOW);

  Serial.println("[CALIBRATE] Test motor derecho...");
  digitalWrite(MOTOR_R_IN1, HIGH);
  digitalWrite(MOTOR_R_IN2, LOW);
  ledcWrite(PWM_CHANNEL_R, 150);
  delay(300);
  ledcWrite(PWM_CHANNEL_R, 0);
  digitalWrite(MOTOR_R_IN1, LOW);

  Serial.println("[CALIBRATE] Test kick servo...");
  kickServo.write(60);
  delay(300);
  kickServo.write(0);

  Serial.println("[CALIBRATE] Calibración completa");
  broadcastMessage("{\"action\":\"calibrated\"}");

  if (BUZZER_PIN >= 0) {
    tone(BUZZER_PIN, 1000, 100);
    delay(150);
    tone(BUZZER_PIN, 1500, 100);
    delay(150);
    tone(BUZZER_PIN, 2000, 100);
  }
}

void cycleMode() {
  if (robot.mode == "manual") robot.mode = "auto";
  else if (robot.mode == "auto") robot.mode = "defend";
  else robot.mode = "manual";

  Serial.println("[MODE] Modo: " + robot.mode);
  broadcastMessage("{\"mode\":\"" + robot.mode + "\"}");

  if (BUZZER_PIN >= 0) tone(BUZZER_PIN, 1200, 80);
}

// ============================================================================
//  BATERÍA
// ============================================================================

void readBattery() {
  if (BATTERY_PIN < 0) {
    robot.batteryPercent = -1;
    return;
  }

  // Leer ADC (promedio de 10 lecturas)
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(BATTERY_PIN);
    delay(1);
  }
  float adcValue = sum / 10.0;

  // Convertir a voltaje (ESP32 ADC: 0-4095 = 0-3.3V)
  float voltage = (adcValue / 4095.0) * 3.3 * BATTERY_DIVIDER_FACTOR;

  // Mapear a porcentaje
  robot.batteryPercent = map(
    constrain(voltage * 100, BATTERY_MIN * 100, BATTERY_MAX * 100),
    BATTERY_MIN * 100, BATTERY_MAX * 100,
    0, 100
  );

  Serial.printf("[BAT] Voltaje: %.2fV | Nivel: %d%%\n", voltage, robot.batteryPercent);
}

// ============================================================================
//  COMUNICACIÓN
// ============================================================================

/**
 * Enviar mensaje a todos los clientes conectados (WS + BLE)
 */
void broadcastMessage(String message) {
  // WebSocket: enviar a todos los clientes
  webSocket.broadcastTXT(message);

  // BLE: enviar via notificación
  if (bleDeviceConnected && pCharacteristic) {
    pCharacteristic->setValue(message.c_str());
    pCharacteristic->notify();
  }
}

// ============================================================================
//  INDICADORES
// ============================================================================

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    if (i < times - 1) delay(delayMs);
  }
}

void updateStatusLED() {
  static unsigned long lastBlink = 0;
  static bool ledState = false;

  if (robot.emergency) {
    // Parpadeo rápido en emergencia
    if (millis() - lastBlink > 100) {
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
      lastBlink = millis();
    }
  } else if (bleDeviceConnected || webSocket.connectedClients() > 0) {
    // LED encendido fijo cuando hay conexión
    digitalWrite(LED_PIN, HIGH);
  } else {
    // Parpadeo lento cuando espera conexión
    if (millis() - lastBlink > 1000) {
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
      lastBlink = millis();
    }
  }
}
