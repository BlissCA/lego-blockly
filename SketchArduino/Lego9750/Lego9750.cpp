#include "Arduino.h"
#include "Lego9750.h"
#define PORT_ON HIGH
#define PORT_OFF LOW
#define COMBO_OFF 0
#define COMBO_LEFT 1
#define COMBO_RIGHT 2
#define COMBO_BOTH 3

Lego9750::Lego9750()
{
 _D0 = PORT0_PIN;
 _D1 = PORT1_PIN;
 _D2 = PORT2_PIN;
 _D3 = PORT3_PIN;
 _D4 = PORT4_PIN;
 _D5 = PORT5_PIN;
 _A6 = PORT6_ANALOGPIN;
 _A7 = PORT7_ANALOGPIN;
}

Lego9750::Lego9750(int P0, int P1, int P2, int P3, int P4, int P5, int P6, int P7)
{
 _D0 = P0;
 _D1 = P1;
 _D2 = P2;
 _D3 = P3;
 _D4 = P4;
 _D5 = P5;
 _A6 = P6;
 _A7 = P7;
}

void Lego9750::Output_Port(int id, int action)
{
 int pin_id;
 int pin_value;
 
 int valid_command = 1;
 
 switch (id)
 {
   case 0:
     pin_id = _D0;
   break;
   case 1:
     pin_id = _D1;
   break;
   case 2:
     pin_id = _D2;
   break;
   case 3:
     pin_id = _D3;
   break;
   case 4:
     pin_id = _D4;
   break;
   case 5:
     pin_id = _D5;
   break;
   default:
     if (_Verbose == HIGH) {Serial.println("Invalid Port Identified.");}
     valid_command = 0;
   break;  
 }
 
 switch (action)
 {
   case PORT_ON:
     pin_value = 255;
   break;
   case PORT_OFF:
     pin_value = 0;
   break;
   default:
     if (_Verbose == HIGH) {Serial.println("Invalid Port Status Identified.");}
     valid_command = 0;
 }
 
 if (valid_command == 1)
   {
     _Port_PWM[id] = pin_value;
     analogWrite(pin_id, pin_value);
     if (_Verbose == HIGH) {Serial.println("Success PORT Command");}
   }
   
}

void Lego9750::PWM_Port(int id, int pwm_value)
{
 int pin_id;
 
 int valid_command =1;
 
 switch(id)
 {
   case 0:
     pin_id = _D0;
   break;
   case 1:
     pin_id = _D1;
   break;
   case 2:
     pin_id = _D2;
   break;
   case 3:
     pin_id = _D3;
   break;
   case 4:
     pin_id = _D4;
   break;
   case 5:
     pin_id = _D5;
   break;
   default:
     if (_Verbose == HIGH) {Serial.println("Invalid PWM Port Identified.");}
     valid_command = 0;
   break;
 }
 
 if ((pwm_value < 0) or (pwm_value > 255))
   {
     if (_Verbose == HIGH) {Serial.println("Invalid PWM Value Identified.");}
     valid_command = 0;
   }
   
 if (valid_command == 1)
   {
     _Port_PWM[id] = pwm_value;
     analogWrite(pin_id, pwm_value);
     if (_Verbose == HIGH) {Serial.println("Success PWM Command.");}
   }
   
}

int Lego9750::Input_Port(int id)
{
 int valid_command = 1;
 int pin_id;
 
 switch(id)
   {
     case 6:
       pin_id = _A6;
     break;
     case 7:
       pin_id = _A7;
     break;
     default:
       if (_Verbose == HIGH) {Serial.println("Invalid Input Port Identified.");}
       valid_command = 0;
     break;
   }
   
 if (valid_command == 1)
   { 
     if (_Verbose == HIGH) {Serial.println("Success Input Command.");}
     return analogRead(pin_id);
   }
  else
   return -1; 
}

void Lego9750::Combo_Port(char id, int mix)
{
 int leftport, rightport;
 int leftvalue, rightvalue;
 int valid_command = 1;
 
 switch (id)
 {
   case 'A':
     leftport = 0;
     rightport = 1;
   break;
   case 'B':
     leftport = 2;
     rightport = 3;
   break;
   case 'C':
     leftport = 4;
     rightport = 5;
   break;
   default:
     if (_Verbose == HIGH) 
      {
       Serial.println("Invalid Combo Port Identified.");
      }
     valid_command = 0;
   break;
 }

 switch (mix)
 {
   case COMBO_OFF:
     leftvalue = LOW;
     rightvalue = LOW;
   break;
   case COMBO_LEFT:
     leftvalue = HIGH;
     rightvalue = LOW;
   break;
   case COMBO_RIGHT:
     leftvalue = LOW;
     rightvalue = HIGH;
   break;
   case COMBO_BOTH:
     leftvalue = HIGH;
     rightvalue = HIGH;
   break;  
   default:
     if (_Verbose == HIGH) {Serial.println("Invalid Combo Port Action.");}
     valid_command =0;
   break;
 }  
 
 if (valid_command ==1) 
 {
   Output_Port(leftport, leftvalue);
   Output_Port(rightport, rightvalue);
   if (_Verbose == HIGH) {Serial.println("Successful COMBO Command.");}
 }
 
}

