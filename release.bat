:: For this to work, you need to download `7za.exe` (7-Zip Command Line Version)
:: from http://www.7-zip.org/download.html and add it to your `PATH`.

@echo off

for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set id=%%c-%%a-%%b)

set file=Automap-%id%-without-markers.zip
echo "Generating maps without markers..."
call tibia-maps --from-data=.\data --output-dir=.\Automap --no-markers
echo "Saving maps without markers as `%file%`..."
:: TODO: exclude `.git/*`
call 7za a -tzip "%file%" Automap

set file=Automap-%id%-with-markers.zip
echo "Generating maps with markers..."
call tibia-maps --from-data=.\data --output-dir=.\Automap
echo "Saving maps without markers as `%file%`..."
:: TODO: exclude `.git/*`
call 7za a -tzip "%file%" Automap
echo "All done."
