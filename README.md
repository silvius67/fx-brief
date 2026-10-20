# FX Brief

Rapoarte de direcție pentru GBP/USD și EUR/USD, generate pe calculatorul tău și
deschise în browser. Fiecare raport citește calendarul economic, datele macro,
dolarul larg, structura sesiunii și fluxul de știri, apoi dă un bias (bullish,
bearish sau neutru), încrederea și, când semnalele sunt aliniate, niveluri de referință.

Node.js 18+, zero dependențe, zero chei API, fără conturi.

## Instalare

Cel mai simplu: copiezi tot conținutul fișierului
[prompt-instalare.md](prompt-instalare.md) și îl lipești în Claude Code. El verifică
Node.js, descarcă exact versiunea verificată, face un raport de test și, dacă vrei,
programează rapoartele la orele fixe.

## Folosire

```bash
node run.js              # ambele perechi, deschide raportul în browser
node run.js --no-open    # doar generează
node run.js --pair eurusd
```

Sau dublu-click pe `start.bat` (Windows) ori `start.command` (Mac).

Rapoartele se salvează în `reports/`: `ultimul.html` are mereu cele mai noi două
rapoarte, iar fiecare rulare rămâne și ca fișier datat, 30 de zile.

## Programul recomandat

Zilele lucrătoare, ora României: **12:20**, **16:05** și **17:20**. Orele urmează
publicările care mișcă perechile: datele UK și din zona euro dimineața (inclusiv
ZEW și inflația HICP de la 12:00), datele americane de la 15:30 și deciziile BOE și
BCE, apoi ISM și Consumer Confidence de la 17:00. Programarea merge doar cât timp
calculatorul e pornit.

## Cum se citește

Cinci componente, fiecare pe o scală de aproximativ −3 la +3, unde pozitiv înseamnă
presiune de creștere pe pereche:

| Componentă | Pondere |
| --- | --- |
| Surprize din calendar (publicat vs consens) | 34% |
| Macro structural (diferențial de dobânzi, creștere, inflație) | 20% |
| Dolar larg | 20% |
| Structura sesiunii (open Sydney, range asiatic) | 15% |
| Flux de știri | 11% |

Peste ±1.5 bias puternic, peste ±0.5 moderat, altfel neutru. Când fundamentalul și
prețul se contrazic, concluzia e „fără trade”, oricât de mare ar fi scorul.

Constantele sunt ipoteze declarate, nu valori calibrate pe istoric.

## Surse

Yahoo Finance (prețuri), ForexFactory (orar și consens), TradingView (valori
publicate), ONS și Bank of England, Eurostat și BCE, BLS și Federal Reserve Bank of
New York, plus fluxurile de știri BabyPips, FXStreet, Investing.com, MarketPulse și
ale băncilor centrale. Toate publice, fără chei.

---

Analiză cantitativă pe date publice. Nu constituie consultanță de investiții.
