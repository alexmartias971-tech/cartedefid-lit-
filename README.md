# Carte fidélité — application

Application pour créer et gérer des cartes de fidélité Apple Wallet et Google Wallet
pour les commerces de Guadeloupe.

- `/admin` : ton tableau de bord (création des entreprises, design des cartes, accès commerçants, notifications, clients)
- `/c/<entreprise>` : page d'inscription des clients (QR code du comptoir)
- `/carte/<code>` : la carte du client + boutons Apple / Google Wallet
- `/m/<code>` : l'espace du commerçant (code PIN, scanner, notifications, clients)

Tout le mode d'emploi, étape par étape, est dans le guide HTML fourni avec ce projet.

## Commandes

```
npm install      # installer (une seule fois)
npm run dev      # lancer sur ton ordinateur : http://localhost:3000
npm run build    # vérifier que tout compile
```

## Dossiers importants

- `supabase/01-schema.sql` : la base de données (à lancer une fois dans Supabase)
- `supabase/02-mon-compte-admin.sql` : te donner le rôle admin
- `.env.example` : modèle du fichier des clés secrètes `.env.local`
- `src/lib/apple` : cartes Apple Wallet (fabrication + notifications)
- `src/lib/google` : cartes Google Wallet
- `src/lib/notifications.ts` : envoi et programmation des notifications
- `vercel.json` : réglages Vercel (région Paris, tâche de secours 1 fois par jour)
- `supabase/03-envoi-automatique.sql` : envoi des notifications programmées toutes les 5 minutes (gratuit, via Supabase)
