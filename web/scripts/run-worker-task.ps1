param([switch]$ExecuteQueues)
$workerNodePath = (Get-Command node.exe -ErrorAction Stop).Source
$workerArgs = '"' + (Join-Path $PSScriptRoot 'worker.mjs') + '"'
if ($ExecuteQueues) { $workerArgs += ' --execute' }
$workerProcess = Start-Process -FilePath $workerNodePath -ArgumentList $workerArgs -WorkingDirectory (Split-Path -Parent $PSScriptRoot) -WindowStyle Hidden -Wait -PassThru
exit $workerProcess.ExitCode