void Lego9750::PWM_Combo_Port(char id, int mix, int pwm_value)
{
 int leftport, rightport;
 int leftvalue, rightvalue;
 int valid_command = 1;
 
 switch (id)
 {
   case 'A':
     leftport = 0;
     rightport = 1;
   break;
   case 'B':
     leftport = 2;
     rightport = 3;
   break;
   case 'C':
     leftport = 4;
     rightport = 5;
   break;
   default:
     if (_Verbose == HIGH) 
       {
         Serial.println("Invalid Combo Port Identified.");
       }
     valid_command = 0;
   break;
 }

 switch (mix)
 {
   case COMBO_OFF:
     leftvalue = 0;
     rightvalue = 0;
   break;
   case COMBO_LEFT:
     leftvalue = pwm_value;
     rightvalue = 0;
   break;
   case COMBO_RIGHT:
     leftvalue = 0;
     rightvalue = pwm_value;
   break;
   case COMBO_BOTH:
     leftvalue = pwm_value;
     rightvalue = pwm_value;
   break;  
   default:
     if (_Verbose == HIGH) {Serial.println("Invalid Combo Port Action.");}
     valid_command = 0;
   break;
 }  
 
 if (valid_command ==1) 
 {
   PWM_Port(leftport, leftvalue);
   PWM_Port(rightport, rightvalue);
   if (_Verbose == HIGH) {Serial.println("Successful CPWM Command.");}
 }
 
}

void Lego9750::Port_Initialize()
{
 pinMode(_D0, OUTPUT);
 analogWrite(_D0, 0);
 digitalWrite(_D0, LOW);
 pinMode(_D1, OUTPUT);
 analogWrite(_D1, 0);
 digitalWrite(_D1, LOW);
 pinMode(_D2, OUTPUT);
 analogWrite(_D2, 0);
 digitalWrite(_D2, LOW);
 pinMode(_D3, OUTPUT);
 analogWrite(_D3, 0);
 digitalWrite(_D3, LOW);
 pinMode(_D4, OUTPUT);
 analogWrite(_D4, 0);
 digitalWrite(_D4, LOW);
 pinMode(_D5, OUTPUT);
 analogWrite(_D5, 0);
 digitalWrite(_D5, LOW);

 if (_Verbose == HIGH) 
  {
   Serial.println("Output Port PWM values set to 0.");
  }
}

int Lego9750::Port_PWM_Value(int id)
{
 int pin_id;
 int valid_command =1;
 
 switch(id)
 {
   case 0:
     pin_id = _D0;
   break;
   case 1:
     pin_id = _D1;
   break;
   case 2:
     pin_id = _D2;
   break;
   case 3:
     pin_id = _D3;
   break;
   case 4:
     pin_id = _D4;
   break;
   case 5:
     pin_id = _D5;
   break;
   default:
     if (_Verbose == HIGH) {Serial.println("Invalid PWM Port Identified.");}
     valid_command = 0;
   break;
 }
 
 if (valid_command == 1)
   return(_Port_PWM[id]);
  else
   return(-1); 
}

void Lego9750::Verbose(int value)
{
 _Verbose = value;
}

void Lego9750::Parse_Command(String Command)
{
 int valid_command = 0;
 String sub_string;
 String command_string;
 String port_string;
 String action_string;
 String value_string;
 
 if (_Verbose == HIGH) 
  Serial.println(Command);

 Command.trim();

 sub_string = Command.substring(0,4);
 
 if (sub_string.compareTo("?PWM") == 0)
  {
    _Display_PWM_Values();
    valid_command = 1;
  }
 
 sub_string = Command.substring(0,2);
 
 if (sub_string.compareTo("?") == 0)
  {
    _Display_Commands();
    valid_command = 1;
  }
 
 sub_string = Command.substring(0,4);
 
 if (sub_string.compareTo("PORT") == 0 )
  {
    command_string = "PORT";
    port_string = Command.substring(5,6);
    action_string = Command.substring(7,10);
    _Parse_Port_Command(port_string, action_string);
    valid_command = 1;
  }

 sub_string = Command.substring(0,3);

 if (sub_string.compareTo("PWM") == 0)
  {
    command_string = "PWM";
    port_string = Command.substring(4,5);
    action_string = Command.substring(6);
    _Parse_PWM_Command(port_string, action_string);
    valid_command = 1;
  }

 sub_string = Command.substring(0,5);

 if (sub_string.compareTo("COMBO") == 0)
  {
    command_string = "COMBO";
    port_string = Command.substring(6,7);
    action_string = Command.substring(8);
    _Parse_Combo_Command(port_string, action_string);
    valid_command = 1;
  }  

 sub_string = Command.substring(0,4);
   
 if (sub_string.compareTo("CPWM") == 0 )
  {
    command_string = "CPWM";
    port_string = Command.substring(5,6);
    action_string = Command.substring(7,12);
    value_string = Command.substring(12);
    _Parse_CPWM_Command(port_string, action_string, value_string);
    valid_command = 1;
  }

 sub_string = Command.substring(0,5);

 if (sub_string.compareTo("INPUT") == 0)
  {
    command_string = "INPUT";
    port_string = Command.substring(6,7);
    _Parse_Input_Command(port_string);
    valid_command = 1;
  }
  
 sub_string = Command.substring(0,7);

 if (sub_string.compareTo("VERBOSE") == 0)
  {
    command_string = "VERBOSE";
    value_string = Command.substring(8,11);
    _Parse_Verbose_Command(value_string);
    valid_command = 1;
  }    
  
 if (valid_command == 0)
  if (_Verbose == HIGH) 
    Serial.println("Huh?");
}

