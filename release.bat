@echo off

for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set id=%%c-%%a-%%b)

set file=Automap-%id%-without-markers.zip
echo "Generating maps without markers…"
tibia-maps --from-data=data --output-dir=Automap --no-markers
echo "Saving maps without markers as `%file%`…"
:: TODO: exclude `.git/*`
7z a -tzip "${file}" Automap

set file=Automap-%id%-with-markers.zip
echo "Generating maps with markers…"
tibia-maps --from-data=data --output-dir=Automap
echo "Saving maps without markers as `%file%`…"
:: TODO: exclude `.git/*`
7z a -tzip "${file}" Automap

echo "All done."
