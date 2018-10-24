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


Occasionally the sqlite3 database file /mod/etc/tvdiary.db can get corrupted and the tvdiary.log file reports "database disk image is malformed".

This can be checked and potentially resolved using the sqlite3 program at the command line.

This shows an integrity check run that shows the problems only in indexes, and this can be resolved by dumping the whole database to an SQL file, and then re-importing that into a fixed DB file.

```
humax# cd /mod/etc
humax# cp tvdiary.db tvdiary_fix.db
humax# sqlite3 tvdiary_fix.db
SQLite version 3.15.1 2016-11-04 12:08:49
Enter ".help" for usage hints.
sqlite> PRAGMA integrity_check;
row 39840 missing from index ia_end
row 39841 missing from index ia_end
row 9607 missing from index ipf_title_id
row 9610 missing from index ipf_title_id
row 9611 missing from index ipf_channel_id
row 9612 missing from index ipf_title_id
row 9613 missing from index ipf_title_id
wrong # of entries in index ipf_channel_id
wrong # of entries in index ipf_title_id
wrong # of entries in index ipf_year_month
sqlite> .mode insert
sqlite> .output tvdiary_dump_all.sql
sqlite> .dump
sqlite> .quit

humax# sqlite3 tvdiary_fixed.db
SQLite version 3.15.1 2016-11-04 12:08:49
Enter ".help" for usage hints.
sqlite> .read tvdiary_dump_all.sql
sqlite> .quit
```

Do a directory listing to check the re-created DB file looks reasonably sized.

```
humax# ls -al tvdiary*
-rw-------    1 root     root      24100864 Oct 24 20:30 tvdiary.db
-rw-------    1 root     root      18653329 Oct 24 20:17 tvdiary_dump_all.sql
-rw-------    1 root     root      24100864 Oct 24 20:07 tvdiary_fix.db
-rw-------    1 root     root      22781952 Oct 24 20:22 tvdiary_fixed.db
```

Finally move the fixed DB file to replace the master tvdiary.db file. You have the tvdiary_fix.db as a backup in case this repair wasn't sufficient.

```
humax# mv tvdiary_fixed.db tvdiary.db
```
