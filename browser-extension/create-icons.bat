@echo off
echo Creating browser extension icons...

REM Copy the main icon as 128px version
copy assets\icon.png browser-extension\icon-128.png

REM For now, use same icon for all sizes
REM In production, you'd want to resize these properly
copy assets\icon.png browser-extension\icon-48.png
copy assets\icon.png browser-extension\icon-16.png

echo.
echo Icons copied! 
echo Note: For production, resize these to actual 16x16, 48x48, and 128x128 dimensions.
echo.
pause
