/*
 * ============================================================================
 *  BRL CONTROL PRO - Arduino + RF Firmware
 *  Baja Robotics League - Robot de Fútbol
 * ============================================================================
 *
 *  Receptor RF conectado vía Serial Hardware (HC-12, APC220, o similar)
 *  El módulo PWA envía datos por Web Serial → USB → Serial → RF TX
 *  Este Arduino recibe por RF RX → Serial → Procesamiento
 *
 *  Compatible con:
 *  - HC-12 (Si4463 @ 433MHz) — recomendado
 *  - APC220
 *  - nRF24L01 (con librería RF24, requiere modificaciones)
 *  - Cualquier módulo serial transparente
 *
 *  CONEXIONES:
 *    Motor L:  IN1=7, IN2=8, ENA=5 (PWM)
 *    Motor R:  IN3=9, IN4=10, ENB=6 (PWM)
 *    Kick:     Servo en pin 3
 *    LED:      Pin 13 (built-in)
 *    Buzzer:   Pin 11
 *    RF:       Hardware Serial (RX=0, TX=1) a 9600 baud
 *              O SoftwareSerial en pines 2, 4 (configurable)
 *
 *  PROTOCOLO:
 *    Binario: [0xAA][CMD][MX][MY][RX][RY][SPD][0x55]
 *    JSON:    {"cmd":"move","mx":0.5,"my":-0.3,"rx":0,"ry":0,"spd":75}\n
 *    CSV:     move,0.5,-0.3,0,0,75\n
 *
 *  PLACA: Arduino Uno/Nano/Mega
 * ============================================================================
 */

#include <Servo.h>

// ============================================================================
//  Descomenta UNA de las siguientes opciones de Serial
// ============================================================================

// Opción 1: Usar Hardware Serial (pin 0/1) — más confiable
#define USE_HARDWARE_SERIAL

// Opción 2: Usar SoftwareSerial — deja libre el USB para debug
// #define USE_SOFTWARE_SERIAL
// #include <SoftwareSerial.h>
// #define SOFT_RX 2
// #define SOFT_TX 4
// SoftwareSerial rfSerial(SOFT_RX, SOFT_TX);

// ============================================================================
//  CONFIGURACIÓN DE PINES
// ============================================================================

// Motor Izquierdo (L298N)
#define MOTOR_L_IN1   7
#define MOTOR_L_IN2   8
#define MOTOR_L_PWM   5   // Pin PWM

// Motor Derecho (L298N)
#define MOTOR_R_IN1   9
#define MOTOR_R_IN2   10
#define MOTOR_R_PWM   6   // Pin PWM

// Periféricos
#define KICK_PIN      3   // Servo (pin PWM)
#define LED_PIN       13
#define BUZZER_PIN    11

// Comunicación
#define BAUD_RATE     9600
#define COMMAND_TIMEOUT_MS 500

// ============================================================================
//  VARIABLES
// ============================================================================

Servo kickServo;

// Estado del robot
float moveX = 0, moveY = 0, rotateX = 0, rotateY = 0;
int speedPercent = 50;
String mode = "manual";
bool emergency = false;
unsigned long lastCommandTime = 0;

// Buffer serial
#define BUFFER_SIZE 128
uint8_t serialBuf[BUFFER_SIZE];
int bufPos = 0;

// Para texto
String textBuffer = "";

// ============================================================================
//  HELPER: obtener referencia al stream serial RF
// ============================================================================

#ifdef USE_SOFTWARE_SERIAL
#define RF_SERIAL rfSerial
#else
#define RF_SERIAL Serial
#endif

// ============================================================================
//  SETUP
// ============================================================================

void setup() {
  // Pines de motor
  pinMode(MOTOR_L_IN1, OUTPUT);
  pinMode(MOTOR_L_IN2, OUTPUT);
  pinMode(MOTOR_L_PWM, OUTPUT);
  pinMode(MOTOR_R_IN1, OUTPUT);
  pinMode(MOTOR_R_IN2, OUTPUT);
  pinMode(MOTOR_R_PWM, OUTPUT);
  stopMotors();

  // Servo
  kickServo.attach(KICK_PIN);
  kickServo.write(0);

  // LED & Buzzer
  pinMode(LED_PIN, OUTPUT);
  if (BUZZER_PIN >= 0) pinMode(BUZZER_PIN, OUTPUT);

  // Serial
  #ifdef USE_SOFTWARE_SERIAL
    Serial.begin(115200);  // USB para debug
    rfSerial.begin(BAUD_RATE);
    Serial.println(F("[BRL] SoftwareSerial RF listo"));
  #else
    Serial.begin(BAUD_RATE);
  #endif

  // Indicación
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH); delay(100);
    digitalWrite(LED_PIN, LOW); delay(100);
  }
  if (BUZZER_PIN >= 0) {
    tone(BUZZER_PIN, 1000, 100); delay(150);
    tone(BUZZER_PIN, 1500, 100);
  }

  #ifdef USE_SOFTWARE_SERIAL
    Serial.println(F("[BRL] Arduino RF Receptor listo"));
  #endif
}

