import sys
import serial
import usb.core
import usb.util

# 1. IDENTIFY AND INITIALIZE THE FTDI CHIP (Via Raw Zadig/WinUSB)
VENDOR_ID = 0x0403
PRODUCT_ID = 0x6001  # Standard for both FT245RL and FT232RL

# Find the device using pyusb
dev = usb.core.find(idVendor=VENDOR_ID, idProduct=PRODUCT_ID)

if dev is None:
    print("FTDI hardware not found! Ensure WinUSB driver is active via Zadig.")
    sys.exit(1)

# Set the active configuration (standard USB device step)
dev.set_configuration()

# Force Asynchronous Bit-Bang Mode via vendor control transfers
# Request 0x0B = Set Bit-Bang Mode
# Value: Upper byte (0x01) triggers Bit-Bang, Lower byte is Direction Mask (0x3F)
# Pins D0-D5 = Outputs (1), D6-D7 = Inputs (0) -> 0011 1111 = 0x3F
DIRECTION_MASK = 0x3F
dev.ctrl_transfer(0x40, 0x0B, (0x01 << 8) | DIRECTION_MASK, 1, None)

# Set an internal refresh clock rate matching standard 9600 Baud mapping
dev.ctrl_transfer(0x40, 0x03, 0x4138, 1, None)

print("FTDI Chip successfully locked into raw Bit-Bang Mode via Python!")

# 2. OPEN THE VIRTUAL NULL-MODEM LINK (com0com)
# Connect to the second half of your virtual cable pair
GATEWAY_PORT = "COM13" 

try:
    ser = serial.Serial(GATEWAY_PORT, baudrate=9600, timeout=0.001)
    print(f"Gateway listening for DOSBox-X traffic on virtual {GATEWAY_PORT}...")
except serial.SerialException as e:
    print(f"Could not open virtual port {GATEWAY_PORT}: {e}")
    sys.exit(1)

current_output_byte = 0x00

# 3. THE 1ms REAL-TIME PROCESSING LOOP
try:
    while True:
        # Read a raw output byte sent from TCLOGO_S over com0com
        # Setting a tiny read size ensures we trap bytes sequentially
        data_in = ser.read(1)
        
        if data_in:
            # Step A: Parse the incoming motor byte configuration
            # Mask it to isolate the D0-D5 lines
            current_output_byte = data_in[0] & DIRECTION_MASK
            
            # Step B: Instantly blast the byte down USB Endpoint 2 (OUT Pipe)
            # PyUSB handles this raw transfer in microseconds
            dev.write(2, [current_output_byte])
            
            # Step C: Execute the strict Write-Then-Read Handshake sequence
            # Request 0x0C directly samples the immediate electrical voltages on the pins
            # We sample immediately after the write finishes to prevent any bus contention
            pin_byte_data = dev.ctrl_transfer(0xC0, 0x0C, 0, 1, 1)
            
            if pin_byte_data:
                raw_pin_byte = pin_byte_data[0]
                
                # Combine our set motor output bits with the live sensor bits (D6 & D7)
                return_byte = (current_output_byte & 0x3F) | (raw_pin_byte & 0xC0)
                
                # Push the single sensor byte back through com0com to satisfy DOSBox-X
                ser.write(bytes([return_byte]))

except KeyboardInterrupt:
    print("\nShutting down Python Gateway...")
    # Safe fallback: Turn off all outputs upon exiting
    try:
        dev.write(2, [0x00])
    except:
        pass
    ser.close()
    print("Goodbye!")
