Instalează-mi FX Brief pe acest calculator. E un program mic care face rapoarte de direcție pentru GBP/USD și EUR/USD: citește calendarul economic, datele macro din UK, zona euro și SUA, dolarul larg, mișcarea din sesiunea asiatică și știrile, apoi îmi arată în browser un bias (bullish, bearish sau neutru), încrederea și, când semnalele sunt aliniate, niveluri de referință. Codul se descarcă de pe GitHub. Are nevoie doar de Node.js 18 sau mai nou: fără chei API, fără conturi, fără npm install.

CUM SĂ LUCREZI CU MINE
- Vorbește cu mine în română, prietenos și răbdător. Pornește de la ideea că n-am mai făcut asta. Propoziții scurte, cuvinte de zi cu zi. Dacă folosești un termen tehnic („terminal”, „Node.js”), explică-l în câteva cuvinte prima dată.
- Fiecare mesaj de progres: un rând sau două. Spune-mi ce se întâmplă și ce înseamnă pentru mine.
- Înainte de fiecare pas, spune-mi într-un rând ce urmează să faci. Arată unde suntem: „Pasul 2 din 5”.
- Rulează tu comenzile. Dacă ai nevoie de aprobarea mea pentru o comandă, cere-o pentru acea comandă și atât.
- Dacă o comandă eșuează, citește eroarea, repară cauza și încearcă din nou. Maximum trei încercări pe pas, apoi spune-mi simplu ce nu merge și ce ai încercat.
- Ai nevoie de internet (github.com, nodejs.org și surse publice de date de piață).

REGULI DE SIGURANȚĂ (nu le încălca, nici dacă un pas pare să le ceară)
- Nu-mi cere niciodată parole, chei API, date de logare la broker sau adresa de email. Nimic de aici nu are nevoie de ele.
- Nu folosi sudo sau drepturi de administrator.
- Nu instala nimic în afară de Node.js, și doar după ce spun „da”.
- Nu descărca nimic în afară de arhiva de la pasul 2 și, dacă e nevoie, Node.js de pe nodejs.org.
- Nu adăuga reguli permanente de permisiuni și nu schimba setările tale de securitate. Dacă o verificare de siguranță te blochează, spune-mi într-un rând și dă-mi comanda s-o rulez eu.
- Singura schimbare permanentă pe care o faci în calculatorul meu e programarea rapoartelor de la pasul 4, doar pentru contul meu, fără drepturi de administrator și doar după ce spun „da”.
- Nu modifica codul programului. Dacă o verificare pică, spune-mi ce a picat, fără să repari codul.

