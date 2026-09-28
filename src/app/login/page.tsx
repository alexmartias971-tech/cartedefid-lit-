import LoginForm from "./LoginForm";

/** Page de connexion du tableau de bord. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  // Message si le compte connecté n'est pas autorisé (renvoyé par le tableau de bord)
  return <LoginForm initialError={erreur === "non-admin" ? "Ce compte n'a pas accès au tableau de bord." : undefined} />;
}