// ============================================================================
//  LOOP
// ============================================================================

void loop() {
  // Leer datos del serial RF
  while (RF_SERIAL.available()) {
    uint8_t b = RF_SERIAL.read();
    
    // Detectar inicio binario
    if (b == 0xAA && bufPos == 0) {
      serialBuf[0] = b;
      bufPos = 1;
    }
    // Acumulando binario
    else if (bufPos > 0 && bufPos < 8) {
      serialBuf[bufPos++] = b;
      if (bufPos == 8) {
        if (serialBuf[7] == 0x55) {
          processBinary(serialBuf, 8);
        }
        bufPos = 0;
      }
    }
    // Texto (JSON o CSV)
    else {
      bufPos = 0; // resetear buffer binario
      if (b == '\n' || b == '\r') {
        if (textBuffer.length() > 0) {
          processText(textBuffer);
          textBuffer = "";
        }
      }
      else if (b == '}') {
        textBuffer += (char)b;
        int start = textBuffer.indexOf('{');
        if (start >= 0) {
          processText(textBuffer.substring(start));
        }
        textBuffer = "";
      }
      else if (textBuffer.length() < 200) {
        textBuffer += (char)b;
      }
      else {
        textBuffer = ""; // overflow protection
      }
    }
  }

  // Timeout de seguridad
  if (millis() - lastCommandTime > COMMAND_TIMEOUT_MS && !emergency) {
    if (moveX != 0 || moveY != 0 || rotateX != 0 || rotateY != 0) {
      moveX = 0; moveY = 0; rotateX = 0; rotateY = 0;
      updateMotors();
    }
  }

  if (emergency) stopMotors();

  // LED: parpadeo lento si sin comandos, sólido si activo
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  if (emergency) {
    if (millis() - lastBlink > 100) {
      ledState = !ledState; digitalWrite(LED_PIN, ledState); lastBlink = millis();
    }
  } else if (millis() - lastCommandTime < 1000) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    if (millis() - lastBlink > 1000) {
      ledState = !ledState; digitalWrite(LED_PIN, ledState); lastBlink = millis();
    }
  }
}

// ============================================================================
//  PROCESAMIENTO BINARIO
// ============================================================================

void processBinary(uint8_t* d, size_t len) {
  if (len < 8 || d[0] != 0xAA || d[7] != 0x55) return;
  lastCommandTime = millis();

  uint8_t cmd = d[1];
  float mx = ((int)d[2] - 128) / 127.0;
  float my = ((int)d[3] - 128) / 127.0;
  float rx = ((int)d[4] - 128) / 127.0;
  float ry = ((int)d[5] - 128) / 127.0;
  int spd = d[6];

  #ifdef USE_SOFTWARE_SERIAL
    Serial.print(F("[BIN] cmd=0x")); Serial.print(cmd, HEX);
    Serial.print(F(" mx=")); Serial.print(mx, 2);
    Serial.print(F(" my=")); Serial.print(my, 2);
    Serial.print(F(" spd=")); Serial.println(spd);
  #endif

  switch (cmd) {
    case 0x01: // Movimiento
      moveX = mx; moveY = my; rotateX = rx; rotateY = ry;
      speedPercent = constrain(spd, 0, 100);
      emergency = false;
      updateMotors();
      break;
    case 0x02: // Kick
      kick(spd);
      break;
    case 0x03: // Pase
      pass(spd);
      break;
    case 0x04: // Especial
      special(spd);
      break;
    case 0x05: // Stop
      moveX = 0; moveY = 0; rotateX = 0; rotateY = 0;
      updateMotors();
      break;
    case 0xFF: // Emergencia
      emergency = true;
      stopMotors();
      break;
    case 0x10: // Calibrar
      calibrate();
      break;
    case 0x11: // Cambiar modo
      cycleMode();
      break;
  }
}

