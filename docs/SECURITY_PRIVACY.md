# Seguretat i privacitat — mínims abans de producció

- MCP remot i API requereixen autenticació i autorització; no confiar en IDs proporcionats pel model.
- Cap endpoint públic que permeti escriure dades personals sense identitat verificada.
- Secrets (DB, Telegram, OAuth) només en gestor de secrets/variables segures; mai `.env` versionat.
- Principi de mínim privilegi; eines MCP concretes, sense SQL lliure.
- Validació server-side, límits de peticions, logs sense dades sensibles i protecció contra instruccions malicioses en dades recuperades.
- OAuth Google amb scopes mínims; gestionar expiració i revocació. El connector de Codex no equival a credencials del nostre backend.
- Còpies de seguretat i exportació verificades abans de confiar-hi dades úniques.
- Retenció i eliminació definides; decisions de «oblidar» poden requerir esborrat o desactivació segons política i còpies.
- Dades de salut/entrenament: minimitzar accés i evitar exposició en Telegram.
- Accions de Calendar amb confirmació quan hi hagi ambigüitat o impacte; registrar resultats parcials.
- Provar permisos negatius i secrets absents abans de desplegar.
