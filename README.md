Humax_tvdiary
=============

tvdiary package for the Humax HDR FOX T2 with customized firmware.

An add-on to the web interface that tracks the TV programmes you record and watch, presenting them in a diary view.

Build instructions:
* Telnet to the customized HDR FOX T2 and create a directory "/mod/dev".
* "git clone https://github.com/martxw/Humax_tvdiary.git tvdiary" to create "/mod/dev/tvdiary".
* Review and run "mk_dev_env" to create a additional development directories.
  * "live"
  * "out"
  * "sbin.jim"
* The "live" directory contains symbolic links to the installed version of the package's files, and allows you to try out speculative code changes quickly.
* The "cmp_live" script compares all of the live files with the src files, so you can spot any changes you haven't synced yet.
* The "src" directory contains all of files that are built into the package. Make persistent changes here.
* The "sbin.jim" directory contains symbolic links to the files in "src/sbin", with added ".jim" extensions, so editors can apply syntax highlighting etc. It's safe to make persistent edits here as they're exactly the same files as under "src/sbin".
* Run "build" to repackage the files under "src", store the resulting package file in "out", uninstall the old version of the package and install the newly built one.

Development is pretty easy with a SMB share set up to "/mod/dev". But I recommend only using Git via Telnet to the Humax, as Git on Windows keeps making spurious file mode changes.