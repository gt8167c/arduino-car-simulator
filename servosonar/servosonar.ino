#include <Servo.h>        //add Servo Motor library            
#include <SoftwareSerial.h>
#include <ArduinoBlue.h>

#define SERVO_PIN        13 // servo pin
// Bluetooth TX -> Arduino D8
#define BLUETOOTH_TX      8
// Bluetooth RX -> Arduino D7
#define BLUETOOTH_RX      7


Servo sonarservo;  // create servo object to control a servo 
SoftwareSerial bluetooth(BLUETOOTH_TX, BLUETOOTH_RX);
ArduinoBlue phone(bluetooth); // pass reference of bluetooth object to ArduinoBlue constructor

void setup() {
  pinMode(SERVO_PIN,OUTPUT);
  sonarservo.attach(SERVO_PIN);  // attaches the servo to a digital pin to the servo object 
  // initialize serial communications at 9600 bps:
  Serial.begin(9600);
  sonarservo.write(180-0); // tells the servo to position at 90-degrees ie. facing forward.
  // Start bluetooth serial at 9600 bps.
  bluetooth.begin(9600);
phone.checkBluetooth();
}

void loop() {loop1();}
void loop1() {
  // read the analog in value:

//  sonarservo.write(36); // tells the servo to position at 90-degrees ie. facing forward.
//  Serial.println("36 degrees = ");
//  delay(2000);
  sonarservo.write(180-75); // tells the servo to position at 90-degrees ie. facing forward.
  delay(500);
  Serial.print("75 degrees = ");

  sonarservo.write(180-100); // tells the servo to position at 90-degrees ie. facing forward.
  delay(500);
  Serial.print("90 degrees = ");

  sonarservo.write(180-125); // tells the servo to position at 90-degrees ie. facing forward.
  delay(500);
  Serial.print("110 degrees = ");

  sonarservo.write(180-100); // tells the servo to position at 90-degrees ie. facing forward.
  delay(500);
  Serial.print("90 degrees = ");

//  sonarservo.write(144); // tells the servo to position at 90-degrees ie. facing forward.
//  Serial.println("144 degrees = ");
//  delay(2000);
}
