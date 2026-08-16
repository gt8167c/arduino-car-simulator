#include <Servo.h>        //add Servo Motor library            
#include <Ultrasonic.h>
#include <SoftwareSerial.h>
#include <ArduinoBlue.h>
#include "SSD1306Ascii.h"
#include "SSD1306AsciiAvrI2c.h"
#include <SparkFun_APDS9960.h>

#define TRIG_PIN          12 // Pin 12 on the Motor Drive Shield soldered to the ultrasonic sensor
#define ECHO_PIN          12 // same

#define TONE_PIN          9

#define SERVO_PIN         13 // servo pin
#define FORWARD_PIN       11 // pwm pin
#define REVERSE_PIN       3 // pwm pin
#define LEFT_PIN          6 // pwm pin
#define RIGHT_PIN         5 // pwm pin

// Bluetooth TX -> Arduino D8
#define BLUETOOTH_TX      8
// Bluetooth RX -> Arduino D7
#define BLUETOOTH_RX      7

// ranges
#define CONTROL_MIN       0
#define CONTROL_MAX       99
#define CONTROL_MID       CONTROL_MAX / 2
#define THROTTLE_MIN      0          
#define THROTTLE_MAX      240

// thresholds
#define TURN_THRESHOLD    32   // range from THROTTLE_MIN to THROTTLE_MAX
#define MOVE_THRESHOLD    80     // range from THROTTLE_MIN to THROTTLE_MAX
#define COLL_DIST         30    // sets distance at which robot stops and reverses
#define TURN_DIST         COLL_DIST+20 // sets distance at which robot veers away from object

#define MAX_DISTANCE      300 // sets maximum useable sensor measuring distance to 300cm
#define MAX_SPEED         250 // sets speed of DC traction motors to 150/250 or about 70% of full speed - to get power drain down.

#define CENTER_ANGLE      90
#define LEFT_ANGLE        25
#define RIGHT_ANGLE        145
#define SQUINT_ANGLE      25

#define SCREEN_WIDTH      128 // OLED display width, in pixels
#define SCREEN_HEIGHT     32 // OLED display height, in pixels
#define I2C_ADDRESS       0x3C

// SoftwareSerial bluetooth(BLUETOOTH_TX, BLUETOOTH_RX);
// ArduinoBlue phone(bluetooth); // pass reference of bluetooth object to ArduinoBlue constructor
SSD1306AsciiAvrI2c oled;

uint8_t prevThrottle = 49;
uint8_t prevSteering = 49;
uint8_t prevServoAngle = CENTER_ANGLE;
uint8_t prevForwardDist = 0;
uint8_t prevBackwardDist = 99;
int spd = 244;
int turn = 244;

#define     CARLABEL  "Veer Car3b"
#define     SERIALL

Servo sonarservo;  // create servo object to control a servo 


//-------------------------------------------- SETUP LOOP ----------------------------------------------------------------------------
void setup() {
  pinMode(TRIG_PIN, OUTPUT); // Sets the trig Pin as an Output. will also use as echo pin. Newping manages it.
  pinMode(SERVO_PIN, OUTPUT); // 
  pinMode(FORWARD_PIN, OUTPUT); // 
  pinMode(REVERSE_PIN, OUTPUT); // 
  pinMode(LEFT_PIN, OUTPUT); // 
  pinMode(RIGHT_PIN, OUTPUT); // 

  // Start serial monitor at 9600 bps.
#ifdef SERIALL
  Serial.begin(9600);
#endif
  // Start bluetooth serial at 9600 bps.
  // bluetooth.begin(9600);

//  oled.begin(&Adafruit128x32, I2C_ADDRESS);
//  oled.begin(&Adafruit128x64, I2C_ADDRESS);
//  oled.setFont(Adafruit5x7);
    
//  playtone(8);

//  DCMOTOR(FORWARD_PIN,244,REVERSE_PIN);
//  DCMOTOR(RIGHT_PIN,244,LEFT_PIN);  
//  delay(500);
//  DCMOTOR(REVERSE_PIN,244,FORWARD_PIN);
//  DCMOTOR(LEFT_PIN,244,RIGHT_PIN);
//  delay(500);
//  DCMOTOR(FORWARD_PIN,244,REVERSE_PIN);
//  DCMOTOR(RIGHT_PIN,244,LEFT_PIN);  
//  delay(3000);
//  DCMOTOR(REVERSE_PIN,244,FORWARD_PIN);
//  DCMOTOR(LEFT_PIN,244,RIGHT_PIN);
//  delay(3000);
//  DCMOTOR(FORWARD_PIN,0,REVERSE_PIN);
//  DCMOTOR(RIGHT_PIN,0,LEFT_PIN);  

}

void loop() {
   Serial.println(readForwardSonic(LEFT_ANGLE));  // read distance looking forward 
   delay(1000);
   Serial.println(readForwardSonic(RIGHT_ANGLE));  // read distance looking forward 
   delay(1000);
   Serial.println(readForwardSonic(CENTER_ANGLE));  // read distance looking forward 
   delay(5000);
}

//-------------------------------------------------------------------------------------------------------------------------------------
void DCMOTOR(int _pin1,int _speed,int _pin2) {
  analogWrite(_pin1,_speed);
  digitalWrite(_pin2,LOW);
}

//-------------------------------------------------------------------------------------------------------------------------------------
uint8_t readForwardSonic(uint8_t deg) { // read the ultrasonic sensor distance in cm
  uint8_t corrected = 180 - deg - 0; // off by 10 degrees
  
//#ifndef    AUTONOMOUS  
//  sonarservo.attach(SERVO_PIN);  // attaches the servo to a digital pin to the servo object
//#endif

  sonarservo.attach(SERVO_PIN);  // attaches the servo to a digital pin to the servo object
  sonarservo.write(corrected);  // move eyes forward
  
  if(prevServoAngle != corrected) {
    prevServoAngle = corrected;
    delay(100);
  }
#ifdef SERIALL
    Serial.print(F("readForwardSonic angle "));
    Serial.println(corrected);
#endif
  Ultrasonic ultrasonic(TRIG_PIN,ECHO_PIN);// sets up sensor library to use the correct pins to measure distance.
  uint8_t cm = ultrasonic.read();
  if(cm == 0 || cm > 255) { // nothing detected in range
    cm = CONTROL_MAX;
  }
#ifndef    AUTONOMOUS  
  sonarservo.detach();  // detach the servo 
#endif
    
  prevForwardDist = cm;
  return cm;
}

