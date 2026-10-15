@echo off
set MYSQL_HOME=C:\Users\kp\tools\mysql8
start "ImLab MySQL (port 3307)" /min "%MYSQL_HOME%\bin\mysqld.exe" --defaults-file="%~dp0my.ini"
echo MySQL 8.0 starting on port 3307 (minimized window). Wait a few seconds before starting the API.
