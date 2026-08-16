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

#define CENTER_ANGLE      100
#define LEFT_ANGLE        25
#define RIGHT_ANGLE        145
#define SQUINT_ANGLE      25

#define SCREEN_WIDTH      128 // OLED display width, in pixels
#define SCREEN_HEIGHT     32 // OLED display height, in pixels
#define I2C_ADDRESS       0x3C

SoftwareSerial bluetooth(BLUETOOTH_TX, BLUETOOTH_RX);
ArduinoBlue phone(bluetooth); // pass reference of bluetooth object to ArduinoBlue constructor
SSD1306AsciiAvrI2c oled;

uint8_t prevThrottle = 49;
uint8_t prevSteering = 49;
uint8_t prevServoAngle = CENTER_ANGLE;
uint8_t prevForwardDist = 0;
uint8_t prevBackwardDist = 99;
int spd = 0;
int turn = 0;

#define     CARLABEL  "Vasu CarK1"
#define     SERIALL

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
  bluetooth.begin(9600);

  oled.begin(&Adafruit128x32, I2C_ADDRESS);
//  oled.begin(&Adafruit128x64, I2C_ADDRESS);
  oled.setFont(Adafruit5x7);
  
  displaytext(COLL_DIST,F(CARLABEL),F("Setup complete"));
  
  playtone(8);
}
//---------------------------------------------MAIN LOOP ------------------------------------------------------------------------------
void loop() {  
  uint8_t throttle, steering, sliderVal, button, sliderId;
  String str_length20_3 = "";

  delay(100);
//  curDist = lookAheadForward(); 
  readForwardSonic(CENTER_ANGLE);  // read distance looking forward 
//  readBackwardLaser();
  prevBackwardDist = 0;
  if (prevForwardDist < COLL_DIST) { // if forward is blocked, move back. let user decide. 
    str_length20_3 = F("fwd collsn");
#ifdef SERIALL
    Serial.println(str_length20_3);
#endif
    playtone(2);
    if(prevBackwardDist < 3) {
      moveBackwardStraight(500);
    } else {
      str_length20_3 = F("rear blocked");
    }
    displaytext(COLL_DIST,F(CARLABEL),str_length20_3);
  } else if(prevBackwardDist > 5) {
    str_length20_3 = F("rear collsn!");
    displaytext(COLL_DIST,F(CARLABEL),str_length20_3);
  } else {
    str_length20_3 = "";
  }
     
  button = phone.getButton();  // ID of the button pressed pressed.
  if (button == -999) { // self driving Display button data whenever its pressed.
    findClearPath();
    // Serial.print("Button: ");
    // Serial.println(button);      
    move(MAX_SPEED,0);  // move forward
    delay(700);  
  } else { // use bluetooth controller
    // Throttle and steering values go from 0 to 99.
    // When throttle and steering values are at 99/2 = 49, the joystick is at center.
    throttle = phone.getThrottle();
    steering = phone.getSteering();  
    
    // Display throttle and steering data if steering or throttle value is changed
    if((prevThrottle != throttle || prevSteering != steering) || (prevThrottle != 49 || prevSteering != 49)) {
      prevThrottle = throttle;
      prevSteering = steering;
      
      processController();
    } else { // ???
      throttle = 49;
      steering = 49;  
      
      stop();
      delay(250);
    }
#ifdef SERIALL
//    Serial.println(str_length20_2);
#endif     
    // ID of the slider moved.
    // sliderId = phone.getSliderId();
    // Slider value goes from 0 to 200.
    // sliderVal = phone.getSliderVal();  
  }
  displaytext(0,F(CARLABEL),str_length20_3);
  phone.checkBluetooth();
}
//-------------------------------------------------------------------------------------------------------------------------------------
uint8_t lookAheadForward() { // read the ultrasonic sensor distance in cm
  uint8_t leftDistance, rightDistance; //distances on either side
  
  leftDistance = readForwardSonic(CENTER_ANGLE-SQUINT_ANGLE);
  delay(250);
  rightDistance = readForwardSonic(CENTER_ANGLE+SQUINT_ANGLE);
  
  return (leftDistance < rightDistance) ? (leftDistance) : (rightDistance);
}  
//-------------------------------------------------------------------------------------------------------------------------------------
void findClearPath() { // if forward path blocked
  uint8_t leftDistance, rightDistance; //distances on either side

  stop();   // stop forward movement
  rightDistance = readForwardSonic(RIGHT_ANGLE); //set right distance
  leftDistance = readForwardSonic(LEFT_ANGLE); //set left distance
  compareDistanceAndMove(leftDistance,rightDistance);
}
//-------------------------------------------------------------------------------------------------------------------------------------
void compareDistanceAndMove(uint8_t leftDistance, uint8_t rightDistance)  { // find the longest distance
  if (leftDistance > rightDistance) {       //if left is less obstructed 
    forwardLeft(700);
  } else if (rightDistance > leftDistance) {//if right is less obstructed
    forwardRight(700);
  } else {  //if they are equally obstructed
    turnAround();
  }
}
//-------------------------------------------------------------------------------------------------------------------------------------
uint8_t readBackwardLaser() { // read the ultrasonic sensor distance in cm
  uint8_t cm = 0;
  
//  SparkFun_APDS9960 apds = SparkFun_APDS9960();
//  apds.init();
//  apds.setProximityGain(PGAIN_2X);
//  apds.enableProximitySensor(false);    
//  apds.readProximity(cm);
  prevBackwardDist = cm;
  return cm;
}

