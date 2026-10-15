@echo off
set MYSQL_HOME=C:\Users\kp\tools\mysql8
"%MYSQL_HOME%\bin\mysqladmin.exe" --port=3307 -u root shutdown
echo MySQL on port 3307 stopped.
