; BetterFleet NSIS installer hooks (#818).
;
; Included by Tauri's generated installer.nsi at global scope (after MUI2.nsh, FileFunc.nsh,
; LogicLib and StrFunc, before the template's own !defines -- so nothing here may reference
; ${PRODUCTNAME}/${UNINSTKEY} at include time; macro BODIES may, since they expand inside the
; sections). The macros expand inside `Section Install` / `Section Uninstall`:
;
;   NSIS_HOOK_PREINSTALL    after `SetOutPath $INSTDIR`, BEFORE the app-running check and all
;                           file copies -- the place to release file locks and migrate.
;   NSIS_HOOK_POSTINSTALL   after files, registry keys and shortcuts -- the place to (re)register
;                           and start the service. Re-runs on EVERY update (the updater re-executes
;                           the installer with /P), so everything here must be idempotent.
;   NSIS_HOOK_PREUNINSTALL  before any file/registry deletion -- stop (and on real uninstall,
;                           delete) the service so the exe is unlocked when the Delete runs.
;   NSIS_HOOK_POSTUNINSTALL after everything else -- runtime-created files cleanup.
;
; Context already established by the template's .onInit/un.onInit (utils.nsh `SetContext`):
; SetShellVarContext all + SetRegView 64. Do NOT use $APPDATA/$LOCALAPPDATA here: in all-users
; context they resolve to ProgramData, not the user's profile. Every command below runs through
; nsExec (hidden console); every wait is bounded.

!define BF_SERVICE "BetterFleetCapture"
; Set to 1 by the PREINSTALL migration when a 2.3.x per-user install was actually retired this
; run - the one case where update mode must recreate shortcuts (see NSIS_HOOK_POSTINSTALL).
Var BF_MigratedPerUser
!define BF_SERVICE_EXE "betterfleet-capture-service.exe"
; The 2.3.x per-user install's uninstall entry (currentUser installs write SHCTX = HKCU).
; Literal product name: the template defines ${PRODUCTNAME}/${UNINSTKEY} after this include.
!define BF_PERUSER_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetterFleet"

; Stop the capture service and wait -- bounded -- until it is really gone. Tolerates a service
; that does not exist (fresh install) and one that refuses to stop (taskkill fallback).
; Inserted in both the installer and the uninstaller; LogicLib generates unique labels per
; insertion, and the two land in different sections anyway.
!macro BF_STOP_CAPTURE_SERVICE
  nsExec::ExecToStack '"$SYSDIR\sc.exe" query ${BF_SERVICE}'
  Pop $0 ; "0" = service exists (running or not), "1060" = not installed, "error" = sc unavailable
  Pop $1
  ${If} $0 == "0"
    DetailPrint "Stopping the ${BF_SERVICE} service"
    nsExec::ExecToLog '"$SYSDIR\sc.exe" stop ${BF_SERVICE}'
    Pop $0 ; 0 ok, 1062 not started, 1061 cannot-accept-control -- all fine, convergence is polled
    ; Poll until STOPPED. A capture in flight can hold the stop for up to MAX_WINDOW_SECS (120s,
    ; netcap/src/service_proto.rs); waiting that out on every update is worse than cutting a
    ; diagnostic capture short, so after 30s the process is killed outright. sc state tokens
    ; (STOPPED / STOP_PENDING) are not localized; "STOPPED" is not a substring of "STOP_PENDING".
    StrCpy $R8 0
    ${Do}
      nsExec::ExecToStack '"$SYSDIR\cmd.exe" /c sc.exe query ${BF_SERVICE} | findstr /C:"STOPPED"'
      Pop $0 ; findstr: "0" = found
      Pop $1
      ${If} $0 == "0"
        ${ExitDo}
      ${EndIf}
      ${If} $R8 >= 60
        DetailPrint "${BF_SERVICE} did not stop in 30s; terminating the process"
        nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM "${BF_SERVICE_EXE}"'
        Pop $0
        ${ExitDo}
      ${EndIf}
      Sleep 500
      IntOp $R8 $R8 + 1
    ${Loop}
  ${EndIf}
