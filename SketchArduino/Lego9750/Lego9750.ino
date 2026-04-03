#include "Lego9750.h"

String ByYourCommand;

Lego9750 brick; 

void setup() 
{
  // put your setup code here, to run once:
  Serial.begin(9600);
  brick.Port_Initialize();  
}

void loop() {
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.length() > 0) {
            brick.Parse_Command(cmd);
        }
    }
}
