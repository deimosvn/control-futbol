/*
 * ============================================================================
 *  BRL CONTROL PRO - ESP32 Firmware (Solo Bluetooth BLE)
 *  Baja Robotics League - Robot de Fútbol
 * ============================================================================
 *
 *  Versión simplificada: Solo Bluetooth BLE (sin WiFi)
 *  Ideal para conexiones directas desde el celular
 *
 *  Usa el mismo protocolo y hardware que la versión WiFi+BLE
 *  Ventaja: menor consumo de energía al no usar WiFi
 *
 *  CONEXIONES IGUALES al firmware wifi_ble:
 *    Motor Izq:  IN1=27, IN2=26, ENA=14
 *    Motor Der:  IN3=25, IN4=33, ENB=32
 *    Kick:       GPIO 13 (Servo)
 *    LED:        GPIO 2
 *    Buzzer:     GPIO 4
 *    Batería:    GPIO 34
 *
 * ============================================================================
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// ============================================================================
//  CONFIGURACIÓN
// ============================================================================

#define BLE_NAME "BRL-BOT-01"

// Pines de Motor (L298N)
#define MOTOR_L_IN1   27
#define MOTOR_L_IN2   26
#define MOTOR_L_PWM   14
#define MOTOR_R_IN1   25
#define MOTOR_R_IN2   33
#define MOTOR_R_PWM   32

#define KICK_PIN      13
#define LED_PIN       2
#define BUZZER_PIN    4
#define BATTERY_PIN   34

#define BATTERY_MAX   4.2
#define BATTERY_MIN   3.3
#define BATTERY_DIVIDER_FACTOR 2.0

#define PWM_FREQ      5000
#define PWM_RESOLUTION 8
#define PWM_CHANNEL_L  0
#define PWM_CHANNEL_R  1

#define SERVICE_UUID        "0000ffe0-0000-1000-8000-00805f9b34fb"
#define CHARACTERISTIC_UUID "0000ffe1-0000-1000-8000-00805f9b34fb"

#define COMMAND_TIMEOUT_MS  500
#define BATTERY_READ_INTERVAL 5000

// ============================================================================
//  VARIABLES
// ============================================================================

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

Servo kickServo;

struct RobotState {
  float moveX = 0, moveY = 0, rotateX = 0, rotateY = 0;
  int speed = 50;
  String mode = "manual";
  bool emergency = false;
  unsigned long lastCommandTime = 0;
  int batteryPercent = -1;
} robot;

unsigned long lastBatteryRead = 0;
String bleBuffer = "";

// ============================================================================
//  BLE CALLBACKS
// ============================================================================

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("[BLE] Conectado");
    for (int i = 0; i < 2; i++) { digitalWrite(LED_PIN, HIGH); delay(100); digitalWrite(LED_PIN, LOW); delay(100); }
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("[BLE] Desconectado");
    pServer->startAdvertising();
  }
};

class CharCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCh) {
    String value = pCh->getValue().c_str();
    if (value.length() == 0) return;

    if (value.length() >= 8 && (uint8_t)value[0] == 0xAA && (uint8_t)value[7] == 0x55) {
      processBinary((uint8_t*)value.c_str(), value.length());
    } else {
      bleBuffer += value;
      int nl = bleBuffer.indexOf('\n');
      int br = bleBuffer.indexOf('}');
      if (nl >= 0) {
        processText(bleBuffer.substring(0, nl));
        bleBuffer = bleBuffer.substring(nl + 1);
      } else if (br >= 0 && bleBuffer.indexOf('{') >= 0) {
        processText(bleBuffer.substring(bleBuffer.indexOf('{'), br + 1));
        bleBuffer = bleBuffer.substring(br + 1);
      }
    }
  }
};

// ============================================================================
//  SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== BRL Control - BLE Only ===");

  // Motores
  pinMode(MOTOR_L_IN1, OUTPUT); pinMode(MOTOR_L_IN2, OUTPUT);
  pinMode(MOTOR_R_IN1, OUTPUT); pinMode(MOTOR_R_IN2, OUTPUT);
  ledcSetup(PWM_CHANNEL_L, PWM_FREQ, PWM_RESOLUTION);
  ledcSetup(PWM_CHANNEL_R, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(MOTOR_L_PWM, PWM_CHANNEL_L);
  ledcAttachPin(MOTOR_R_PWM, PWM_CHANNEL_R);
  stopMotors();

  // Kick
  kickServo.attach(KICK_PIN);
  kickServo.write(0);

  // LED & Buzzer
  pinMode(LED_PIN, OUTPUT);
  if (BUZZER_PIN >= 0) pinMode(BUZZER_PIN, OUTPUT);

  // BLE
  BLEDevice::init(BLE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());
  BLEService* svc = pServer->createService(SERVICE_UUID);
  pCharacteristic = svc->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR | BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setCallbacks(new CharCallbacks());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Listo: " + String(BLE_NAME));
  if (BUZZER_PIN >= 0) { tone(BUZZER_PIN, 1000, 100); delay(150); tone(BUZZER_PIN, 1500, 100); }
}

// ============================================================================
//  LOOP
// ============================================================================

void loop() {
  // Timeout de seguridad
  if (millis() - robot.lastCommandTime > COMMAND_TIMEOUT_MS && !robot.emergency) {
    if (robot.moveX != 0 || robot.moveY != 0 || robot.rotateX != 0 || robot.rotateY != 0) {
      robot.moveX = 0; robot.moveY = 0; robot.rotateX = 0; robot.rotateY = 0;
      updateMotors();
    }
  }

  if (robot.emergency) stopMotors();

  // Batería
  if (BATTERY_PIN >= 0 && millis() - lastBatteryRead > BATTERY_READ_INTERVAL) {
    readBattery();
    lastBatteryRead = millis();
    if (deviceConnected) {
      String msg = "{\"bat\":" + String(robot.batteryPercent) + "}";
      pCharacteristic->setValue(msg.c_str());
      pCharacteristic->notify();
    }
  }

  // Reconexión BLE
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  // LED estado
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  if (robot.emergency) {
    if (millis() - lastBlink > 100) { ledState = !ledState; digitalWrite(LED_PIN, ledState); lastBlink = millis(); }
  } else if (deviceConnected) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    if (millis() - lastBlink > 1000) { ledState = !ledState; digitalWrite(LED_PIN, ledState); lastBlink = millis(); }
  }
}

// ============================================================================
//  PROCESAMIENTO
// ============================================================================

void processBinary(uint8_t* d, size_t len) {
  if (len < 8 || d[0] != 0xAA || d[7] != 0x55) return;
  robot.lastCommandTime = millis();
  uint8_t cmd = d[1];
  float mx = ((int)d[2] - 128) / 127.0;
  float my = ((int)d[3] - 128) / 127.0;
  float rx = ((int)d[4] - 128) / 127.0;
  float ry = ((int)d[5] - 128) / 127.0;
  int spd = d[6];

  switch (cmd) {
    case 0x01:
      robot.moveX = mx; robot.moveY = my; robot.rotateX = rx; robot.rotateY = ry;
      robot.speed = constrain(spd, 0, 100); robot.emergency = false;
      updateMotors(); break;
    case 0x02: kick(spd); break;
    case 0x03: pass(spd); break;
    case 0x04: special(spd); break;
    case 0x05:
      robot.moveX = 0; robot.moveY = 0; robot.rotateX = 0; robot.rotateY = 0;
      updateMotors(); break;
    case 0xFF: robot.emergency = true; stopMotors(); break;
    case 0x10: calibrate(); break;
    case 0x11: cycleMode(); break;
  }
}

void processText(String text) {
  text.trim();
  if (text.length() == 0) return;
  robot.lastCommandTime = millis();

  if (text.startsWith("{")) {
    StaticJsonDocument<256> doc;
    if (!deserializeJson(doc, text)) {
      String cmd = doc["cmd"] | "";
      if (cmd == "move") {
        robot.moveX = doc["mx"] | 0.0; robot.moveY = doc["my"] | 0.0;
        robot.rotateX = doc["rx"] | 0.0; robot.rotateY = doc["ry"] | 0.0;
        robot.speed = doc["spd"] | 50; robot.emergency = false;
        updateMotors();
      }
      else if (cmd == "kick") kick(doc["spd"] | 100);
      else if (cmd == "pass") pass(doc["spd"] | 50);
      else if (cmd == "special") special(doc["spd"] | 100);
      else if (cmd == "stop") { robot.moveX = 0; robot.moveY = 0; robot.rotateX = 0; robot.rotateY = 0; updateMotors(); }
      else if (cmd == "emergency") { robot.emergency = true; stopMotors(); }
      else if (cmd == "calibrate") calibrate();
      else if (cmd == "mode") cycleMode();
    }
  }
}

// ============================================================================
//  MOTORES
// ============================================================================

void updateMotors() {
  float fwd = robot.moveY;
  float turn = robot.rotateX;
  if (abs(turn) < 0.05) turn = robot.moveX * 0.7;

  float lp = constrain(fwd + turn, -1.0, 1.0) * (robot.speed / 100.0);
  float rp = constrain(fwd - turn, -1.0, 1.0) * (robot.speed / 100.0);

  int lPWM = abs(lp) * 255; if (lPWM < 25) lPWM = 0;
  int rPWM = abs(rp) * 255; if (rPWM < 25) rPWM = 0;

  digitalWrite(MOTOR_L_IN1, lp > 0); digitalWrite(MOTOR_L_IN2, lp < 0);
  ledcWrite(PWM_CHANNEL_L, lPWM);
  digitalWrite(MOTOR_R_IN1, rp > 0); digitalWrite(MOTOR_R_IN2, rp < 0);
  ledcWrite(PWM_CHANNEL_R, rPWM);
}

void stopMotors() {
  digitalWrite(MOTOR_L_IN1, LOW); digitalWrite(MOTOR_L_IN2, LOW);
  digitalWrite(MOTOR_R_IN1, LOW); digitalWrite(MOTOR_R_IN2, LOW);
  ledcWrite(PWM_CHANNEL_L, 0); ledcWrite(PWM_CHANNEL_R, 0);
}

// ============================================================================
//  ACCIONES
// ============================================================================

void kick(int power) {
  int angle = map(constrain(power, 0, 100), 0, 100, 45, 120);
  kickServo.write(angle); delay(150); kickServo.write(0);
  if (BUZZER_PIN >= 0) tone(BUZZER_PIN, 800, 50);
}

void pass(int power) {
  int angle = map(constrain(power, 0, 100), 0, 100, 20, 60);
  kickServo.write(angle); delay(200); kickServo.write(0);
}

void special(int power) {
  digitalWrite(MOTOR_L_IN1, HIGH); digitalWrite(MOTOR_L_IN2, LOW);
  digitalWrite(MOTOR_R_IN1, LOW); digitalWrite(MOTOR_R_IN2, HIGH);
  ledcWrite(PWM_CHANNEL_L, 255); ledcWrite(PWM_CHANNEL_R, 255);
  delay(180);
  kickServo.write(120); delay(100); kickServo.write(0);
  stopMotors();
}

void calibrate() {
  stopMotors(); kickServo.write(0);
  digitalWrite(MOTOR_L_IN1, HIGH); ledcWrite(PWM_CHANNEL_L, 150); delay(300);
  ledcWrite(PWM_CHANNEL_L, 0); digitalWrite(MOTOR_L_IN1, LOW);
  digitalWrite(MOTOR_R_IN1, HIGH); ledcWrite(PWM_CHANNEL_R, 150); delay(300);
  ledcWrite(PWM_CHANNEL_R, 0); digitalWrite(MOTOR_R_IN1, LOW);
  kickServo.write(60); delay(300); kickServo.write(0);
  if (BUZZER_PIN >= 0) { tone(BUZZER_PIN, 1000, 100); delay(150); tone(BUZZER_PIN, 2000, 100); }
}

void cycleMode() {
  if (robot.mode == "manual") robot.mode = "auto";
  else if (robot.mode == "auto") robot.mode = "defend";
  else robot.mode = "manual";
  if (deviceConnected) {
    String msg = "{\"mode\":\"" + robot.mode + "\"}";
    pCharacteristic->setValue(msg.c_str());
    pCharacteristic->notify();
  }
}

void readBattery() {
  if (BATTERY_PIN < 0) return;
  long sum = 0;
  for (int i = 0; i < 10; i++) { sum += analogRead(BATTERY_PIN); delay(1); }
  float v = (sum / 10.0 / 4095.0) * 3.3 * BATTERY_DIVIDER_FACTOR;
  robot.batteryPercent = map(constrain(v * 100, BATTERY_MIN * 100, BATTERY_MAX * 100), BATTERY_MIN * 100, BATTERY_MAX * 100, 0, 100);
}
