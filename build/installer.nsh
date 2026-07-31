!macro customInstall
  IfFileExists "$INSTDIR\resources\runtime\prerequisites\vc_redist.x64.exe" 0 vc_runtime_done
  DetailPrint "Installing Microsoft Visual C++ Runtime 14.44 (x64)..."
  ExecWait '"$INSTDIR\resources\runtime\prerequisites\vc_redist.x64.exe" /install /quiet /norestart' $0
  DetailPrint "Microsoft Visual C++ Runtime installer exit code: $0"
  vc_runtime_done:
!macroend
