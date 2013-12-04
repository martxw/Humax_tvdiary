Humax_tvdiary
=============

tvdiary package for the Humax HDR FOX T2 with customized firmware.

An add-on to the web interface that tracks the TV programmes you record and watch, presenting them in a diary view.

Build instructions:
* On the customized HDR FOX T2, create a directory "/mod/dev/tvdiary".
* Clone https://github.com/martxw/Humax_tvdiary.git to "/mod/dev/tvdiary".
* Review and run "mk_dev_env" to create a additional development directories.
  * "live" - contains symbolic links to the installed version of the package's files, for trying out code changes.
  * "out" - where built package files are placed.
  * "sbin.jim" - contains symbolic links to the files in "src/sbin", with added ".jim" extensions, so editors can apply syntax highlighting etc.
* Run "build" to repackage the files under "src", store the resulting package file in "out", uninstall the old version of the package and install the newly built one.