!macroend

; One-time 2.3.x migration: a perMachine installer never sees the per-user install (the template
; reads SHCTX = HKLM only), so every existing user would otherwise end up with two "BetterFleet"
; entries and an orphaned copy in %LOCALAPPDATA%\BetterFleet. Run the old per-user uninstaller
; silently and AWAITED: `_?=` makes it run in place, so ExecWait really waits instead of racing
; the temp-copy trick. Silent mode never shows the delete-app-data checkbox, so the user's
; settings (%APPDATA%\fr.zelytra, %LOCALAPPDATA%\fr.zelytra) are preserved by construction; the
; old uninstaller also removes its own per-user shortcuts and HKCU uninstall entry, which makes
; this a no-op on every later update.
!macro BF_MIGRATE_PERUSER_INSTALL
  StrCpy $BF_MigratedPerUser 0
  ReadRegStr $R0 HKCU "${BF_PERUSER_UNINSTKEY}" "UninstallString"
  ${If} $R0 != ""
    ; Tauri writes the value quoted; strip surrounding quotes if present.
    StrCpy $R1 $R0 1
    ${If} $R1 == '"'
      StrCpy $R0 $R0 "" 1
      StrCpy $R0 $R0 -1
    ${EndIf}
    ${If} ${FileExists} "$R0"
      ${GetParent} "$R0" $R2 ; FileFunc.nsh, already included by the template
      ${If} $R2 != "$INSTDIR" ; never run an in-place uninstall of the directory being installed to
        DetailPrint "Removing the previous per-user install at $R2"
        ClearErrors
        ExecWait '"$R0" /S _?=$R2' $R3
        ${If} ${Errors}
          DetailPrint "Warning: could not launch the per-user uninstaller; old install left in place"
        ${ElseIf} $R3 = 0
          ; An in-place uninstaller cannot delete itself; sweep the leftovers.
          Delete "$R0"
          RMDir "$R2"
          StrCpy $BF_MigratedPerUser 1
        ${Else}
          DetailPrint "Warning: per-user uninstall exited with $R3; old install left in place"
        ${EndIf}
      ${EndIf}
    ${Else}
      ; Registry ghost with no uninstaller on disk: just remove the Apps & Features entry. The
      ; ghost's shortcuts, if any survive, point at a binary that is gone - recreate ours too.
      DeleteRegKey HKCU "${BF_PERUSER_UNINSTKEY}"
      StrCpy $BF_MigratedPerUser 1
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Order matters: free the file lock on the service exe first (updates overwrite it), then
  ; retire the 2.3.x per-user install (no-op everywhere but the first perMachine install).
  !insertmacro BF_STOP_CAPTURE_SERVICE
  !insertmacro BF_MIGRATE_PERUSER_INSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Idempotent register-or-repair: `sc create` when absent, `sc config` when present -- the
  ; latter also heals a disabled start type or a broken binPath on reinstall. The doubled
  ; escaped quotes are deliberate: sc.exe must RECEIVE the quotes so the SCM stores a quoted
  ; ImagePath ($INSTDIR contains "Program Files").
  nsExec::ExecToStack '"$SYSDIR\sc.exe" query ${BF_SERVICE}'
  Pop $0
  Pop $1
  ${If} $0 == "0"
    DetailPrint "Reconfiguring the ${BF_SERVICE} service"
    nsExec::ExecToLog '"$SYSDIR\sc.exe" config ${BF_SERVICE} binPath= "\"$INSTDIR\${BF_SERVICE_EXE}\"" start= auto'
    Pop $0
  ${Else}
    DetailPrint "Registering the ${BF_SERVICE} service"
    nsExec::ExecToLog '"$SYSDIR\sc.exe" create ${BF_SERVICE} binPath= "\"$INSTDIR\${BF_SERVICE_EXE}\"" start= auto DisplayName= "BetterFleet Capture"'
    Pop $0
  ${EndIf}
  ${If} $0 != "0"
    ; A service stuck in marked-for-delete (1072) lands here; a reboot clears it. Do not fail
    ; the install over it -- the app itself still works, capture degrades gracefully.
    DetailPrint "Warning: could not register ${BF_SERVICE} (sc exit code $0)"
  ${EndIf}
  nsExec::ExecToLog '"$SYSDIR\sc.exe" description ${BF_SERVICE} "Privileged network capture host for BetterFleet server matching."'
  Pop $0
  ; Restart on crash: 5s, 5s, then 30s; counter resets after a day. Normal stops (exit 0 via the
  ; SCM) do not trigger failure actions.
  nsExec::ExecToLog '"$SYSDIR\sc.exe" failure ${BF_SERVICE} reset= 86400 actions= restart/5000/restart/5000/restart/30000'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\sc.exe" start ${BF_SERVICE}'
  Pop $0 ; 1056 already-running and transient start failures are tolerated: start= auto covers the next boot

  ; The one-time migration deletes the per-user install's shortcuts (its uninstaller owns them),
  ; and an updater-driven install runs in update mode, where the template's
  ; CreateOrUpdateDesktopShortcut / CreateOrUpdateStartMenuShortcut return without creating
  ; anything - by design, so ordinary updates never resurrect icons a user deleted. Net effect on
  ; the 2.3.x -> perMachine transition: no desktop icon, nothing in Start search, while Apps &
  ; Features shows the app fine (field-caught). Recreate them through the template's own
  ; functions - same paths, same AppUserModelId, same no-shortcut preference handling - with
  ; update mode masked for just these two calls. Ordinary updates keep the flag at 0 and are
  ; untouched.
  ${If} $BF_MigratedPerUser = 1
    DetailPrint "Recreating shortcuts after the per-user migration"
    StrCpy $R9 $UpdateMode
    StrCpy $UpdateMode 0
    Call CreateOrUpdateDesktopShortcut
    Call CreateOrUpdateStartMenuShortcut
    StrCpy $UpdateMode $R9
  ${Else}
    ; Heal for installs the pre-fix migration left shortcut-less (the field window before this
    ; hook existed): the app updates fine but has no Start Menu entry, so Windows search cannot
    ; find it. A MISSING Start Menu shortcut on update is healed - an unfindable app is never a
    ; user's deliberate choice - while a missing desktop icon alone stays respected as one.
    ${IfNot} ${FileExists} "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      ${IfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
        DetailPrint "Start Menu entry missing; recreating it"
        StrCpy $R9 $UpdateMode
        StrCpy $UpdateMode 0
        Call CreateOrUpdateStartMenuShortcut
        StrCpy $UpdateMode $R9
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro BF_STOP_CAPTURE_SERVICE
  ; On updates ($UpdateMode: the new installer runs this uninstaller with /UPDATE) keep the
  ; registration -- POSTINSTALL reconfigures it seconds later. On a real uninstall, delete it.
  ${If} $UpdateMode <> 1
    DetailPrint "Removing the ${BF_SERVICE} service"
    nsExec::ExecToLog '"$SYSDIR\sc.exe" delete ${BF_SERVICE}'
    Pop $0 ; 1060 (not installed) is fine
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; The service writes %ProgramData%\BetterFleet\capture-service.log at runtime; no file list
  ; tracks it, so a real uninstall must sweep it or it is an orphan. Left alone on updates.
  ${If} $UpdateMode <> 1
    ExpandEnvStrings $0 "%ProgramData%\BetterFleet"
    ${If} $0 != "%ProgramData%\BetterFleet" ; only if the variable actually expanded
      RMDir /r "$0"
    ${EndIf}
  ${EndIf}
!macroend
