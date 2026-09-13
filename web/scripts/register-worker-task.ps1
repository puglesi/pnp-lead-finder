param([switch]$ExecuteQueues)
$workerWebRoot = Split-Path -Parent $PSScriptRoot
$workerArgs = '-NoProfile -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'run-worker-task.ps1') + '"'
if ($ExecuteQueues) { $workerArgs += ' -ExecuteQueues' }
$workerAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $workerArgs -WorkingDirectory $workerWebRoot
$workerTrigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$workerSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'PnP Lead Finder Worker' -Action $workerAction -Trigger $workerTrigger -Settings $workerSettings -Description 'PnP worker; monitor mode unless explicitly enabled' -ErrorAction Stop
