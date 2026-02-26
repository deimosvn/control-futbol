# ============================================================================
#  BRL CONTROL PRO - Guía de Cableado / Wiring Guide
#  Baja Robotics League - Robot de Fútbol
# ============================================================================

## Componentes Necesarios

### Opción A: ESP32 (WiFi + Bluetooth)
- 1x ESP32 DevKit V1
- 1x L298N Motor Driver
- 2x Motores DC (con caja reductora, 6V-12V)
- 1x Micro Servo SG90 o MG90S (mecanismo de patada)
- 1x LED (indicador de estado) - opcional, hay LED built-in en GPIO 2
- 1x Buzzer activo 5V
- 1x Batería LiPo 2S (7.4V) o 3S (11.1V) con conector XT60
- 2x Resistencias 10kΩ (divisor de voltaje para batería)
- 1x Interruptor de encendido
- Cables dupont, PCB o protoboard

### Opción B: Arduino Uno/Nano + Módulo RF
- 1x Arduino Uno o Nano
- 1x HC-12 Módulo RF 433MHz (receptor)
- 1x HC-12 Módulo RF 433MHz (transmisor - conectado a PC por USB)
- 1x USB-Serial adapter (CH340, FTDI, CP2102) para el HC-12 transmisor
- 1x L298N Motor Driver
- 2x Motores DC
- 1x Micro Servo SG90
- 1x Buzzer activo 5V
- Fuente de alimentación 7-12V

---

## DIAGRAMA ESP32 + L298N + Servo

```
                    ┌─────────────────────────────────────┐
                    │            ESP32 DevKit              │
                    │                                      │
   LED ◄──────────│ GPIO 2              GPIO 27 ─────────│──► L298N IN1
   Buzzer ◄───────│ GPIO 4              GPIO 26 ─────────│──► L298N IN2
                    │                    GPIO 14 ─────────│──► L298N ENA
   Bat ADC ◄──────│ GPIO 34             GPIO 25 ─────────│──► L298N IN3
                    │                    GPIO 33 ─────────│──► L298N IN4
   Servo ◄────────│ GPIO 13             GPIO 32 ─────────│──► L298N ENB
                    │                                      │
                    │         3V3  5V  GND                 │
                    └──────────┼────┼────┼─────────────────┘
                               │    │    │
                               │    │    └───────────────────── GND común
                               │    └────────────────────────── 5V (entrada regulada)
                               └─────────────────────────────── 3.3V ref

        ┌──────────────────────────────────────────────┐
        │                  L298N                        │
        │                                              │
        │  IN1 ◄── GPIO 27     OUT1 ──► Motor Izq (+) │
        │  IN2 ◄── GPIO 26     OUT2 ──► Motor Izq (-) │
        │  ENA ◄── GPIO 14                             │
        │                                              │
        │  IN3 ◄── GPIO 25     OUT3 ──► Motor Der (+)  │
        │  IN4 ◄── GPIO 33     OUT4 ──► Motor Der (-)  │
        │  ENB ◄── GPIO 32                             │
        │                                              │
        │  +12V ◄── Batería (+)                        │
        │  GND  ◄── Batería (-) ── ESP32 GND           │
        │  +5V  ──► ESP32 5V  (regulador 5V interno)   │
        └──────────────────────────────────────────────┘

  ⚠️  IMPORTANTE: Quitar el jumper de 5V del L298N SOLO si alimentas
      el ESP32 desde USB. Si usas el regulador del L298N, déjalo puesto.


  DIVISOR DE VOLTAJE PARA BATERÍA:
  ─────────────────────────────────
  
  Batería (+) ──── [R1 = 10kΩ] ──┬── GPIO 34 (ADC)
                                   │
                                   [R2 = 10kΩ]
                                   │
  GND ────────────────────────────┘

  Esto divide el voltaje a la mitad:
  - 8.4V batería → 4.2V al ADC (dentro del rango 3.3V? No!)
  
  ⚠️  Para baterías > 6.6V, usar R1=20kΩ y R2=10kΩ (divide por 3):
  - 8.4V → 2.8V ✓
  - 12.6V → 4.2V ⚠️ (límite, usar R1=30kΩ R2=10kΩ para 3S)
  
  Ajustar BATTERY_DIVIDER_FACTOR en el firmware según tu divisor.


  SERVO (Mecanismo de Patada):
  ───────────────────────────
  
  Servo Naranja (Signal) ──► GPIO 13
  Servo Rojo (VCC)       ──► 5V
  Servo Marrón (GND)     ──► GND
  
  ⚠️  Si el servo es grande (MG996R), alimentar con fuente separada.
      Los servos pequeños (SG90) pueden ir directo al 5V del regulador.
```

