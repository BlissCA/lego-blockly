# Lego Interface A WebSocket version
The WebSocket version is an alternative to the use of BlueTooth (HC-05 module).\
It increases the speed and distance range for controlling Lego Interface A by using WIFI instead of Bluetooth.

It uses an ESP32 Wroom to make the Bridge between websocket Ethernet (Wifi) and TTL Serial.\
Serial is still needed for the Arduino Uno/Nano that is still used to control the parallel lines of Interface A.\
So the ESP32 should be located near the Arduino Uno/Nano like an HC-05 when using BlueTooth.\
(**Lego9750_WS sketch uses the same pinout as the Lego9750_v2.**)

## Boards needed in Arduino Boards Manager
- Arduino AVR Boards by Arduino (1.8.7)
- esp32 by Expressif Systems (3.3.8)

## Librairies needed in Arduino IDE:
No need to install specific external libraries for the moment.

## Upload Sketch into the Arduino and ESP32 boards
Use provided sketches in [folder WebSocket/Sketch](Sketch).

Use Lego9750_ws for the Arduino Uno/Nano.\
Use ESP32_WS_Bridge for the ESP32 WROOM.

**BUT BEFORE YOU UPLOAD ESP32 Sketch**, you must first edit the sketch and change the wifi ssid and password.\
The bridgeName may remain to Bridge 1.  Should you have more Int.A using WebSocket, you will need other ESP32 Bridge and then, bridgeName must be changed to Bridge 2, 3, or 4 (4 is maximum supported)

```
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* bridgeName = "Bridge 1";
```

After uploading the ESP32, use the arduino serial monitor, reset the ESP32 (reset button), IP Address of the ESP32 should be printed in the serial monitor.\
**WRITE DOWN (OR SAVE IN NOTEPAD) THE ESP32 IP ADRESS as it is needed later in nginx conf file**

## Arduino to ESP32 Pinout:

The following assumes that ESP32 Devkit board is powered throuth its USB port.

| Arduino Uno Pin | ESP32 Pin  |
|-----------------|------------|
| 5Vin            | Vcc        |
| GND             | GND        |
| Rx0             | TX2 (IO17) |
| Tx1             | RX2 (IO16) |

> [!NOTE]
> I tested with and without voltage divider (1k and 2k resistors) between Arduino Tx1 (5v) and ESP32 Rx2 (3.3v) and both work.

## Arduino to Interface A Pinout:

| Arduino Uno Pin | Interface A Connector | Interface A Port |
|:---------------:|:---------------------:|:----------------:|
| 5V              | 1, 3                  |                  |
| GND             | 5,7,9,11,13,15,17,19  |                  |
| 3               | 6                     | 0 (Output)       |
| 5               | 8                     | 1 (Output)       |
| 6               | 10                    | 2 (Output)       |
| 9               | 12                    | 3 (Output)       |
| 10              | 14                    | 4 (Output)       |
| 11              | 16                    | 5 (Output)       |
| 7               | 18                    | 6 (Input)        |
| 8               | 20                    | 7 (Input)        |


## NGINX 

NGINX (pronounced "engine-x") is a free, open-source, high-performance web server, reverse proxy, load balancer, and HTTP cache.

### Why do we need nginx here:
Because Lego Blockly is served on a GitHub HTTPS Page.
WebSocket protocol uses ws:// url type, when using websockets over HTTPS, it needs to be wss:// which requires certificates etc which the ESP32 bridge does not provide.\
(Note that we might make wss on esp32 I did not go that route for now as I read it may be too flaky and nginx open the door for other projects like mqtt etc) 
So nginx will be used as a reverse proxy to make wss request goes to ws esp32 bridge...

### Nginx setup:

These instructions are for windows 11 OS only.

- On the PC that runs Lego Blockly, unzip the nginx.zip file (contains nginx folder so use "unzip here")
- You should place nginx in an easy to access location like C:\nginx
- Open an elevated command prompt (As an Administrator) and type the command cd\nginx
- In the root of the folder nginx I included 3 files pertaining to another software called openSSL that is used to create the self signed certificate.\
  The setup_certs.bat can be used to create the certificates that are saved in the nginx/conf folder.\
  There are alread certificate files in the conf folder so you might not have to execute the setup_certs.bat of everything is working for you already.
- In the "conf" folder, edit nginx.conf with notepad.
  Search for the following section:
  ```
        # --- WebSocket Bridge ---
        location /bridge1/ {
            proxy_pass http://192.168.2.152:80/;

            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_buffering off;
            proxy_request_buffering off;
            lingering_close off;
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
            proxy_cache off;
        }

		location /bridge2/ { return 204; }
		location /bridge3/ { return 204; }
		location /bridge4/ { return 204; }
  ```

  And replace 192.168.2.152 with your ESP32 IP address you saved earlier.\
  Save the conf file and close notepad.\
  Should you have a second ESP32 Bridge, copy paste location /bridge1/ section and paste it after it and replace bridge1 by bridge2 and change the ESP32 IP address.\
  Then Delete the line ```location /bridge2/ { return 204; }```.
- In the command prompt, type "start nginx".  (You must be located in the nginx folder which should be the case if you did the cd\nginx previously)\
  You may make a batch file and execute it automatically when to boot your computer to start nginx automatically.
- Open a Tab in Chrome and in the address bar copy paste the following:
  https://127.0.0.1:7890/ \
  It will tell you it is not secure blah blah, just click advanced and continue to this website.\
  Then you should see Welcome to nginx page after that.\
  You have to do this once.  You may have to do it again if you close and reopen Chrome, so bookmark this url.
- To test the ESP32 bridge, in the chrome address bar, enter https://127.0.0.1:7890/bridge1/id.\
  You should see : {"type":"lego-bridge","name":"Bridge 1","version":"1.0","ws":"/lego-bridge"}
- You should now be ready to select Interface A WS in Lego Blockly and connect to it 

## Connect to Interface A with websocket in Lego Blockly:

![Select Interface A WS and click Connect](https://bricksafe.com/files/Bliss2025/lego-blockly-part-2/chrome_HyoGrkEfAL.png)

![Popup opens and select Bridge 1](https://bricksafe.com/files/Bliss2025/lego-blockly-part-2/chrome_qXfWMi0OQY.png)

![Lego Interface 1 Connected](https://bricksafe.com/files/Bliss2025/lego-blockly-part-2/chrome_8xLVt9KNWo.png)

Use Lego Int.A v2 blocks in you blockly programs.






























