@echo off
echo ===================================================
echo  AttendX - Compiling C Application (Windows MinGW)
echo ===================================================

where gcc >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] GCC compiler not found in PATH!
    echo Please ensure MinGW or MSYS2 gcc is installed and added to PATH.
    pause
    exit /b 1
)

echo Compiling C source files...
gcc -Wall -Wextra -std=c11 -O2 -Ilib src/main.c src/server.c src/api_handlers.c src/file_handler.c src/auth.c src/utils.c lib/mongoose.c lib/cJSON.c -o attendx.exe -lws2_32

if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo  Build Successful! Generated attendx.exe
    echo  Run with: attendx.exe
    echo ===================================================
) else (
    echo ===================================================
    echo  Build FAILED! Please check the error messages above.
    echo ===================================================
)