---

## DIAGRAMA ARDUINO + L298N + HC-12

```
                    ┌─────────────────────────────────────┐
                    │           Arduino Uno/Nano           │
                    │                                      │
   LED (built-in)  │ Pin 13              Pin 7  ──────────│──► L298N IN1
   Buzzer ◄────────│ Pin 11              Pin 8  ──────────│──► L298N IN2
                    │                    Pin 5 (PWM)──────│──► L298N ENA
                    │                    Pin 9  ──────────│──► L298N IN3
   Servo ◄─────────│ Pin 3 (PWM)        Pin 10 ──────────│──► L298N IN4
                    │                    Pin 6 (PWM)──────│──► L298N ENB
   HC-12 TX ──────►│ Pin 0 (RX)                           │
   HC-12 RX ◄──────│ Pin 1 (TX)                           │
                    │                                      │
                    │           5V    GND                   │
                    └───────────┼──────┼───────────────────┘
                                │      │
                                │      └──── GND común
                                └───────── 5V
  
  
  HC-12 MÓDULO (Receptor - en el robot):
  ───────────────────────────────────────
  
  HC-12 VCC ──► 5V Arduino
  HC-12 GND ──► GND Arduino
  HC-12 TXD ──► Pin 0 (RX) Arduino
  HC-12 RXD ──► Pin 1 (TX) Arduino
  HC-12 SET ──► No conectar (o pin digital para configurar)

  ⚠️  Desconectar HC-12 de Pin 0/1 cuando subas el código al Arduino,
      ya que comparten el mismo serial que el USB.
      
  ALTERNATIVA: Usar SoftwareSerial (pines 2 y 4):
  HC-12 TXD ──► Pin 2 Arduino
  HC-12 RXD ──► Pin 4 Arduino
  (Descomentar USE_SOFTWARE_SERIAL en el firmware)


  HC-12 MÓDULO (Transmisor - en la PC):
  ──────────────────────────────────────
  
  Conectar HC-12 a un adaptador USB-Serial:
  
  USB-Serial TX ──► HC-12 RXD
  USB-Serial RX ◄── HC-12 TXD
  USB-Serial 5V ──► HC-12 VCC
  USB-Serial GND──► HC-12 GND

  La PWA se conecta a este USB-Serial por Web Serial API.


  L298N (mismo que ESP32):
  ───────────────────────

        ┌──────────────────────────────────────────────┐
        │                  L298N                        │
        │                                              │
        │  IN1 ◄── Pin 7        OUT1 ──► Motor Izq (+) │
        │  IN2 ◄── Pin 8        OUT2 ──► Motor Izq (-) │
        │  ENA ◄── Pin 5 (PWM)                         │
        │                                              │
        │  IN3 ◄── Pin 9        OUT3 ──► Motor Der (+)  │
        │  IN4 ◄── Pin 10       OUT4 ──► Motor Der (-)  │
        │  ENB ◄── Pin 6 (PWM)                         │
        │                                              │
        │  +12V ◄── Batería (+)                        │
        │  GND  ◄── Batería (-) ── Arduino GND         │
        │  +5V  ──► Arduino 5V (con jumper puesto)      │
        └──────────────────────────────────────────────┘


  SERVO (Mecanismo de Patada):
  ───────────────────────────

  Servo Signal ──► Pin 3 (PWM)
  Servo VCC    ──► 5V
  Servo GND    ──► GND
```

