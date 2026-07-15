import sys
import serial
import usb.core
import usb.util

# 1. IDENTIFY AND INITIALIZE THE FTDI CHIP (Via Raw Zadig/WinUSB)
VENDOR_ID = 0x0403
PRODUCT_ID = 0x6001

dev = usb.core.find(idVendor=VENDOR_ID, idProduct=PRODUCT_ID)
if dev is None:
    print("FTDI hardware not found! Ensure WinUSB driver is active via Zadig.")
    sys.exit(1)

dev.set_configuration()

# Force Asynchronous Bit-Bang Mode on the FT232RL
DIRECTION_MASK = 0x3F  # D0-D5 = Outputs (1), D6-D7 = Inputs (0)
dev.ctrl_transfer(0x40, 0x0B, (0x01 << 8) | DIRECTION_MASK, 1, None)
dev.ctrl_transfer(0x40, 0x03, 0x4138, 1, None)

print("FTDI Chip successfully locked into raw Asynchronous Bit-Bang Mode!")

# 2. OPEN THE VIRTUAL NULL-MODEM LINK (com0com)
GATEWAY_PORT = "COM13"
try:
    # --- THE PERFECT TIMING FIX ---
    # timeout=0.001 tells Python to wait exactly 1ms for data before moving on.
    # This prevents the 100% CPU lockup and aligns with the software's 1ms PWM pace.
    ser = serial.Serial(GATEWAY_PORT, baudrate=9600, timeout=0.001)
    print(f"Rock-Solid Universal Gateway active on virtual {GATEWAY_PORT}...")
except serial.SerialException as e:
    print(f"Could not open virtual port {GATEWAY_PORT}: {e}")
    sys.exit(1)

current_output_byte = 0x00
last_reported_inputs = 0x00

# 3. HIGH-SPEED MICRO-POLLED SYNCHRONOUS MACHINE LOOP
try:
    while True:
        # Check if the PC sent a motor update byte (Waits up to 1ms)
        data_in = ser.read(1)
        
        if data_in:
            # If a write hits (TCLogo style), update outputs instantly
            # Convert raw byte directly to integer array
            raw_byte = data_in[0]
            current_output_byte = raw_byte & DIRECTION_MASK
            dev.write(2, [current_output_byte])
            
        # Independent Real-Time Input Sampling (Lego Lines and TCLogo support)
        # Directly query the hardware pins D6 & D7
        pin_byte_data = dev.ctrl_transfer(0xC0, 0x0C, 0, 1, 1)
        
        if pin_byte_data:
            raw_pin_byte = pin_byte_data[0]
            current_inputs = raw_pin_byte & 0xC0
            
            # --- THE MISSING INPUT RECOVERY LOCK ---
            # If a sensor state physically changes (0->1 or 1->0), OR if TCLogo just 
            # executed a motor write, force an instant, non-blocking stream refresh.
            if (current_inputs != last_reported_inputs) or data_in:
                
                # Combine outputs with the live sensor values
                return_byte = (current_output_byte & 0x3F) | current_inputs
                
                # Clear com0com queues to completely wipe any 1-2 second latency backlogs
                ser.reset_output_buffer()
                ser.reset_input_buffer()
                
                # Deliver the clean snapshot to the PC instantly
                ser.write(bytes([return_byte]))
                
                # Save state to track physical changes on the next pass
                last_reported_inputs = current_inputs

except KeyboardInterrupt:
    print("\nShutting down Universal Python Gateway...")
    try:
        dev.write(2, [0x00]) # Safe fallback: Turn off all outputs upon exit
    except:
        pass
    ser.close()
    print("System safe. Goodbye!")