// ============================================================================
//  PROCESAMIENTO DE TEXTO (JSON y CSV)
// ============================================================================

void processText(String text) {
  text.trim();
  if (text.length() == 0) return;
  lastCommandTime = millis();

  #ifdef USE_SOFTWARE_SERIAL
    Serial.print(F("[TXT] ")); Serial.println(text);
  #endif

  if (text.startsWith("{")) {
    processJSON(text);
  } else {
    processCSV(text);
  }
}

void processJSON(String json) {
  // Parser JSON manual (sin ArduinoJson para ahorrar memoria en Arduino Uno)
  String cmd = extractJsonString(json, "cmd");
  
  if (cmd == "move") {
    moveX = extractJsonFloat(json, "mx");
    moveY = extractJsonFloat(json, "my");
    rotateX = extractJsonFloat(json, "rx");
    rotateY = extractJsonFloat(json, "ry");
    speedPercent = (int)extractJsonFloat(json, "spd");
    if (speedPercent == 0) speedPercent = 50;
    emergency = false;
    updateMotors();
  }
  else if (cmd == "kick") { kick((int)extractJsonFloat(json, "spd")); }
  else if (cmd == "pass") { pass((int)extractJsonFloat(json, "spd")); }
  else if (cmd == "special") { special((int)extractJsonFloat(json, "spd")); }
  else if (cmd == "stop") {
    moveX = 0; moveY = 0; rotateX = 0; rotateY = 0;
    updateMotors();
  }
  else if (cmd == "emergency") { emergency = true; stopMotors(); }
  else if (cmd == "calibrate") { calibrate(); }
  else if (cmd == "mode") { cycleMode(); }
}

void processCSV(String csv) {
  // Formato: cmd,mx,my,rx,ry,spd
  int c1 = csv.indexOf(',');
  if (c1 < 0) return;
  String cmd = csv.substring(0, c1);
  csv = csv.substring(c1 + 1);

  if (cmd == "move") {
    float vals[5] = {0};
    for (int i = 0; i < 5 && csv.length() > 0; i++) {
      int cx = csv.indexOf(',');
      if (cx >= 0) {
        vals[i] = csv.substring(0, cx).toFloat();
        csv = csv.substring(cx + 1);
      } else {
        vals[i] = csv.toFloat();
        csv = "";
      }
    }
    moveX = vals[0]; moveY = vals[1]; rotateX = vals[2]; rotateY = vals[3];
    speedPercent = (int)vals[4];
    if (speedPercent == 0) speedPercent = 50;
    emergency = false;
    updateMotors();
  }
  else if (cmd == "kick") { kick(csv.toInt()); }
  else if (cmd == "pass") { pass(csv.toInt()); }
  else if (cmd == "special") { special(csv.toInt()); }
  else if (cmd == "stop") { moveX = 0; moveY = 0; rotateX = 0; rotateY = 0; updateMotors(); }
  else if (cmd == "emergency") { emergency = true; stopMotors(); }
  else if (cmd == "calibrate") { calibrate(); }
  else if (cmd == "mode") { cycleMode(); }
}

// ============================================================================
//  JSON PARSER MANUAL (para ahorrar RAM en Arduino Uno)
// ============================================================================

String extractJsonString(String json, String key) {
  String search = "\"" + key + "\":\"";
  int start = json.indexOf(search);
  if (start < 0) return "";
  start += search.length();
  int end = json.indexOf('"', start);
  if (end < 0) return "";
  return json.substring(start, end);
}

float extractJsonFloat(String json, String key) {
  // Buscar "key":valor  o  "key": valor
  String search1 = "\"" + key + "\":";
  int start = json.indexOf(search1);
  if (start < 0) return 0;
  start += search1.length();
  // Saltar espacios
  while (start < (int)json.length() && json[start] == ' ') start++;
  // Leer hasta , o }
  String numStr = "";
  while (start < (int)json.length()) {
    char c = json[start];
    if (c == ',' || c == '}' || c == ' ') break;
    numStr += c;
    start++;
  }
  return numStr.toFloat();
}

// ============================================================================
//  CONTROL DE MOTORES
// ============================================================================

