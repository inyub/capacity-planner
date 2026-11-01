!macro customInstall
  Push $0
  FileOpen $0 "$INSTDIR\resources\capacity-planner-installed" w
  FileWrite $0 "de.dkarsiko.capacityplanner"
  FileClose $0
  Pop $0
!macroend
