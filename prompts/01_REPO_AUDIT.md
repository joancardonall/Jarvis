# Primera ordre per a Codex — AUDITORIA, SENSE MODIFICAR CODI

Llegeix `AGENTS.md` i els documents de `docs/`. Inspecciona el repositori existent i informa:

1. Arbre de fitxers significatius, stack real, dependències, endpoints i proves.
2. Què funciona avui, què és només scaffold i què està trencat o no verificat.
3. Què es pot reutilitzar de la implementació existent, si n'hi ha, per al primer circuit de projectes/MCP. El prototip de xat es va retirar a D009; no el donis per present.
4. Compara **FastAPI** i **Workers JS** amb criteris de temps, cost recurrent, manteniment, desplegament, aprenentatge i risc. Contrasta les decisions vigents; no implementis ni canviïs stack.
5. Identifica riscos de seguretat, autenticació i persistència.
6. Proposa el **primer PR més petit possible** per validar un flux real, amb criteris d'acceptació i proves.
7. Enumera preguntes que necessiten decisió humana.

**No modifiquis cap fitxer, no instal·lis dependències, no facis commits/push ni desplegaments.** Pots executar proves existents si és segur. Sigues crític i distingeix observacions verificades d'hipòtesis.

Retorna un informe curt i accionable en Markdown per revisar amb ChatGPT.