---

## Notas Importantes

### Alimentación
1. **Batería recomendada**: LiPo 2S 7.4V 1000-2000mAh para robots pequeños
2. **NUNCA** conectar la batería directamente al ESP32/Arduino sin regulador
3. El L298N tiene regulador de 5V integrado (con jumper puesto) que puede alimentar el microcontrolador
4. Para baterías > 12V, quitar el jumper del L298N y usar un regulador step-down separado

### Motores
1. Los motores deben ser del voltaje compatible con tu batería
2. Si un motor gira al revés, intercambiar los cables OUT1↔OUT2 (o OUT3↔OUT4)
3. Agregar capacitores cerámicos de 100nF en los terminales de cada motor para reducir ruido

### Comunicación
1. **WiFi**: Alcance ~30m en interior, ~100m en exterior (ESP32)
2. **Bluetooth BLE**: Alcance ~10-30m
3. **RF HC-12**: Alcance ~100m (modo normal) hasta ~1000m (modo larga distancia, más lento)

### El Mecanismo de Patada
El servo acciona un brazo mecánico que golpea la pelota:
```
         ┌──── Brazo de patada (varilla/paleta)
         │
    ┌────┴────┐
    │  Servo  │  ← Montado en el chasis
    └─────────┘
    
  Posición 0° = brazo retraído (listo)
  Posición 90-120° = brazo extendido (patada)
```

### Checklist Pre-Competencia
- [ ] Verificar voltaje de batería (>7V para 2S LiPo)
- [ ] Probar ambos motores (adelante, atrás)
- [ ] Probar mecanismo de patada
- [ ] Verificar que el LED parpadea al encender
- [ ] Conectar desde la PWA y verificar telemetría
- [ ] Probar el botón de emergencia
- [ ] Probar calibración
- [ ] Verificar alcance de comunicación en la cancha

---

## Subir Firmware

### ESP32 (Arduino IDE)
1. Instalar **ESP32 Board Package** en Arduino IDE:
   - Preferences → Additional Board URLs: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Board Manager → buscar "ESP32" → instalar
2. Instalar librerías:
   - **WebSocketsServer** por Markus Sattler
   - **ArduinoJson** por Benoit Blanchon
   - **ESP32Servo** por Kevin Harrington
3. Seleccionar placa: **ESP32 Dev Module**
4. Puerto: seleccionar el COM del ESP32
5. Upload Speed: 921600
6. Compilar y subir

### Arduino Uno/Nano
1. Abrir `firmware/arduino_rf/arduino_rf.ino`
2. La única librería necesaria es **Servo** (incluida por defecto)
3. **IMPORTANTE**: Desconectar el HC-12 de los pines 0/1 antes de subir
4. Seleccionar placa: Arduino Uno (o Nano)
5. Seleccionar COM port
6. Compilar y subir
7. Reconectar el HC-12 después de subir

---

## Solución de Problemas

| Problema | Causa Probable | Solución |
|----------|---------------|----------|
| No se conecta por WiFi | SSID/contraseña incorrectos | Verificar "BRL-BOT-01" / "brl12345" |
| No se conecta por BLE | Navegador no compatible | Usar Chrome/Edge en Android o PC |
| Motores no giran | Cables sueltos o voltaje bajo | Verificar conexiones y batería |
| Motor gira al revés | Polaridad invertida | Intercambiar OUT1↔OUT2 en L298N |
| Servo no funciona | Pin incorrecto o sin 5V | Verificar conexión y alimentación |
| Robot no responde | Timeout activado | PWA debe enviar comandos continuamente |
| HC-12 no recibe | Baudrate diferente | Ambos HC-12 deben estar a 9600 baud |
| Arduino no sube código | HC-12 en pines 0/1 | Desconectar HC-12, subir, reconectar |