//-------------------------------------------------------------------------------------------------------------------------------------
uint8_t readForwardSonic(uint8_t deg) { // read the ultrasonic sensor distance in cm
  uint8_t corrected = 180 - deg;
  
  Servo sonarservo;  // create servo object to control a servo 
  sonarservo.attach(SERVO_PIN);  // attaches the servo to a digital pin to the servo object
  sonarservo.write(corrected);  // move eyes forward
  
  if(prevServoAngle != corrected) {
    prevServoAngle = corrected;
    delay(100);
  }
  Ultrasonic ultrasonic(TRIG_PIN,ECHO_PIN);// sets up sensor library to use the correct pins to measure distance.
  uint8_t cm = ultrasonic.read();
  if(cm == 0 || cm > 255) { // nothing detected in range
    cm = CONTROL_MAX;
  }
  sonarservo.detach();  // detach the servo 
    
  prevForwardDist = cm;
  return cm;
}
//-------------------------------------------------------------------------------------------------------------------------------------
void processController() {
  // moves the robot based on the throttle and steering variables
  // incoming data range from CONTROL_MIN to CONTROL_MAX 
  
  spd = map(abs(prevThrottle - CONTROL_MID),CONTROL_MIN,CONTROL_MID,THROTTLE_MIN,THROTTLE_MAX);
  turn = map(abs(prevSteering - CONTROL_MID),CONTROL_MIN,CONTROL_MID,THROTTLE_MIN,THROTTLE_MAX);
  
  // If the MOVE_THRESHOLD is not reached don't move the robot.
  if (spd < MOVE_THRESHOLD) {
    spd = 0;
    turn = 0;
  } else {
    if((prevThrottle - CONTROL_MID) < 0) {  // if -ve go reverse
      spd = -spd;
    }
    if(abs(spd) > MAX_SPEED) { // speed governor
      if(spd < 0) {
        spd = -MAX_SPEED;
      } else {
        spd = MAX_SPEED;      
      }
    }   
    
    if((prevSteering - CONTROL_MID) < 0) { // if -ve go left
      turn = -turn;
    }
    if(abs(turn) < TURN_THRESHOLD) { // governor max or nothing
      turn = 0;
    } else {
      if(turn < 0) {
        turn = -MAX_SPEED;       
      } else {
        turn = MAX_SPEED;       
      }
    }
  }
#ifdef SERIALL
  Serial.print(F("spd: ")); Serial.print(spd); Serial.print(F(" turn: ")); Serial.println(turn);
#endif
  move();
}
//-------------------------------------------------------------------------------------------------------------------------------------
void DCMOTOR(int _pin1,int _speed,int _pin2) {
  analogWrite(_pin1,_speed);
  digitalWrite(_pin2,LOW);
}
//-------------------------------------------------------------------------------------------------------------------------------------
// both spd and turn numbers 0-255
void move() {
    if(turn > 0) {
      DCMOTOR(RIGHT_PIN,abs(turn),LEFT_PIN);
    } else if(turn < 0) {      
      DCMOTOR(LEFT_PIN,abs(turn),RIGHT_PIN);
    } else {
      DCMOTOR(RIGHT_PIN,10,LEFT_PIN);
    }
  if(spd != 0) {  
    if(spd > 0) {
      DCMOTOR(FORWARD_PIN,abs(spd),REVERSE_PIN);
    } else if(spd < 0) {
      DCMOTOR(REVERSE_PIN,abs(spd),FORWARD_PIN);
    } else {
      DCMOTOR(FORWARD_PIN,0,REVERSE_PIN);    
    }
  } else {
    DCMOTOR(FORWARD_PIN,0,REVERSE_PIN);    
    DCMOTOR(LEFT_PIN,0,RIGHT_PIN);
  }
#ifdef SERIALL
//  Serial.println(F("move()"));
#endif
}
//-------------------------------------------------------------------------------------------------------------------------------------
void move(int speeding,int turning) {
  spd = speeding;
  turn = turning;
  move();
}
//-------------------------------------------------------------------------------------------------------------------------------------
void stop() {
  move(0,0);
}  // stop the motors.
//-------------------------------------------------------------------------------------------------------------------------------------
void turnAround() {
  backwardRight(700); // reverse right
  forwardLeft(700); // forward left
}  
//-------------------------------------------------------------------------------------------------------------------------------------
void moveBackwardStraight(int ms) {
  move(-MAX_SPEED,0); // reverse straight
  delay(ms); // run motors this way for ms
  stop();
}  
//-------------------------------------------------------------------------------------------------------------------------------------
void forwardLeft(int ms) {
  move(MAX_SPEED,-MAX_SPEED); // forward left
  delay(ms);
  stop();
}  
//-------------------------------------------------------------------------------------------------------------------------------------
void forwardRight(int ms) {
  move(MAX_SPEED,MAX_SPEED); // forward right
  delay(ms);
  stop();
}  
//-------------------------------------------------------------------------------------------------------------------------------------
void backwardLeft(int ms) {
  move(MAX_SPEED,-MAX_SPEED); // forward left
  delay(ms);
  stop();
}  
//-------------------------------------------------------------------------------------------------------------------------------------
void backwardRight(int ms) {
  move(-MAX_SPEED,MAX_SPEED); // forward right
  delay(ms);
  stop();
}  
//-------------------------------------------------------------------------------------------------------------------------------------
void displaytext(uint8_t idx, String str_length20_1, String str_length20_3) {
  
  oled.clear();
  
  oled.set2X();
  oled.println(str_length20_1);
  if(idx == COLL_DIST) {
    oled.set2X();
    oled.println(str_length20_3);
  } else {
    oled.set1X();
    oled.print(F("Th:"));
    oled.print(prevThrottle);
    oled.print(F(" St:"));
    oled.print(prevSteering);
    oled.print(F(" D:"));
    oled.print(prevForwardDist);
    oled.println(F(""));  // can try printing one thing at a time instead of whole string
    
    oled.set1X();
    if(spd != 0) {  
      if(spd > 0) {
        oled.print(F("fwd "));
      } else if(spd < 0) {
        oled.print(F("bak "));
      } else {
        oled.print(F("stp "));
      }
      oled.print(abs(spd));
      if(turn > 0) {
        oled.print(F(" rig "));
      } else if(turn < 0) {      
        oled.print(F(" lef "));
      } else {
        oled.print(F(" stp "));
      }
      oled.print(abs(turn));
    } else {
      oled.print(F("move() 0 0"));
    }
    oled.println(F(""));
  }
//      str_length20_2 = "";
//      str_length20_2 = str_length20_2 + "Th:" + throttle + " St:" + steering;
//      str_length20_2 = str_length20_2 + " D:" + prevForwardDist;
//    str_length20_2 = "Th:  St:  D:" + prevForwardDist;
//    str_length20_4 = abs(spd);
//      str_length20_4 = str_length20_4 + " fwd";
//      str_length20_4 = str_length20_4 + " bak";
//      str_length20_4 = str_length20_4 + " stp";
//    str_length20_4 = str_length20_4 + abs(turn);
//      str_length20_4 = str_length20_4 + " rig ";
//      str_length20_4 = str_length20_4 + " lef ";
//      str_length20_4 = str_length20_4 + " stp ";
//    str_length20_4 = F("move() 0 0"); 
}
//-------------------------------------------------------------------------------------------------------------------------------------
void playtone(uint8_t numoftones) {
  // notes in the melody:
  const PROGMEM int melody[] = {
    262, 196, 196, 220, 196, 0, 247, 262
  };  
  
  const PROGMEM int noteDurations[] = {
    4, 8, 8, 4, 4, 4, 4, 4
  };
  
  // note durations: 4 = quarter note, 8 = eighth note, etc.:
  // iterate over the notes of the melody:
  for (int thisNote = 0; thisNote < numoftones/*8*/; thisNote++) {
    // to calculate the note duration, take one second divided by the note type.
    //e.g. quarter note = 1000 / 4, eighth note = 1000/8, etc.
    int noteDuration = 500 / noteDurations[thisNote];
//    tone(TONE_PIN, melody[thisNote], 250/*noteDuration*/);
    int note = map(melody[thisNote],0,5000,0,255);
    analogWrite(TONE_PIN,note);
    // to distinguish the notes, set a minimum time between them.
    // the note's duration + 30% seems to work well:
    int pauseBetweenNotes = noteDuration * 1.30;
    delay(pauseBetweenNotes);
    // stop the tone playing:
//    noTone(TONE_PIN);
    digitalWrite(TONE_PIN,LOW);    
  }
}

