Lego Interface B ONLINE Blockly type Programming:

The requirements? Well no need to install any softwares like python etc but you still need:

- A Windows PC with Internet access 
  I have been told it is also working on OSX, Linux has to be confirmed
- But the key is to use Chromium browser latest version (Chrome or Edge, I use Chrome)
- usb ports available with USB to RS232 adapters (qty depends how many Lego Interface B you want to try at the same time)
  It might work with Android phone or tablet with OTG adapter + serial adapter or a Bluetooth to RS232 adapter.  Has to be be confirmed.

It supports multiple Lego Interface B!

Link to my Lego-Blockly page:
https://blissca.github.io/lego-blockly/index.html

Example Projects to download
https://github.com/BlissCA/lego-blockly/tree/main/Examples

Go to the following post on Eurobricks forum for more informations
https://www.eurobricks.com/forum/forums/topic/200778-project-programs-to-allow-interactions-between-old-lego-control-interfaces-rcx-lego-interface-b-others/page/4/#comment-3821464

2026-03-27:
- Now has support for intercommunication with RCX yellow brick using the IR tower Serial (NOT USB Tower)
- it is now an "installable" (PWA) application.  In the adress bar of your Chromium browser, click on the small TV icon that has a down arrow on the right...  This should allow you to use the app offline with no internet.

2026-04-09
- Added support for Lego CyberMaster and Lego Interface A
- For Interface A, since it uses parallel lines, you need a Serial to parallel lines adapter which can be an Arduino type board.
- So for Interface A, it is only supported though the use of an Arduino with the Sketch provided in the Sketch Folder.  This sketch works with no modification for UNO and NANO.

2026-04-09
- Added support for Lego CyberMaster and Lego Interface A
- For Interface A, since it uses parallel lines, you need a Serial to parallel lines adapter which can be an Arduino type board.
- So for Interface A, it is only supported though the use of an Arduino with the Sketch provided in the Sketch Folder.  This sketch works with no modification for UNO and NANO.
- See https://wiki.lvl1.org/Lego_Interactive_Interface-A_Driven_via_Arduino for more information on the pins used for Interface A...