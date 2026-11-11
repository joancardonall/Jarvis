# Flux de treball Git

- No desenvolupar directament a main. Crear una branca per tasca:
  feat/ per funcionalitats, fix/ per correccions i docs/ per documentació.
- Abans de començar, revisar la branca, els commits recents i els canvis
  pendents. No sobreescriure feina d'un altre agent.
- Un sol agent alhora a la carpeta principal. Si treballem en paral·lel,
  utilitzar git worktree: una carpeta de treball separada per agent.
- Es poden fer commits a la branca de la tasca. Han de ser petits,
  amb un canvi lògic cadascun, i sense secrets.
- Revisar el diff i executar les comprovacions rellevants abans del commit.
- Fusionar a main i fer push requereixen aprovació explícita de l'usuari.
- No descartar canvis ni reescriure l'historial compartit sense aprovació.
