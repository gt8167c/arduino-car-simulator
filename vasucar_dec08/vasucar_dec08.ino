#include <Servo.h>        //add Servo Motor library            
#include <NewPing.h>      //add Ultrasonic sensor library
#include <SoftwareSerial.h>
#include <ArduinoBlue.h>
#include "SSD1306Ascii.h"
#include "SSD1306AsciiAvrI2c.h"

#define TRIG_PIN          12 // Pin 12 on the Motor Drive Shield soldered to the ultrasonic sensor
#define ECHO_PIN          12 // same

#define TONE_PIN          2

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
#define THROTTLE_MAX      120

// thresholds
#define TURN_THRESHOLD    32   // range from THROTTLE_MIN to THROTTLE_MAX
#define MOVE_THRESHOLD    80     // range from THROTTLE_MIN to THROTTLE_MAX
#define COLL_DIST         20    // sets distance at which robot stops and reverses to 30cm
#define TURN_DIST         COLL_DIST+20 // sets distance at which robot veers away from object

#define MAX_DISTANCE      300 // sets maximum useable sensor measuring distance to 300cm
#define MAX_SPEED         250 // sets speed of DC traction motors to 150/250 or about 70% of full speed - to get power drain down.

#define CENTER_ANGLE      100
#define LEFT_ANGLE        25
#define RIGHT_ANGLE        145
#define SQUINT_ANGLE  25

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 32 // OLED display height, in pixels
// 0X3C+SA0 - 0x3C or 0x3D
#define I2C_ADDRESS 0x3C

SSD1306AsciiAvrI2c oled;
NewPing sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE); // sets up sensor library to use the correct pins to measure distance.
Servo sonarservo;  // create servo object to control a servo 
SoftwareSerial bluetooth(BLUETOOTH_TX, BLUETOOTH_RX);
ArduinoBlue phone(bluetooth); // pass reference of bluetooth object to ArduinoBlue constructor

String str_length20_1 = "";
String str_length20_2 = "";
String str_length20_3 = "";
String str_length20_4 = "";

int prevThrottle = 49;
int prevSteering = 49;
int prevServoAngle = CENTER_ANGLE;
int prevAngleDist = 0;

// notes in the melody:
int melody[] = {
  262, 196, 196, 220, 196, 0, 247, 262
};  

//-------------------------------------------- SETUP LOOP ----------------------------------------------------------------------------
void setup() {
  pinMode(TRIG_PIN, OUTPUT); // Sets the trig Pin as an Output. will also use as echo pin. Newping manages it.
  pinMode(SERVO_PIN, OUTPUT); // 
  pinMode(FORWARD_PIN, OUTPUT); // 
  pinMode(REVERSE_PIN, OUTPUT); // 
  pinMode(LEFT_PIN, OUTPUT); // 
  pinMode(RIGHT_PIN, OUTPUT); // 

  // Start serial monitor at 9600 bps.
  Serial.begin(9600);
  // Start bluetooth serial at 9600 bps.
  bluetooth.begin(9600);

  oled.begin(&Adafruit128x32, I2C_ADDRESS);
  oled.setFont(Adafruit5x7);
    
  str_length20_1 = "Vasu Car"; //
  str_length20_2 = "Setup complete";
  displaytext(0);
  
  Serial.println(str_length20_2);
  delay(00); // delay for x ms  
}
//------------------------------------------------------------------------------------------------------------------------------------


