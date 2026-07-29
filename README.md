# LEGO BLOCKLY

![Lego Blockly Example](https://bricksafe.com/files/Bliss2025/lego-blockly-part-2/chrome_JjSrEd386C.png/800x440.png)

## Start programming with Lego-Blockly here: https://blissca.github.io/lego-blockly/index.html

This softwares uses [Blockly](https://developers.google.com/blockly) as a programming language to make programs for Brainless Lego old and newer interfaces.

This is a web application that will work only in chromium based browsers like Chrome / Edge (Latest version) and is installable outside the broswer if you click the small icon on the right of the address bar.\
![PWA App](https://bricksafe.com/files/Bliss2025/lego-blockly/Lego-Blockly-PWA.png)


## Supported Lego Interfaces/Bricks

Lego Blockly supports for now:

- Lego Interface B
- Lego Interface A with an Arduino (Uno/Nano or ESP32(BT, ESP-WROOM-32, 30Pin prefered) sketch provided).
- Lego Power Function with the IR 2-port adapter.  To use PF IR you need to wire a IR Transmitter LED (Like the one in a TV Remote) to the Arduine D2 pin and use the sketch for Interface A above.
- Lego RCX / ControlMaster (RCX must use Serial IR Tower).  Lego Blockly does not create RCX programs to upload into the brick.  Only for inter communication.  Most Practical use: Send recieve message.
- VLL : Virtal Light Link for Code Pilot and MicroScout brick
- Wedo 1.0 (using the 2 ports USB hub)
- WeDo 2.0 (BLE)
- LPF2 (Lego Power Function 2 BLE: Boost, Powered UP, Technic Control+, Spike etc...)
- Lego Dimensions Toypad USB.  ONLY SUPPORTED FOR THE WII/PS3/PS4 versions.  (NO XBOX sorry)

You need access to serial ports:
- Through the use of USB to RS232 adapters (qty depends how many Lego Interface B you want to try at the same time)
- Through the use of Bluetooth to Serial adapter like [HC-05](https://www.amazon.ca/hiBCTR-HC-05-Dual-Mode-Serial-Component/dp/B0FX2B4KMP).  Works with Interface A with the Arduino. Works with Interface B with the use of a [RS232 to TTL adapter](https://www.amazon.ca/HiLetgo-MAX3232-Converter-Module-Serial/dp/B00LPK0Z9A) using Max3232.


><ins>**Lego Blockly supports multiple Lego Interfaces/bricks connected at the same time**</ins>  


Example Projects to download: https://github.com/BlissCA/lego-blockly/tree/main/Examples (_Some examples are old and might not work anymore because of updated blockly blocks_)

### IN TEST: Connect to Interface A using WIFI and WebSocket
Please read the [readme_ws.md](WebSocket/README_WS.md) in the WebSocket folder for instructions how to use websocket to extend the distance range of Interface A.\
This will NOT work on a phone or tablet for the moment.  This will work only on a PC that runs both Lego Blockly AND Nginx proxy.

## Forum
Go to the following thread on Eurobricks forum for more informations: [Eurobricks Forum](https://www.eurobricks.com/forum/forums/topic/200778-project-programs-to-allow-interactions-between-old-lego-control-interfaces-rcx-lego-interface-b-others/page/4/#comment-3821464).\
Special thanks to people who participate in this forum thread.  They give precious support, suggestions, testing etc.  (Toastie, Gunners TekZone, Wapata to name a few)


## Notes:
- Concerning the use of HC-05 BT to TTL Board.  
  - For Interface B: 
    - Since the Int.B is 9600 bauds, the HC-05 can be use as is. You can wire the rx to rx and tx to tx (Reverse if not working).  
    - You will need a 5v source and wire 5v and GND to both Max3232 and HC-05 modules.\
      ![HC-05 with Max3232](https://bricksafe.com/files/Bliss2025/lego-blockly/IMG_7785.jpeg/800x600.jpeg)
  - For Interface A: 
    - The arduino Uno/Nano code uses 115200 bauds so the HC-05 default baud rate must be changed by entering the AT Command Mode.
    - You must use an Arduino or FTDI connected to HC-05 ttl lines to send specific AT commands.  
    - To enter AT Command mode, hold HC-05 button while powering on.  
    - Set baud rate to 38400 baud of Serial Monitor (Arduino IDE) or Termite (if using FTDI, you can use other terminal software Hercules, putty).
    - Wire Tx on Rx, and Rx on Tx.  If it does not work, wire Tx on Tx and Rx on Rx. (I thinkk using an arduino to enter AT mode of HC-05, it must be rx on rx and tx on tx, but an FTDI, it is Rx-Tx Tx-Rx if I recall)
    - Once in AT Mode, in the Terminal or serial monitor, type AT+UART? to check the actual baud.  Type AT+UART=115200,0,0 to change baud.  Power cycle the module to exit AT mode.
    - By the way, The HC-05 module's RX/TX logic levels are 3.3V, despite the module often being powered by a 5V VCC pin. The RX pin is not 5V tolerant, so a voltage divider (e.g., 1kΩ and 2kΩ resistors) is required to reduce a 5V Arduino TX signal to 3.3V, while the HC-05 TX can connect directly to a 5V RX.
    - Once HC-05 at 115200 bauds and reset to normal mode, Arduino 5v (not 5v in), GND, rx0, tx1 (using voltage divider) goes to HC-05 5v, GND, tx, rx.

- To use Interface A (AND lego power function IR) with Lego Blockly you need to upload a "sketch" into an arduino (UNO or Nano preferably OR an ESP32 for BT communication)

	- ARDUINO UNO/NANO:
		- You need [Arduino free IDE](https://www.arduino.cc/en/software/).  
		- See [folder SketchArduino](SketchArduino) and upload sketch to your Arduino.  Use Lego9750_V2 or the latest Lego9750_PF_UNO_V4 which support dual protocol (Blockly and Bit Bang for Lego Legacy dos software See ESP32 below).
		- You can use the USB port directly on the Arduino. or you can use rx tx pin (0, 1) (Cannot use both USB and RxTx Pins a the same time).
		- Interface A Outputs 0 to 5 should be wired to Arduino pins 3, 5, 6, 9, 10, 11.
		- Interface A Inputs 6 and 7 should be wired to Arduino pins 7 and 8 respectively.
		- For Power Function IR, you have to wire a IR Led to Pin 2 and gnd.  You will need to use a resistor too and the value depends of the IR Led used.
  
	- ESP32 (BLUETOOTH)
		- Prefered Board: ESP-WROOM-32 Devkit 1 30-pin variant as the pins allign with Interface A Connector
		- The ESP32 uses Built-in Bluetooth, not serial lines.
		- You must have bluetooth on your PC.  Or you can buy a cheap TP-Link BT/BLE dongle.
		- Once paired in windows, it creates 2 vitural COM port like the HC-05 does.  You must use the OUTBOUND com port.
		- You must use original ESP-WROOM-32 that has standard BT, not BLE.
		The newer ESP32-S3, C3, C6 only have BLE...
		- Use Arduino IDE to upload the ESP32 Sketch Lego9750_PF_ESP32_V2 provided in the [folder SketchArduino](SketchArduino).
		- IMPORTANT: In Arduino IDE, Menu Tools, Board, Board Manager, USE esp32 package 2.0.17!
		- ~~IMPORTANT: Since the ESP32 GPIO's operate at 3.3v level, you need to use a Bidirectional Logic Level converter (TXS0108E, or DFR0844 should do the job) between GPIO's and Lego Interface A Inputs and Outputs connector pins...~~
		Apparently, The Interface A tolerates 3.3V level out of the box...
		- Interface A Outputs 0 to 5 should be wired to ESP32 pins 13, 12, 14, 27, 26, 25.
		- Interface A Inputs 6 and 7 should be wired to ESP32 pins 33 and 32 respectively.
		- For Power Function IR, you have to wire a IR Led to ESP32 Pin 4 and gnd.  You will need to use a resistor too and the value depends of the IR Led used.
		- NOTE that the ESP32 has DUAL protocol support.  (Not the Arduino UNO).
		It means you can also use the ESP32 with legacy DOS lego software like le patched TC_LOGO_S.COM found on [alexGS bricksafe]( https://bricksafe.com/files/alexGSofNZ/interface-a-tc-logo/TCLOGO_P.COM).
		- Lego Interface A 20 pin Connector wiring:
			- Connector pin 1 or 3 goes to ESP32 3.3V
			- Connector pin 5 (or 7, 9, 11, 13, 15, 17, 19) goes to ESP32 GND
			- Connector pins 6, 8, 10, 12, 14, 16 goes to ESP32 13, 12, 14, 27, 26, 25 (Int.A Outputs 0 to 5)
			- Connector Pins 18, 20 goes to ESP32 33, 32. (Int.A Inputs 6 and 7)
		- See very small footprint setup by @Toastie on Eurobrick forum: [Lego Interface A ESP32 setup](https://www.eurobricks.com/forum/forums/topic/200778-project-programs-to-allow-interactions-between-old-lego-control-interfaces-rcx-lego-interface-b-others/page/25/#findComment-3838950)
		
		

## Wonderful other related projects by others:
- For RCX brick: [BlockNQC](https://www.webpbrick.com/nqc/blocknqc/) and [WebPBrick](https://www.webpbrick.com/ide/) by @maehw (https://github.com/maehw)
- [BrickLogo](https://github.com/openbrickproject/BrickLogo) by the Open Brick Project. (https://github.com/nathankellenicki)