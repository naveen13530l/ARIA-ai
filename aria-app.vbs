Set WshShell = CreateObject("WScript.Shell")

' Stop existing node servers to prevent port conflicts
WshShell.Run "powershell -WindowStyle Hidden -Command ""Stop-Process -Name node -Force -ErrorAction SilentlyContinue""", 0, True

' Start Backend silently
WshShell.Run "cmd /c cd /d ""c:\Users\navee\Downloads\ARIA-Assistant-temp\ARIA-export\server"" && node index.js", 0, False

' Start Frontend silently
WshShell.Run "cmd /c cd /d ""c:\Users\navee\Downloads\ARIA-Assistant-temp\ARIA-export"" && npx vite", 0, False

' Wait 4 seconds for servers to start
WScript.Sleep 4000

' Open Edge in native App mode (hides URL bar and tabs)
WshShell.Run "msedge.exe --app=http://localhost:5173", 1, False
