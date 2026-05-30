@echo off
cd /d "%~dp0"
python -m pip install python-docx
python generate_scientific_doc.py
if exist "Курсовая_Arkanoid_Web.docx" (
    echo.
    echo Created: %~dp0Курсовая_Arkanoid_Web.docx
    dir "Курсовая_Arkanoid_Web.docx"
) else (
    echo ERROR: docx was not created.
    exit /b 1
)
pause
