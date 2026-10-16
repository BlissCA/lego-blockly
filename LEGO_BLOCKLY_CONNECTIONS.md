# LEGO Blockly Hardware & Connections Guide

This document contains the connection and microcontroller reference tables for LEGO Blockly.

---

## 1. LEGO Blockly "Connect" Tab Entries / Microcontrollers / Computer Connections

| LEGO Blockly "Connect" tab | Microcontroller and/or adapter | Computer connection | Connections etc. |
| :--- | :--- | :--- | :--- |
| **Interface A+PF IR** | • Arduino (*)<br>• ESP32 (A) | USB / BT | • Protocols: Blockly + Legacy + PF IR TX (w/ IR LED)<br>• 20 pin parallel cable (2x10; Int.A to Arduino/ESP)<br>• BT/Arduino needs additional HC05 module |
| **Interface A WS** | *(None)* | | |
| **Interface B** | • Ser2USB adapter<br>• Ser2BT adapter | USB / BT | • BT: Ser2TTL+HC05 adapters or Bolutek Ser2BT adapter<br>• Null modem serial cable/connector (RX, TX, GND only)<br>• VLL: Outputs A-H of Int.B w/ 9V lamp or VIS LED |
| **RCX Serial IR** | Serial IR Tower + Ser2USB | USB | Null modem cable (full). Mindstorms IR remote support |
| **RCX USB IR** | USB Tower (#) | USB | USB A plug (to computer). RCX + VLL + RCCar protocols. Mindstorms IR remote support |
| **Cybermaster** | Serial RF Tower + Ser2USB | USB | Null modem cable (full) |
| **NXT** | None | USB + BT | USB B (NXT) to USB A (computer) cable |
| **WeDo 1.0** | None | USB | USB A plug (to computer) |
| **WeDo 2.0** | None | BLE | n.a. |
| **VLL Serial** | TTL2USB (FTDI) | USB | TTL signals “DTR” and “3.3V” (or GND) for VIS LED; USB A plug (to computer) |
| **LPF2** | None | BLE | Connects to LEGO LWP3.0 BLE devices: 4 port Technic hub, BLE Handset |
| **Toypad** | None | USB | USB A plug (to computer) |
| **PF IR ESP32** | ESP32 (PF) | USB + BLE | ESP32 (PF): PF TX w/ IR LED; PF RX w/ TSOP IR. IR RX: PF or generic 38 kHz IR remotes |
| **PF IR RCX Serial** | Serial IR Tower + Ser2USB | USB | PF TX. Null modem cable (full) |
| **C.Cube ESP Bridge** | ESP32 (C) | BLE | Tenka’s “Circuit Cubes”; 2 BT Battery Cubes/ESP32 (C) controller |

---

## 2. LEGO Blockly Programming Blocks / Microcontrollers / Computer Connections

| LEGO Blockly "Program blocks" | Microcontroller and/or adapter | Computer connection | Connections etc. |
| :--- | :--- | :--- | :--- |
| **Interface A (+PF)** | • Arduino (*)<br>• ESP32 (A) | USB / BT | • 20 pin parallel cable (2x10; Int.A to Arduino/ESP)<br>• BT/Arduino w/ additional HC05 module<br>• PF TX w/ IR LED |
| **Interface B (+VLL)** | • Ser2USB adapter<br>• Ser2BT adapter | USB / BT | • BT w/ Ser2TTL+HC05 adapters or Bolutek Ser2BT adapter<br>• Null modem serial cable/connector (RX, TX, GND only)<br>• VLL: Outputs A-H of Int.B w/ 9V lamp or VIS LED |
| **RCX/CM (+VLL, +RCCar)** | • Serial IR Tower + Ser2USB<br>• Serial RF Tower + Ser2USB<br>• USB Tower (#) | USB | • RCX: USB tower (USB A plug) or Serial IR Tower. Null modem cable (full)<br>• RCCar: USB tower (USB A plug)<br>• VLL: USB tower (USB A plug)<br>• CM: Serial RF Tower. Null modem cable (full)<br>• Mindstorms IR remote support |
| **NXT** | None | USB + BT | USB B (NXT) to USB A (computer) cable |
| **WeDo 1.0** | None | USB | USB A plug (to computer) |
| **WeDo 2.0** | None | BLE | n.a. |
| **VLL Serial** | TTL2USB (FTDI) | USB | TTL signals “DTR” and “3.3V” (or GND) for VIS LED; USB A plug (to computer) |
| **LPF2** | None | BLE | LEGO LWP3.0 BLE devices: 4 port Technic hub; BLE Handset |
| **Toypad** | None | USB | USB A plug (to computer) |
| **PF IR** | ESP32 (PF) | USB + BLE | ESP32 (PF): PF TX w/ IR LED; PF RX w/ TSOP IR. IR RX: PF or generic 38 kHz IR remotes |
| **Cube** | ESP32 (C) | BLE | Tenka’s “Circuit Cubes”; 2 BT Battery Cubes/ESP32 (C) controller |

---

### Reference Notes & Firmware Links

- **USB Tower (#):** [Eurobricks Installation Guide](https://www.eurobricks.com/forum/forums/topic/214097-lego-blockly-graphical-common-programming-environment-web-app-using-intuitive-blockly-for-all-lego-robotic-platforms/#findComment-3849253)
- **Arduino (\*):** [`Lego9750_PF_UNO_V4`](https://github.com/BlissCA/lego-blockly/tree/main/SketchArduino/Lego9750_PF_UNO_V4) *(also for Nanos/Pro Minis, check GPIO assignment)*
- **ESP32 (A):** [`Lego9750_PF_ESP32_BT_USB_V6`](https://github.com/BlissCA/lego-blockly/tree/main/SketchArduino/Lego9750_PF_ESP32_BT_USB_V6) *(latest ESP board package in Arduino IDE)*
- **ESP32 (PF):**
  - [`LegoPFIR_BLE_ESP_WROOM_32_V3`](https://github.com/BlissCA/lego-blockly/tree/main/SketchArduino/LegoPFIR_BLE_ESP_WROOM_32_V3) *(latest ESP board package in Arduino IDE)* or
  - [`LegoPFIR_BLE_ESP32_C3_V1`](https://github.com/BlissCA/lego-blockly/tree/main/SketchArduino/LegoPFIR_BLE_ESP32_C3_V1) *(latest ESP board package in Arduino IDE)*
- **ESP32 (C):** [`CCubesESP32BLEBridge_V2`](https://github.com/BlissCA/lego-blockly/tree/main/SketchArduino/CCubesESP32BLEBridge_V2) *(latest ESP board package in Arduino IDE)*
