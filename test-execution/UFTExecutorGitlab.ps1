mkdir build
mkdir testResults
$TESTS_TO_RUN_XML = $env:testsToRun -replace ('path="',-join("path=`"", -join($env:CI_PROJECT_DIR, "\test-execution")))
$WORKSPACE_ESCAPED = $env:CI_PROJECT_DIR -replace ('\\', '\\') -replace ('[ ]', '%20')
$WORKSPACE_ESCAPED2 = $env:CI_PROJECT_DIR -replace ('\\', '\\')
Set-Content -Path ./build/testsToRun.mtbx -Value $TESTS_TO_RUN_XML
Set-Content -Path ./build/Props.txt -Value "runType=FileSystem"
Add-Content -Path ./build/Props.txt -Value "resultUnifiedTestClassname=true"
Add-Content -Path ./build/Props.txt -Value "resultsFilename=testResults\\Results.xml"
Add-Content -Path ./build/Props.txt -Value "fsReportPath=build\\UFTReports"
Add-Content -Path ./build/Props.txt -Value "Test1=build\\testsToRun.mtbx"
Get-Content -Path ./build/Props.txt
Start-Process -FilePath "FTToolsLauncher.exe" -ArgumentList "-paramfile `"$PWD/build/Props.txt`"" -Wait *>&1
$resultsContent = Get-Content -Path ./testResults/Results.xml
$WORKSPACE_PATH = -join($WORKSPACE_ESCAPED, "\\test-execution\\");
$WORKSPACE_PATH2 = -join($WORKSPACE_ESCAPED2, "\\test-execution\\");
$newResultContent = $resultsContent -replace('/','\') -replace ($WORKSPACE_PATH, '') -replace ($WORKSPACE_PATH2, '') -replace ('file:\\\\\\', '') -replace ('<\\','</') -replace ('\\>','/>') -replace('xmlns:xsi="[^"]*"','') -replace('xmlns:xsd="[^"]*"','') -replace ('package=\"FTToolsLauncher\"','')
$newResultContent | Set-Content -Path ./testResults/Results.xml