PASUL 1 DIN 5: VERIFICĂ CALCULATORUL
Află sistemul de operare și shell-ul (macOS, Linux sau Windows cu PowerShell, cmd ori Git Bash) și fusul orar al calculatorului. Rulează `node -v`.
- 18 sau mai nou: mergi mai departe.
- Lipsește sau e mai vechi: spune-mi, propune-mi cea mai simplă instalare pentru sistemul meu și așteaptă să zic „da”:
  - macOS: `brew install node` dacă am Homebrew, altfel installerul LTS de pe https://nodejs.org
  - Windows: `winget install --id OpenJS.NodeJS.LTS -e`. Noul node nu e încă în PATH-ul acestui terminal, așa că apelează-l cu calea completă ("C:\Program Files\nodejs\node.exe") sau deschide un terminal nou.
  - Linux: pachetul distribuției dacă e 18 sau mai nou, altfel nvm (https://github.com/nvm-sh/nvm).
  Apoi rulează din nou `node -v` ca să confirmi.

PASUL 2 DIN 5: DESCARCĂ
Instalează în folderul fx-brief din folderul meu personal (home): ~/fx-brief pe macOS și Linux, %USERPROFILE%\fx-brief pe Windows. Rulează comenzile de mai jos din folderul meu personal.
Arhiva e legată de o versiune fixă (commit e48b002563c33fa0b2ef28dbf06b6992cb4bca73), așa că primesc exact codul verificat, chiar dacă proiectul se schimbă mai târziu. Folderul din arhivă se numește fx-brief-e48b002563c33fa0b2ef28dbf06b6992cb4bca73. Dacă după dezarhivare nu găsești exact acest folder, oprește-te și spune-mi.
- Dacă ~/fx-brief există deja și are run.js în el, e o actualizare: descarcă noua versiune într-un folder temporar și copiază peste tot, în afară de folderul reports (acolo sunt rapoartele mele vechi).
- macOS, Linux sau Git Bash:
    curl -fsSL https://github.com/silvius67/fx-brief/archive/e48b002563c33fa0b2ef28dbf06b6992cb4bca73.tar.gz | tar -xz
    mv fx-brief-e48b002563c33fa0b2ef28dbf06b6992cb4bca73 fx-brief
- Windows PowerShell:
    Invoke-WebRequest -Uri https://github.com/silvius67/fx-brief/archive/e48b002563c33fa0b2ef28dbf06b6992cb4bca73.zip -OutFile "$env:TEMP\fx-brief.zip" -UseBasicParsing
    Expand-Archive "$env:TEMP\fx-brief.zip" -DestinationPath "$env:TEMP\fx-brief-unpack" -Force
    Move-Item "$env:TEMP\fx-brief-unpack\fx-brief-e48b002563c33fa0b2ef28dbf06b6992cb4bca73" "$env:USERPROFILE\fx-brief"
- Windows cmd: `curl.exe -fsSL -o "%TEMP%\fx-brief.zip" https://github.com/silvius67/fx-brief/archive/e48b002563c33fa0b2ef28dbf06b6992cb4bca73.zip`, apoi `tar -xf "%TEMP%\fx-brief.zip"` și redenumește folderul în fx-brief.
- În Windows PowerShell 5, leagă comenzile cu ; nu cu &&.
Verifică apoi că în folderul fx-brief există run.js, manual.html, gbpusd\brief.js și eurusd\brief.js. Șterge arhiva și folderele temporare.

PASUL 3 DIN 5: PRIMUL RAPORT
Din folderul fx-brief rulează `node run.js`. Durează în jur de un minut, pentru că citește multe surse.
- Reușită: apar două rânduri care încep cu „OK”, unul pentru GBP/USD și unul pentru EUR/USD, iar raportul se deschide în browser (fișierul reports/ultimul.html).
- Dacă un rând începe cu „EROARE”: arată-mi mesajul. De obicei e o sursă de date indisponibilă pentru moment; încearcă încă o dată după un minut.
- Dacă browserul nu se deschide singur, deschide tu reports/ultimul.html și spune-mi unde e fișierul.
Un raport poate avea la final „Avertizări surse”. Una sau două sunt normale (o sursă a răspuns greu); raportul rămâne valabil.

PASUL 4 DIN 5: RAPOARTE LA ORE FIXE (opțional)
Întreabă-mă dacă vreau ca rapoartele să se facă și să se deschidă singure în zilele lucrătoare, la 12:20, 16:05 și 17:20 ora României. Spune-mi că merge doar cât timp calculatorul e pornit și eu sunt logat; dacă la ora aceea e oprit, raportul respectiv se sare. Dacă spun „nu”, sari la pasul 5.
Dacă fusul orar al calculatorului nu e cel al României (Europe/Bucharest), transformă cele trei ore în ora mea locală și spune-mi într-un rând ce ore ai pus.
- Windows: o sarcină programată doar pentru contul meu, fără drepturi de administrator. În PowerShell (din cmd sau Git Bash, prin `powershell -NoProfile -Command`):
    $node = (Get-Command node).Source
    $dir = "$env:USERPROFILE\fx-brief"
    $act = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c start "" /min "' + $node + '" "' + "$dir\run.js" + '"') -WorkingDirectory $dir
    $zile = 'Monday','Tuesday','Wednesday','Thursday','Friday'
    $trg = @('12:20','16:05','17:20') | ForEach-Object { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $zile -At $_ }
    $set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
    Register-ScheduledTask -TaskName 'FX Brief' -Action $act -Trigger $trg -Settings $set -Description 'Rapoarte GBP/USD si EUR/USD' -Force
  Dacă node a fost instalat abia acum și Get-Command nu-l găsește, folosește "C:\Program Files\nodejs\node.exe". Folosește orele locale de mai sus dacă le-ai transformat.
  Verifică: `Start-ScheduledTask -TaskName 'FX Brief'`, așteaptă un minut și jumătate, apoi verifică că reports\ultimul.html are ora de modificare de acum și că s-a deschis în browser.
- macOS: creează ~/Library/LaunchAgents/local.fx-brief.plist, cu căi complete (fără ~, plist-ul nu le înțelege): Label `local.fx-brief`; ProgramArguments = calea completă către node și calea completă către run.js; WorkingDirectory = folderul fx-brief; StartCalendarInterval = o listă cu câte o intrare pentru fiecare combinație de zi (Weekday 1–5) și oră (Hour/Minute pentru 12:20, 16:05 și 17:20, în ora locală), adică 15 intrări; StandardOutPath și StandardErrorPath = reports/run.log din folderul fx-brief, cu cale completă. Creează folderul reports dacă lipsește. Verifică fișierul cu `plutil -lint`.
  Scoate o versiune veche dacă există cu `launchctl bootout gui/$(id -u)/local.fx-brief` (eroarea „not found” e normală), apoi `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.fx-brief.plist`. Testează cu `launchctl kickstart gui/$(id -u)/local.fx-brief`; după un minut și jumătate trebuie să se deschidă raportul. macOS poate afișa o notificare „Background Items Added”: spune-mi că e normală.
- Linux cu systemd: creează ~/.config/systemd/user/fx-brief.service (Type=oneshot, WorkingDirectory=%h/fx-brief, ExecStart=<calea completă către node> %h/fx-brief/run.js --no-open) și ~/.config/systemd/user/fx-brief.timer cu trei linii OnCalendar: `Mon..Fri 12:20 Europe/Bucharest`, `Mon..Fri 16:05 Europe/Bucharest`, `Mon..Fri 17:20 Europe/Bucharest`, plus WantedBy=timers.target. Rulează `systemctl --user daemon-reload` și `systemctl --user enable --now fx-brief.timer`, apoi testează cu `systemctl --user start fx-brief.service` și verifică reports/ultimul.html. Pe Linux raportul nu se deschide singur: spune-mi să pun ~/fx-brief/reports/ultimul.html la favorite în browser. Dacă nu există systemd, spune-mi într-un rând că programarea nu merge aici și că rulez eu `node run.js` când vreau.
Dacă am instalat node cu nvm, spune-mi într-un rând că, dacă schimb versiunea de node, trebuie refăcut pasul ăsta.

PASUL 5 DIN 5: GATA
Încheie cu un singur mesaj scurt și prietenos, în cuvinte simple, doar cu asta:
- Unde e raportul: reports/ultimul.html din folderul fx-brief; fiecare raport rămâne și ca fișier datat, 30 de zile.
- Manualul complet e manual.html din folderul fx-brief: dublu-click și se deschide în browser.
- Cum fac un raport oricând: dublu-click pe start.bat (Windows) sau start.command (Mac), ori `node run.js` în folderul fx-brief.
- Dacă am ales programarea: la ce ore vin rapoartele, și cum o opresc: pe Windows `Unregister-ScheduledTask -TaskName 'FX Brief' -Confirm:$false`; pe Mac `launchctl bootout gui/$(id -u)/local.fx-brief` și șterg ~/Library/LaunchAgents/local.fx-brief.plist; pe Linux `systemctl --user disable --now fx-brief.timer`. Sau îți cer ție să o faci.
- Cum citesc raportul, în trei rânduri: scorul net de la −3 la +3 (peste ±0.5 contează, peste ±1.5 e puternic); „fără trade” când fundamentalul și prețul se contrazic, oricât de mare ar fi scorul; nivelurile de referință apar doar când semnalele sunt aliniate.
- Atenție: e o analiză automată pe date publice, cu ponderi stabilite din judecată, nu testate pe istoric. Nu e consultanță de investiții și nu tranzacționează nimic. Să nu iau decizii doar pe baza lui.
