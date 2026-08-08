' Launcher silencioso — sem janela do PowerShell.
' Uso: wscript.exe //B //Nologo open-winbox.vbs "winboxnovo://192.168.88.1"

If WScript.Arguments.Count < 1 Then
  WScript.Quit 1
End If

Dim uri, fso, folder, ps1, cmd, sh
uri = WScript.Arguments(0)

Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = folder & "\open-winbox.ps1"

If Not fso.FileExists(ps1) Then
  WScript.Quit 2
End If

' 0 = janela oculta; False = nao esperar
Set sh = CreateObject("WScript.Shell")
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ """ & Replace(uri, """", "") & """"
sh.Run cmd, 0, False