void updateMotors() {
  // Differential drive con mezcla tank
  float fwd = moveY;
  float turn = rotateX;
  if (abs(turn) < 0.05) turn = moveX * 0.7;

  float lPower = constrain(fwd + turn, -1.0, 1.0) * (speedPercent / 100.0);
  float rPower = constrain(fwd - turn, -1.0, 1.0) * (speedPercent / 100.0);

  int lPWM = abs(lPower) * 255;
  int rPWM = abs(rPower) * 255;
  
  // Zona muerta
  if (lPWM < 25) lPWM = 0;
  if (rPWM < 25) rPWM = 0;

  // Motor izquierdo
  if (lPower > 0) {
    digitalWrite(MOTOR_L_IN1, HIGH); digitalWrite(MOTOR_L_IN2, LOW);
  } else if (lPower < 0) {
    digitalWrite(MOTOR_L_IN1, LOW); digitalWrite(MOTOR_L_IN2, HIGH);
  } else {
    digitalWrite(MOTOR_L_IN1, LOW); digitalWrite(MOTOR_L_IN2, LOW);
  }
  analogWrite(MOTOR_L_PWM, lPWM);

  // Motor derecho
  if (rPower > 0) {
    digitalWrite(MOTOR_R_IN1, HIGH); digitalWrite(MOTOR_R_IN2, LOW);
  } else if (rPower < 0) {
    digitalWrite(MOTOR_R_IN1, LOW); digitalWrite(MOTOR_R_IN2, HIGH);
  } else {
    digitalWrite(MOTOR_R_IN1, LOW); digitalWrite(MOTOR_R_IN2, LOW);
  }
  analogWrite(MOTOR_R_PWM, rPWM);
}

void stopMotors() {
  digitalWrite(MOTOR_L_IN1, LOW); digitalWrite(MOTOR_L_IN2, LOW);
  digitalWrite(MOTOR_R_IN1, LOW); digitalWrite(MOTOR_R_IN2, LOW);
  analogWrite(MOTOR_L_PWM, 0);
  analogWrite(MOTOR_R_PWM, 0);
}

// ============================================================================
//  ACCIONES
// ============================================================================

void kick(int power) {
  int angle = map(constrain(power, 0, 100), 0, 100, 45, 120);
  kickServo.write(angle);
  delay(150);
  kickServo.write(0);
  if (BUZZER_PIN >= 0) tone(BUZZER_PIN, 800, 50);
}

void pass(int power) {
  int angle = map(constrain(power, 0, 100), 0, 100, 20, 60);
  kickServo.write(angle);
  delay(200);
  kickServo.write(0);
}

void special(int power) {
  // Giro + patada
  digitalWrite(MOTOR_L_IN1, HIGH); digitalWrite(MOTOR_L_IN2, LOW);
  digitalWrite(MOTOR_R_IN1, LOW); digitalWrite(MOTOR_R_IN2, HIGH);
  analogWrite(MOTOR_L_PWM, 255);
  analogWrite(MOTOR_R_PWM, 255);
  delay(180);
  kickServo.write(120);
  delay(100);
  kickServo.write(0);
  stopMotors();
}

void calibrate() {
  stopMotors();
  kickServo.write(0);
  
  // Test motor izquierdo
  digitalWrite(MOTOR_L_IN1, HIGH); digitalWrite(MOTOR_L_IN2, LOW);
  analogWrite(MOTOR_L_PWM, 150);
  delay(300);
  analogWrite(MOTOR_L_PWM, 0);
  digitalWrite(MOTOR_L_IN1, LOW);

  // Test motor derecho
  digitalWrite(MOTOR_R_IN1, HIGH); digitalWrite(MOTOR_R_IN2, LOW);
  analogWrite(MOTOR_R_PWM, 150);
  delay(300);
  analogWrite(MOTOR_R_PWM, 0);
  digitalWrite(MOTOR_R_IN1, LOW);

  // Test kick
  kickServo.write(60);
  delay(300);
  kickServo.write(0);

  if (BUZZER_PIN >= 0) {
    tone(BUZZER_PIN, 1000, 100); delay(150);
    tone(BUZZER_PIN, 2000, 100);
  }
}

void cycleMode() {
  if (mode == "manual") mode = "auto";
  else if (mode == "auto") mode = "defend";
  else mode = "manual";
  
  #ifdef USE_SOFTWARE_SERIAL
    Serial.print(F("[MODE] ")); Serial.println(mode);
  #endif
}