//---------------------------------------------MAIN LOOP ------------------------------------------------------------------------------
void loop() {  
  int throttle, steering, sliderVal, button, sliderId;
  int curDist = 0;

  delay(500);
//  curDist = lookAheadForward(); 
  curDist = readPing(CENTER_ANGLE);  // read distance looking forward lookAheadForward()
  if (curDist < COLL_DIST) { // if forward is blocked, move back. let user decide. 
    Serial.println("collision distance");
    str_length20_3 = "COLLISION!";
    displaytext(COLL_DIST);
    moveBackwardStraight(350);
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
    if(prevThrottle != throttle || prevSteering != steering) {
      prevThrottle = throttle;
      prevSteering = steering;
      
      str_length20_2 = "";
      str_length20_2 = str_length20_2 + "Th:" + throttle + " St:" + steering;
      str_length20_2 = str_length20_2 + " D:" + curDist;
      Serial.println(str_length20_2);
      
      processController(throttle,steering);
    } else {
      delay(250);
    }
     
    // ID of the slider moved.
    // sliderId = phone.getSliderId();
    // Slider value goes from 0 to 200.
    // sliderVal = phone.getSliderVal();  
  }
  displaytext(0);
  phone.checkBluetooth();
}
//-------------------------------------------------------------------------------------------------------------------------------------
int lookAheadForward() { // read the ultrasonic sensor distance in cm
  int leftDistance, rightDistance; //distances on either side
  
  leftDistance = readPing(CENTER_ANGLE-SQUINT_ANGLE);
  delay(250);
  rightDistance = readPing(CENTER_ANGLE+SQUINT_ANGLE);
  
  return (leftDistance < rightDistance) ? (leftDistance) : (rightDistance);
}  
//-------------------------------------------------------------------------------------------------------------------------------------
void findClearPath() { // if forward path blocked
  int leftDistance, rightDistance; //distances on either side

  stop();   // stop forward movement
  rightDistance = readPing(RIGHT_ANGLE); //set right distance
  leftDistance = readPing(LEFT_ANGLE); //set left distance
  compareDistanceAndMove(leftDistance,rightDistance);
}
//-------------------------------------------------------------------------------------------------------------------------------------
void compareDistanceAndMove(int leftDistance, int rightDistance)  { // find the longest distance
  if (leftDistance > rightDistance) {//if left is less obstructed 
    forwardLeft(700);
  } else if (rightDistance > leftDistance) {//if right is less obstructed
    forwardRight(700);
  } else {  //if they are equally obstructed
    turnAround();
  }
}
//-------------------------------------------------------------------------------------------------------------------------------------
int readPing(int deg) { // read the ultrasonic sensor distance in cm
  int corrected = 180 - deg;
  
  sonarservo.attach(SERVO_PIN);  // attaches the servo to a digital pin to the servo object
  sonarservo.write(corrected);  // move eyes forward
  
  if(prevServoAngle != corrected) {
    prevServoAngle = corrected;
    delay(500);
  }
  // unsigned int uS = uS/US_ROUNDTRIP_CM;
  int cm = sonar.ping_cm();
  if(cm == 0) { // nothing detected in range
    cm = CONTROL_MAX;
  }
  sonarservo.detach();  // detach the servo 
    
  prevAngleDist = cm;
  return cm;
}
//-------------------------------------------------------------------------------------------------------------------------------------
void processController(int throttle, int steering) {
  // moves the robot based on the throttle and steering variables
  // incoming data range from CONTROL_MIN to CONTROL_MAX 
  
  int spd = map(abs(throttle - CONTROL_MID),CONTROL_MIN,CONTROL_MID,THROTTLE_MIN,THROTTLE_MAX);
  int turn = map(abs(steering - CONTROL_MID),CONTROL_MIN,CONTROL_MID,THROTTLE_MIN,THROTTLE_MAX);
  
  // If the MOVE_THRESHOLD is not reached don't move the robot.
  if (spd < MOVE_THRESHOLD) {
    spd = 0;
    turn = 0;
  } else {
    if((throttle - CONTROL_MID) < 0) {  // if -ve go reverse
      spd = -spd;
    }
    if(abs(spd) > MAX_SPEED) { // speed governer
      if(spd < 0) {
        spd = -MAX_SPEED;
      } else {
        spd = MAX_SPEED;      
      }
    }   
    
    if(turn < TURN_THRESHOLD) { // governer max or nothing
      turn = 0;
    } else {
      turn = MAX_SPEED;         
    }
    if((steering - CONTROL_MID) < 0) { // if -ve go left
      turn = -turn;
    }
  }
//  Serial.print("spd: "); Serial.print(spd); Serial.print("\turn: "); Serial.println(turn);
  move(spd,turn);
}
//-------------------------------------------------------------------------------------------------------------------------------------
void DCMOTOR(int _pin1,int _speed,int _pin2) {
  analogWrite(_pin1,_speed);
  digitalWrite(_pin2,LOW);
}
//-------------------------------------------------------------------------------------------------------------------------------------
// both spd and turn numbers 0-255
void move(int spd, int turn) {
  if(spd != 0) {  
    str_length20_4 = abs(turn);
    if(turn > 0) {
      str_length20_4 = str_length20_4 + " rig ";
      DCMOTOR(RIGHT_PIN,abs(turn),LEFT_PIN);
    } else if(turn < 0) {
      str_length20_4 = str_length20_4 + " lef ";
      DCMOTOR(LEFT_PIN,abs(turn),RIGHT_PIN);
    } else {
      str_length20_4 = str_length20_4 + " stp ";
      DCMOTOR(LEFT_PIN,0,RIGHT_PIN);
    }
    str_length20_4 = str_length20_4 + abs(spd);
    if(spd > 0) {
      DCMOTOR(FORWARD_PIN,abs(spd),REVERSE_PIN);
      str_length20_4 = str_length20_4 + " fwd";
    } else if(spd < 0) {
      str_length20_4 = str_length20_4 + " bak";
      DCMOTOR(REVERSE_PIN,abs(spd),FORWARD_PIN);
    } else {
      str_length20_4 = str_length20_4 + " stp";
      DCMOTOR(FORWARD_PIN,0,REVERSE_PIN);    
    }
  } else {
    str_length20_4 = "move() 0 0"; 
    DCMOTOR(FORWARD_PIN,0,REVERSE_PIN);    
    DCMOTOR(LEFT_PIN,0,RIGHT_PIN);
  }
  Serial.println(str_length20_4);
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
void displaytext(int idx) {
  oled.clear();
  
  oled.set2X();
  oled.println(str_length20_1);
  if(idx == COLL_DIST) {
    oled.set2X();
    oled.println(str_length20_3);
  } else {
    oled.set1X();
    oled.println(str_length20_2);  
    oled.set1X();
    oled.println(str_length20_4);
  }
}
//-------------------------------------------------------------------------------------------------------------------------------------
void startuptone() {
  // note durations: 4 = quarter note, 8 = eighth note, etc.:
  int noteDurations[] = {
    4, 8, 8, 4, 4, 4, 4, 4
  };
  // iterate over the notes of the melody:
  for (int thisNote = 0; thisNote < 8; thisNote++) {
    // to calculate the note duration, take one second divided by the note type.
    //e.g. quarter note = 1000 / 4, eighth note = 1000/8, etc.
    int noteDuration = 1000 / noteDurations[thisNote];
    tone(TONE_PIN, melody[thisNote], 250/*noteDuration*/);

    // to distinguish the notes, set a minimum time between them.
    // the note's duration + 30% seems to work well:
    int pauseBetweenNotes = noteDuration * 1.30;
    delay(pauseBetweenNotes);
    // stop the tone playing:
//    noTone(TONE_PIN);
  }
}
