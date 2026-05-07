# LEGO BLOCKLY

![Lego Blockly Example](https://bricksafe.com/files/Bliss2025/lego-blockly-part-2/chrome_JjSrEd386C.png/800x440.png)

## Start programming with Lego-Blockly here: https://blissca.github.io/lego-blockly/index.html

This softwares uses [Blockly](https://developers.google.com/blockly) as a programming language to make programs for Brainless Lego old and newer interfaces.

This is a web application that will work only in chromium based browsers like Chrome / Edge (Latest version) and is installable outside the broswer if you click the small icon on the right of the address bar.\
![PWA App](https://bricksafe.com/files/Bliss2025/lego-blockly/Lego-Blockly-PWA.png)

It supports for now:

- Lego Interface B
- Lego Interface A with an Arduino (Uno/Nano sketch provided).
- Lego RCX / ControlMaster (RCX must use Serial IR Tower).  Lego Blockly does not create RCX programs to upload into the brick.  Only for inter communication.  Most Practical use: Send recieve message.
- VLL : Virtal Light Link for Code Pilot and MicroScout brick
- Wedo 1.0 (using the 2 ports USB hub)

More to come (Wedo 2.0, Boost, etc)

You need access to serial ports:
- Through the use of USB to RS232 adapters (qty depends how many Lego Interface B you want to try at the same time)
- Through the use of Bluetooth to Serial adapter like [HC-05](https://www.amazon.ca/hiBCTR-HC-05-Dual-Mode-Serial-Component/dp/B0FX2B4KMP).  Works with Interface A with the Arduino. Works with Interface B with the use of a [RS232 to TTL adapter](https://www.amazon.ca/HiLetgo-MAX3232-Converter-Module-Serial/dp/B00LPK0Z9A) using Max3232.


><ins>**Lego Blockly supports multiple Lego Interfaces/bricks connected at the same time**</ins>  


Example Projects to download: https://github.com/BlissCA/lego-blockly/tree/main/Examples (_Some examples are old and might not work anymore because of updated blockly blocks_)

Go to the following thread on Eurobricks forum for more informations: [Eurobricks Forum](https://www.eurobricks.com/forum/forums/topic/200778-project-programs-to-allow-interactions-between-old-lego-control-interfaces-rcx-lego-interface-b-others/page/4/#comment-3821464).\
Special thanks to people who participate in this forum thread.  They give precious support, suggestions, testing etc.  (Toastie, Gunners TekZone, Wapata to name a few)


Notes:
- Concerning the use of HC-05 BT to TTL Board.  
  - For Interface B: 
    - Since the Int.B is 9600 bauds, the HC-05 can be use as is. You can wire the rx to rx and tx to tx (Reverse if not working).  
    - You will need a 5v source and wire 5v and GND to both Max3232 and HC-05 modules.\
      ![HC-05 with Max3232](https://bricksafe.com/files/Bliss2025/lego-blockly/IMG_7785.jpeg/800x600.jpeg)
  - For Interface A: 
    - The arduino code uses 115200 bauds so the HC-05 default baud rate must be changed by entering the AT Command Mode.
    - You must use an arduino or FTDI connected to HC-05 ttl lines to send specific AT commands.  
    - To enter AT Command mode, hold HC-05 button while powering on.  
    - Set baud rate to 38400 baud of Serial Monitor (Arduino IDE) or Termite (if using FTDI, you can use other terminal software Hercules, putty).
    - Wire Tx on Rx, and Rx on Tx.  If it does not work, wire Tx on Tx and Rx on Rx. (I thinkk using an arduino to enter AT mode of HC-05, it must be rx on rx and tx on tx, but an FTDI, it is Rx-Tx Tx-Rx if I recall)
    - Once in AT Mode, in the Terminal or serial monitor, type AT+UART? to check the actual baud.  Type AT+UART=115200,0,0 to change baud.  Power cycle the module to exit AT mode.
    - By the way, The HC-05 module's RX/TX logic levels are 3.3V, despite the module often being powered by a 5V VCC pin. The RX pin is not 5V tolerant, so a voltage divider (e.g., 1kΩ and 2kΩ resistors) is required to reduce a 5V Arduino TX signal to 3.3V, while the HC-05 TX can connect directly to a 5V RX.
    - Once HC-05 at 115200 bauds and reset to normal mode, Arduino 5v (not 5v in), GND, rx0, tx1 (using voltage divider) goes to HC-05 5v, GND, tx, rx.

- To use Interface A with Lego Blockly you need to upload a "sketch" into an arduino (UNO or Nano preferably)
  - You need [Arduino free IDE](https://www.arduino.cc/en/software/).  
  - See [folder SketchArduino](SketchArduino) and upload sketch to your Arduino.  Use Lego9750_V2.
  - You can use the USB port directly on the Arduino. or you can use rx tx pin (0, 1) (Cannot use both USB and RxTx Pins a the same time).

## Wonderful other related projects by others:
- For RCX brick: [BlockNQC](https://www.webpbrick.com/nqc/blocknqc/) and [WebPBrick](https://www.webpbrick.com/ide/) by @maehw (https://github.com/maehw)
- [BrickLogo](https://github.com/openbrickproject/BrickLogo) by the Open Brick Project. 