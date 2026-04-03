/* 
Lego9750.h - Library to run Lego Technic 70455 Controller brick with an Arduino Shield.
Created December 16, 2015
Rights Reserved
*/

#ifndef Lego9750_h
#define Lego9750_h
#include "Arduino.h"

class Lego9750
{
 public:

 #define PORT0_PIN 3
 #define PORT1_PIN 5
 #define PORT2_PIN 6
 #define PORT3_PIN 9
 #define PORT4_PIN 10
 #define PORT5_PIN 11
 #define PORT6_ANALOGPIN 0
 #define PORT7_ANALOGPIN 1
 #define PORT_ON HIGH
 #define PORT_OFF LOW
 #define COMBO_OFF 0
 #define COMBO_LEFT 1
 #define COMBO_RIGHT 2
 #define COMBO_BOTH 3
    
 // Instance Creation Routine
   // Pin Defaults:
   //  Output 0 : Pin 3
   //  Output 1 : Pin 5
   //  Output 2 : Pin 6
   //  Output 3 : Pin 9
   //  Output 4 : Pin 10
   //  Output 5 : Pin 11
   //  Input 6 : Pin Analog 0
   //  Input 7 : Pin Analog 1
 Lego9750();

 // Instance Creation Routine
   // Pins Assigned Through Parameters
   // Input Pins Must Be Analog Pins
 Lego9750(int P0, int P1, int P2, int P3, int P4, int P5, int P6, int P7);

 // Output Port High/Low Set Routine
   // id (integer): 0 to 6
   // action (literal): PORT_ON, PORT_OFF
   //   PORT_ON sets PWM Value to 255
 void Output_Port(int id, int action);

 // Set Output Port PWM Value
   // id (integer): 0 to 6
   // pwm_value (integer): 0 to 255
 void PWM_Port(int id, int pwm_value);

 // Return Input Port Value
   // id (integer): 0 to 6
   // Analog Pin Returns value between 0 and 1023  
 int Input_Port(int id);

 // Allows Setting Multiple Output Ports
   // COMBO A : Output Ports 0 and 1
   // COMBO B : Output Ports 2 and 3
   // COMBO C : Output Ports 4 and 5
   // id (char): "A", "B", "C"
   // mix (literal): COMBO_OFF, COMBO_LEFT, COMBO_RIGHT, COMBO_BOTH
   //Port values set to 0 or 255
 void Combo_Port(char id, int mix);

 // Allows Setting Value for Multiple Output Ports
   // COMBO A : Output Ports 0 and 1
   // COMBO B : Output Ports 2 and 3
   // COMBO C : Output Ports 4 and 5
   // id (char): "A", "B", "C"
   // mix (literal): COMBO_OFF, COMBO_LEFT, COMBO_RIGHT, COMBO_BOTH
   // pwm_value (integer): 0 to 255
 void PWM_Combo_Port(char id, int mix, int pwm_value); 

 // Sets All Output Port PWM Values to 0
 void Port_Initialize();

 // Returns Output Port PWM Value
   // id (integer): 0 to 6
 int Port_PWM_Value(int id);

 // Enables/Disables Serial Monitor Messages
   // value (integer): 0 to 1 (silent to verbose)
 void Verbose(int value);

 // A Command Parsing Routine
   //Commands ...
   //"PORT [0..5] ON|OFF"
   //"PWM [0..5] [0..255]"
   //"COMBO A|B|C LEFT|RIGHT|OFF"
   //"CPWM A|B|C LEFT|RIGHT [0..255]"
   //"INPUT [6..7]"
   //"?PWM"
   //"VERBOSE ON|OFF"
 void Parse_Command(String Command);

 private:
   int _D0,_D1,_D2,_D3,_D4,_D5,_A6,_A7;
   int _Verbose = HIGH;
   int _Port_PWM[6] = {0, 0, 0, 0, 0, 0};
   void _Parse_PWM_Command(String Port, String Value);
   void _Parse_Verbose_Command(String Value);
   void _Parse_CPWM_Command(String Port, String Action, String Value);
   void _Parse_Port_Command(String Port, String Action);
   void _Parse_Combo_Command(String Port, String Action);
   void _Parse_Input_Command(String Port);
   void _Display_Commands();
   void _Display_PWM_Values();
};

#endif