void Lego9750::_Parse_Verbose_Command(String Value)
{
 int valid_command = 1;
 int action;
 
 if (Value.compareTo("ON") == 0)  
   action = HIGH;
  else
   if (Value.compareTo("OFF") == 0)  
     action = LOW;
    else
     valid_command = 0;
    
  if (valid_command == 1)
    Verbose(action);
   else
    if (_Verbose == HIGH) 
      Serial.println("VERBOSE Command Syntax Error.");
}

void Lego9750::_Parse_Input_Command(String Port)
{
 int port_value;
 int return_value;
 
 port_value = Port.toInt();
 return_value = Input_Port(port_value); 
 Serial.println(return_value);
}

void Lego9750::_Parse_CPWM_Command(String Port, String Action, String Value)
{
 char port_value;
 int action_value;
 int value_value;
 int valid_command = 1;
 
 if (Port.compareTo("A") == 0 )
   port_value = 'A';
  else
   if (Port.compareTo("B") == 0 )
     port_value = 'B';
    else
     if (Port.compareTo("C") == 0 )
       port_value = 'C';
      else
       valid_command = 0;

 if (Action.compareTo("LEFT ") == 0 )
   action_value = COMBO_LEFT;
  else
   if (Action.compareTo("RIGHT") == 0 )
     action_value = COMBO_RIGHT;
    else
     valid_command = 0;
 
 value_value = Value.toInt();
 
 if (valid_command == 1)
   PWM_Combo_Port(port_value, action_value, value_value);
  else
   if (_Verbose == HIGH) 
     Serial.println("CPWM Command Syntax Error.");
}

void Lego9750::_Parse_PWM_Command(String Port, String Value)
{
 int port_value;
 int action_value;
 
 port_value = Port.toInt();
 action_value = Value.toInt(); 
 PWM_Port(port_value, action_value);
}

void Lego9750::_Parse_Combo_Command(String Port, String Action)
{
 char port_value;
 int action_value;
 
 port_value = Port.toInt();
   
 if (Port.compareTo("A") == 0 )
   port_value = 'A';
  else
 if (Port.compareTo("B") == 0 )
   port_value = 'B';
  else
 if (Port.compareTo("C") == 0 )
   port_value = 'C';
  else
   port_value = 'z';
   
 if (Action.compareTo("LEFT") == 0)
   Combo_Port(port_value, COMBO_LEFT);
  else
   if (Action.compareTo("RIGHT") == 0)
     Combo_Port(port_value, COMBO_RIGHT);
    else
     if (Action.compareTo("OFF") == 0)
       Combo_Port(port_value, COMBO_OFF);
      else 
       if (_Verbose == HIGH)
         Serial.println("COMBO Command Syntax Error.");
}

void Lego9750::_Parse_Port_Command(String Port, String Action)
{
 int port_value;
 int action_value;
 
 port_value = Port.toInt();
   
 if (Action.compareTo("OFF") == 0)
   Output_Port(port_value, LOW);
  else
   if (Action.compareTo("ON") == 0)
     Output_Port(port_value, HIGH);
    else
     if (_Verbose == HIGH)
       Serial.println("PORT Command Syntax Error.");
}

void Lego9750::_Display_Commands()
{
 if (_Verbose == HIGH) 
  {
   Serial.println("Commands ...");
   Serial.println("PORT [0..5] ON|OFF");
   Serial.println("PWM [0..5] [0..255]");
   Serial.println("COMBO A|B|C LEFT|RIGHT|OFF");
   Serial.println("CPWM A|B|C LEFT|RIGHT [0..255]");
   Serial.println("INPUT [6..7]");
   Serial.println("?PWM");
   Serial.println("VERBOSE ON|OFF");
  }
}

void Lego9750::_Display_PWM_Values()
{
 if (_Verbose == HIGH) 
  {
   Serial.print("PORT 0 ");
   Serial.println(Port_PWM_Value(0));
   Serial.print("PORT 1 ");
   Serial.println(Port_PWM_Value(1));
   Serial.print("PORT 2 ");
   Serial.println(Port_PWM_Value(2));
   Serial.print("PORT 3 ");
   Serial.println(Port_PWM_Value(3));
   Serial.print("PORT 4 ");
   Serial.println(Port_PWM_Value(4));
   Serial.print("PORT 5 ");
   Serial.println(Port_PWM_Value(5));
  }
}