$TaskName = "PNP Lead Finder - Modo 24h"
$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tarefa removida: $TaskName"
} else {
    Write-Host "Nenhuma tarefa encontrada com o nome: $TaskName"
}